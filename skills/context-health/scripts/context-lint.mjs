#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, posix } from "node:path";
import { pathToFileURL } from "node:url";

export class LintError extends Error {}

function fail(message) {
	throw new LintError(message);
}

export const SCAN_DIRS = ["instructions", ".github/instructions", ".github/agents", ".github/prompts", ".github/skills", ".agents", ".claude", ".cursor"];
export const SCAN_FILES = [".github/copilot-instructions.md", "AGENTS.md", "CLAUDE.md"];
export const DEFAULT_MAX_LINES = 120;
export const DEFAULT_STALE_DAYS = 180;
export const DUPLICATE_THRESHOLD = 0.6;
export const MIN_DUPLICATE_LINES = 5;
export const GROWTH_LIMIT = 0.2;
export const BASELINE_NAME = "context-baseline.json";

const SKIP_DIRS = new Set(["node_modules", ".git"]);
const TEXT_EXTENSIONS = new Set([".md", ".mdc", ".json", ".yml", ".yaml", ".txt"]);
const MAX_FILE_BYTES = 1_000_000;

export const SECRET_PATTERNS = [
	{ type: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
	{ type: "private key block", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
	{ type: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
	{ type: "Slack token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
	{ type: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{22,}/ },
	{ type: "API secret key", regex: /\bsk[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{32,}/ },
];

async function walk(dir, rel, out) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const path = join(dir, entry.name);
		const relPath = posix.join(rel, entry.name);
		if (entry.isDirectory()) await walk(path, relPath, out);
		else if (entry.isFile()) out.push(relPath);
	}
}

const extension = (name) => (name.includes(".") ? name.slice(name.lastIndexOf(".")) : "");

/** Workspace-relative paths of the files the lint covers. */
export async function collectFiles(root) {
	const found = new Set();
	for (const dir of SCAN_DIRS) {
		const files = [];
		await walk(join(root, dir), dir, files);
		files.filter((f) => TEXT_EXTENSIONS.has(extension(f))).forEach((f) => found.add(f));
	}
	for (const file of SCAN_FILES) {
		try {
			if ((await stat(join(root, file))).isFile()) found.add(file);
		} catch {
			// absent files are fine
		}
	}
	return [...found].sort();
}

export function isInstructionFile(path) {
	const name = basename(path);
	return name.endsWith(".instructions.md") || name === "copilot-instructions.md" || name === "AGENTS.md" || name === "CLAUDE.md" || (path.startsWith(".cursor/") && name.endsWith(".mdc"));
}

export function parseFrontmatter(content) {
	const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
	const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
	if (!match) return { data: {}, body: content, present: false };
	const data = {};
	for (const line of match[1].split("\n")) {
		const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
		if (!kv) continue;
		const value = kv[2].trim();
		const quoted = /^(['"])(.*)\1\s*(?:#.*)?$/.exec(value);
		data[kv[1]] = quoted ? quoted[2] : value.replace(/\s+#.*$/, "");
	}
	return { data, body: text.slice(match[0].length), present: true };
}

export function jaccard(a, b) {
	if (!a.size && !b.size) return 0;
	let shared = 0;
	for (const item of a) if (b.has(item)) shared++;
	return shared / (a.size + b.size - shared);
}

export function lineSet(content) {
	const { body } = parseFrontmatter(content);
	return new Set(body.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter((line) => line.length > 2));
}

export function findSecrets(content) {
	const hits = [];
	content.split(/\r?\n/).forEach((line, i) => {
		for (const { type, regex } of SECRET_PATTERNS) if (regex.test(line)) hits.push({ type, line: i + 1 });
	});
	return hits;
}

/** Names of skills, agents, and prompts present in the tree. */
export async function collectInventory(root) {
	const all = [];
	await walk(root, "", all);
	const inventory = { skill: new Set(), agent: new Set(), prompt: new Set() };
	for (const rel of all) {
		const name = basename(rel);
		let kind = null;
		let slug = null;
		if (name === "SKILL.md") [kind, slug] = ["skill", basename(posix.dirname(rel))];
		else if (name.endsWith(".agent.md")) [kind, slug] = ["agent", name.slice(0, -".agent.md".length)];
		else if (name.endsWith(".prompt.md")) [kind, slug] = ["prompt", name.slice(0, -".prompt.md".length)];
		else if (/^\.(?:claude|cursor)\/agents\/[^/]+\.md$/.test(rel)) [kind, slug] = ["agent", name.slice(0, -".md".length)];
		else if (/^\.(?:claude|cursor)\/commands\/[^/]+\.md$/.test(rel)) [kind, slug] = ["prompt", name.slice(0, -".md".length)];
		if (!kind) continue;
		inventory[kind].add(slug.toLowerCase());
		try {
			const { data } = parseFrontmatter(await readFile(join(root, rel), "utf-8"));
			if (data.name) inventory[kind].add(data.name.toLowerCase());
		} catch {
			// an unreadable file contributes only its slug
		}
	}
	return inventory;
}

const REFERENCE_PATTERNS = [
	{ kind: "skill", regex: /`([a-z0-9][a-z0-9-]*)`\s+skill\b/g },
	{ kind: "skill", regex: /\bskill\s+`([a-z0-9][a-z0-9-]*)`/g },
	{ kind: "skill", regex: /\bskills\/([a-z0-9][a-z0-9-]*)\//g },
	{ kind: "agent", regex: /`([^`<>\n]+)`\s+agent\b/g },
	{ kind: "agent", regex: /\bagent\s+`([^`<>\n]+)`/g },
	{ kind: "agent", regex: /\bagents\/([a-z0-9][a-z0-9-]*)\.agent\.md/g },
	{ kind: "prompt", regex: /`([a-z0-9][a-z0-9-]*)`\s+prompt\b/g },
	{ kind: "prompt", regex: /\bprompt\s+`([a-z0-9][a-z0-9-]*)`/g },
	{ kind: "prompt", regex: /\bprompts\/([a-z0-9][a-z0-9-]*)\.prompt\.md/g },
];

export function findReferences(content) {
	const refs = [];
	// Examples inside fenced code blocks are illustrations, not references to real artifacts.
	const prose = content.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
	for (const { kind, regex } of REFERENCE_PATTERNS) {
		for (const match of prose.matchAll(regex)) refs.push({ kind, name: match[1].trim() });
	}
	return refs;
}

function gitAvailable(root) {
	try {
		return execFileSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() === "true";
	} catch {
		return false;
	}
}

/** A shallow clone has truncated history, so every file would look freshly committed. */
function isShallowRepository(root) {
	try {
		return execFileSync("git", ["-C", root, "rev-parse", "--is-shallow-repository"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() === "true";
	} catch {
		return false;
	}
}

function lastCommitMs(root, rel) {
	try {
		const out = execFileSync("git", ["-C", root, "log", "-1", "--format=%ct", "--", rel], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
		return out ? Number(out) * 1000 : null;
	} catch {
		return null;
	}
}

export function parseBaseline(data, label = "baseline") {
	if (typeof data !== "object" || data === null || Array.isArray(data)) fail(`${label} must be a JSON object`);
	if (!Number.isInteger(data.instructionCount) || data.instructionCount < 0) fail(`${label}.instructionCount must be a non-negative integer`);
	return { instructionCount: data.instructionCount };
}

/**
 * Lints the Persistent Context under root.
 * @param {{root: string, baseline?: {instructionCount: number, allowBroad: string[]}|null, maxLines?: number, staleDays?: number, now?: number}} options
 */
export async function lintContext({ root, baseline = null, maxLines = DEFAULT_MAX_LINES, staleDays = DEFAULT_STALE_DAYS, now = Date.now() }) {
	const files = await collectFiles(root);
	const contents = new Map();
	for (const rel of files) {
		const path = join(root, rel);
		if ((await stat(path)).size <= MAX_FILE_BYTES) contents.set(rel, await readFile(path, "utf-8"));
	}
	// A Cursor .mdc rule generated from an *.instructions.md is a copy of it: counting it would double the instruction count.
	const stem = (rel) => basename(rel).replace(/\.instructions\.md$|\.mdc$/, "");
	const nativeStems = new Set(files.filter((f) => f.endsWith(".instructions.md")).map(stem));
	const instructionFiles = files.filter((f) => isInstructionFile(f) && contents.has(f) && !(f.endsWith(".mdc") && nativeStems.has(stem(f))));
	const findings = [];
	const add = (severity, rule, file, message) => findings.push({ severity, rule, file, message });

	for (const rel of instructionFiles) {
		const content = contents.get(rel);
		if (rel.endsWith(".instructions.md")) {
			const { data } = parseFrontmatter(content);
			if (!data.description) add("error", "missing-description", rel, "frontmatter has no description");
		}
		const lines = content.replace(/\r?\n$/, "").split(/\r?\n/).length;
		if (lines > maxLines) add("warning", "too-long", rel, `${lines} lines exceed ${maxLines}: the everything instruction gets ignored; split it`);
	}

	const sets = new Map(instructionFiles.map((rel) => [rel, lineSet(contents.get(rel))]));
	for (let i = 0; i < instructionFiles.length; i++) {
		for (let j = i + 1; j < instructionFiles.length; j++) {
			const [a, b] = [instructionFiles[i], instructionFiles[j]];
			if (sets.get(a).size < MIN_DUPLICATE_LINES || sets.get(b).size < MIN_DUPLICATE_LINES) continue;
			const score = jaccard(sets.get(a), sets.get(b));
			if (score >= DUPLICATE_THRESHOLD) add("warning", "near-duplicate", a, `near-duplicate of ${b} (line overlap ${Math.round(score * 100)}%)`);
		}
	}

	const inventory = await collectInventory(root);
	for (const rel of instructionFiles) {
		const reported = new Set();
		for (const { kind, name } of findReferences(contents.get(rel))) {
			const key = `${kind}:${name.toLowerCase()}`;
			if (reported.has(key) || inventory[kind].has(name.toLowerCase())) continue;
			reported.add(key);
			add("error", "dangling-reference", rel, `references the ${kind} "${name}", which does not exist in the tree`);
		}
	}

	for (const [rel, content] of contents) {
		for (const hit of findSecrets(content)) add("error", "secret", rel, `line ${hit.line} looks like a ${hit.type}: remove it and rotate the credential`);
	}

	const notes = [];
	if (gitAvailable(root) && isShallowRepository(root)) {
		notes.push("stale check skipped: shallow clone (fetch full history, for example `fetch-depth: 0`)");
	} else if (gitAvailable(root)) {
		for (const rel of instructionFiles) {
			const committed = lastCommitMs(root, rel);
			if (committed === null) continue;
			const age = Math.floor((now - committed) / 86_400_000);
			if (age > staleDays) add("warning", "stale", rel, `last committed ${age} days ago (limit ${staleDays}): confirm it is still true or delete it`);
		}
	}

	let growth = null;
	if (baseline && baseline.instructionCount > 0) {
		const ratio = (instructionFiles.length - baseline.instructionCount) / baseline.instructionCount;
		growth = { count: instructionFiles.length, baseline: baseline.instructionCount, ratio };
		if (ratio > GROWTH_LIMIT) add("warning", "growth", "(all)", `instruction count grew ${Math.round(ratio * 100)}% over the baseline (${baseline.instructionCount} to ${instructionFiles.length}): prune before adding`);
	}

	const order = { error: 0, warning: 1 };
	findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message));
	return { files, instructionFiles, instructionCount: instructionFiles.length, findings, notes, growth };
}

export function renderLint(result) {
	const out = result.findings.map((f) => `${f.severity === "error" ? "✗ error" : "⚠ warning"} [${f.rule}] ${f.file}: ${f.message}`);
	for (const note of result.notes ?? []) out.push(`note: ${note}`);
	const errors = result.findings.filter((f) => f.severity === "error").length;
	out.push(`Instructions: ${result.instructionCount}${result.growth ? ` (baseline ${result.growth.baseline}, ${result.growth.ratio >= 0 ? "+" : ""}${Math.round(result.growth.ratio * 100)}%)` : ""}`);
	out.push(`Files scanned: ${result.files.length}; ${errors} error(s), ${result.findings.length - errors} warning(s)`);
	return `${out.join("\n")}\n`;
}

const USAGE = `Usage:
  node context-lint.mjs --root <dir> [--baseline context-baseline.json] [--write-baseline] [--max-lines 120] [--stale-days 180] [--strict] [--today YYYY-MM-DD]
Exit codes: 0 no errors (warnings are reported), 1 errors or invalid input. --strict also fails on warnings.
--write-baseline records the current instruction count in the baseline file (default <root>/${BASELINE_NAME}).`;

function parseArgs(args) {
	const parsed = { maxLines: DEFAULT_MAX_LINES, staleDays: DEFAULT_STALE_DAYS, writeBaseline: false, strict: false };
	for (let i = 0; i < args.length; i++) {
		const next = args[i + 1];
		if (args[i] === "--root" && next) parsed.root = args[++i];
		else if (args[i] === "--baseline" && next) parsed.baseline = args[++i];
		else if (args[i] === "--max-lines" && next) parsed.maxLines = Number(args[++i]);
		else if (args[i] === "--stale-days" && next) parsed.staleDays = Number(args[++i]);
		else if (args[i] === "--today" && next) parsed.today = args[++i];
		else if (args[i] === "--write-baseline") parsed.writeBaseline = true;
		else if (args[i] === "--strict") parsed.strict = true;
		else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else fail(`unexpected argument "${args[i]}"`);
	}
	return parsed;
}

export async function runLint(args = process.argv.slice(2)) {
	try {
		const opts = parseArgs(args);
		if (opts.help || !opts.root) {
			console.log(USAGE);
			return opts.help ? 0 : 1;
		}
		if (!Number.isInteger(opts.maxLines) || opts.maxLines < 1) fail("--max-lines must be a positive integer");
		if (!Number.isInteger(opts.staleDays) || opts.staleDays < 1) fail("--stale-days must be a positive integer");
		let now = Date.now();
		if (opts.today) {
			now = Date.parse(`${opts.today}T00:00:00Z`);
			if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.today) || Number.isNaN(now)) fail("--today must be an ISO date YYYY-MM-DD");
		}
		if (!(await stat(opts.root).catch(() => null))?.isDirectory()) fail(`root not found: ${opts.root}`);

		const baselinePath = opts.baseline ?? (opts.writeBaseline ? join(opts.root, BASELINE_NAME) : null);
		let baseline = null;
		if (baselinePath) {
			let text = null;
			try {
				text = await readFile(baselinePath, "utf-8");
			} catch (err) {
				if (err.code !== "ENOENT" || !opts.writeBaseline) fail(`cannot read baseline ${baselinePath}: ${err.code ?? err.message}`);
			}
			if (text !== null) {
				try {
					baseline = parseBaseline(JSON.parse(text), baselinePath);
				} catch (err) {
					if (err instanceof SyntaxError) fail(`baseline ${baselinePath} is not valid JSON`);
					throw err;
				}
			}
		}

		const result = await lintContext({ root: opts.root, baseline, maxLines: opts.maxLines, staleDays: opts.staleDays, now });
		process.stdout.write(renderLint(result));
		if (opts.writeBaseline) {
			await writeFile(baselinePath, `${JSON.stringify({ instructionCount: result.instructionCount }, null, 2)}\n`);
			console.log(`✓ Wrote baseline ${baselinePath} (${result.instructionCount} instruction file(s))`);
		}
		const errors = result.findings.some((f) => f.severity === "error");
		return errors || (opts.strict && result.findings.length) ? 1 : 0;
	} catch (err) {
		console.error(`✗ [context-lint] ${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runLint().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
