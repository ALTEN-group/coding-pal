import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	APPROVAL_MESSAGE,
	DEFAULT_LIMIT,
	ValidationError,
	checkHistory,
	createState,
	failStep,
	nextStepNumber,
	parsePlanApproval,
	parsePlanSteps,
	passStep,
	planSha256,
	runCodeLoop,
	startStep,
	validateState,
} from "./code-loop.mjs";
import { APPROVAL, pendingPlan, validPlan } from "./code-fixture.mjs";

async function workItem(plan = validPlan) {
	const root = await mkdtemp(join(tmpdir(), "code-loop-"));
	const dir = join(root, "specs", "issue-42");
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "plan.md"), plan);
	return dir;
}

async function run(args, options) {
	const out = { log: [], warn: [], error: [] };
	const original = { log: console.log, warn: console.warn, error: console.error };
	console.log = (...a) => out.log.push(a.join(" "));
	console.warn = (...a) => out.warn.push(a.join(" "));
	console.error = (...a) => out.error.push(a.join(" "));
	try {
		out.code = await runCodeLoop(args, options);
	} finally {
		Object.assign(console, original);
	}
	return out;
}

const progress = async (dir) => JSON.parse(await readFile(join(dir, "progress.json"), "utf-8"));

test("automated Plan approval allows Code without a forged Developer signature", async () => {
	const automated = validPlan.replace(APPROVAL, "Automated by Planner agent on 2026-10-14");
	assert.equal(parsePlanApproval(automated).approved, true);
	assert.equal(parsePlanApproval(automated.replace("2026-10-14", "2026-02-30")).approved, false);
	assert.equal(parsePlanApproval(automated.replace("Planner agent", "<name>")).approved, false);
	const dir = await workItem(automated);
	assert.equal((await run(["next", "--dir", dir])).code, 0);
	assert.equal((await run(["start", "1", "--dir", dir])).code, 0);
});

test("parses plan steps and ignores step-like text inside code fences", () => {
	const steps = parsePlanSteps(validPlan);
	assert.deepEqual(steps.map((s) => [s.number, s.name]), [
		[1, "Create the role route"],
		[2, "Mount the router behind authentication"],
		[3, "Add route tests"],
	]);
	assert.equal(steps[1].fields.Files, "`src/app.js`");
	assert.equal(steps[0].fields.Serves, "AC-3");
});

