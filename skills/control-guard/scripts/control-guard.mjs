#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export class GuardError extends Error {}

export const DEFAULT_PROTECTED = [
	".agents/skills/**",
	".claude/skills/**",
	".cursor/skills/**",
	".github/workflows/**",
	"**/control-guard.json",
	"**/mutation-bar.json",
	"**/waivers.json",
	"**/rails.json",
];

export const DEFAULT_TEST_GLOBS = [
	"tests/**",
	"test/**",
	"**/tests/**",
	"**/test/**",
	"**/__tests__/**",
	"**/e2e/**",
	"**/*.test.*",
	"**/*.spec.*",
	"**/test_*.py",
	"**/*_test.py",
	"**/*_test.go",
	"**/*Test.java",
	"**/*Tests.cs",
];

const WORKFLOW_GLOBS = [".github/workflows/**", ".gitlab-ci.yml", "azure-pipelines.yml", ".circleci/config.yml", "Jenkinsfile"];
const DEFAULT_PIPELINE_GLOBS = [...WORKFLOW_GLOBS, "**/package.json", "**/Makefile", "**/*.sh", ".husky/**", ".pre-commit-config.yaml"];
const DOC_GLOBS = ["**/*.md", "**/*.mdx", "**/*.txt", "**/*.rst"];

const CONFIG_KEYS = new Set(["protectedPaths", "testGlobs", "pipelineGlobs", "assertionTolerance"]);

