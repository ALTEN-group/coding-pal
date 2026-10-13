#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	ESCALATION_FILE,
	NONE,
	ValidationError,
	fail,
	isPlaceholder,
	loadEscalations,
	need,
	normalizeNewlines,
	parseFields,
	parsePerson,
	validDate,
	validateEscalationContent,
} from "./escalations.mjs";

export { ValidationError };

export const STATUSES = ["Drafted", "Accepted", "Rejected", "Superseded"];
export const TYPES = ["contract-change", "data-model", "security", "runtime-vendor", "ai-policy", "model-adoption", "tooling", "other"];
export const TIERS = ["Low", "Medium", "High", "Critical"];
export const DECISION_FILE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

const DECISION_H2 = ["Context", "Options", "Decision", "Consequences"];
const UNSIGNED = "Drafted: unsigned";
const SIGNED = /^Signed by (.+) on (\d{4}-\d{2}-\d{2})$/;
const ISSUE_REF = /^(#\d+|issue-\d+)$/;

/** Splits markdown into lines grouped by level-two headings, ignoring headings inside code fences. */
function splitH2(markdown) {
	const lines = markdown.split("\n");
	const sections = [];
	const preamble = [];
	let current = null;
	let fence = null;
	for (const line of lines) {
		const f = line.match(/^\s*(`{3,}|~{3,})/);
		if (f) fence = fence ? (f[1][0] === fence ? null : fence) : f[1][0];
		const h = !fence && !f ? line.match(/^## (.+)$/) : null;
		if (h) {
			current = { name: h[1].trim(), lines: [] };
			sections.push(current);
		} else if (current) current.lines.push(line);
		else preamble.push(line);
	}
	return { preamble: preamble.join("\n"), sections: sections.map((s) => ({ name: s.name, body: s.lines.join("\n").trim() })) };
}

/** Normalizes a workspace-relative path: no absolute paths, backslashes, or `..`. */
export function checkWorkspacePath(value, where, filename) {
	const path = value.replace(/^`|`$/g, "").trim();
	if (!path || isPlaceholder(path)) fail(`${filename} ${where} must be a workspace-relative path`);
	if (/^([a-zA-Z]:|\/|~)/.test(path) || path.includes("\\") || path.includes("://") || path.split("/").includes("..")) {
		fail(`${filename} ${where} "${path}" must be a workspace-relative path using "/" and no ".."`);
	}
	return path;
}

function parseOptions(body, filename) {
	const matches = [...body.matchAll(/^### Option (\d+): (.+)$/gm)];
	if (matches.length < 2) fail(`${filename} "## Options" needs 2 or more "### Option <N>: <name>" blocks`);
	const seen = new Set();
	return matches.map((m, i) => {
		const n = Number(m[1]);
		const name = m[2].trim();
		if (n !== i + 1) fail(`${filename} option #${i + 1} is numbered ${n}; options must be numbered sequentially from 1`);
		if (isPlaceholder(name)) fail(`${filename} Option ${n} needs a name`);
		if (seen.has(name.toLowerCase())) fail(`${filename} Option ${n} repeats the name "${name}"`);
		seen.add(name.toLowerCase());
		const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
		const fields = parseFields(body.slice(m.index + m[0].length, end));
		for (const label of ["Pros", "Cons"]) {
			const value = need(fields, label, `Option ${n}`, filename);
			if (value === NONE) fail(`${filename} Option ${n} field "${label}" must not be "${NONE}"; name a real ${label.toLowerCase()}`);
		}
		return { n, name };
	});
}

/**
 * Validates a decision record and returns its structured content.
 * @param {string} rawMarkdown
 * @param {string} [filename="decision.md"]
 */
export function validateDecisionContent(rawMarkdown, filename = "decision.md") {
	const markdown = normalizeNewlines(rawMarkdown).trim();
	if (!markdown) fail(`${filename} is empty`);
	const h1 = markdown.split("\n")[0].match(/^# Decision:[ \t]*(.*)$/);
	if (!h1 || !h1[1].trim() || isPlaceholder(h1[1].trim())) fail(`${filename} must start with a level-one heading: "# Decision: <title>"`);
	if (/^```(js|ts|javascript|typescript|python|java|go|sh|bash)\b/m.test(markdown)) fail(`${filename} must not contain source code blocks`);

	const { preamble, sections } = splitH2(markdown);
	if (sections.length !== DECISION_H2.length) {
		fail(`${filename} must contain exactly ${DECISION_H2.length} level-two headings: ${DECISION_H2.map((h) => `## ${h}`).join(", ")}`);
	}
	sections.forEach((s, i) => {
		if (s.name !== DECISION_H2[i]) fail(`${filename} heading #${i + 1} is "## ${s.name}", expected "## ${DECISION_H2[i]}"`);
		if (!s.body || isPlaceholder(s.body)) fail(`${filename} has empty section for "## ${s.name}"`);
	});
	const body = Object.fromEntries(sections.map((s) => [s.name, s.body]));

	const header = parseFields(preamble.slice(h1[0].length));
	const status = STATUSES.find((s) => s.toLowerCase() === need(header, "Status", "header", filename).toLowerCase());
	if (!status) fail(`${filename} Status must be one of: ${STATUSES.join(", ")}`);
	const date = need(header, "Date", "header", filename);
	if (!validDate(date)) fail(`${filename} Date must be a valid ISO date (YYYY-MM-DD), found "${date}"`);
	const typeRaw = need(header, "Type", "header", filename).toLowerCase();
	const type = TYPES.find((t) => t === typeRaw);
	if (!type) fail(`${filename} Type must be one of: ${TYPES.join(", ")}`);

	const deciders = need(header, "Deciders", "header", filename)
		.split(",")
		.map((d) => parsePerson(d, "Deciders entry", filename));
	if (new Set(deciders.map((d) => d.name.toLowerCase())).size !== deciders.length) fail(`${filename} Deciders lists a person twice`);
	if (!deciders.some((d) => d.role === "Architect")) fail(`${filename} Deciders must include an Architect; these decisions are the Architect's`);

	const sourceRaw = need(header, "Source", "header", filename).replace(/^`|`$/g, "").trim();
	const source = ISSUE_REF.test(sourceRaw) ? sourceRaw : checkWorkspacePath(sourceRaw, "Source", filename);

	const supersedesRaw = need(header, "Supersedes", "header", filename).replace(/^`|`$/g, "").trim();
	if (supersedesRaw !== NONE && !/^\d{4}$/.test(supersedesRaw)) fail(`${filename} Supersedes must be a 4-digit record number or "${NONE}", found "${supersedesRaw}"`);
	const supersedes = supersedesRaw === NONE ? null : Number(supersedesRaw);

	const signatureRaw = need(header, "Signature", "header", filename);
	let signature = { signed: false, by: null, date: null };
	if (status === "Drafted") {
		if (signatureRaw !== UNSIGNED) fail(`${filename} a Drafted record must carry "- **Signature:** ${UNSIGNED}"; only the Architect signs`);
	} else {
		const m = signatureRaw.match(SIGNED);
		if (!m) fail(`${filename} a ${status} record needs "- **Signature:** Signed by <name> (Architect) on YYYY-MM-DD"; AI may only produce Drafted records`);
		const by = parsePerson(m[1], "Signature", filename);
		if (by.role !== "Architect") fail(`${filename} Signature must be by an Architect, found "${by.role}"`);
		if (!deciders.some((d) => d.role === "Architect" && d.name.toLowerCase() === by.name.toLowerCase())) fail(`${filename} Signature by ${by.name} must match an Architect listed in Deciders`);
		if (!validDate(m[2])) fail(`${filename} Signature date must be a valid ISO date, found "${m[2]}"`);
		if (m[2] < date) fail(`${filename} Signature date ${m[2]} is before the record Date ${date}`);
		signature = { signed: true, by, date: m[2] };
	}

	const required = {
		tooling: ["Native Alternatives Considered", "Context Preservation"],
		"data-model": ["Migration Plan"],
		"model-adoption": ["Evaluation Report"],
	}[type] ?? [];
	for (const label of required) {
		if (need(header, label, `header (Type ${type})`, filename) === NONE) fail(`${filename} Type ${type} requires "${label}"; it must not be "${NONE}"`);
	}
	const evaluationReport = type === "model-adoption" ? checkWorkspacePath(header.get("evaluation report"), "Evaluation Report", filename) : null;

	const choices = parseOptions(body.Options, filename);
	return { title: h1[1].trim(), status, date, type, deciders, source, supersedes, signature, options: choices, evaluationReport };
}

export function recordNumber(filename) {
	const m = basename(filename).match(DECISION_FILE);
	if (!m) fail(`${filename} must be named "<NNNN>-<slug>.md" (4-digit number, lowercase kebab-case)`);
	return Number(m[1]);
}

const pad = (n) => String(n).padStart(4, "0");

/**
 * Checks numbering and supersession across a set of records.
 * @param {{file: string, number: number, status: string, supersedes: number|null}[]} records
 */
export function checkRecordSet(records) {
	const byNumber = new Map();
	for (const r of records) {
		if (byNumber.has(r.number)) fail(`record number ${pad(r.number)} is used by both ${byNumber.get(r.number).file} and ${r.file}`);
		byNumber.set(r.number, r);
	}
	const numbers = [...byNumber.keys()].sort((a, b) => a - b);
	numbers.forEach((n, i) => {
		if (n !== i + 1) fail(`record numbering must be sequential from 0001 with no gaps: expected ${pad(i + 1)}, found ${pad(n)}`);
	});

	const supersededBy = new Map();
	for (const r of records) {
		if (r.supersedes === null) continue;
		if (r.supersedes === r.number) fail(`${r.file} cannot supersede itself`);
		const target = byNumber.get(r.supersedes);
		if (!target) fail(`${r.file} supersedes ${pad(r.supersedes)}, which does not exist`);
		if (target.number > r.number) fail(`${r.file} supersedes ${pad(r.supersedes)}, which is newer than the record itself`);
		if (supersededBy.has(target.number)) fail(`${pad(target.number)} is superseded by both ${supersededBy.get(target.number).file} and ${r.file}`);
		supersededBy.set(target.number, r);
		const active = r.status === "Accepted" || r.status === "Superseded";
		if (active && target.status !== "Superseded") fail(`${r.file} is ${r.status} and supersedes ${pad(target.number)}, so ${target.file} must have Status Superseded (found ${target.status})`);
		if (!active && target.status !== "Accepted") fail(`${r.file} is ${r.status} and proposes to supersede ${pad(target.number)}, which must still be Accepted (found ${target.status})`);
	}
	for (const r of records) {
		if (r.status === "Superseded" && !supersededBy.has(r.number)) fail(`${r.file} is Superseded but no record lists ${pad(r.number)} in Supersedes`);
	}
}

/** Extracts the `## Decision Record` and `## Blast Radius` facts from a think.md. */
export function parseThinkDecision(rawMarkdown, filename = "think.md") {
	const { sections } = splitH2(normalizeNewlines(rawMarkdown));
	const section = (name) => {
		const s = sections.find((x) => x.name === name);
		if (!s) fail(`${filename} has no "## ${name}" section`);
		return parseFields(s.body);
	};
	const dr = section("Decision Record");
	const required = need(dr, "Required", "## Decision Record", filename).toLowerCase().split(/[\s.,;:(]/)[0];
	if (!["yes", "no"].includes(required)) fail(`${filename} Decision Record "Required" must be "yes" or "no"`);
	let record = null;
	let status = null;
	if (required === "yes") {
		record = checkWorkspacePath(need(dr, "Record", "## Decision Record", filename), "Decision Record Record", filename);
		const s = need(dr, "Status", "## Decision Record", filename).toLowerCase().match(/^(drafted|signed)\b/);
		if (!s) fail(`${filename} Decision Record "Status" must be "Drafted" (awaiting Architect) or "Signed"`);
		status = s[1];
	}
	const tierRaw = need(section("Blast Radius"), "Tier", "## Blast Radius", filename).replace(/[*`]/g, "").trim();
	const tier = TIERS.find((t) => t.toLowerCase() === tierRaw.toLowerCase());
	if (!tier) fail(`${filename} Blast Radius "Tier" must be one of: ${TIERS.join(", ")}`);
	return { required: required === "yes", record, status, tier };
}

/**
 * Cross-checks think.md against the decision record it points to.
 * @param {ReturnType<typeof parseThinkDecision>} think
 * @param {ReturnType<typeof validateDecisionContent>|null} record null when the record file does not exist
 */
export function crossCheckThink(think, record, filename = "think.md") {
	if (!think.required) {
		if (think.tier === "Critical") fail(`${filename} a Critical blast radius requires a decision record`);
		return;
	}
	if (!record) fail(`${filename} points to decision record "${think.record}", which does not exist`);
	if (think.status === "signed" && !(record.signature.signed && record.status !== "Drafted")) {
		fail(`${filename} calls the decision record Signed, but ${think.record} is ${record.status} with signature "${UNSIGNED}"; only the Architect signs, and a signed record is Accepted or Rejected`);
	}
	if (think.status === "drafted" && record.signature.signed) {
		fail(`${filename} calls the decision record Drafted, but ${think.record} is already signed; update the Status in think.md`);
	}
}

async function fileExists(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

async function dirExists(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

/** Validates one file as a decision record or an escalation (by its heading). Returns a log line. */
async function validateOne(path, root) {
	const raw = await readFile(path, "utf-8");
	if (raw.trimStart().startsWith("# Escalation:")) {
		const m = basename(path).match(ESCALATION_FILE);
		if (!m || !validDate(m[1])) fail(`${path} must be named "<YYYY-MM-DD>-<slug>.md" (lowercase kebab-case)`);
		const e = validateEscalationContent(raw, path, { fileDate: m[1] });
		return { kind: "escalation", message: `✓ [escalation] Validated: "${e.title}" (${e.status}, default ${e.defaultDate}) (${path})` };
	}
	const number = recordNumber(path);
	const record = validateDecisionContent(raw, path);
	if (record.evaluationReport && !(await fileExists(join(root, record.evaluationReport)))) {
		fail(`${path} Evaluation Report "${record.evaluationReport}" does not exist`);
	}
	return {
		kind: "decision",
		record: { file: path, number, status: record.status, supersedes: record.supersedes, parsed: record },
		message: `✓ [decision] Validated: "${record.title}" (${pad(number)}, ${record.status}, ${record.type}) (${path})`,
	};
}

function parseArgs(args) {
	const parsed = { file: null, dir: null, think: null, root: null, problems: [] };
	const values = { "--file": "file", "--dir": "dir", "--think": "think", "--root": "root" };
	for (let i = 0; i < args.length; i++) {
		const key = values[args[i]];
		if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else if (!key) parsed.problems.push(`Unknown argument: ${args[i]}`);
		else if (!args[i + 1]) parsed.problems.push(`${args[i]} needs a value`);
		else parsed[key] = args[++i];
	}
	return parsed;
}

export async function runValidator(args = process.argv.slice(2)) {
	const opts = parseArgs(args);
	if (!opts.help && opts.problems.length) {
		console.error(`✗ ${opts.problems[0]}`);
		return 1;
	}
	if (opts.help || (!opts.file && !opts.dir && !opts.think)) {
		console.log(`Usage:
  node validate-decision.mjs --file <docs/decisions/NNNN-slug.md | docs/decisions/escalations/YYYY-MM-DD-slug.md> [--think <think.md>]
  node validate-decision.mjs --dir <docs/decisions> [--think <think.md>]
  node validate-decision.mjs --think <specs/issue-N/think.md>
Options:
  --think <file>   Cross-check the think.md "## Decision Record" against the record it points to
  --root <dir>     Workspace root for resolving record and report paths (default: current directory)
`);
		return opts.help ? 0 : 1;
	}

	const root = resolve(opts.root ?? ".");
	try {
		const checked = new Map();
		if (opts.file) {
			if (!(await fileExists(opts.file))) fail(`File not found: ${opts.file}`);
			const result = await validateOne(opts.file, root);
			console.log(result.message);
			if (result.record) checked.set(resolve(opts.file), result.record.parsed);
		}
		if (opts.dir) {
			if (!(await dirExists(opts.dir))) fail(`Directory not found: ${opts.dir}`);
			const names = (await readdir(opts.dir)).filter((n) => n.endsWith(".md") && n !== "README.md").sort();
			const records = [];
			for (const name of names) {
				const path = join(opts.dir, name);
				const result = await validateOne(path, root);
				if (result.kind === "escalation") fail(`${path} is an escalation; escalations live in ${join(opts.dir, "escalations")}`);
				console.log(result.message);
				records.push(result.record);
				checked.set(resolve(path), result.record.parsed);
			}
			checkRecordSet(records);
			const escDir = join(opts.dir, "escalations");
			let escalations = 0;
			if (await dirExists(escDir)) {
				escalations = (await loadEscalations(escDir)).length;
			}
			console.log(`✓ [decisions] ${records.length} record(s) numbered 0001-${pad(records.length)} and ${escalations} escalation(s) are consistent (${opts.dir})`);
		}
		if (opts.think) {
			if (!(await fileExists(opts.think))) fail(`File not found: ${opts.think}`);
			const think = parseThinkDecision(await readFile(opts.think, "utf-8"), opts.think);
			let record = null;
			if (think.required) {
				const path = resolve(root, think.record);
				if (opts.file && resolve(opts.file) !== path) fail(`${opts.think} points to ${think.record}, but --file is ${opts.file}`);
				if (await fileExists(path)) {
					record = checked.get(path) ?? (await validateOne(path, root)).record?.parsed ?? null;
					if (!checked.has(path)) console.log(`✓ [decision] Validated the record named by ${opts.think} (${think.record})`);
				}
			}
			crossCheckThink(think, record, opts.think);
			console.log(`✓ [think.md] Decision Record is consistent (${think.required ? `${think.record}, ${think.status}` : "not required"}, tier ${think.tier}) (${opts.think})`);
		}
		return 0;
	} catch (err) {
		console.error(`✗ Validation failed: ${err instanceof ValidationError ? err.message : err.stack}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runValidator().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