test("rejects plans without steps, with gaps, or with an unclosed fence", () => {
	const rejects = (md, pattern) => assert.throws(() => parsePlanSteps(md), (e) => e instanceof ValidationError && pattern.test(e.message));
	rejects("# Plan\n\n## Done When\n- x\n", /no "## Implementation Checklist"/);
	rejects("# Plan\n\n## Implementation Checklist\n\nnothing\n", /no "### Step/);
	rejects(validPlan.replace("### Step 2:", "### Step 3:"), /sequential/);
	rejects(`${validPlan}\n\`\`\`js\n`, /unclosed code fence/);
});

test("step transitions are strictly ordered", () => {
	const state = createState("42", "sha", 3);
	assert.throws(() => startStep(state, "2"), /Step 1 must be completed before Step 2/);
	assert.throws(() => startStep(state, "9"), /does not exist/);
	assert.throws(() => startStep(state, "one"), /does not exist/);
	assert.throws(() => passStep(state, "1"), /start it before recording a pass/);
	assert.equal(startStep(state, "1"), 1);
	assert.throws(() => startStep(state, "1"), /already in progress/);
	assert.throws(() => startStep(state, "2"), /Step 1 must be completed/);
	passStep(state, "1", new Date("2026-10-13T09:30:00.123Z"));
	assert.equal(state.steps[1].verifiedAt, "2026-10-13T09:30:00Z");
	assert.throws(() => startStep(state, "1"), /already done/);
	assert.equal(nextStepNumber(state), 2);
	startStep(state, "2");
	passStep(state, "2");
	startStep(state, "3");
	passStep(state, "3");
	assert.equal(nextStepNumber(state), null);
});

test("fail needs a step in progress and a reason, and counts attempts", () => {
	const state = createState("42", "sha", 2);
	assert.throws(() => failStep(state, "1", "boom"), /only the step in progress can fail/);
	startStep(state, "1");
	assert.throws(() => failStep(state, "1", "  "), /needs --reason/);
	const result = failStep(state, "1", "type error in role.js");
	assert.deepEqual(result, { step: 1, limitReached: false, warn: false });
	assert.equal(state.steps[1].attempts, 1);
	assert.equal(state.steps[1].lastFailure, "type error in role.js");
	assert.equal(state.fixLoop.attempts, 1);
});

test("validateState catches hand edits that break the loop", () => {
	const good = () => createState("42", "sha", 3);
	validateState(good(), 3);
	const bad = (mutate, pattern) => {
		const state = good();
		mutate(state);
		assert.throws(() => validateState(state, 3), (e) => e instanceof ValidationError && pattern.test(e.message));
	};
	bad((s) => delete s.steps[3], /exactly the keys/);
	bad((s) => (s.steps[1].status = "started"), /status must be one of/);
	bad((s) => (s.steps[1].attempts = -1), /non-negative/);
	bad((s) => (s.steps[1].status = "done"), /verifiedAt/);
	bad((s) => (s.steps[2].status = "in_progress"), /strictly ordered/);
	bad((s) => (s.steps[1].attempts = 2), /must equal the sum/);
	bad((s) => (s.fixLoop.limit = 0), /"limit" from 1 to 5/);
	bad((s) => (s.fixLoop.limit = 6), /"limit" from 1 to 5/);
	bad((s) => delete s.planSha256, /planSha256/);
	assert.throws(() => validateState(null, 3), /JSON object/);
});

test("CLI creates progress.json and walks a work item to done", async () => {
	const dir = await workItem();
	let result = await run(["status", "--dir", dir]);
	assert.equal(result.code, 0);
	assert.match(result.log.join("\n"), /Code progress: issue 42 \(3 steps\)/);
	assert.match(result.log.join("\n"), /Done 0\/3; fix loop 0\/5/);
	const created = await progress(dir);
	assert.equal(created.issue, "42");
	assert.equal(created.planSha256, planSha256(validPlan));
	assert.deepEqual(created.fixLoop, { attempts: 0, limit: DEFAULT_LIMIT });
	assert.equal(created.steps[1].status, "pending");

	result = await run(["next", "--dir", dir]);
	assert.match(result.log.join("\n"), /Step 1: Create the role route \(pending, attempts 0\)/);
	assert.match(result.log.join("\n"), /Verification: `npm test/);
	result = await run(["next", "--dir", dir, "--json"]);
	assert.equal(JSON.parse(result.log.join("\n")).number, 1);

	const clock = { now: () => new Date("2026-10-13T09:30:00Z") };
	for (const n of ["1", "2", "3"]) {
		assert.equal((await run(["start", n, "--dir", dir])).code, 0);
		assert.equal((await run(["pass", n, "--dir", dir], clock)).code, 0);
	}
	assert.equal((await progress(dir)).steps[3].verifiedAt, "2026-10-13T09:30:00Z");

	result = await run(["next", "--dir", dir]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /all steps are done/);
	result = await run(["status", "--dir", dir, "--json"]);
	assert.equal(JSON.parse(result.log.join("\n")).done, 3);
});

test("CLI enforces order, warns after 3 attempts, and stops at the limit", async () => {
	const dir = await workItem();
	assert.equal((await run(["start", "2", "--dir", dir])).code, 1);
	assert.equal((await run(["start", "1", "--dir", dir])).code, 0);
	assert.equal((await run(["fail", "1", "--dir", dir])).code, 1);

	for (let i = 1; i <= 3; i++) {
		const result = await run(["fail", "1", "--reason", `attempt ${i}`, "--dir", dir]);
		assert.equal(result.code, 0);
		assert.equal(result.warn.length, 0);
	}
	let result = await run(["fail", "1", "--reason", "attempt 4", "--dir", dir]);
	assert.equal(result.code, 0);
	assert.match(result.warn.join("\n"), /too big or too vague/);

	result = await run(["fail", "1", "--reason", "attempt 5", "--dir", dir]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /fix-loop limit reached: the Developer steps in/);
	assert.deepEqual((await progress(dir)).fixLoop, { attempts: 5, limit: 5 });

	for (const args of [["pass", "1"], ["fail", "1", "--reason", "again"], ["start", "1"]]) {
		result = await run([...args, "--dir", dir]);
		assert.equal(result.code, 1);
		assert.match(result.error.join("\n"), /the Developer steps in/);
	}
	result = await run(["status", "--dir", dir]);
	assert.equal(result.code, 0);
	assert.match(result.log.join("\n"), /fix loop 5\/5: fix-loop limit reached: the Developer steps in/);
});

test("the limit is set once and cannot be raised or reset by the agent", async () => {
	const dir = await workItem();
	assert.equal((await run(["start", "1", "--dir", dir, "--limit", "2"])).code, 0);
	assert.equal((await progress(dir)).fixLoop.limit, 2);
	assert.equal((await run(["fail", "1", "--reason", "x", "--dir", dir, "--limit", "2"])).code, 0);
	let result = await run(["fail", "1", "--reason", "y", "--dir", dir]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /limit reached/);
	result = await run(["fail", "1", "--reason", "z", "--dir", dir, "--limit", "4"]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /fixed when progress.json is created/);
	assert.equal((await run(["status", "--dir", dir, "--limit", "0"])).code, 1);
	assert.equal((await run(["status", "--dir", dir, "--limit", "many"])).code, 1);
	const other = await workItem();
	const tooHigh = await run(["start", "1", "--dir", other, "--limit", "6"]);
	assert.equal(tooHigh.code, 1);
	assert.match(tooHigh.error.join("\n"), /--limit must be an integer from 1 to 5/);
	assert.equal((await run(["start", "1", "--dir", other, "--limit", "99"])).code, 1);
	const reset = await run(["reset-attempts", "--dir", dir]);
	assert.equal(reset.code, 1);
	assert.match(reset.error.join("\n"), /cannot be reset by the agent/);
});

test("a plan changed after Code started is refused, an untouched one is re-read", async () => {
	const dir = await workItem();
	await run(["status", "--dir", dir]);
	const edited = validPlan.replace("Add route tests", "Add all the tests");
	await writeFile(join(dir, "plan.md"), edited);
	let result = await run(["status", "--dir", dir]);
	assert.equal(result.code, 0);
	assert.equal((await progress(dir)).planSha256, planSha256(edited));
	assert.match(result.log.join("\n"), /Add all the tests/);

	await run(["start", "1", "--dir", dir]);
	await writeFile(join(dir, "plan.md"), validPlan);
	result = await run(["status", "--dir", dir]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /plan changed after Code started; the Developer must re-approve/);
	assert.equal((await run(["start", "2", "--dir", dir])).code, 1);
});

test("the plan hash ignores line-ending differences", () => {
	assert.equal(planSha256("a\nb\n"), planSha256("a\r\nb\r\n"));
	assert.notEqual(planSha256("a\nb\n"), planSha256("a\nc\n"));
});

test("CLI reports usage and input errors", async () => {
	const dir = await workItem();
	assert.equal((await run([])).code, 1);
	assert.equal((await run(["status"])).code, 1);
	assert.equal((await run(["status", "--dir", dir, "--bogus"])).code, 1);
	assert.equal((await run(["status", "extra", "more", "--dir", dir])).code, 1);
	assert.equal((await run(["--help"])).code, 0);
	assert.equal((await run(["status", "--dir", join(dir, "missing")])).code, 1);
	assert.equal((await run(["start", "--dir", dir])).code, 1);

	await writeFile(join(dir, "progress.json"), "{ not json");
	let result = await run(["status", "--dir", dir]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /not valid JSON/);

	await writeFile(join(dir, "progress.json"), JSON.stringify({ ...createState("42", planSha256(validPlan), 3), fixLoop: { attempts: 1, limit: 5 } }));
	result = await run(["status", "--dir", dir]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /must equal the sum of step attempts/);

	await writeFile(join(dir, "plan.md"), "# Plan\n");
	assert.equal((await run(["status", "--dir", dir])).code, 1);
});

const withApproval = (value) => validPlan.replace(`- **Approved By:** ${APPROVAL}`, `- **Approved By:** ${value}`);

test("parsePlanApproval accepts a named Developer and rejects everything else", () => {
	assert.deepEqual(parsePlanApproval(validPlan), { approved: true, value: APPROVAL, reason: null });
	assert.equal(parsePlanApproval(withApproval(`${APPROVAL}; Grace Hopper (Architect) on 2026-10-04`)).approved, true);

	const rejected = (md, pattern) => {
		const result = parsePlanApproval(md);
		assert.equal(result.approved, false);
		assert.match(result.reason, pattern);
	};
	rejected(pendingPlan, /not "<name> \(Developer\) on YYYY-MM-DD"/);
	rejected(validPlan.replace(/\n## Approval\n- \*\*Approved By:\*\* .*\n/, "\n"), /no "## Approval" section/);
	rejected(validPlan.replace("**Approved By:**", "**Approver:**"), /no "- \*\*Approved By:\*\*" field/);
	for (const value of ["Approved", "Ada Lovelace (Architect) on 2026-10-03", "Ada Lovelace (Developer)", "Ada Lovelace (Developer) on 03/10/2026", "Ada Lovelace (Developer) on 2026-10-03; Grace Hopper (Developer) on 2026-10-03"]) {
		rejected(withApproval(value), /not "<name> \(Developer\)/);
	}
	for (const name of ["Copilot", "Claude Sonnet", "release-bot", "Review Agent", "dependabot[bot]", "AI"]) {
		rejected(withApproval(`${name} (Developer) on 2026-10-03`), /AI or automation/);
		rejected(withApproval(`${APPROVAL}; ${name} (Architect) on 2026-10-04`), /AI or automation/);
	}
	for (const name of ["TBD", "x", "<name>"]) rejected(withApproval(`${name} (Developer) on 2026-10-03`), /placeholder/);
	rejected(withApproval("Ada Lovelace (Developer) on 2026-13-40"), /not a valid date/);
	rejected(withApproval(`${APPROVAL}; ada lovelace (Architect) on 2026-10-04`), /two different people/);
	const fenced = validPlan.replace(/\n## Approval\n- \*\*Approved By:\*\* .*\n/, "\n```md\n## Approval\n- **Approved By:** Ada Lovelace (Developer) on 2026-10-03\n```\n");
	rejected(fenced, /no "## Approval" section/);
});

test("start and next refuse a plan that is not approved by a Developer; status shows the approval", async () => {
	const dir = await workItem(pendingPlan);
	for (const args of [["start", "1"], ["next"], ["next", "--json"]]) {
		const result = await run([...args, "--dir", dir]);
		assert.equal(result.code, 1);
		assert.match(result.error.join("\n"), new RegExp(APPROVAL_MESSAGE));
	}
	await assert.rejects(readFile(join(dir, "progress.json"), "utf-8"), "a refused start writes no state");

	let result = await run(["status", "--dir", dir]);
	assert.equal(result.code, 0);
	assert.match(result.log.join("\n"), /Approved by: NOT APPROVED \(.*Pending.*\)/);
	assert.equal(JSON.parse((await run(["status", "--dir", dir, "--json"])).log.join("\n")).approval.approved, false);

	await writeFile(join(dir, "plan.md"), withApproval("Copilot (Developer) on 2026-10-03"));
	result = await run(["start", "1", "--dir", dir]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /plan is not approved by a Developer; Code starts only from an approved plan \(approver "Copilot" is an AI or automation/);

	await writeFile(join(dir, "plan.md"), validPlan);
	result = await run(["next", "--dir", dir]);
	assert.equal(result.code, 0);
	assert.match(result.log.join("\n"), new RegExp(`Approved by: ${APPROVAL.replace(/[()]/g, "\\$&")}`));
	assert.equal(JSON.parse((await run(["next", "--dir", dir, "--json"])).log.join("\n")).approval.value, APPROVAL);
	assert.equal((await run(["start", "1", "--dir", dir])).code, 0);
	result = await run(["status", "--dir", dir]);
	assert.match(result.log.join("\n"), /Approved by: Ada Lovelace \(Developer\) on 2026-10-03/);
});

function git(cwd, args) {
	const env = { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "t@example.com" };
	return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** A repo with the approved plan on main and a feature branch checked out; progress.json is added per test. */
async function historyRepo() {
	const root = await mkdtemp(join(tmpdir(), "code-loop-history-"));
	git(root, ["init", "-b", "main"]);
	await mkdir(join(root, "specs", "issue-42"), { recursive: true });
	await writeFile(join(root, "specs", "issue-42", "plan.md"), validPlan);
	git(root, ["add", "."]);
	git(root, ["commit", "-m", "plan"]);
	git(root, ["checkout", "-b", "feature/issue-42-roles"]);
	return root;
}

/** progress.json after `attempts` failed attempts on step 1. */
function state(attempts, mutate = () => {}) {
	const s = createState("42", planSha256(validPlan), 3);
	if (attempts > 0) {
		s.steps[1].status = "in_progress";
		s.steps[1].attempts = attempts;
		s.fixLoop.attempts = attempts;
	}
	mutate(s);
	return s;
}

async function commitProgress(root, content, message = "progress") {
	await writeFile(join(root, "specs", "issue-42", "progress.json"), typeof content === "string" ? content : `${JSON.stringify(content, null, "\t")}\n`);
	git(root, ["add", "."]);
	git(root, ["commit", "-m", message]);
}

const history = (root, extra = []) => run(["check-history", "--dir", "specs/issue-42", ...extra], { cwd: root });

test("check-history passes when there is no progress.json or the counters only grow", async () => {
	const root = await historyRepo();
	let result = await history(root);
	assert.equal(result.code, 0);
	assert.match(result.log.join("\n"), /no progress.json for specs\/issue-42 on main .*nothing to check/);

	await commitProgress(root, state(0));
	await commitProgress(root, state(1));
	await commitProgress(root, state(1, (s) => (s.steps[1].lastFailure = "retry")), "same counters");
	await commitProgress(root, state(3));
	result = await history(root);
	assert.equal(result.code, 0);
	assert.match(result.log.join("\n"), /specs\/issue-42\/progress.json never lowered its counters: \d+ version\(s\) checked against main/);

	git(root, ["checkout", "main"]);
	git(root, ["merge", "--no-ff", "-m", "merge", "feature/issue-42-roles"]);
	git(root, ["checkout", "-b", "feature/issue-42-more"]);
	await commitProgress(root, state(3, (s) => (s.steps[1].lastFailure = "again")));
	assert.equal((await history(root)).code, 0, "the base version is the starting point");
	assert.equal((await history(root, ["--base", "main"])).code, 0);
});

test("check-history catches a deleted progress.json", async () => {
	const root = await historyRepo();
	await commitProgress(root, state(2));
	git(root, ["checkout", "main"]);
	git(root, ["merge", "--no-ff", "-m", "merge", "feature/issue-42-roles"]);
	git(root, ["checkout", "-b", "feature/issue-42-reset"]);

	const file = join(root, "specs", "issue-42", "progress.json");
	await rm(file);
	let result = await history(root);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /missing from the working tree but exists in/);

	git(root, ["commit", "-am", "drop the counter"]);
	result = await history(root);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /progress.json was deleted in commit [0-9a-f]{7}: deleting it resets the fix-loop counter/);

	const onBranch = await historyRepo();
	await commitProgress(onBranch, state(1));
	await commitProgress(onBranch, state(1, (s) => (s.steps[1].lastFailure = "touch")), "touch");
	await rm(join(onBranch, "specs", "issue-42", "progress.json"));
	git(onBranch, ["commit", "-am", "delete"]);
	await commitProgress(onBranch, state(0), "recreate from zero");
	result = await history(onBranch);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /deleted in commit/);
});

test("check-history catches a reset or rewritten counter, committed or not", async () => {
	const root = await historyRepo();
	await commitProgress(root, state(2));
	await commitProgress(root, state(0));
	let result = await history(root);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /fixLoop.attempts decreased from 2 to 0 \(commit [0-9a-f]{7} to commit [0-9a-f]{7}\): the fix-loop counter cannot be reset/);

	const dip = await historyRepo();
	await commitProgress(dip, state(3));
	await commitProgress(dip, state(1));
	await commitProgress(dip, state(4));
	result = await history(dip);
	assert.equal(result.code, 1, "an earlier commit with higher attempts exposes the rewrite even when HEAD ends higher");
	assert.match(result.error.join("\n"), /decreased from 3 to 1/);

	const stepOnly = await historyRepo();
	await commitProgress(stepOnly, state(2));
	await commitProgress(stepOnly, state(2, (s) => {
		s.steps[1].attempts = 1;
		s.steps[2].attempts = 1;
		s.steps[1].status = "done";
		s.steps[1].verifiedAt = "2026-10-13T09:30:00Z";
	}));
	result = await history(stepOnly);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /step 1 attempts decreased from 2 to 1/);

	const uncommitted = await historyRepo();
	await commitProgress(uncommitted, state(2));
	await writeFile(join(uncommitted, "specs", "issue-42", "progress.json"), JSON.stringify(state(0)));
	result = await history(uncommitted);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /decreased from 2 to 0 \(commit [0-9a-f]{7} to the working tree\)|\(HEAD to the working tree\)/);

	await writeFile(join(uncommitted, "specs", "issue-42", "progress.json"), JSON.stringify(state(3)));
	assert.equal((await history(uncommitted)).code, 0, "a working tree that is ahead of HEAD is fine");
});

