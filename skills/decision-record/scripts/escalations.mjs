#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export class ValidationError extends Error {}

export function fail(message) {
	throw new ValidationError(message);
}

export const NONE = "_None._";
export const ROLES = ["Product Owner", "Developer", "Architect", "DevOps", "QA and maintainer"];
export const REASONS = ["cross-squad conflict", "security exposure", "compliance obligation", "external commitment", "budget impact"];
export const ESCALATION_STATUSES = ["Open", "Decided", "Adopted by default"];
export const DUE_SOON_DAYS = 2;

const PLACEHOLDER = /^(tbd|n\/a|\.\.\.|<[^>]*>)$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AI_WORDS = new Set(["copilot", "claude", "gpt", "chatgpt", "gemini", "llm", "bot", "agent", "assistant", "codex", "openai", "anthropic", "dependabot", "renovate", "renovatebot"]);
const NOT_A_PERSON = new Set(["tbd", "tba", "todo", "unknown", "anonymous", "nobody", "someone", "none", "team", "user", "human", "person", "name", "me", "you", "admin", "system"]);
const DAY_MS = 86_400_000;

/** Why a name cannot be a named person, or null. A bare role, a placeholder, or an AI is never a person. */
function notAPerson(name) {
	if (!/\p{L}/u.test(name)) return "it has no letters";
	if (/[<>[\]{}]/.test(name) && !/\[bot\]/i.test(name)) return "it is a placeholder";
	const words = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
	if (words.some((w) => AI_WORDS.has(w.replace(/\d+$/, ""))) || /\bAI\b/.test(name) || /^ai$/i.test(name) || /github[- ]actions/i.test(name)) return "it looks like an AI";
	const plain = words.join(" ").replace(/^the /, "");
	if (ROLES.some((r) => r.toLowerCase() === plain) || NOT_A_PERSON.has(plain) || isPlaceholder(name)) return "it is a role or a placeholder, not a person's name";
	return null;
}

export function normalizeNewlines(value) {
	return value.replace(/\r\n?/g, "\n");
}

export function isPlaceholder(value) {
	return !value || PLACEHOLDER.test(value.trim());
}

