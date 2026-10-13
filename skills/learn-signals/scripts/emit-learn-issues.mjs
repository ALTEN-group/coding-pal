#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { ValidationError as LedgerError, parseLedger } from "./vendor/ledger.mjs";
import { ValidationError as IncidentError, checkFileName, validateIncidentContent } from "./vendor/validate-incident.mjs";

export class SignalError extends Error {}

function fail(message) {
	throw new SignalError(message);
}

export const SIGNAL_LABELS = ["needs:triage", "source:learn"];
export const SIGNAL_KINDS = ["incident", "hypothesis", "telemetry"];
const FINDING_KINDS = ["anomaly", "breach", "trend"];
const FINDING_SEVERITIES = ["high", "medium"];
const ID = /^[a-z0-9][a-z0-9_.-]*$/;
const MAX_TITLE = 120;

export function marker(kind, id) {
	return `<!-- learn-signal: ${kind}:${id} -->`;
}

const cell = (value) => String(value).replace(/\s+/g, " ").replace(/\|/g, "/").trim();
const title = (value) => (value.length > MAX_TITLE ? `${value.slice(0, MAX_TITLE - 3).trimEnd()}...` : value);

export function workspacePath(file) {
	const rel = relative(process.cwd(), resolve(file));
	return (rel.startsWith("..") ? file : rel).split(sep).join("/");
}

function renderBody({ kind, id, problem, evidenceType, reference, evidence, criteria, source }) {
	return `${[
		marker(kind, id),
		"## Problem Statement",
		problem,
		"",
		"## Evidence",
		"| ID | Type | Reference | Quote or Count |",
		"|---|---|---|---|",
		`| E1 | ${evidenceType} | ${cell(reference)} | ${cell(evidence)} |`,
		"",
		"## Draft Acceptance Criteria",
		...criteria.map((c) => `- ${c}`),
		"",
		"## Source",
		source,
	].join("\n")}\n`;
}

function signal(kind, id, issueTitle, fields) {
	return { kind, id, title: title(issueTitle), labels: SIGNAL_LABELS, marker: marker(kind, id), bodyFile: `signal-${kind}-${id}.md`, body: renderBody({ kind, id, ...fields }) };
}

/** One issue per Control Hardening item, plus a follow-up when the mitigation left the capability off or rolled back. */
export function incidentSignals(incident, path) {
	const { date, slug } = checkFileName(path, incident.detectedAt);
	const base = `${date}-${slug}`;
	const reference = workspacePath(path);
	const evidence = `Incident ${base}: ${incident.severity}, tier ${incident.tier}, detected ${incident.detectedAt}, mitigated ${incident.mitigatedAt} by ${incident.mechanism}, cause: ${incident.cause}`;
	const source = `Incident record \`${reference}\` (reviewed ${incident.reviewDate} by ${incident.reviewedBy.name} (${incident.reviewedBy.role})).`;
	const signals = incident.controls.map((control, i) =>
		signal("incident", `${base}-control-${i + 1}`, `Harden controls: ${control.kind}: ${control.what}`, {
			problem: `The ${incident.severity} incident "${incident.title}" reached production although a control should have caught it: ${incident.whatShouldHaveCaught} Add this ${control.kind}: ${control.what}.`,
			evidenceType: "incident",
			reference,
			evidence,
			criteria: [
				`Given the failure mode of "${incident.title}", when a change with that defect is proposed, then the new ${control.kind} fails the pipeline before release.`,
				`Given the new ${control.kind}, then it has an owner and its place in the Deterministic Controls catalog is documented.`,
			],
			source: `${source} Control hardening item ${i + 1} of ${incident.controls.length}.`,
		}),
	);
	if (incident.mechanism !== "forward fix") {
		signals.push(
			signal("incident", `${base}-repair`, `Lift the ${incident.mechanism} mitigation after incident "${incident.title}"`, {
				problem: `The incident "${incident.title}" was mitigated by ${incident.mechanism}. The fix (commit ${incident.fixCommit}) is in, so the capability must be restored on the fixed code and the temporary mitigation removed.`,
				evidenceType: "incident",
				reference,
				evidence,
				criteria: [
					`Given the fix commit ${incident.fixCommit} is released, when the ${incident.mechanism} mitigation is lifted, then the capability works again and the error rate stays within its baseline.`,
					`Given the reproducing test \`${incident.reproducingTest}\`, then it stays green in the pipeline.`,
				],
				source,
			}),
		);
	}
	return signals;
}