test("check-history compares against the base ref", async () => {
	const root = await historyRepo();
	await commitProgress(root, state(3));
	git(root, ["checkout", "main"]);
	git(root, ["merge", "--no-ff", "-m", "merge", "feature/issue-42-roles"]);
	git(root, ["checkout", "-b", "feature/issue-42-low"]);
	await commitProgress(root, state(1));
	const result = await history(root, ["--base", "main"]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /decreased from 3 to 1 \(base main to commit/);
});

test("check-history catches a changed plan hash once Code started, a raised limit, and removed steps", async () => {
	const changed = await historyRepo();
	await commitProgress(changed, state(1));
	await commitProgress(changed, state(1, (s) => (s.planSha256 = "0".repeat(64))));
	let result = await history(changed);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /planSha256 changed after Code started .*: the Developer must re-approve the plan/);

	const untouched = await historyRepo();
	await commitProgress(untouched, state(0));
	await commitProgress(untouched, state(0, (s) => (s.planSha256 = "0".repeat(64))));
	assert.equal((await history(untouched)).code, 0, "an untouched progress.json is re-read when the plan changes before Code starts");

	const raised = await historyRepo();
	await commitProgress(raised, state(1, (s) => (s.fixLoop.limit = 3)));
	await commitProgress(raised, state(1));
	result = await history(raised);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /fixLoop.limit was raised from 3 to 5/);

	const removed = await historyRepo();
	await commitProgress(removed, state(1));
	await commitProgress(removed, state(1, (s) => delete s.steps[3]));
	result = await history(removed);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /step 3 was removed/);
});