const SKIP_MARKERS = [
	/\.skip\(/,
	/(?<![\w.$])x(?:it|describe|test)\(/,
	/(?<![\w.$])f(?:it|describe)\(/,
	/(?<![\w$])(?:it|test)\.todo\(/,
	/\.only\(/,
	/@skip\b/,
	/pytest\.mark\.skip/,
	/@Disabled\b/,
];

const SUPPRESSIONS = [/eslint-disable/, /@ts-ignore/, /@ts-nocheck/, /#\s*noqa\b/, /biome-ignore/, /NOSONAR/];

const THRESHOLD_KEY = /(?<![\w-])(branches|functions|lines|statements|break|minScore|min-score|threshold|coverageThreshold|fail_under)["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)/g;
const THRESHOLD_FLAG = /(?<![\w-])--min-score(?:=|\s+)["']?(\d+(?:\.\d+)?)/g;

const PIPELINE_WEAKENING = [
	[/continue-on-error:\s*(?:true\b|["']true["']|\$\{\{\s*true\s*\}\})/i, "continue-on-error: true lets a failing step pass"],
	[/\|\|\s*(?:true|exit\s+0)\b/, "'|| true' hides a failing command"],
	[/--no-verify\b/, "--no-verify skips the git hooks"],
	[/\bif:\s*(?:false\b|\$\{\{\s*false\s*\}\})/, "if: false disables the step or job"],
	[/\ballow_failure\s*:\s*(?!false\b)\S/, "allow_failure lets a failing job pass"],
];

const PROD_CREDENTIALS = [
	[/secrets\.PROD/i, "production secret"],
	[/secrets\[\s*['"]PROD/i, "production secret"],
	[/\benvironment:\s*['"]?production\b/i, "production environment"],
	[/\benvironment:\s*\{[^}]*\bname:\s*['"]?production\b/i, "production environment"],
	[/^\s*name:\s*['"]?production['"]?\s*$/, "production environment"],
];

const ASSERTION = /\bexpect\s*\(|\bassert(?:[A-Z_]\w*)?\b|\bAssert\.\w+/g;
const ASSERTION_COMMENT = /^\s*(?:\/\/|#|\/?\*)/;

/** Translates a glob (`**`, `*`, `?`) to an anchored RegExp. `**` + `/` matches zero or more directories. */
export function globToRegExp(glob) {
	let re = "";
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === "*" && glob[i + 1] === "*") {
			if (glob[i + 2] === "/") {
				re += "(?:.*/)?";
				i += 2;
			} else {
				re += ".*";
				i += 1;
			}
		} else if (c === "*") re += "[^/]*";
		else if (c === "?") re += "[^/]";
		else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${re}$`);
}

export function matchGlob(path, glob) {
	return globToRegExp(glob.replace(/^\.\//, "")).test(path);
}

export function matchesAny(path, globs) {
	return globs.some((g) => matchGlob(path, g));
}

const PATH_ESCAPES = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11 };

/** Unquotes a git C-style quoted path (octal and character escapes); unquoted paths pass through. */
function unquotePath(raw) {
	if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw;
	const chars = Array.from(raw.slice(1, -1));
	const bytes = [];
	for (let i = 0; i < chars.length; i++) {
		if (chars[i] !== "\\" || i === chars.length - 1) {
			bytes.push(...Buffer.from(chars[i]));
			continue;
		}
		const octal = /^[0-3][0-7]{2}$/.exec(chars.slice(i + 1, i + 4).join(""));
		if (octal) {
			bytes.push(Number.parseInt(octal[0], 8));
			i += 3;
		} else {
			i++;
			bytes.push(...(PATH_ESCAPES[chars[i]] === undefined ? Buffer.from(chars[i]) : [PATH_ESCAPES[chars[i]]]));
		}
	}
	return Buffer.from(bytes).toString("utf8");
}

function cleanPath(raw) {
	const p = unquotePath(raw.split("\t")[0].trim());
	if (p === "/dev/null") return p;
	return p.replace(/^[ab]\//, "");
}

/** Parses a unified diff (git or plain) into files with status and hunks. */
export function parseDiff(text) {
	const files = [];
	let cur = null;
	let hunk = null;
	let oldRem = 0;
	let newRem = 0;
	let oldLine = 0;
	let newLine = 0;
	const startFile = (fromGit) => {
		cur = { oldPath: null, newPath: null, status: "modified", hunks: [], fromGit, sawMinus: false };
		files.push(cur);
		hunk = null;
		oldRem = newRem = 0;
	};
	for (const line of text.split(/\r?\n/)) {
		const inHunk = hunk !== null && (oldRem > 0 || newRem > 0);
		if (inHunk) {
			const kind = line[0];
			if (kind === "+") {
				hunk.lines.push({ type: "add", text: line.slice(1), line: newLine++ });
				newRem--;
				continue;
			}
			if (kind === "-") {
				hunk.lines.push({ type: "del", text: line.slice(1), line: oldLine++ });
				oldRem--;
				continue;
			}
			if (kind === " " || line === "") {
				oldLine++;
				newLine++;
				oldRem--;
				newRem--;
				continue;
			}
			if (kind === "\\") continue;
		}
		if (line.startsWith("diff --git ")) {
			startFile(true);
			const m = /^diff --git "?a\/(.*?)"? "?b\/(.*?)"?$/.exec(line);
			if (m) {
				cur.oldPath = unquotePath(`"${m[1]}"`);
				cur.newPath = unquotePath(`"${m[2]}"`);
			}
			continue;
		}
		const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
		if (header && cur) {
			oldLine = Number(header[1]);
			newLine = Number(header[3]);
			oldRem = header[2] === undefined ? 1 : Number(header[2]);
			newRem = header[4] === undefined ? 1 : Number(header[4]);
			hunk = { oldStart: oldLine, newStart: newLine, lines: [] };
			cur.hunks.push(hunk);
			continue;
		}
		if (line.startsWith("--- ") && !inHunk) {
			if (!cur || cur.hunks.length > 0 || cur.sawMinus) startFile(false);
			cur.sawMinus = true;
			const p = cleanPath(line.slice(4));
			cur.oldPath = p;
			if (p === "/dev/null") cur.status = "added";
			continue;
		}
		if (line.startsWith("+++ ") && cur && !inHunk) {
			const p = cleanPath(line.slice(4));
			cur.newPath = p;
			if (p === "/dev/null") cur.status = "deleted";
			continue;
		}
		if (!cur) continue;
		if (line.startsWith("new file mode")) cur.status = "added";
		else if (line.startsWith("deleted file mode")) cur.status = "deleted";
		else if (line.startsWith("rename from ")) {
			cur.status = "renamed";
			cur.oldPath = unquotePath(line.slice("rename from ".length));
		} else if (line.startsWith("rename to ")) cur.newPath = unquotePath(line.slice("rename to ".length));
	}
	return files
		.filter((f) => f.oldPath || f.newPath)
		.map((f) => {
			const oldPath = f.oldPath === "/dev/null" ? null : f.oldPath;
			const newPath = f.newPath === "/dev/null" ? null : f.newPath;
			return { oldPath: oldPath ?? newPath, newPath: newPath ?? oldPath, path: f.status === "deleted" ? (oldPath ?? newPath) : (newPath ?? oldPath), status: f.status, hunks: f.hunks };
		});
}

function validateGlobList(value, key) {
	if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !v.trim())) {
		throw new GuardError(`config ${key} must be an array of non-empty strings`);
	}
	return value;
}

/** Normalizes a parsed config. The list keys can only add to the defaults: a control cannot be weakened from its own config. */
export function resolveConfig(raw = {}) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new GuardError("config must be a JSON object");
	for (const key of Object.keys(raw)) {
		if (!CONFIG_KEYS.has(key)) throw new GuardError(`unknown config key ${key}`);
	}
	const tolerance = raw.assertionTolerance ?? 0;
	if (!Number.isInteger(tolerance) || tolerance < 0) throw new GuardError("config assertionTolerance must be an integer >= 0");
	return {
		protectedPaths: [...DEFAULT_PROTECTED, ...validateGlobList(raw.protectedPaths ?? [], "protectedPaths")],
		testGlobs: [...DEFAULT_TEST_GLOBS, ...validateGlobList(raw.testGlobs ?? [], "testGlobs")],
		pipelineGlobs: [...DEFAULT_PIPELINE_GLOBS, ...validateGlobList(raw.pipelineGlobs ?? [], "pipelineGlobs")],
		assertionTolerance: tolerance,
	};
}

export async function loadConfig(configPath, cwd = process.cwd()) {
	const explicit = configPath !== undefined && configPath !== null;
	const file = resolve(cwd, configPath ?? "control-guard.json");
	if (!existsSync(file)) {
		if (explicit) throw new GuardError(`config file not found: ${configPath}`);
		return resolveConfig({});
	}
	let raw;
	try {
		raw = JSON.parse(await readFile(file, "utf8"));
	} catch (err) {
		throw new GuardError(`config ${configPath ?? "control-guard.json"} is not valid JSON: ${err.message}`);
	}
	return resolveConfig(raw);
}

const addedLines = (file) => file.hunks.flatMap((h) => h.lines.filter((l) => l.type === "add"));
const removedLines = (file) => file.hunks.flatMap((h) => h.lines.filter((l) => l.type === "del"));
const isComment = (text) => text.trim().startsWith("#") || text.trim().startsWith("//");
const firstLine = (file) => file.hunks[0]?.newStart || 1;

function collectThresholds(lines) {
	const found = [];
	for (const { text } of lines) {
		for (const m of text.matchAll(THRESHOLD_KEY)) found.push({ key: m[1], value: Number(m[2]) });
		for (const m of text.matchAll(THRESHOLD_FLAG)) found.push({ key: "--min-score", value: Number(m[1]) });
	}
	return found;
}

function countAssertions(lines) {
	let count = 0;
	for (const { text } of lines) {
		if (!ASSERTION_COMMENT.test(text)) count += [...text.matchAll(ASSERTION)].length;
	}
	return count;
}

/** Applies rules R1 to R8 to parsed diff files. Returns findings as { rule, file, line, message }. */
export function scanDiff(files, config = resolveConfig({}), { allowPaths = [] } = {}) {
	const findings = [];
	const add = (rule, file, line, message) => findings.push({ rule, file, line, message });

	for (const file of files) {
		const path = file.path;
		const isTest = matchesAny(path, config.testGlobs);
		const isDoc = matchesAny(path, DOC_GLOBS);
		const isWorkflow = matchesAny(path, WORKFLOW_GLOBS);
		const isPipeline = matchesAny(path, config.pipelineGlobs);
		const added = addedLines(file);

		if (file.status === "deleted" && matchesAny(file.oldPath, config.testGlobs)) {
			add("R1", file.oldPath, 1, "test file deleted");
		} else if (file.status === "renamed" && matchesAny(file.oldPath, config.testGlobs) && !isTest) {
			add("R1", file.oldPath, 1, `test file moved out of the test paths to ${file.newPath}`);
		}

		if (isTest) {
			for (const l of added) {
				const marker = SKIP_MARKERS.find((re) => re.test(l.text));
				if (marker) add("R2", path, l.line, `skip or only marker added: ${l.text.trim()}`);
			}
		}

		if (!isTest && !isDoc) {
			for (const hunk of file.hunks) {
				const removed = collectThresholds(hunk.lines.filter((l) => l.type === "del"));
				const now = collectThresholds(hunk.lines.filter((l) => l.type === "add"));
				const addLine = hunk.lines.find((l) => l.type === "add")?.line ?? hunk.newStart;
				for (const key of new Set(removed.map((r) => r.key))) {
					const before = removed.filter((r) => r.key === key);
					const after = now.filter((r) => r.key === key);
					before.forEach((b, i) => {
						if (after[i] && after[i].value < b.value) add("R3", path, addLine, `threshold ${key} lowered from ${b.value} to ${after[i].value}`);
					});
				}
			}
		}

		if (isWorkflow && file.status === "deleted") add("R4", file.oldPath, 1, "workflow file deleted");
		if (isPipeline && !isDoc) {
			for (const l of added) {
				if (isComment(l.text)) continue;
				for (const [re, message] of PIPELINE_WEAKENING) {
					if (re.test(l.text)) add("R4", path, l.line, message);
				}
			}
		}
		if (isWorkflow && /\.ya?ml$/.test(path) && file.status !== "deleted") {
			const jobKey = /^ {2}([A-Za-z0-9_-]+):\s*$/;
			const reAdded = new Set(added.map((l) => jobKey.exec(l.text)?.[1]).filter(Boolean));
			for (const hunk of file.hunks) {
				const removed = hunk.lines.filter((l) => l.type === "del");
				removed.forEach((l, i) => {
					const m = jobKey.exec(l.text);
					if (!m || reAdded.has(m[1])) return;
					const body = [];
					for (const next of removed.slice(i + 1)) {
						if (jobKey.test(next.text)) break;
						body.push(next.text);
					}
					if (body.some((t) => /^ {4}(?:runs-on|steps|uses):/.test(t))) add("R4", path, hunk.newStart || 1, `job ${m[1]} deleted`);
				});
			}
		}

		const protectedHit = matchesAny(path, config.protectedPaths) ? path : matchesAny(file.oldPath, config.protectedPaths) ? file.oldPath : null;
		if (protectedHit && !matchesAny(protectedHit, allowPaths)) {
			add("R5", protectedHit, firstLine(file), `protected path modified (${file.status}); only the Architect changes controls`);
		}

		if (!isDoc) {
			for (const l of added) {
				if (SUPPRESSIONS.some((re) => re.test(l.text))) add("R6", path, l.line, `suppression added: ${l.text.trim()}`);
			}
		}

		if (isWorkflow && /(remediate|agent)/i.test(path.split("/").pop())) {
			for (const l of added) {
				if (isComment(l.text)) continue;
				const hit = PROD_CREDENTIALS.find(([re]) => re.test(l.text));
				if (hit) add("R7", path, l.line, `agent workflow exposes a ${hit[1]}`);
			}
		}

		if (isTest && (file.status === "modified" || file.status === "renamed")) {
			const removed = removedLines(file);
			const before = countAssertions(removed);
			const after = countAssertions(added);
			const net = before - after;
			if (net > config.assertionTolerance) {
				const first = removed.find((l) => countAssertions([l]) > 0);
				add("R8", path, first?.line ?? firstLine(file), `assertions removed: -${before} +${after} (net ${net}, tolerance ${config.assertionTolerance})`);
			}
		}
	}
	return findings;
}

function git(args, cwd) {
	try {
		return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
	} catch (err) {
		throw new GuardError(`git ${args.slice(0, 2).join(" ")} failed: ${(err.stderr?.toString() || err.message).trim().split("\n")[0]}`);
	}
}

/** Diff of the working tree against the merge base of <base> and HEAD (the whole pull request, including uncommitted edits). */
export function gitDiff(base, cwd = process.cwd()) {
	git(["rev-parse", "--verify", `${base}^{commit}`], cwd);
	let from = base;
	try {
		from = git(["merge-base", base, "HEAD"], cwd).trim() || base;
	} catch {
		from = base;
	}
	const diff = git(["-c", "core.quotePath=false", "diff", "--no-color", "--no-ext-diff", "-M", "--unified=0", from, "--"], cwd);
	const untracked = git(["ls-files", "--others", "--exclude-standard"], cwd).split("\n").filter(Boolean);
	return { diff, untracked };
}

export function parseArgs(argv) {
	const opts = { git: null, diff: null, config: null, json: false, allowPaths: [] };
	const needValue = (i) => {
		if (argv[i + 1] === undefined) throw new GuardError(`${argv[i]} needs a value`);
		return argv[i + 1];
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--git") opts.git = needValue(i++);
		else if (arg === "--diff") opts.diff = needValue(i++);
		else if (arg === "--config") opts.config = needValue(i++);
		else if (arg === "--allow-path") opts.allowPaths.push(needValue(i++));
		else if (arg === "--json") opts.json = true;
		else throw new GuardError(`unknown argument ${arg}`);
	}
	if ((opts.git === null) === (opts.diff === null)) throw new GuardError("pass exactly one of --git <base> or --diff <file>");
	return opts;
}

export function renderFindings(findings) {
	const lines = findings.map((f) => `${f.rule} ${f.file}:${f.line} ${f.message}`);
	lines.push(findings.length === 0 ? "PASS: no control was weakened" : `FAIL: ${findings.length} finding(s)`);
	return lines.join("\n");
}

export async function runControlGuard(argv, { cwd = process.cwd() } = {}) {
	try {
		const opts = parseArgs(argv);
		const config = await loadConfig(opts.config, cwd);
		let text;
		if (opts.git !== null) {
			const { diff, untracked } = gitDiff(opts.git, cwd);
			text = diff;
			if (untracked.length > 0) console.error(`control-guard: note: ${untracked.length} untracked file(s) are not scanned; stage or commit them first`);
		} else if (opts.diff === "-") {
			text = await readFile(0, "utf8");
		} else {
			try {
				text = await readFile(resolve(cwd, opts.diff), "utf8");
			} catch (err) {
				throw new GuardError(`cannot read diff ${opts.diff}: ${err.code ?? err.message}`);
			}
		}
		const parsed = parseDiff(text);
		if (parsed.length === 0 && text.trim() !== "") throw new GuardError("input is not a unified diff: no file headers found");
		const findings = scanDiff(parsed, config, { allowPaths: opts.allowPaths });
		if (opts.json) console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
		else console.log(renderFindings(findings));
		return findings.length === 0 ? 0 : 1;
	} catch (err) {
		if (err instanceof GuardError) {
			console.error(`control-guard: ${err.message}`);
			return 1;
		}
		throw err;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runControlGuard(process.argv.slice(2)).then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
