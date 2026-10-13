#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export class ValidationError extends Error {}

function fail(message) {
	throw new ValidationError(message);
}

export const COLUMNS = ["Issue", "Hypothesis", "Metric", "Baseline", "Target", "Direction", "Watch Ends", "Verdict", "Evidence", "Action", "Decided"];
export const VERDICTS = ["Open", "Validated", "Inconclusive", "Invalidated"];
export const DIRECTIONS = ["up", "down"];
export const ACTIONS = {
	Validated: ["Remove flag", "Invest further"],
	Inconclusive: ["Iterate once", "Remove"],
	Invalidated: ["Delete feature"],
};
export const DEFAULT_CYCLE_DAYS = 14;
export const DEFAULT_TOLERANCE = 0.05;
export const HEALTHY_RATE_CEILING = 0.9;
export const MIN_CLOSED_FOR_RATE_WARNING = 3;

const NONE = "_None._";
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIDED = /^(.+?) \(Product Owner\) on (\d{4}-\d{2}-\d{2})$/;
const DELETE_ACTION = /^Delete feature \((?:Pending|Deleted (\d{4}-\d{2}-\d{2}))\)$/;
const PLACEHOLDER = /^(tbd|n\/a|\.\.\.|<[^>]*>)$/i;
const ROLES = ["Product Owner", "Developer", "Architect", "DevOps", "QA and maintainer"];
const AI_WORDS = new Set(["copilot", "claude", "gpt", "chatgpt", "gemini", "llm", "bot", "agent", "ai", "assistant", "codex", "openai", "anthropic", "dependabot", "renovate", "renovatebot"]);
const NOT_A_PERSON = new Set(["x", "tbd", "tba", "todo", "unknown", "anonymous", "nobody", "someone", "none", "team", "user", "human", "person", "name", "me", "you", "admin", "system"]);

/** Why a name cannot be a named person, or null. A bare role, a placeholder, or an AI is never a person. */
function notAPerson(name) {
	if (!/\p{L}/u.test(name)) return "it has no letters";
	if (/[<>[\]{}]/.test(name) && !/\[bot\]/i.test(name)) return "it is a placeholder";
	const words = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
	if (words.some((w) => AI_WORDS.has(w.replace(/\d+$/, ""))) || /github[- ]actions/i.test(name)) return "it looks like an AI";
	const plain = words.join(" ").replace(/^the /, "");
	if (ROLES.some((r) => r.toLowerCase() === plain) || NOT_A_PERSON.has(plain) || PLACEHOLDER.test(name.trim())) return "it is a role or a placeholder, not a person's name";
	return null;
}