/** An Invalidated hypothesis whose feature is not yet deleted becomes an issue to delete it. */
export function hypothesisSignals(rows, ledgerPath) {
	const reference = workspacePath(ledgerPath);
	return rows
		.filter((row) => row.verdict === "Invalidated" && row.deletedDate === null)
		.map((row) =>
			signal("hypothesis", row.issue.slice(1), `Delete the invalidated feature from ${row.issue}: ${row.hypothesis}`, {
				problem: `${row.issue} predicted "${row.hypothesis}", but ${row.metric} did not move toward the target. The Product Owner invalidated it. A dead feature costs every future change, so it must be deleted.`,
				evidenceType: "hypothesis-verdict",
				reference: `${reference}#${row.issue.slice(1)}`,
				evidence: `${row.issue} Invalidated: ${row.metric} baseline ${row.baseline}, target ${row.target} (${row.direction}); ${row.evidence}`,
				criteria: [
					`Given the feature behind ${row.issue} was invalidated on ${row.decidedDate}, then its code, flag, tests, documentation, and telemetry are removed in one pull request.`,
					`Given the pull request is merged, then the ledger row for ${row.issue} records Delete feature (Deleted <date>).`,
				],
				source: `Hypothesis ledger \`${reference}\`, verdict decided by ${row.decided.replace(/ on \d{4}-\d{2}-\d{2}$/, "")} on ${row.decidedDate}.`,
			}),
		);
}

export function parseFindings(data) {
	if (!data || typeof data !== "object" || !Array.isArray(data.findings)) fail('findings file must be an object with a "findings" array (the --json output of telemetry-scan)');
	const seen = new Set();
	return data.findings.map((f, i) => {
		const where = `findings[${i}]`;
		if (!f || typeof f !== "object") fail(`${where} must be an object`);
		if (typeof f.id !== "string" || !ID.test(f.id)) fail(`${where}.id must match ${ID}`);
		if (seen.has(f.id)) fail(`${where}.id "${f.id}" is duplicated`);
		seen.add(f.id);
		if (typeof f.metric !== "string" || !f.metric.trim()) fail(`${where}.metric must be a non-empty string`);
		if (!FINDING_KINDS.includes(f.kind)) fail(`${where}.kind must be one of ${FINDING_KINDS.join(", ")}`);
		if (!FINDING_SEVERITIES.includes(f.severity)) fail(`${where}.severity must be one of ${FINDING_SEVERITIES.join(", ")}`);
		if (typeof f.onset !== "string" || Number.isNaN(Date.parse(f.onset))) fail(`${where}.onset must be an ISO timestamp`);
		if (typeof f.summary !== "string" || !f.summary.trim()) fail(`${where}.summary must be a non-empty string`);
		if (!f.evidence || typeof f.evidence !== "object" || Array.isArray(f.evidence)) fail(`${where}.evidence must be an object`);
		const deploys = f.deploys ?? [];
		if (!Array.isArray(deploys) || deploys.some((d) => !d || typeof d.version !== "string" || typeof d.t !== "string")) fail(`${where}.deploys must be an array of { t, version, diff }`);
		return { ...f, deploys };
	});
}

/** Only high severity findings become issues: medium findings stay in the weekly review. */
export function telemetrySignals(findings, findingsPath) {
	const reference = workspacePath(findingsPath);
	return findings
		.filter((f) => f.severity === "high")
		.map((f) =>
			signal("telemetry", f.id, `Investigate high ${f.metric} ${f.kind} from ${f.onset}`, {
				problem: `Predictive monitoring flagged a high severity ${f.kind} on ${f.metric}: ${f.summary}.${f.deploys.length ? ` Deploys within 60 minutes before the onset: ${f.deploys.map((d) => d.version).join(", ")}.` : ""}`,
				evidenceType: "telemetry",
				reference: `${reference}#${f.id}`,
				evidence: `${f.metric} ${f.kind} (${f.severity}) from ${f.onset}: ${f.summary}`,
				criteria: [
					`Given the ${f.kind} on ${f.metric} since ${f.onset}, when a person confirms the cause, then it is recorded with its evidence.`,
					`Given the confirmed cause, then ${f.metric} is back within its baseline, or a control hardening issue is filed for the signal that arrived too late.`,
				],
				source: `Telemetry scan findings \`${reference}\` (finding ${f.id}).`,
			}),
		);
}

