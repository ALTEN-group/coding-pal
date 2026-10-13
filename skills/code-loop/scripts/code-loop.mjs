#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, posix, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export class ValidationError extends Error {}

function fail(message) {
	throw new ValidationError(message);
}

export const DEFAULT_LIMIT = 5;
export const WARNING_THRESHOLD = 3;
export const STATUSES = ["pending", "in_progress", "done"];
export const LIMIT_MESSAGE = "fix-loop limit reached: the Developer steps in";
export const APPROVAL_MESSAGE = "plan is not approved by a Developer; Code starts only from an approved plan";

const USAGE = `Usage:
  node code-loop.mjs status --dir specs/issue-<n> [--json]
  node code-loop.mjs next --dir specs/issue-<n> [--json]
  node code-loop.mjs start <step> --dir specs/issue-<n>
  node code-loop.mjs pass <step> --dir specs/issue-<n>
  node code-loop.mjs fail <step> --reason "<text>" --dir specs/issue-<n> [--limit 5]
  node code-loop.mjs check-history --dir specs/issue-<n> [--base origin/main]
`;

function normalizeNewlines(value) {
	return value.replace(/\r\n?/g, "\n");
}

/** sha256 of plan.md with line endings normalized to LF, so Windows and Unix checkouts agree. */
export function planSha256(plan) {
	return createHash("sha256").update(normalizeNewlines(plan)).digest("hex");
}

/** Replaces every line inside a fenced code block with a filler so structural regexes cannot match code. */
function maskFences(lines, filename) {
	let fence = null;
	const masked = lines.map((line) => {
		const m = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
		if (fence) {
			if (m && m[1][0] === fence.char && m[1].length >= fence.len && !m[2].trim()) fence = null;
			return "\u0001".repeat(line.length);
		}
		if (m) {
			fence = { char: m[1][0], len: m[1].length };
			return "\u0001".repeat(line.length);
		}
		return line;
	});
	if (fence) fail(`${filename} contains an unclosed code fence`);
	return masked;
}

/**
 * Parses the ordered steps of plan.md. Fence-aware: step-like text inside `New Code` is ignored.
 * @returns {{number: number, name: string, fields: Record<string, string>}[]}
 */