test("check-history rejects unreadable versions, missing bases, and non-repositories", async () => {
	const root = await historyRepo();
	await commitProgress(root, "{ not json");
	let result = await history(root);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /progress.json at commit [0-9a-f]{7} is not valid JSON/);

	const shapeless = await historyRepo();
	await commitProgress(shapeless, { issue: "42" });
	result = await history(shapeless);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /has no "steps" and "fixLoop.attempts"/);

	result = await history(root, ["--base", "origin/main"]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /base ref origin\/main not found/);

	git(root, ["branch", "-m", "main", "trunk"]);
	result = await history(root);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /base ref origin\/main or main not found/);

	const outside = await mkdtemp(join(tmpdir(), "code-loop-nogit-"));
	result = await run(["check-history", "--dir", "specs/issue-42"], { cwd: outside });
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /not inside a git work tree/);

	assert.equal((await run(["check-history"])).code, 1);
	assert.equal((await run(["status", "--dir", "specs/issue-42", "--base", "main"])).code, 1);
	assert.throws(() => checkHistory({ dir: "../../outside", cwd: root, base: "trunk" }), /outside the repository/);
});

test("check-history falls back from origin/main to main and works from a subdirectory", async () => {
	const root = await historyRepo();
	await commitProgress(root, state(2));
	git(root, ["update-ref", "refs/remotes/origin/main", "main"]);
	const viaOrigin = await history(root);
	assert.equal(viaOrigin.code, 0);
	assert.match(viaOrigin.log.join("\n"), /checked against origin\/main/);

	const sub = join(root, "specs");
	const result = await run(["check-history", "--dir", "issue-42"], { cwd: sub });
	assert.equal(result.code, 0);
	assert.equal(checkHistory({ dir: join(root, "specs", "issue-42"), cwd: root }).path, "specs/issue-42/progress.json");
});