/**
 * Validates every input first, then builds the signals. Nothing is built from an invalid input.
 * @param {{incidents?: {path: string, content: string}[], ledger?: {path: string, content: string}, findings?: {path: string, data: unknown}}} inputs
 */
export function buildSignals({ incidents = [], ledger = null, findings = null }) {
	const signals = [];
	for (const { path, content } of incidents) {
		let incident;
		try {
			incident = validateIncidentContent(content, path, { stage: "draft" });
		} catch (err) {
			if (err instanceof IncidentError) fail(`incident ${path}: ${err.message}`);
			throw err;
		}
		try {
			signals.push(...incidentSignals(incident, path));
		} catch (err) {
			if (err instanceof IncidentError) fail(`incident ${path}: ${err.message}`);
			throw err;
		}
	}
	if (ledger) {
		try {
			signals.push(...hypothesisSignals(parseLedger(ledger.content, ledger.path).rows, ledger.path));
		} catch (err) {
			if (err instanceof LedgerError) fail(`ledger ${ledger.path}: ${err.message}`);
			throw err;
		}
	}
	if (findings) signals.push(...telemetrySignals(parseFindings(findings.data), findings.path));
	const ids = new Set();
	for (const s of signals) {
		if (ids.has(s.marker)) fail(`duplicate signal ${s.marker}`);
		ids.add(s.marker);
	}
	return signals;
}

const USAGE = `Usage:
  node emit-learn-issues.mjs --out <dir> [--incident <file>]... [--ledger <hypotheses.md>] [--findings <telemetry-scan --json output>]
Writes signal-<kind>-<id>.md issue bodies and signals.json (title, labels, marker, bodyFile). Inputs are validated first; an invalid input writes nothing.
Open each issue unless one with the same marker exists. Incident records are validated at the draft stage so "Triage Issue: Pending" is accepted.`;

function parseArgs(args) {
	const parsed = { incidents: [] };
	for (let i = 0; i < args.length; i++) {
		const next = args[i + 1];
		if (args[i] === "--out" && next) parsed.out = args[++i];
		else if (args[i] === "--incident" && next) parsed.incidents.push(args[++i]);
		else if (args[i] === "--ledger" && next) parsed.ledger = args[++i];
		else if (args[i] === "--findings" && next) parsed.findings = args[++i];
		else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else fail(`unexpected argument "${args[i]}"`);
	}
	return parsed;
}

async function read(path, label) {
	try {
		return await readFile(path, "utf-8");
	} catch (err) {
		fail(`cannot read ${label} ${path}: ${err.code ?? err.message}`);
	}
}

export async function runEmitter(args = process.argv.slice(2)) {
	try {
		const opts = parseArgs(args);
		if (opts.help) {
			console.log(USAGE);
			return 0;
		}
		if (!opts.out || !(opts.incidents.length || opts.ledger || opts.findings)) {
			console.log(USAGE);
			return 1;
		}
		const inputs = {
			incidents: await Promise.all(opts.incidents.map(async (path) => ({ path, content: await read(path, "incident") }))),
			ledger: opts.ledger ? { path: opts.ledger, content: await read(opts.ledger, "ledger") } : null,
			findings: null,
		};
		if (opts.findings) {
			let data;
			try {
				data = JSON.parse(await read(opts.findings, "findings"));
			} catch (err) {
				if (err instanceof SyntaxError) fail(`findings ${opts.findings} is not valid JSON`);
				throw err;
			}
			inputs.findings = { path: opts.findings, data };
		}
		const signals = buildSignals(inputs);
		await mkdir(opts.out, { recursive: true });
		for (const s of signals) await writeFile(join(opts.out, s.bodyFile), s.body);
		await writeFile(join(opts.out, "signals.json"), `${JSON.stringify(signals.map(({ body, id, ...rest }) => rest), null, 2)}\n`);
		console.log(`✓ Emitted ${signals.length} Learn signal(s) to ${opts.out}`);
		return 0;
	} catch (err) {
		console.error(`✗ [learn-signals] ${err instanceof SignalError ? err.message : err.stack}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runEmitter().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
