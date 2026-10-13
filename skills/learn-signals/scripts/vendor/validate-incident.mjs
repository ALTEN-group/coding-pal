#!/usr/bin/env node

import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export class ValidationError extends Error {}

function fail(message) {
	throw new ValidationError(message);
}

export const REQUIRED_H2 = ["Summary", "Detect", "Mitigate", "Diagnose", "Repair", "Learn", "Ambiguities & Open Questions"];
export const SEVERITIES = ["SEV1", "SEV2", "SEV3"];
export const TIERS = ["Low", "Medium", "High", "Critical"];
export const ROLLBACK_ROLES = ["DevOps", "QA and maintainer"];
export const CONCLUDE_ROLES = ["QA and maintainer", "Developer", "DevOps"];
export const REVIEW_ROLES = ["Product Owner", "Developer", "Architect", "DevOps", "QA and maintainer"];
export const MECHANISMS = ["flag off", "rollback", "forward fix"];
export const CONTROL_KINDS = ["guard", "gate", "contract", "probe"];
export const RESTORE_TARGET_MINUTES = 15;
export const REVIEW_WORKING_DAYS = 5;
export const STAGES = ["draft", "final"];

const NONE = "_None._";
const PLACEHOLDER = /^(tbd|n\/a|\.\.\.|<[^>]*>)$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const EVIDENCE_SOURCES = /\b(logs?|traces?|deploys?|deployments?|diffs?|commits?)\b/i;

const isPlaceholder = (value) => !value || PLACEHOLDER.test(value.trim());
const AI_WORDS = new Set(["copilot", "claude", "gpt", "chatgpt", "gemini", "llm", "bot", "agent", "ai", "assistant", "codex", "openai", "anthropic", "dependabot", "renovate", "renovatebot"]);
const NOT_A_PERSON = new Set(["x", "tbd", "tba", "todo", "unknown", "anonymous", "nobody", "someone", "none", "team", "user", "human", "person", "name", "me", "you", "admin", "system"]);

/** Why a name cannot be a named person, or null. A bare role, a placeholder, or an AI is never a person. */
function notAPerson(name) {
	if (!/\p{L}/u.test(name)) return "it has no letters";
	if (/[<>[\]{}]/.test(name) && !/\[bot\]/i.test(name)) return "it is a placeholder";
	const words = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
	if (words.some((w) => AI_WORDS.has(w.replace(/\d+$/, ""))) || /github[- ]actions/i.test(name)) return "it looks like an AI";
	const plain = words.join(" ").replace(/^the /, "");
	if (REVIEW_ROLES.some((r) => r.toLowerCase() === plain) || NOT_A_PERSON.has(plain) || PLACEHOLDER.test(name.trim())) return "it is a role or a placeholder, not a person's name";
	return null;
}

export function isIsoTimestamp(value) {
	if (!TIMESTAMP.test(value)) return false;
	const date = new Date(value);
	return !Number.isNaN(date.getTime()) && date.toISOString().replace(".000", "") === value;
}

