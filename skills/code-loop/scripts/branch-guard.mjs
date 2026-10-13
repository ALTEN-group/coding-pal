#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export class ValidationError extends Error {}

function fail(message) {
	throw new ValidationError(message);
}

export const BRANCH_PATTERN = /^(feature|fix|chore)\/issue-\d+-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PROTECTED_BRANCHES = [/^main$/, /^develop$/, /^release\/.*$/];
export const DEFAULT_BASE = "main";
export const DEFAULT_MAX_AGE_DAYS = 5;
const DAY_SECONDS = 86400;

const USAGE = `Usage: node branch-guard.mjs --git [--base main] [--max-age-days 5] [--name <branch>] [--cwd <repo>]
       node branch-guard.mjs --name <branch>      (name rules only, no git)
`;

/** Agent branches are short-lived and named feature|fix|chore/issue-<n>-<slug>; shared branches are never agent branches. */
export function checkBranchName(name) {
	if (!name) fail("no branch name: HEAD is detached; pass --name <branch>");
	if (PROTECTED_BRANCHES.some((pattern) => pattern.test(name))) {
		fail(`branch "${name}" is a shared branch; agents work on a short-lived feature|fix|chore/issue-<n>-<slug> branch`);
	}
	if (!BRANCH_PATTERN.test(name)) {
		fail(`branch "${name}" must match ${BRANCH_PATTERN.source} (for example feature/issue-42-add-roles)`);
	}
}

function git(args, cwd) {
	return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryGit(args, cwd) {
	try {
		return git(args, cwd);
	} catch {
		return null;
	}
}

function resolveRef(ref, cwd) {
	for (const candidate of [ref, `origin/${ref}`]) {
		if (tryGit(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`], cwd)) return candidate;
	}
	return null;
}

/** Age in days of the first commit on the branch that is not on the base, or null when the branch has no commits of its own. */
export function branchAgeDays(branch, base, cwd, now = new Date()) {
	const baseRef = resolveRef(base, cwd);
	if (!baseRef) fail(`base branch "${base}" not found (also tried origin/${base}); fetch it first`);
	const branchRef = resolveRef(branch, cwd);
	if (!branchRef) fail(`branch "${branch}" not found (also tried origin/${branch})`);
	const times = git(["log", "--format=%at", `${baseRef}..${branchRef}`], cwd).split("\n").filter(Boolean).map(Number);
	if (!times.length) return null;
	return (now.getTime() / 1000 - Math.min(...times)) / DAY_SECONDS;
}

export function runBranchGuard(args = process.argv.slice(2), { now = new Date() } = {}) {
	const opts = { git: false, base: DEFAULT_BASE, maxAge: DEFAULT_MAX_AGE_DAYS, name: null, cwd: process.cwd(), help: false };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--git") opts.git = true;
		else if (args[i] === "--base" && args[i + 1]) opts.base = args[++i];
		else if (args[i] === "--max-age-days" && args[i + 1]) opts.maxAge = args[++i];
		else if (args[i] === "--name" && args[i + 1]) opts.name = args[++i];
		else if (args[i] === "--cwd" && args[i + 1]) opts.cwd = args[++i];
		else if (args[i] === "--help" || args[i] === "-h") opts.help = true;
		else {
			console.error(`✗ unknown option or missing value for "${args[i]}"\n${USAGE}`);
			return 1;
		}
	}
	if (opts.help) {
		console.log(USAGE);
		return 0;
	}
	if (!opts.git && !opts.name) {
		console.error(USAGE);
		return 1;
	}

	try {
		if (!/^\d+(\.\d+)?$/.test(String(opts.maxAge))) fail("--max-age-days must be a non-negative number");
		const maxAge = Number(opts.maxAge);
		const name = opts.name ?? (opts.git ? tryGit(["symbolic-ref", "--short", "-q", "HEAD"], opts.cwd) : null);
		checkBranchName(name);
		if (!opts.git) {
			console.log(`✓ Branch "${name}" follows the naming rules`);
			return 0;
		}
		const age = branchAgeDays(name, opts.base, opts.cwd, now);
		if (age !== null && age > maxAge) {
			fail(`branch "${name}" is ${age.toFixed(1)} days old (max ${maxAge}); long-running branches are forbidden: merge it or start a new short-lived branch`);
		}
		console.log(`✓ Branch "${name}" is short-lived (${age === null ? "no commits yet" : `${age.toFixed(1)} days old`}, max ${maxAge}) and based on ${opts.base}`);
		return 0;
	} catch (err) {
		console.error(`✗ ${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	const code = runBranchGuard();
	if (code !== 0) process.exit(code);
}