export function isIsoDate(value) {
	if (!DATE.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const toDay = (value) => Date.parse(`${value}T00:00:00Z`) / 86_400_000;
export const daysBetween = (from, to) => toDay(to) - toDay(from);
export function addDays(date, days) {
	return new Date((toDay(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

function splitRow(line) {
	return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

const isTableLine = (line) => line.trim().startsWith("|");

export function renderRow(row) {
	return `| ${[row.issue, row.hypothesis, row.metric, row.baseline, row.target, row.direction, row.watchEnds, row.verdict, row.evidence, row.action, row.decided].join(" | ")} |`;
}

export function renderLedger(rows) {
	return `${["# Hypothesis Ledger", "", `| ${COLUMNS.join(" | ")} |`, `|${COLUMNS.map(() => "---").join("|")}|`, ...rows.map(renderRow)].join("\n")}\n`;
}

function checkRow(row) {
	const where = `row ${row.index} (${row.issue})`;
	if (!/^#[1-9]\d*$/.test(row.issue)) fail(`${where}: Issue must look like #<number> without leading zeros`);
	for (const [field, label] of [["hypothesis", "Hypothesis"], ["metric", "Metric"]]) {
		if (!row[field] || PLACEHOLDER.test(row[field]) || row[field] === NONE) fail(`${where}: ${label} is empty or a placeholder`);
	}
	if (!NUMBER.test(row.baselineText)) fail(`${where}: Baseline must be a number (found "${row.baselineText}")`);
	if (!NUMBER.test(row.targetText)) fail(`${where}: Target must be a number (found "${row.targetText}")`);
	if (!DIRECTIONS.includes(row.direction)) fail(`${where}: Direction must be up or down (found "${row.direction}")`);
	if (row.baseline === row.target) fail(`${where}: Target must differ from Baseline`);
	if ((row.direction === "up") !== (row.target > row.baseline)) fail(`${where}: Direction ${row.direction} contradicts Baseline ${row.baseline} and Target ${row.target}`);
	if (!isIsoDate(row.watchEnds)) fail(`${where}: Watch Ends must be an ISO date YYYY-MM-DD (found "${row.watchEnds}")`);
	if (!VERDICTS.includes(row.verdict)) fail(`${where}: Verdict must be one of ${VERDICTS.join(", ")} (found "${row.verdict}")`);
	if (!row.evidence || PLACEHOLDER.test(row.evidence)) fail(`${where}: Evidence is empty or a placeholder`);

	if (row.verdict === "Open") {
		if (row.action !== NONE) fail(`${where}: an Open row must have Action ${NONE}`);
		if (row.decided !== NONE) fail(`${where}: an Open row must have Decided ${NONE}`);
		return;
	}

	if (row.evidence === NONE) fail(`${where}: a ${row.verdict} verdict needs Evidence (the observed number and where it came from)`);
	const decided = DECIDED.exec(row.decided);
	if (!decided || PLACEHOLDER.test(decided[1])) fail(`${where}: Decided must be "<name> (Product Owner) on YYYY-MM-DD": only the Product Owner decides a verdict`);
	const reason = notAPerson(decided[1].trim());
	if (reason) fail(`${where}: Decided "${decided[1].trim()}" is not a named person (${reason}): only a human Product Owner decides a verdict`);
	if (!isIsoDate(decided[2])) fail(`${where}: Decided date "${decided[2]}" is not a valid ISO date`);
	row.decidedDate = decided[2];
	if (row.decidedDate < row.watchEnds) fail(`${where}: Decided ${row.decidedDate} is before the watch window ends (${row.watchEnds})`);

	if (row.verdict === "Invalidated") {
		const match = DELETE_ACTION.exec(row.action);
		if (!match) fail(`${where}: an Invalidated verdict needs Action "Delete feature (Pending)" or "Delete feature (Deleted YYYY-MM-DD)"`);
		row.deletedDate = match[1] ?? null;
		if (row.deletedDate) {
			if (!isIsoDate(row.deletedDate)) fail(`${where}: deletion date "${row.deletedDate}" is not a valid ISO date`);
			if (row.deletedDate < row.decidedDate) fail(`${where}: the feature cannot be deleted (${row.deletedDate}) before the verdict (${row.decidedDate})`);
		}
	} else if (!ACTIONS[row.verdict].includes(row.action)) {
		fail(`${where}: a ${row.verdict} verdict needs Action ${ACTIONS[row.verdict].map((a) => `"${a}"`).join(" or ")} (found "${row.action}")`);
	}
}

/** Parses and validates a ledger. Returns the rows plus the line positions needed to append a row. */
export function parseLedger(content, filename = "hypotheses.md") {
	if (!content.trim()) fail(`${filename} is empty`);
	const lines = content.replace(/\r\n?/g, "\n").split("\n");
	const heading = lines.find((line) => line.trim());
	if (heading.trim() !== "# Hypothesis Ledger") fail(`${filename} must start with the level-one heading "# Hypothesis Ledger"`);

	const tableLines = lines.map((line, i) => (isTableLine(line) ? i : -1)).filter((i) => i >= 0);
	if (!tableLines.length) fail(`${filename} has no hypothesis table`);
	const first = tableLines[0];
	const last = tableLines[tableLines.length - 1];
	if (last - first + 1 !== tableLines.length) fail(`${filename} must contain a single contiguous table`);

	if (splitRow(lines[first]).join("|") !== COLUMNS.join("|")) fail(`${filename} table columns must be exactly: ${COLUMNS.join(" | ")}`);
	if (first === last || !splitRow(lines[first + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))) fail(`${filename} table needs a separator row after the header`);

	const rows = [];
	const seen = new Set();
	for (let i = first + 2; i <= last; i++) {
		const cells = splitRow(lines[i]);
		const index = rows.length + 1;
		if (cells.length !== COLUMNS.length) fail(`row ${index}: expected ${COLUMNS.length} cells but found ${cells.length} (cells cannot contain "|")`);
		const [issue, hypothesis, metric, baseline, target, direction, watchEnds, verdict, evidence, action, decided] = cells;
		const row = { index, issue, hypothesis, metric, baselineText: baseline, targetText: target, baseline: Number(baseline), target: Number(target), direction, watchEnds, verdict, evidence, action, decided };
		checkRow(row);
		if (seen.has(row.issue)) fail(`row ${index}: duplicate hypothesis for ${row.issue}`);
		seen.add(row.issue);
		rows.push(row);
	}
	return { rows, lines, first, last };
}

/** Appends an Open row, rejecting duplicates and rows that would make the ledger invalid. */
export function addRow(content, entry, filename = "hypotheses.md") {
	const issue = `#${String(entry.issue ?? "").trim().replace(/^#/, "")}`;
	const row = {
		issue,
		hypothesis: String(entry.hypothesis ?? "").trim(),
		metric: String(entry.metric ?? "").trim(),
		baseline: String(entry.baseline ?? "").trim(),
		target: String(entry.target ?? "").trim(),
		direction: String(entry.direction ?? "").trim(),
		watchEnds: String(entry.watchEnds ?? "").trim(),
		verdict: "Open",
		evidence: NONE,
		action: NONE,
		decided: NONE,
	};
	for (const [name, value] of Object.entries(row)) {
		if (/[|\n]/.test(value)) fail(`${name} cannot contain "|" or line breaks`);
	}
	const text = renderRow(row);
	if (content === null) {
		const next = `${renderLedger([]).trimEnd()}\n${text}\n`;
		parseLedger(next, filename);
		return next;
	}
	const parsed = parseLedger(content, filename);
	if (parsed.rows.some((r) => r.issue === issue)) fail(`${issue} already has a hypothesis in ${filename}`);
	const lines = [...parsed.lines];
	lines.splice(parsed.last + 1, 0, text);
	const next = lines.join("\n");
	parseLedger(next, filename);
	return next;
}

/** progress = (observed - baseline) / (target - baseline); positive means moved toward the target. */
export function proposeVerdict(row, observed, tolerance = DEFAULT_TOLERANCE) {
	if (!Number.isFinite(observed)) fail("observed must be a number");
	if (!(Number.isFinite(tolerance) && tolerance >= 0)) fail("tolerance must be a number of at least 0");
	if (row.target === row.baseline) fail("Target must differ from Baseline: progress is undefined");
	// Rounding to 9 decimals keeps a value exactly on a boundary from flipping on floating-point noise.
	const progress = Math.round(((observed - row.baseline) / (row.target - row.baseline)) * 1e9) / 1e9;
	let verdict;
	let reason;
	if (progress >= 1) {
		verdict = "Validated";
		reason = "the metric reached or passed the target";
	} else if (progress < -tolerance) {
		verdict = "Invalidated";
		reason = `the metric moved against the hypothesis by more than the tolerance (${tolerance})`;
	} else {
		verdict = "Inconclusive";
		reason = progress > 0 ? "the metric moved toward the target but did not reach it" : "the metric did not move beyond the tolerance";
	}
	return { progress: Math.round(progress * 10_000) / 10_000, verdict, reason, actions: [...ACTIONS[verdict]] };
}

export function dueRows(rows, today, cycleDays = DEFAULT_CYCLE_DAYS) {
	const reviews = rows
		.filter((r) => r.verdict === "Open" && r.watchEnds < today)
		.map((r) => ({ issue: r.issue, metric: r.metric, watchEnds: r.watchEnds, daysOver: daysBetween(r.watchEnds, today) }));
	const deletions = rows
		.filter((r) => r.verdict === "Invalidated" && r.deletedDate === null && addDays(r.decidedDate, cycleDays) < today)
		.map((r) => ({ issue: r.issue, decided: r.decidedDate, deleteBy: addDays(r.decidedDate, cycleDays), daysOver: daysBetween(addDays(r.decidedDate, cycleDays), today) }));
	return { reviews, deletions };
}

export function computeStats(rows, cycleDays = DEFAULT_CYCLE_DAYS) {
	const count = (verdict) => rows.filter((r) => r.verdict === verdict).length;
	const validated = count("Validated");
	const inconclusive = count("Inconclusive");
	const invalidated = count("Invalidated");
	const closed = validated + inconclusive + invalidated;
	const invalidatedRows = rows.filter((r) => r.verdict === "Invalidated");
	const deletedInCycle = invalidatedRows.filter((r) => r.deletedDate && r.deletedDate <= addDays(r.decidedDate, cycleDays)).length;
	return {
		total: rows.length,
		open: count("Open"),
		closed,
		validated,
		inconclusive,
		invalidated,
		validationRate: closed ? validated / closed : null,
		deletedInCycle,
		pendingDeletion: invalidatedRows.filter((r) => r.deletedDate === null).length,
		deletionRate: invalidated ? deletedInCycle / invalidated : null,
		cycleDays,
	};
}

const pct = (value) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);

export function renderStats(stats) {
	const lines = [
		`Hypotheses: ${stats.total} (${stats.open} open, ${stats.closed} closed)`,
		`Verdicts: ${stats.validated} validated, ${stats.inconclusive} inconclusive, ${stats.invalidated} invalidated`,
		`Hypothesis validation rate: ${pct(stats.validationRate)} (${stats.validated} validated / ${stats.closed} closed)`,
		`Feature deletion rate: ${pct(stats.deletionRate)} (${stats.deletedInCycle} of ${stats.invalidated} invalidated features deleted within ${stats.cycleDays} days; ${stats.pendingDeletion} still pending)`,
	];
	if (stats.validationRate !== null && stats.closed >= MIN_CLOSED_FOR_RATE_WARNING && stats.validationRate >= HEALTHY_RATE_CEILING) {
		lines.push("⚠ A validation rate close to 100% usually means only safe bets are tested: the team learns little.");
	}
	return `${lines.join("\n")}\n`;
}

export function renderDue({ reviews, deletions }, today, cycleDays) {
	const out = [`# Due for review (${today})`, "", "## Open hypotheses past their watch end"];
	out.push(...(reviews.length ? reviews.map((r) => `- ${r.issue}: ${r.metric} (watch ended ${r.watchEnds}, ${r.daysOver} day(s) ago)`) : [NONE]));
	out.push("", `## Invalidated features not deleted within ${cycleDays} days`);
	out.push(...(deletions.length ? deletions.map((d) => `- ${d.issue}: decided ${d.decided}, delete by ${d.deleteBy} (${d.daysOver} day(s) overdue)`) : [NONE]));
	return `${out.join("\n")}\n`;
}

export function renderProposal(row, observed, proposal, tolerance, today = null) {
	const out = [
		`${row.issue}: ${row.metric} (${row.direction})`,
		`Baseline ${row.baseline}, target ${row.target}, observed ${observed}`,
		`progress = (${observed} - ${row.baseline}) / (${row.target} - ${row.baseline}) = ${proposal.progress}`,
		`Rule: Validated if progress >= 1; Invalidated if progress < -${tolerance}; otherwise Inconclusive`,
		`PROPOSED verdict: ${proposal.verdict} (${proposal.reason})`,
		`Suggested actions: ${proposal.actions.join(" | ")}`,
		"Nothing was written. The Product Owner decides and records the verdict, the action, and the evidence.",
	];
	if (today && row.watchEnds >= today) out.push(`⚠ The watch window ends ${row.watchEnds}: this proposal is premature.`);
	return `${out.join("\n")}\n`;
}

const USAGE = `Usage:
  node ledger.mjs validate --file specs/learn/hypotheses.md
  node ledger.mjs add --file <ledger> --issue <n> --hypothesis "<text>" --metric "<text>" --baseline <n> --target <n> --direction up|down --watch-ends YYYY-MM-DD
  node ledger.mjs due --file <ledger> [--today YYYY-MM-DD] [--cycle-days 14]
  node ledger.mjs propose --file <ledger> --issue <n> --observed <number> [--tolerance 0.05] [--today YYYY-MM-DD]
  node ledger.mjs stats --file <ledger> [--cycle-days 14]
The script never writes a verdict: humans decide.`;

const KNOWN_FLAGS = ["file", "issue", "hypothesis", "metric", "baseline", "target", "direction", "watch-ends", "today", "cycle-days", "observed", "tolerance"];

function parseArgs(args) {
	const [command, ...rest] = args;
	const parsed = { command, flags: {}, help: command === "--help" || command === "-h" };
	for (let i = 0; i < rest.length; i++) {
		if (rest[i] === "--help" || rest[i] === "-h") parsed.help = true;
		else if (rest[i].startsWith("--") && rest[i + 1] !== undefined) {
			const name = rest[i].slice(2);
			if (!KNOWN_FLAGS.includes(name)) fail(`unknown flag "${rest[i]}"`);
			parsed.flags[name] = rest[++i];
		} else fail(`unexpected argument "${rest[i]}"`);
	}
	return parsed;
}

async function readIfExists(path) {
	try {
		return await readFile(path, "utf-8");
	} catch (err) {
		if (err.code === "ENOENT") return null;
		throw err;
	}
}

function numberFlag(flags, name, fallback) {
	if (flags[name] === undefined) return fallback;
	if (!NUMBER.test(flags[name].trim())) fail(`--${name} must be a plain number (found "${flags[name]}")`);
	return Number(flags[name]);
}

function cycleDaysFlag(flags) {
	const value = numberFlag(flags, "cycle-days", DEFAULT_CYCLE_DAYS);
	if (!Number.isInteger(value) || value < 0) fail("--cycle-days must be a whole number of days, 0 or more");
	return value;
}

function dateFlag(flags, name) {
	const value = flags[name] ?? new Date().toISOString().slice(0, 10);
	if (!isIsoDate(value)) fail(`--${name} must be an ISO date YYYY-MM-DD`);
	return value;
}

export async function runLedger(args = process.argv.slice(2)) {
	try {
		const { command, flags, help } = parseArgs(args);
		if (help || !command) {
			console.log(USAGE);
			return help ? 0 : 1;
		}
		if (!["validate", "add", "due", "propose", "stats"].includes(command)) fail(`unknown command "${command}"`);
		if (!flags.file) fail("--file is required");
		const content = await readIfExists(flags.file);
		const cycleDays = cycleDaysFlag(flags);

		if (command === "add") {
			for (const name of ["issue", "hypothesis", "metric", "baseline", "target", "direction", "watch-ends"]) {
				if (flags[name] === undefined) fail(`--${name} is required`);
			}
			const entry = { issue: flags.issue, hypothesis: flags.hypothesis, metric: flags.metric, baseline: flags.baseline, target: flags.target, direction: flags.direction, watchEnds: flags["watch-ends"] };
			const next = addRow(content, entry, flags.file);
			await mkdir(dirname(flags.file), { recursive: true });
			await writeFile(flags.file, next);
			console.log(`✓ Added Open hypothesis #${flags.issue.replace(/^#/, "")} to ${flags.file}`);
			return 0;
		}

		if (content === null) fail(`ledger not found: ${flags.file}`);
		const { rows } = parseLedger(content, flags.file);

		if (command === "validate") {
			console.log(`✓ [hypotheses.md] Validated ${rows.length} hypothesis row(s) (${flags.file})`);
		} else if (command === "due") {
			const today = dateFlag(flags, "today");
			process.stdout.write(renderDue(dueRows(rows, today, cycleDays), today, cycleDays));
		} else if (command === "stats") {
			process.stdout.write(renderStats(computeStats(rows, cycleDays)));
		} else {
			if (flags.issue === undefined) fail("--issue is required");
			if (flags.observed === undefined) fail("--observed is required");
			const issue = `#${flags.issue.replace(/^#/, "")}`;
			const row = rows.find((r) => r.issue === issue);
			if (!row) fail(`${issue} is not in ${flags.file}`);
			if (row.verdict !== "Open") fail(`${issue} already has a ${row.verdict} verdict; propose applies to Open rows only`);
			const observed = numberFlag(flags, "observed");
			const tolerance = numberFlag(flags, "tolerance", DEFAULT_TOLERANCE);
			const today = flags.today === undefined ? null : dateFlag(flags, "today");
			process.stdout.write(renderProposal(row, observed, proposeVerdict(row, observed, tolerance), tolerance, today));
		}
		return 0;
	} catch (err) {
		console.error(`✗ [hypotheses.md] ${err instanceof ValidationError ? `Validation failed: ${err.message}` : err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runLedger().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