export function isIsoDate(value) {
	if (!DATE.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Number of Monday to Friday days in (from, to]. */
export function workingDaysAfter(from, to) {
	let count = 0;
	for (let t = Date.parse(`${from}T00:00:00Z`) + 86_400_000; t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
		const day = new Date(t).getUTCDay();
		if (day !== 0 && day !== 6) count++;
	}
	return count;
}

function splitSections(markdown, filename) {
	const h2 = [...markdown.matchAll(/^## (.+)$/gm)];
	const names = h2.map((m) => m[1].trim());
	if (names.length !== REQUIRED_H2.length) fail(`${filename} must contain exactly ${REQUIRED_H2.length} level-two headings: ${REQUIRED_H2.map((h) => `## ${h}`).join(", ")}`);
	REQUIRED_H2.forEach((expected, i) => {
		if (names[i] !== expected) fail(`${filename} heading ${i + 1} must be "## ${expected}" (found "## ${names[i]}")`);
	});
	const sections = {};
	h2.forEach((m, i) => {
		const start = m.index + m[0].length;
		const end = i + 1 < h2.length ? h2[i + 1].index : markdown.length;
		sections[names[i]] = markdown.slice(start, end).trim();
	});
	return sections;
}

function parseFields(body) {
	const fields = new Map();
	let current = null;
	for (const line of body.split("\n")) {
		const bullet = line.match(/^- \*\*(.+?):\*\*\s*(.*)$/);
		const item = line.match(/^\s{2,}- (.+)$/);
		if (bullet) {
			current = { label: bullet[1].trim(), value: bullet[2].trim(), items: [] };
			if (fields.has(current.label.toLowerCase())) fail(`field "${current.label}" is declared twice; each field must appear once`);
			fields.set(current.label.toLowerCase(), current);
		} else if (current && item) {
			current.items.push(item[1].trim());
		} else if (current && /^\s{2,}\S/.test(line)) {
			current.value = `${current.value} ${line.trim()}`.trim();
		} else {
			current = null;
		}
	}
	return fields;
}

function required(fields, label, section) {
	const field = fields.get(label.toLowerCase());
	if (!field) fail(`## ${section} is missing the "- **${label}:**" field`);
	return field;
}

function requiredValue(fields, label, section) {
	const { value } = required(fields, label, section);
	if (isPlaceholder(value) || value === NONE) fail(`## ${section}: "${label}" is empty or a placeholder`);
	return value;
}

function requiredTimestamp(fields, label, section) {
	const value = requiredValue(fields, label, section);
	if (!isIsoTimestamp(value)) fail(`## ${section}: "${label}" must be an ISO 8601 UTC timestamp like 2026-10-13T09:30:00Z (found "${value}")`);
	return value;
}

function namedPerson(value, roles, label, section) {
	const match = /^(.+?) \(([^()]+)\)$/.exec(value);
	if (!match || isPlaceholder(match[1]) || !roles.includes(match[2])) {
		fail(`## ${section}: "${label}" must be "<name> (${roles.join(" | ")})" (found "${value}")`);
	}
	const reason = notAPerson(match[1].trim());
	if (reason) fail(`## ${section}: "${label}" "${match[1].trim()}" is not a named person (${reason}): AI proposes, humans decide`);
	return { name: match[1].trim(), role: match[2] };
}

function oneOf(value, allowed, label, section) {
	if (!allowed.includes(value)) fail(`## ${section}: "${label}" must be one of ${allowed.join(", ")} (found "${value}")`);
	return value;
}

function checkTestPath(value) {
	const match = /^`([^`]+)`$/.exec(value);
	if (!match) fail(`## Repair: "Reproducing Test" must be a workspace-relative path in backticks (found "${value}")`);
	const path = match[1];
	if (isAbsolute(path) || /\\/.test(path) || path.split("/").includes("..")) fail(`## Repair: "Reproducing Test" must be a workspace-relative path using "/" and no ".." (found "${path}")`);
	return path;
}

/** The reproducing test must exist under the tests directory, given either relative to it or to the workspace. */
export function testExistsUnder(testPath, testsDir) {
	const root = resolve(testsDir);
	const candidates = [resolve(testPath), resolve(root, testPath)];
	return candidates.some((candidate) => {
		const inside = relative(root, candidate);
		return !inside.startsWith("..") && !isAbsolute(inside) && existsSync(candidate) && statSync(candidate).isFile();
	});
}

function parseCommitOrder(value) {
	const match = /^test (\S+), fix (\S+)$/.exec(value);
	if (!match || !isIsoTimestamp(match[1]) || !isIsoTimestamp(match[2])) {
		fail('## Repair: "Commit Order" must be "test <ISO timestamp>, fix <ISO timestamp>" in UTC like 2026-10-13T10:05:00Z');
	}
	return { test: match[1], fix: match[2] };
}

/**
 * Validates an incident record and returns its structured data.
 * @param {string} content
 * @param {string} filename
 * @param {{stage?: "draft"|"final", testsDir?: string}} options draft allows "Triage Issue: Pending" so the issue can be emitted first
 */
export function validateIncidentContent(content, filename = "incident.md", options = {}) {
	const stage = options.stage ?? "final";
	if (!STAGES.includes(stage)) fail(`stage must be one of ${STAGES.join(", ")}`);
	if (!content.trim()) fail(`${filename} is empty`);
	const markdown = content.replace(/\r\n?/g, "\n");
	const h1 = markdown.match(/^# (.+)$/m);
	if (!h1 || !h1[1].startsWith("Incident: ") || isPlaceholder(h1[1].slice("Incident: ".length))) fail(`${filename} must start with the level-one heading "# Incident: <title>"`);
	if (markdown.slice(0, h1.index).trim()) fail(`${filename} must start with the level-one heading`);
	const title = h1[1].slice("Incident: ".length).trim();
	const sections = splitSections(markdown, filename);

	const summary = parseFields(sections.Summary);
	const severity = oneOf(requiredValue(summary, "Severity", "Summary"), SEVERITIES, "Severity", "Summary");
	const tier = oneOf(requiredValue(summary, "Tier", "Summary"), TIERS, "Tier", "Summary");
	const detectedAt = requiredTimestamp(summary, "Detected At", "Summary");
	const mitigatedAt = requiredTimestamp(summary, "Mitigated At", "Summary");
	const resolvedAt = requiredTimestamp(summary, "Resolved At", "Summary");
	if (detectedAt > mitigatedAt) fail("## Summary: Detected At must not be after Mitigated At");
	if (mitigatedAt > resolvedAt) fail("## Summary: Mitigated At must not be after Resolved At");
	const rollbackDecidedBy = namedPerson(requiredValue(summary, "Rollback Decided By", "Summary"), ROLLBACK_ROLES, "Rollback Decided By", "Summary");

	if (isPlaceholder(sections.Detect)) fail("## Detect is empty: record the alert or customer report that revealed the fault");

	const mitigate = parseFields(sections.Mitigate);
	const mechanism = oneOf(requiredValue(mitigate, "Mechanism", "Mitigate"), MECHANISMS, "Mechanism", "Mitigate");

	const diagnose = parseFields(sections.Diagnose);
	const diagnosisStartedAt = requiredTimestamp(diagnose, "Diagnosis Started At", "Diagnose");
	if (diagnosisStartedAt < mitigatedAt) fail("## Diagnose: Diagnosis Started At is before Mitigated At: mitigation precedes diagnosis");
	if (diagnosisStartedAt > resolvedAt) fail("## Diagnose: Diagnosis Started At is after Resolved At");
	const cause = requiredValue(diagnose, "Cause", "Diagnose");
	const evidence = requiredValue(diagnose, "Evidence", "Diagnose");
	if (!EVIDENCE_SOURCES.test(evidence)) fail("## Diagnose: Evidence must correlate logs, traces, deploys, or diffs");
	const concludedBy = namedPerson(requiredValue(diagnose, "Concluded By", "Diagnose"), CONCLUDE_ROLES, "Concluded By", "Diagnose");

	const repair = parseFields(sections.Repair);
	const reproducingTest = checkTestPath(requiredValue(repair, "Reproducing Test", "Repair"));
	if (options.testsDir && !testExistsUnder(reproducingTest, options.testsDir)) fail(`## Repair: Reproducing Test "${reproducingTest}" does not exist under ${options.testsDir}`);
	if (requiredValue(repair, "Failed Before Fix", "Repair") !== "yes") fail('## Repair: "Failed Before Fix" must be "yes": the test must fail before the fix');
	if (requiredValue(repair, "Passes After Fix", "Repair") !== "yes") fail('## Repair: "Passes After Fix" must be "yes"');
	const fixCommit = requiredValue(repair, "Fix Commit", "Repair");
	const testCommit = requiredValue(repair, "Test Commit", "Repair");
	for (const [label, value] of [["Fix Commit", fixCommit], ["Test Commit", testCommit]]) {
		if (!COMMIT.test(value)) fail(`## Repair: "${label}" must be a 7 to 40 character hexadecimal commit id (found "${value}")`);
	}
	if (fixCommit === testCommit) fail("## Repair: Test Commit and Fix Commit must be different commits");
	const commitOrder = parseCommitOrder(requiredValue(repair, "Commit Order", "Repair"));
	if (commitOrder.test >= commitOrder.fix) fail("## Repair: the Test Commit must come before the Fix Commit (a failing test first)");
	if (commitOrder.test < diagnosisStartedAt) fail("## Repair: the Test Commit is dated before Diagnosis Started At");
	if (commitOrder.fix > resolvedAt) fail("## Repair: the Fix Commit is dated after Resolved At");

	const learn = parseFields(sections.Learn);
	const reviewDate = requiredValue(learn, "Review Date", "Learn");
	if (!isIsoDate(reviewDate)) fail(`## Learn: "Review Date" must be an ISO date YYYY-MM-DD (found "${reviewDate}")`);
	const resolvedDate = resolvedAt.slice(0, 10);
	if (reviewDate < resolvedDate) fail("## Learn: Review Date is before Resolved At");
	const reviewDay = new Date(`${reviewDate}T00:00:00Z`).getUTCDay();
	if (reviewDay === 0 || reviewDay === 6) fail(`## Learn: Review Date ${reviewDate} is a weekend; reviews happen Monday to Friday`);
	const waited = workingDaysAfter(resolvedDate, reviewDate);
	if (waited > REVIEW_WORKING_DAYS) fail(`## Learn: Review Date is ${waited} working days after Resolved At; the review is due within ${REVIEW_WORKING_DAYS}`);
	const reviewedBy = namedPerson(requiredValue(learn, "Reviewed By", "Learn"), REVIEW_ROLES, "Reviewed By", "Learn");
	const whatShouldHaveCaught = requiredValue(learn, "What Should Have Caught This", "Learn");

	const hardening = required(learn, "Control Hardening", "Learn");
	let controls = [];
	let noControlReason = null;
	const none = /^None: (.+)$/.exec(hardening.value);
	if (none) {
		if (hardening.items.length) fail('## Learn: "Control Hardening" cannot be "None" and also list items');
		if (isPlaceholder(none[1])) fail('## Learn: "Control Hardening: None" needs a reason');
		noControlReason = none[1].trim();
	} else {
		if (hardening.value) fail('## Learn: "Control Hardening" must list nested items "- <guard|gate|contract|probe>: <what to add>" or "None: <reason>"');
		if (!hardening.items.length) fail('## Learn: "Control Hardening" needs at least one item or "None: <reason>"');
		controls = hardening.items.map((text) => {
			const match = /^(guard|gate|contract|probe): (.+)$/.exec(text);
			if (!match || isPlaceholder(match[2])) fail(`## Learn: Control Hardening item must be "<${CONTROL_KINDS.join("|")}>: <what to add>" (found "${text}")`);
			return { kind: match[1], what: match[2].trim() };
		});
	}

	const triageField = required(learn, "Triage Issue", "Learn").value;
	if (isPlaceholder(triageField)) fail('## Learn: "Triage Issue" is empty or a placeholder');
	if (triageField === NONE) {
		if (controls.length) fail('## Learn: "Triage Issue" can be _None._ only when Control Hardening is "None"');
	} else if (!/^#[1-9]\d*$/.test(triageField)) {
		if (!(stage === "draft" && triageField === "Pending")) fail(`## Learn: "Triage Issue" must be #<number> or _None._${stage === "draft" ? " or Pending" : ""} (found "${triageField}")`);
		if (!controls.length) fail('## Learn: "Triage Issue: Pending" only applies when Control Hardening lists items');
	} else if (!controls.length) {
		fail('## Learn: Control Hardening is "None", so "Triage Issue" must be _None._');
	}

	const actions = required(learn, "Postmortem Actions", "Learn");
	let postmortemActions = [];
	if (actions.value === NONE && !actions.items.length) {
		postmortemActions = [];
	} else {
		if (actions.value) fail('## Learn: "Postmortem Actions" must be _None._ or nested items "<action> (owner: <name>)"');
		if (!actions.items.length) fail('## Learn: "Postmortem Actions" needs at least one item or _None._');
		postmortemActions = actions.items.map((text) => {
			const match = /^(.+?) \(owner: ([^()]+)\)$/.exec(text);
			if (!match || isPlaceholder(match[2])) fail(`## Learn: every Postmortem Action needs an owner "<action> (owner: <name>)" (found "${text}")`);
			return { action: match[1].trim(), owner: match[2].trim() };
		});
	}

	if (isPlaceholder(sections["Ambiguities & Open Questions"])) fail("## Ambiguities & Open Questions is empty: list open questions or write _None._");

	return {
		title,
		severity,
		tier,
		detectedAt,
		mitigatedAt,
		resolvedAt,
		rollbackDecidedBy,
		mechanism,
		diagnosisStartedAt,
		cause,
		evidence,
		concludedBy,
		reproducingTest,
		fixCommit,
		testCommit,
		reviewDate,
		reviewedBy,
		whatShouldHaveCaught,
		controls,
		noControlReason,
		triageIssue: triageField,
		postmortemActions,
		timeToRestoreMinutes: (Date.parse(mitigatedAt) - Date.parse(detectedAt)) / 60_000,
		stage,
	};
}

/** The file name is docs/incidents/<YYYY-MM-DD>-<slug>.md and the date is the detection date. */
export function checkFileName(path, detectedAt) {
	const match = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/.exec(basename(path));
	if (!match) fail(`file name must be <YYYY-MM-DD>-<slug>.md in lowercase (found "${basename(path)}")`);
	if (match[1] !== detectedAt.slice(0, 10)) fail(`file name date ${match[1]} must match the Detected At date ${detectedAt.slice(0, 10)}`);
	return { date: match[1], slug: match[2] };
}

export function restoreStatus(minutes) {
	return minutes < RESTORE_TARGET_MINUTES ? `met (target under ${RESTORE_TARGET_MINUTES} min)` : `missed (target under ${RESTORE_TARGET_MINUTES} min)`;
}

function parseArgs(args) {
	const parsed = { stage: "final" };
	const valueFlags = { "--file": "file", "--tests-dir": "testsDir", "--stage": "stage" };
	for (let i = 0; i < args.length; i++) {
		const key = valueFlags[args[i]];
		if (key) {
			const next = args[++i];
			if (!next || next.startsWith("--")) parsed.error = `${args[i - 1]} needs a value`;
			else parsed[key] = next;
		} else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else parsed.error = `Unknown argument: ${args[i]}`;
	}
	return parsed;
}

export async function runValidator(args = process.argv.slice(2)) {
	const opts = parseArgs(args);
	if (opts.error && !opts.help) {
		console.error(`✗ [incident] ${opts.error}`);
		return 1;
	}
	if (opts.help || !opts.file) {
		console.log(`Usage:
  node validate-incident.mjs --file docs/incidents/<YYYY-MM-DD>-<slug>.md [--tests-dir <dir>] [--stage draft|final]
Options:
  --tests-dir <dir>   The reproducing test must exist under this directory
  --stage draft       Allow "Triage Issue: Pending" so Learn can emit the issue first (default: final)`);
		return opts.help ? 0 : 1;
	}
	try {
		const content = await readFile(opts.file, "utf-8");
		const incident = validateIncidentContent(content, opts.file, { stage: opts.stage, testsDir: opts.testsDir });
		checkFileName(opts.file, incident.detectedAt);
		console.log(`✓ [incident] Validated (${incident.stage}): "${incident.title}" ${incident.severity}, tier ${incident.tier}, ${incident.controls.length} control hardening item(s) (${opts.file})`);
		console.log(`Time to restore: ${incident.timeToRestoreMinutes} min, ${restoreStatus(incident.timeToRestoreMinutes)}`);
		return 0;
	} catch (err) {
		console.error(`✗ [incident] ${err instanceof ValidationError ? `Validation failed: ${err.message}` : err.message}`);
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