export function parsePlanSteps(rawPlan, filename = "plan.md") {
	const lines = normalizeNewlines(rawPlan).split("\n");
	const masked = maskFences(lines, filename);
	const start = masked.findIndex((line) => /^## Implementation Checklist\s*$/.test(line));
	if (start === -1) fail(`${filename} has no "## Implementation Checklist" section`);
	let end = masked.findIndex((line, i) => i > start && /^## /.test(line));
	if (end === -1) end = lines.length;

	const heads = [];
	for (let i = start + 1; i < end; i++) {
		const m = masked[i].match(/^### Step (\d+):\s+(.+?)\s*$/);
		if (m) heads.push({ index: i, number: Number(m[1]), name: m[2] });
	}
	if (!heads.length) fail(`${filename} has no "### Step <N>: <name>" headings in "## Implementation Checklist"`);

	return heads.map((head, i) => {
		if (head.number !== i + 1) fail(`${filename} step numbers must be sequential. Expected Step ${i + 1}, found Step ${head.number}`);
		const blockEnd = i + 1 < heads.length ? heads[i + 1].index : end;
		const fields = {};
		for (let j = head.index + 1; j < blockEnd; j++) {
			const m = masked[j].match(/^- \*\*(.+?):\*\*\s*(.*)$/);
			if (m) fields[m[1].trim()] = m[2].trim();
		}
		return { number: head.number, name: head.name, fields };
	});
}

const APPROVED_BY = /^([^;()]+) \(Developer\) on (\d{4}-\d{2}-\d{2})(?:; ([^;()]+) \(Architect\) on (\d{4}-\d{2}-\d{2}))?$/;
const NOT_A_PERSON = /(^|[^a-z0-9])(copilot|claude|gpt|gemini|chatgpt|openai|anthropic|bot|agent|dependabot|renovate|github-actions|ai|llm|assistant|automation|pipeline)([^a-z0-9]|$)/i;
const NAME_PLACEHOLDER = /^(tbd|x|<[^>]*>)$/i;

function isValidDate(value) {
	return !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

/**
 * Reads the plan's "## Approval" -> "Approved By" field. Approved means a named human Developer and a valid date
 * (`<name> (Developer) on YYYY-MM-DD`, optionally followed by `; <name> (Architect) on YYYY-MM-DD`).
 * @returns {{approved: boolean, value: string, reason: string|null}}
 */
export function parsePlanApproval(rawPlan, filename = "plan.md") {
	const lines = normalizeNewlines(rawPlan).split("\n");
	const masked = maskFences(lines, filename);
	const start = masked.findIndex((line) => /^## Approval\s*$/.test(line));
	if (start === -1) return { approved: false, value: "missing", reason: `${filename} has no "## Approval" section` };
	let end = masked.findIndex((line, i) => i > start && /^## /.test(line));
	if (end === -1) end = lines.length;
	const field = masked.slice(start + 1, end).map((line) => line.match(/^- \*\*Approved By:\*\*\s*(.*)$/)).find(Boolean);
	if (!field) return { approved: false, value: "missing", reason: `${filename} "## Approval" has no "- **Approved By:**" field` };
	const value = field[1].trim();
	const m = value.match(APPROVED_BY);
	if (!m) return { approved: false, value, reason: `"${value}" is not "<name> (Developer) on YYYY-MM-DD"` };
	const people = [[m[1].trim(), m[2]], ...(m[3] ? [[m[3].trim(), m[4]]] : [])];
	for (const [name, date] of people) {
		if (NAME_PLACEHOLDER.test(name)) return { approved: false, value, reason: `approver "${name}" is a placeholder` };
		if (NOT_A_PERSON.test(name)) return { approved: false, value, reason: `approver "${name}" is an AI or automation, not a person` };
		if (!isValidDate(date)) return { approved: false, value, reason: `approval date ${date} is not a valid date` };
	}
	if (people.length === 2 && people[0][0].toLowerCase() === people[1][0].toLowerCase()) {
		return { approved: false, value, reason: "the Developer and the Architect must be two different people" };
	}
	return { approved: true, value, reason: null };
}

function assertApproved(approval) {
	if (!approval.approved) fail(`${APPROVAL_MESSAGE} (${approval.reason})`);
}

export function createState(issue, sha, stepCount, limit = DEFAULT_LIMIT) {
	const steps = {};
	for (let n = 1; n <= stepCount; n++) steps[n] = { status: "pending", attempts: 0, verifiedAt: null, lastFailure: null };
	return { issue, planSha256: sha, steps, fixLoop: { attempts: 0, limit } };
}

function isUntouched(state) {
	return (
		Number.isInteger(state.fixLoop?.limit) &&
		state.fixLoop.attempts === 0 &&
		Object.values(state.steps).every((s) => s?.status === "pending" && s.attempts === 0)
	);
}

/** Checks the shape and ordering invariants of progress.json so hand edits that break the loop are caught. */
export function validateState(state, stepCount) {
	const bad = (message) => fail(`progress.json is invalid: ${message}`);
	if (!state || typeof state !== "object" || Array.isArray(state)) bad("it must be a JSON object");
	if (typeof state.planSha256 !== "string" || !state.planSha256) bad('"planSha256" is missing');
	if (!state.steps || typeof state.steps !== "object") bad('"steps" is missing');
	const keys = Object.keys(state.steps);
	if (keys.length !== stepCount || !Array.from({ length: stepCount }, (_, i) => String(i + 1)).every((k) => keys.includes(k))) {
		bad(`"steps" must have exactly the keys 1 to ${stepCount}`);
	}
	let sum = 0;
	const order = [];
	for (let n = 1; n <= stepCount; n++) {
		const s = state.steps[n];
		if (!s || !STATUSES.includes(s.status)) bad(`step ${n} status must be one of ${STATUSES.join(", ")}`);
		if (!Number.isInteger(s.attempts) || s.attempts < 0) bad(`step ${n} attempts must be a non-negative integer`);
		if (s.status === "done" ? typeof s.verifiedAt !== "string" || !s.verifiedAt : s.verifiedAt != null) {
			bad(`step ${n} verifiedAt must be set exactly when the step is done`);
		}
		order.push(s.status);
		sum += s.attempts;
	}
	if (!/^(done)*(in_progress)?(pending)*$/.test(order.join(""))) {
		bad("steps are strictly ordered: done steps first, at most one in_progress step next, then pending steps");
	}
	const loop = state.fixLoop;
	if (!loop || !Number.isInteger(loop.attempts) || loop.attempts < 0 || !Number.isInteger(loop.limit) || loop.limit < 1 || loop.limit > DEFAULT_LIMIT) {
		bad(`"fixLoop" needs an integer "attempts" and a "limit" from 1 to ${DEFAULT_LIMIT}`);
	}
	if (loop.attempts !== sum) bad(`fixLoop.attempts (${loop.attempts}) must equal the sum of step attempts (${sum})`);
}

function assertNotLocked(state) {
	if (state.fixLoop.attempts >= state.fixLoop.limit) fail(`${LIMIT_MESSAGE} (${state.fixLoop.attempts}/${state.fixLoop.limit} attempts)`);
}

export function nextStepNumber(state) {
	const numbers = Object.keys(state.steps).map(Number).sort((a, b) => a - b);
	return numbers.find((n) => state.steps[n].status !== "done") ?? null;
}

function resolveStep(raw, state) {
	const n = Number(raw);
	if (!/^\d+$/.test(String(raw ?? "")) || !state.steps[n]) {
		fail(`step "${raw ?? ""}" does not exist in plan.md (steps 1 to ${Object.keys(state.steps).length})`);
	}
	return n;
}

export function startStep(state, raw) {
	assertNotLocked(state);
	const n = resolveStep(raw, state);
	const step = state.steps[n];
	if (step.status === "done") fail(`Step ${n} is already done`);
	if (step.status === "in_progress") fail(`Step ${n} is already in progress`);
	const next = nextStepNumber(state);
	if (n !== next) fail(`Step ${next} must be completed before Step ${n}: steps are strictly ordered`);
	step.status = "in_progress";
	return n;
}

export function passStep(state, raw, now = new Date()) {
	assertNotLocked(state);
	const n = resolveStep(raw, state);
	const step = state.steps[n];
	if (step.status !== "in_progress") fail(`Step ${n} is ${step.status}; start it before recording a pass`);
	step.status = "done";
	step.verifiedAt = now.toISOString().replace(/\.\d{3}Z$/, "Z");
	return n;
}

export function failStep(state, raw, reason) {
	assertNotLocked(state);
	const n = resolveStep(raw, state);
	const step = state.steps[n];
	if (step.status !== "in_progress") fail(`Step ${n} is ${step.status}; only the step in progress can fail`);
	if (!reason || !reason.trim()) fail('"fail" needs --reason "<what failed>"');
	step.attempts += 1;
	step.lastFailure = reason.trim();
	state.fixLoop.attempts += 1;
	return { step: n, limitReached: state.fixLoop.attempts >= state.fixLoop.limit, warn: state.fixLoop.attempts > WARNING_THRESHOLD };
}

export function summarize(state, steps, approval = null) {
	const rows = steps.map((s) => ({ number: s.number, name: s.name, ...state.steps[s.number] }));
	return {
		issue: state.issue,
		steps: rows,
		done: rows.filter((r) => r.status === "done").length,
		total: rows.length,
		fixLoop: state.fixLoop,
		next: nextStepNumber(state),
		approval,
	};
}

function approvalLine(approval) {
	return approval.approved ? `Approved by: ${approval.value}` : `Approved by: NOT APPROVED (${approval.reason})`;
}

function renderStatus(summary) {
	const out = [`Code progress: issue ${summary.issue} (${summary.total} steps)`];
	if (summary.approval) out.push(approvalLine(summary.approval));
	for (const r of summary.steps) out.push(`  Step ${r.number}  ${r.status.padEnd(11)}  attempts ${r.attempts}  ${r.name}`);
	const { attempts, limit } = summary.fixLoop;
	let note = "";
	if (attempts >= limit) note = `: ${LIMIT_MESSAGE}`;
	else if (attempts > WARNING_THRESHOLD) note = ": the plan was probably too big or too vague";
	out.push(`Done ${summary.done}/${summary.total}; fix loop ${attempts}/${limit}${note}`);
	return out.join("\n");
}

function describeNext(state, steps, approval) {
	const n = nextStepNumber(state);
	return { ...steps.find((s) => s.number === n), ...state.steps[n], approval };
}

function renderNext(step) {
	const out = [`Step ${step.number}: ${step.name} (${step.status}, attempts ${step.attempts})`, `  ${approvalLine(step.approval)}`];
	for (const label of ["Files", "Action", "Verification", "Bootable Check", "Serves"]) {
		if (step.fields[label]) out.push(`  ${label}: ${step.fields[label]}`);
	}
	out.push(`  New Code: see "### Step ${step.number}" in plan.md`);
	return out.join("\n");
}

function git(args, cwd) {
	return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function tryGit(args, cwd) {
	try {
		return git(args, cwd);
	} catch {
		return null;
	}
}

function resolveBase(requested, cwd) {
	const candidates = requested ? [requested] : ["origin/main", "main"];
	const found = candidates.find((ref) => tryGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd) !== null);
	if (!found) fail(`base ref ${candidates.join(" or ")} not found; fetch it first (fetch-depth: 0 in CI) or pass --base`);
	return found;
}

function parseVersion(label, text) {
	let state;
	try {
		state = JSON.parse(text);
	} catch {
		fail(`progress.json at ${label} is not valid JSON`);
	}
	const bad = !state || typeof state !== "object" || !state.steps || typeof state.steps !== "object" || !Number.isInteger(state.fixLoop?.attempts);
	if (bad) fail(`progress.json at ${label} has no "steps" and "fixLoop.attempts"`);
	return state;
}

function isUntouchedState(state) {
	return state.fixLoop.attempts === 0 && Object.values(state.steps).every((s) => s?.status === "pending" && s.attempts === 0);
}

/** Fails when `next` lowers a counter, raises the limit, or swaps the plan hash of `prev` once Code has started. */
function compareVersions(prev, next) {
	const where = `${prev.label} to ${next.label}`;
	const was = prev.state;
	const now = next.state;
	if (now.fixLoop.attempts < was.fixLoop.attempts) {
		fail(`fixLoop.attempts decreased from ${was.fixLoop.attempts} to ${now.fixLoop.attempts} (${where}): the fix-loop counter cannot be reset`);
	}
	if (now.fixLoop.limit > was.fixLoop.limit) fail(`fixLoop.limit was raised from ${was.fixLoop.limit} to ${now.fixLoop.limit} (${where}): the limit cannot be raised`);
	for (const [n, step] of Object.entries(was.steps)) {
		const after = now.steps[n];
		if (!after) fail(`step ${n} was removed from progress.json (${where})`);
		if (after.attempts < step.attempts) fail(`step ${n} attempts decreased from ${step.attempts} to ${after.attempts} (${where}): the counter cannot be reset`);
	}
	if (was.planSha256 !== now.planSha256 && !isUntouchedState(was)) {
		fail(`planSha256 changed after Code started (${where}): the Developer must re-approve the plan`);
	}
}

/**
 * Verifies, with git, that the fix-loop counters in progress.json were never lowered: not by deleting the file,
 * rewriting it, or an earlier commit that holds higher attempts. Runs against the base ref, every commit that
 * touched the file between the base and HEAD, and the working tree.
 * @returns {{path: string, base: string, versions: number}}
 */
export function checkHistory({ dir, base = null, cwd = process.cwd() }) {
	if (tryGit(["rev-parse", "--is-inside-work-tree"], cwd) === null) fail(`${cwd} is not inside a git work tree`);
	const baseRef = resolveBase(base, cwd);
	const prefix = git(["rev-parse", "--show-prefix"], cwd).trim();
	const rel = relative(resolve(cwd), resolve(cwd, dir)).split(sep).join("/");
	const path = posix.normalize(posix.join(prefix, rel, "progress.json"));
	if (path.startsWith("../")) fail(`${dir} is outside the repository`);

	const atBase = tryGit(["show", `${baseRef}:${path}`], cwd);
	let prev = atBase === null ? null : { label: `base ${baseRef}`, state: parseVersion(`base ${baseRef}`, atBase) };
	let versions = prev ? 1 : 0;

	const commits = git(["log", "--format=%H", "--topo-order", "--reverse", `${baseRef}..HEAD`, "--", path], cwd).split("\n").filter(Boolean);
	for (const sha of commits) {
		const label = `commit ${sha.slice(0, 7)}`;
		const text = tryGit(["show", `${sha}:${path}`], cwd);
		if (text === null) {
			if (prev) fail(`progress.json was deleted in ${label}: deleting it resets the fix-loop counter`);
			continue;
		}
		const next = { label, state: parseVersion(label, text) };
		if (prev) compareVersions(prev, next);
		prev = next;
		versions++;
	}

	const atHead = tryGit(["show", `HEAD:${path}`], cwd);
	if (atHead === null) {
		if (prev) fail(`progress.json is missing at HEAD but exists in ${prev.label}: deleting it resets the fix-loop counter`);
	} else {
		const head = { label: "HEAD", state: parseVersion("HEAD", atHead) };
		if (prev) compareVersions(prev, head);
		versions++;
		prev = head;
	}

	const workingTree = resolve(cwd, dir, "progress.json");
	if (existsSync(workingTree)) {
		const tree = { label: "the working tree", state: parseVersion("the working tree", readFileSync(workingTree, "utf-8")) };
		if (prev) compareVersions(prev, tree);
		versions++;
	} else if (prev) {
		fail(`progress.json is missing from the working tree but exists in ${prev.label}: deleting it resets the fix-loop counter`);
	}
	return { path, base: baseRef, versions };
}

async function fileExists(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

function issueName(dir) {
	const name = basename(resolve(dir));
	const m = name.match(/^issue-(\d+)$/);
	return m ? m[1] : name;
}

function parseArgs(args) {
	const parsed = { command: null, positional: null, dir: null, reason: null, limit: null, base: null, json: false, help: false };
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--dir" && args[i + 1] !== undefined) parsed.dir = args[++i];
		else if (arg === "--base" && args[i + 1] !== undefined) parsed.base = args[++i];
		else if (arg === "--reason" && args[i + 1] !== undefined) parsed.reason = args[++i];
		else if (arg === "--limit" && args[i + 1] !== undefined) parsed.limit = args[++i];
		else if (arg === "--json") parsed.json = true;
		else if (arg === "--help" || arg === "-h") parsed.help = true;
		else if (arg.startsWith("--")) fail(`unknown option or missing value for "${arg}"`);
		else if (!parsed.command) parsed.command = arg;
		else if (parsed.positional === null) parsed.positional = arg;
		else fail(`unexpected argument "${arg}"`);
	}
	return parsed;
}

/** Loads progress.json (creating it on first use) and refuses a plan that changed after Code started. */
async function loadState(dir, steps, sha, requestedLimit) {
	const progressPath = join(dir, "progress.json");
	if (!(await fileExists(progressPath))) return createState(issueName(dir), sha, steps.length, requestedLimit ?? DEFAULT_LIMIT);

	let state;
	try {
		state = JSON.parse(await readFile(progressPath, "utf-8"));
	} catch {
		fail("progress.json is not valid JSON");
	}
	if (requestedLimit !== null && state?.fixLoop?.limit !== requestedLimit) {
		fail("the fix-loop limit is fixed when progress.json is created and cannot be changed by the agent");
	}
	if (state?.planSha256 !== sha) {
		const startedNothing = state?.steps && typeof state.steps === "object" && isUntouched(state);
		if (!startedNothing) fail("plan changed after Code started; the Developer must re-approve");
		state = createState(state.issue ?? issueName(dir), sha, steps.length, state.fixLoop.limit);
	}
	validateState(state, steps.length);
	return state;
}

export async function runCodeLoop(args = process.argv.slice(2), { now = () => new Date(), cwd = process.cwd() } = {}) {
	let opts;
	try {
		opts = parseArgs(args);
	} catch (err) {
		console.error(`✗ ${err.message}`);
		return 1;
	}
	if (opts.help) {
		console.log(USAGE);
		return 0;
	}
	if (opts.command === "reset-attempts") {
		console.error("✗ the fix-loop counter is per work item and cannot be reset by the agent: the Developer steps in");
		return 1;
	}
	if (!["status", "next", "start", "pass", "fail", "check-history"].includes(opts.command) || !opts.dir) {
		console.error(USAGE);
		return 1;
	}
	if (opts.base !== null && opts.command !== "check-history") {
		console.error('✗ --base applies only to "check-history"');
		return 1;
	}

	if (opts.command === "check-history") {
		try {
			const result = checkHistory({ dir: opts.dir, base: opts.base, cwd });
			console.log(result.versions ? `✓ ${result.path} never lowered its counters: ${result.versions} version(s) checked against ${result.base}` : `✓ no progress.json for ${opts.dir} on ${result.base} or in its history; nothing to check`);
			return 0;
		} catch (err) {
			console.error(`✗ ${err.message}`);
			return 1;
		}
	}

	try {
		let limit = null;
		if (opts.limit !== null) {
			if (!/^\d+$/.test(opts.limit) || Number(opts.limit) < 1 || Number(opts.limit) > DEFAULT_LIMIT) fail(`--limit must be an integer from 1 to ${DEFAULT_LIMIT}: the fix-loop limit is ${DEFAULT_LIMIT} per work item`);
			limit = Number(opts.limit);
		}

		const planPath = join(opts.dir, "plan.md");
		if (!(await fileExists(planPath))) fail(`plan.md not found in ${opts.dir}`);
		const plan = await readFile(planPath, "utf-8");
		const steps = parsePlanSteps(plan, planPath);
		const approval = parsePlanApproval(plan, planPath);
		if (opts.command === "start" || opts.command === "next") assertApproved(approval);
		const state = await loadState(opts.dir, steps, planSha256(plan), limit);

		let message;
		let warning = null;
		let exitCode = 0;
		if (opts.command === "status") {
			const summary = summarize(state, steps, approval);
			message = opts.json ? JSON.stringify(summary, null, "\t") : renderStatus(summary);
		} else if (opts.command === "next") {
			if (nextStepNumber(state) === null) fail("all steps are done; open the pull request with the pr-record body");
			const step = describeNext(state, steps, approval);
			message = opts.json ? JSON.stringify(step, null, "\t") : renderNext(step);
		} else if (opts.command === "start") {
			const n = startStep(state, opts.positional);
			message = `✓ Step ${n} is in progress: ${steps[n - 1].name}`;
		} else if (opts.command === "pass") {
			const n = passStep(state, opts.positional, now());
			message = `✓ Step ${n} is done (verified ${state.steps[n].verifiedAt})`;
		} else {
			const result = failStep(state, opts.positional, opts.reason);
			message = `Step ${result.step} attempt ${state.steps[result.step].attempts} failed; fix loop ${state.fixLoop.attempts}/${state.fixLoop.limit}`;
			if (result.limitReached) {
				exitCode = 1;
				warning = `✗ ${LIMIT_MESSAGE}`;
			} else if (result.warn) {
				warning = `⚠ ${state.fixLoop.attempts} fix attempts: the plan was too big or too vague. Tell the Developer and consider splitting the plan.`;
			}
		}

		await writeFile(join(opts.dir, "progress.json"), `${JSON.stringify(state, null, "\t")}\n`);
		console.log(message);
		if (warning) (exitCode ? console.error : console.warn)(warning);
		return exitCode;
	} catch (err) {
		console.error(`✗ ${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runCodeLoop().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
