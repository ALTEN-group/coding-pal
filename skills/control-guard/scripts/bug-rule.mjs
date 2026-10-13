#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DEFAULT_TEST_GLOBS, matchesAny } from "./control-guard.mjs";

export class BugRuleError extends Error {}

export { DEFAULT_TEST_GLOBS };

function git(args, cwd) {
	try {
		return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
	} catch (err) {
		throw new BugRuleError(`git ${args[0]} failed: ${(err.stderr?.toString() || err.message).trim().split("\n")[0]}`);
	}
}

export function parseRange(range) {
	if (typeof range !== "string" || range.includes("...")) throw new BugRuleError("--git needs a <base>..<head> range");
	const m = /^([^\s]+?)\.\.([^\s]+)$/.exec(range);
	if (!m) throw new BugRuleError("--git needs a <base>..<head> range");
	return { base: m[1], head: m[2] };
}

/** Parses `git show --name-status` output into { status, path } entries (renames and copies also carry the old path as `oldPath`). */
export function parseNameStatus(output) {
	return output
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [status, ...paths] = line.split("\t");
			const entry = { status: status[0], path: paths[paths.length - 1] };
			if (paths.length > 1) entry.oldPath = paths[0];
			return entry;
		});
}

/** Labels a commit: tests (tests only), code (no tests), mixed (both), empty. A rename is a delete of the old path plus an add of the new one. */
export function classifyCommit(files, testGlobs = DEFAULT_TEST_GLOBS) {
	const touched = files.flatMap((f) => (f.status === "R" && f.oldPath ? [{ status: "D", path: f.oldPath }, { status: "A", path: f.path }] : [f]));
	const tests = touched.filter((f) => matchesAny(f.path, testGlobs));
	const code = touched.filter((f) => !matchesAny(f.path, testGlobs));
	let kind = "empty";
	if (tests.length > 0 && code.length > 0) kind = "mixed";
	else if (tests.length > 0) kind = "tests";
	else if (code.length > 0) kind = "code";
	return { kind, testFiles: tests.map((f) => f.path), codeFiles: code.map((f) => f.path), addsOrChangesTests: tests.some((f) => f.status !== "D") };
}

/**
 * Enforces the bug rule on commits in chronological order: the first commit that changes non-test files
 * must be preceded by an earlier commit that adds or changes tests only.
 */
export function evaluateBugRule(commits) {
	if (commits.length === 0) return { ok: false, reason: "no commits in the range", fixIndex: -1, testIndex: -1 };
	const fixIndex = commits.findIndex((c) => c.kind === "code" || c.kind === "mixed");
	if (fixIndex === -1) return { ok: true, reason: "no commit changes non-test files; nothing to order", fixIndex, testIndex: -1 };
	const testIndex = commits.findIndex((c, i) => i < fixIndex && c.kind === "tests" && c.addsOrChangesTests);
	if (testIndex !== -1) {
		return { ok: true, reason: `the failing check is committed first (${commits[testIndex].short}) and the fix follows (${commits[fixIndex].short})`, fixIndex, testIndex };
	}
	const first = commits[fixIndex];
	const reason = first.kind === "mixed"
		? `commit ${first.short} mixes tests and non-test changes; commit the failing check on its own before the fix`
		: `no tests-only commit precedes the first non-test change (${first.short}); commit the failing check before the fix`;
	return { ok: false, reason, fixIndex, testIndex: -1 };
}

export function getCommits(range, testGlobs, cwd = process.cwd()) {
	const { base, head } = parseRange(range);
	for (const ref of [base, head]) git(["rev-parse", "--verify", `${ref}^{commit}`], cwd);
	const log = git(["log", "--reverse", "--topo-order", "--no-merges", "--format=%H%x1f%s", `${base}..${head}`], cwd);
	return log
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [sha, subject] = line.split("\x1f");
			const files = parseNameStatus(git(["-c", "core.quotePath=false", "show", "--no-color", "--name-status", "-M", "--format=", sha], cwd));
			return { sha, short: sha.slice(0, 7), subject, ...classifyCommit(files, testGlobs) };
		});
}

export function renderReport({ range, defect, commits, verdict }) {
	const lines = [`Bug rule for ${range}${defect ? ` (defect: ${defect})` : ""}`];
	commits.forEach((c, i) => lines.push(`${i + 1} ${c.short} ${c.kind.padEnd(5)} ${c.subject}`));
	lines.push(`${verdict.ok ? "PASS" : "FAIL"}: ${verdict.reason}`);
	if (verdict.ok && verdict.testIndex !== -1) lines.push("Next: prove the check fails without the fix with the test-probe skill.");
	return lines.join("\n");
}

export function parseArgs(argv) {
	const opts = { range: null, tests: DEFAULT_TEST_GLOBS, defect: null, json: false };
	const needValue = (i) => {
		if (argv[i + 1] === undefined) throw new BugRuleError(`${argv[i]} needs a value`);
		return argv[i + 1];
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--git") opts.range = needValue(i++);
		else if (arg === "--tests") {
			opts.tests = needValue(i++).split(",").map((s) => s.trim()).filter(Boolean);
			if (opts.tests.length === 0) throw new BugRuleError("--tests needs at least one glob");
		} else if (arg === "--defect") {
			opts.defect = needValue(i++).trim();
			if (!opts.defect) throw new BugRuleError("--defect needs a reference such as #123");
		} else if (arg === "--json") opts.json = true;
		else throw new BugRuleError(`unknown argument ${arg}`);
	}
	if (opts.range === null) throw new BugRuleError("--git <base>..<head> is required");
	parseRange(opts.range);
	return opts;
}

export async function runBugRule(argv, { cwd = process.cwd() } = {}) {
	try {
		const opts = parseArgs(argv);
		const commits = getCommits(opts.range, opts.tests, cwd);
		const verdict = evaluateBugRule(commits);
		if (opts.json) console.log(JSON.stringify({ ok: verdict.ok, reason: verdict.reason, defect: opts.defect, commits }, null, 2));
		else console.log(renderReport({ range: opts.range, defect: opts.defect, commits, verdict }));
		return verdict.ok ? 0 : 1;
	} catch (err) {
		if (err instanceof BugRuleError) {
			console.error(`bug-rule: ${err.message}`);
			return 1;
		}
		throw err;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runBugRule(process.argv.slice(2)).then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
