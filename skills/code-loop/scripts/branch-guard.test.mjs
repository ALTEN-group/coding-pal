import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BRANCH_PATTERN, ValidationError, branchAgeDays, checkBranchName, runBranchGuard } from "./branch-guard.mjs";

function git(cwd, args, date) {
	const env = { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "t@example.com" };
	if (date) Object.assign(env, { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
	return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function commit(cwd, file, date) {
	await writeFile(join(cwd, file), `${file}\n`);
	git(cwd, ["add", file]);
	git(cwd, ["commit", "-m", `add ${file}`], date);
}

async function repo() {
	const cwd = await mkdtemp(join(tmpdir(), "branch-guard-"));
	git(cwd, ["init", "-b", "main"]);
	await commit(cwd, "base.txt", "2026-01-01T10:00:00Z");
	return cwd;
}

function run(args, options) {
	const out = { log: [], error: [] };
	const original = { log: console.log, error: console.error };
	console.log = (...a) => out.log.push(a.join(" "));
	console.error = (...a) => out.error.push(a.join(" "));
	try {
		out.code = runBranchGuard(args, options);
	} finally {
		Object.assign(console, original);
	}
	return out;
}

const rejects = (name, pattern) => assert.throws(() => checkBranchName(name), (e) => e instanceof ValidationError && pattern.test(e.message));

test("accepts short-lived agent branch names", () => {
	for (const name of ["feature/issue-42-add-roles", "fix/issue-7-null-check", "chore/issue-100-bump-node", "feature/issue-1-x"]) {
		assert.doesNotThrow(() => checkBranchName(name));
		assert.match(name, BRANCH_PATTERN);
	}
});

test("rejects shared branches and malformed names", () => {
	rejects("main", /shared branch/);
	rejects("develop", /shared branch/);
	rejects("release/1.2", /shared branch/);
	rejects("feature/add-roles", /must match/);
	rejects("feature/issue-42", /must match/);
	rejects("feature/issue-42-Add-Roles", /must match/);
	rejects("feature/issue-42-add--roles", /must match/);
	rejects("hotfix/issue-42-add-roles", /must match/);
	rejects("issue-42-add-roles", /must match/);
	rejects("", /detached/);
});

test("branch age counts from the first commit not on the base", async () => {
	const cwd = await repo();
	git(cwd, ["checkout", "-b", "feature/issue-42-add-roles"]);
	assert.equal(branchAgeDays("feature/issue-42-add-roles", "main", cwd), null);
	await commit(cwd, "a.txt", "2026-10-01T00:00:00Z");
	await commit(cwd, "b.txt", "2026-10-04T00:00:00Z");
	const age = branchAgeDays("feature/issue-42-add-roles", "main", cwd, new Date("2026-10-04T12:00:00Z"));
	assert.equal(age, 3.5);
});

test("branch age uses the oldest author date even when history is not in date order", async () => {
	const cwd = await repo();
	git(cwd, ["checkout", "-b", "feature/issue-42-add-roles"]);
	await commit(cwd, "a.txt", "2026-10-04T00:00:00Z");
	await commit(cwd, "b.txt", "2026-10-01T00:00:00Z");
	assert.equal(branchAgeDays("feature/issue-42-add-roles", "main", cwd, new Date("2026-10-04T12:00:00Z")), 3.5);
});

test("fails when the base or the branch cannot be resolved", async () => {
	const cwd = await repo();
	git(cwd, ["checkout", "-b", "feature/issue-42-add-roles"]);
	assert.throws(() => branchAgeDays("feature/issue-42-add-roles", "trunk", cwd), /base branch "trunk" not found/);
	assert.throws(() => branchAgeDays("feature/issue-9-ghost", "main", cwd), /branch "feature\/issue-9-ghost" not found/);
});

test("CLI passes a fresh agent branch and uses the current branch by default", async () => {
	const cwd = await repo();
	git(cwd, ["checkout", "-b", "fix/issue-7-null-check"]);
	await commit(cwd, "a.txt", "2026-10-10T00:00:00Z");
	const result = run(["--git", "--cwd", cwd], { now: new Date("2026-10-11T00:00:00Z") });
	assert.equal(result.code, 0);
	assert.match(result.log.join("\n"), /"fix\/issue-7-null-check" is short-lived \(1\.0 days old, max 5\)/);
});

test("CLI passes a branch without commits of its own", async () => {
	const cwd = await repo();
	git(cwd, ["checkout", "-b", "chore/issue-3-tidy"]);
	const result = run(["--git", "--cwd", cwd]);
	assert.equal(result.code, 0);
	assert.match(result.log.join("\n"), /no commits yet/);
});

test("CLI rejects long-running branches and honours --max-age-days and --base", async () => {
	const cwd = await repo();
	git(cwd, ["checkout", "-b", "develop"]);
	await commit(cwd, "d.txt", "2026-10-01T00:00:00Z");
	git(cwd, ["checkout", "-b", "feature/issue-42-add-roles"]);
	await commit(cwd, "a.txt", "2026-10-02T00:00:00Z");
	const now = new Date("2026-10-10T00:00:00Z");
	let result = run(["--git", "--cwd", cwd], { now });
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /9\.0 days old \(max 5\); long-running branches are forbidden/);
	assert.equal(run(["--git", "--cwd", cwd, "--max-age-days", "10"], { now }).code, 0);
	result = run(["--git", "--cwd", cwd, "--base", "develop", "--max-age-days", "8"], { now });
	assert.equal(result.code, 0);
	assert.equal(run(["--git", "--cwd", cwd, "--max-age-days", "soon"], { now }).code, 1);
});

test("CLI rejects protected and misnamed current branches and an explicit --name", async () => {
	const cwd = await repo();
	let result = run(["--git", "--cwd", cwd]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /"main" is a shared branch/);
	git(cwd, ["checkout", "-b", "my-branch"]);
	assert.equal(run(["--git", "--cwd", cwd]).code, 1);
	result = run(["--git", "--cwd", cwd, "--name", "release/2.0"]);
	assert.match(result.error.join("\n"), /shared branch/);
	git(cwd, ["checkout", "--detach"]);
	result = run(["--git", "--cwd", cwd]);
	assert.match(result.error.join("\n"), /detached/);
});

test("--name alone checks naming without git", () => {
	assert.equal(run(["--name", "feature/issue-42-add-roles"]).code, 0);
	assert.equal(run(["--name", "main"]).code, 1);
});

test("CLI reports usage errors", () => {
	assert.equal(run([]).code, 1);
	assert.equal(run(["--bogus"]).code, 1);
	assert.equal(run(["--help"]).code, 0);
});