export function validDate(value) {
	return DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

export function addDays(date, days) {
	return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Parses `- **Label:** value` lines; other lines continue the previous value. Fenced code is skipped as a field source. */
export function parseFields(body) {
	const entries = [];
	let fence = null;
	for (const line of body.split("\n")) {
		const f = line.match(/^\s*(`{3,}|~{3,})/);
		if (f) fence = fence ? (f[1][0] === fence ? null : fence) : f[1][0];
		if (fence || f) {
			if (entries.length) entries[entries.length - 1][1] += `\n${line}`;
			continue;
		}
		const m = line.match(/^- \*\*(.+?):\*\*\s*(.*)$/);
		if (m) entries.push([m[1].trim(), m[2]]);
		else if (entries.length) entries[entries.length - 1][1] += `\n${line}`;
	}
	return new Map(entries.map(([label, value]) => [label.toLowerCase(), value.trim()]));
}

export function need(map, label, where, filename) {
	const value = map.get(label.toLowerCase());
	if (value === undefined) fail(`${filename} ${where} is missing the "- **${label}:**" field`);
	if (!value || (!value.includes("\n") && isPlaceholder(value))) fail(`${filename} ${where} field "${label}" is empty or a placeholder`);
	return value;
}

/** Parses "Name (Role)". Roles are the factory's human roles; AI-looking names are rejected. */
export function parsePerson(text, where, filename) {
	const m = text.trim().match(/^(.+?) \((.+)\)$/);
	if (!m) fail(`${filename} ${where} must be formatted "<name> (<role>)", found "${text.trim()}"`);
	const name = m[1].trim().replace(/\s+/g, " ");
	const role = m[2].trim();
	if (!ROLES.includes(role)) fail(`${filename} ${where} role "${role}" must be one of: ${ROLES.join(", ")}`);
	const reason = notAPerson(name);
	if (reason) fail(`${filename} ${where} "${name}" is not a named person (${reason}); only a named person can decide or sign`);
	return { name, role };
}

function listItems(value) {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => /^(?:[-*]|\d+[.)])\s+\S/.test(line))
		.map((line) => line.replace(/^(?:[-*]|\d+[.)])\s+/, ""));
}

/**
 * Validates an escalation record and returns its structured content.
 * @param {string} rawMarkdown
 * @param {string} [filename="escalation.md"]
 * @param {{fileDate?: string}} [options] fileDate is the YYYY-MM-DD prefix of the file name
 */
export function validateEscalationContent(rawMarkdown, filename = "escalation.md", options = {}) {
	const markdown = normalizeNewlines(rawMarkdown).trim();
	if (!markdown) fail(`${filename} is empty`);
	const h1 = markdown.split("\n")[0].match(/^# Escalation:[ \t]*(.*)$/);
	if (!h1 || !h1[1].trim() || isPlaceholder(h1[1].trim())) {
		fail(`${filename} must start with a level-one heading: "# Escalation: <title>"`);
	}
	if (/^```(js|ts|javascript|typescript|python|java|go|sh|bash)\b/m.test(markdown)) fail(`${filename} must not contain source code blocks`);
	const fields = parseFields(markdown.slice(h1[0].length));

	const decision = need(fields, "Decision", "escalation", filename);
	const choices = listItems(need(fields, "Options", "escalation", filename));
	if (choices.length < 2) fail(`${filename} "Options" must list at least 2 options (as a bulleted or numbered list)`);
	if (choices.some(isPlaceholder)) fail(`${filename} "Options" contains a placeholder`);
	const recommendation = need(fields, "Recommendation", "escalation", filename);

	const defaultDate = need(fields, "Default Date", "escalation", filename);
	if (!validDate(defaultDate)) fail(`${filename} Default Date must be a valid ISO date (YYYY-MM-DD), found "${defaultDate}"`);
	if (options.fileDate && defaultDate < options.fileDate) {
		fail(`${filename} Default Date ${defaultDate} is before the escalation date ${options.fileDate}`);
	}

	const reasonRaw = need(fields, "Reason", "escalation", filename);
	const reason = REASONS.find((r) => r === reasonRaw.toLowerCase());
	if (!reason) fail(`${filename} Reason must be one of: ${REASONS.join(", ")}`);

	const statusRaw = need(fields, "Status", "escalation", filename);
	const status = ESCALATION_STATUSES.find((s) => s.toLowerCase() === statusRaw.toLowerCase());
	if (!status) fail(`${filename} Status must be one of: ${ESCALATION_STATUSES.join(", ")}`);

	const resolution = (fields.get("resolution") ?? NONE).trim();
	let resolvedBy = null;
	if (status === "Open") {
		if (resolution !== NONE) fail(`${filename} an Open escalation must not carry a Resolution`);
	} else if (status === "Decided") {
		const m = resolution.match(/^Decided by (.+) on (\d{4}-\d{2}-\d{2})$/);
		if (!m) fail(`${filename} a Decided escalation needs "- **Resolution:** Decided by <name> (<role>) on YYYY-MM-DD"`);
		resolvedBy = parsePerson(m[1], "Resolution", filename);
		if (!validDate(m[2])) fail(`${filename} Resolution date must be a valid ISO date, found "${m[2]}"`);
	} else {
		const m = resolution.match(/^Adopted by default on (\d{4}-\d{2}-\d{2})$/);
		if (!m) fail(`${filename} an escalation adopted by default needs "- **Resolution:** Adopted by default on YYYY-MM-DD"`);
		if (!validDate(m[1])) fail(`${filename} Resolution date must be a valid ISO date, found "${m[1]}"`);
		if (m[1] < defaultDate) fail(`${filename} cannot be adopted by default on ${m[1]}, before the Default Date ${defaultDate}`);
	}

	return { title: h1[1].trim(), decision, options: choices, recommendation, defaultDate, reason, status, resolution, resolvedBy };
}

/**
 * Splits parsed escalations into Open ones whose Default Date has passed, Open ones due within DUE_SOON_DAYS, and the rest.
 * @param {{file: string, defaultDate: string, status: string}[]} records
 * @param {string} today YYYY-MM-DD
 */
export function classifyEscalations(records, today) {
	if (!validDate(today)) fail(`--today must be a valid ISO date (YYYY-MM-DD), found "${today}"`);
	const soon = addDays(today, DUE_SOON_DAYS);
	const open = records
		.filter((r) => r.status === "Open")
		.sort((a, b) => a.defaultDate.localeCompare(b.defaultDate) || a.file.localeCompare(b.file));
	return {
		overdue: open.filter((r) => r.defaultDate < today),
		dueSoon: open.filter((r) => r.defaultDate >= today && r.defaultDate <= soon),
		later: open.filter((r) => r.defaultDate > soon),
		closed: records.filter((r) => r.status !== "Open"),
	};
}

export const ESCALATION_FILE = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/** Reads and validates every escalation in a directory. */
export async function loadEscalations(dir) {
	const names = (await readdir(dir)).filter((n) => n.endsWith(".md") && n !== "README.md").sort();
	const records = [];
	for (const name of names) {
		const m = name.match(ESCALATION_FILE);
		if (!m || !validDate(m[1])) fail(`${join(dir, name)} must be named "<YYYY-MM-DD>-<slug>.md" (lowercase kebab-case)`);
		const file = join(dir, name);
		records.push({ file, ...validateEscalationContent(await readFile(file, "utf-8"), file, { fileDate: m[1] }) });
	}
	return records;
}

async function isDirectory(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

function parseArgs(args) {
	const parsed = { command: null, dir: null, today: null, problems: [] };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else if (args[i] === "--dir" || args[i] === "--today") {
			if (!args[i + 1]) parsed.problems.push(`${args[i]} needs a value`);
			else parsed[args[i].slice(2)] = args[++i];
		} else if (!args[i].startsWith("-") && !parsed.command) parsed.command = args[i];
		else parsed.problems.push(`Unknown argument: ${args[i]}`);
	}
	return parsed;
}

export async function runEscalations(args = process.argv.slice(2)) {
	const opts = parseArgs(args);
	if (!opts.help && opts.problems.length) {
		console.error(`✗ ${opts.problems[0]}`);
		return 1;
	}
	if (opts.help || opts.command !== "due" || !opts.dir) {
		console.log(`Usage:
  node escalations.mjs due --dir docs/decisions/escalations [--today YYYY-MM-DD]
Lists Open escalations whose Default Date has passed (the recommendation is adopted by default: update the record)
and those due within ${DUE_SOON_DAYS} days. Exits 1 when an Open escalation is overdue or a record is invalid.
`);
		return opts.help ? 0 : 1;
	}
	if (!(await isDirectory(opts.dir))) {
		console.error(`Error: Directory not found: ${opts.dir}`);
		return 1;
	}

	const today = opts.today ?? new Date().toISOString().slice(0, 10);
	try {
		const records = await loadEscalations(opts.dir);
		const { overdue, dueSoon, later, closed } = classifyEscalations(records, today);
		for (const r of overdue) console.log(`✗ [overdue] ${r.file}: Default Date ${r.defaultDate} passed; "${r.recommendation}" is adopted by default. Set Status to "Adopted by default".`);
		for (const r of dueSoon) console.log(`⚠ [due soon] ${r.file}: Default Date ${r.defaultDate}; silence adopts "${r.recommendation}".`);
		console.log(`${records.length} escalation(s) as of ${today}: ${overdue.length} overdue, ${dueSoon.length} due within ${DUE_SOON_DAYS} days, ${later.length} open later, ${closed.length} closed`);
		return overdue.length ? 1 : 0;
	} catch (err) {
		console.error(`✗ Escalations failed: ${err instanceof ValidationError ? err.message : err.stack}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runEscalations().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
