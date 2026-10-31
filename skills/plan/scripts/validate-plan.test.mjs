import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PLAN_APPROVAL, THINK_APPROVAL, approvedPlan, approvedThink, validPlan, validThink } from "./plan-fixtures.mjs";
import { ValidationError, runValidator, validatePlanContent, validateThinkContent } from "./validate-plan.mjs";

const F = "```";
const think = (from, to) => validThink.replace(from, to);
const plan = (from, to) => validPlan.replace(from, to);
const matches = (pattern) => (err) => err instanceof ValidationError && pattern.test(err.message);
const badPlan = (md, pattern, options) => assert.throws(() => validatePlanContent(md, "plan.md", options), matches(pattern));

test("automated Plan approval preserves Think chronology and structural checks", () => {
	const think = validateThinkContent(validThink.replace("Approved By:** Pending", "Approved By:** Automated by Thinker agent on 2026-10-14"));
	const plan = validPlan.replace("Approved By:** Pending", "Approved By:** Automated by Planner agent on 2026-10-15");
	assert.equal(validatePlanContent(plan, "plan.md", { think, stage: "approved" }).approval.approvals[0].role, "Automation");
	badPlan(plan.replace("2026-10-15", "2026-10-13"), /before/, { think, stage: "approved" });
	badPlan(plan.replace("2026-10-15", "2026-02-30"), /valid date/);
	badPlan(plan.replace("Planner agent", "<name>"), /identity/);
});

test("validates compliant plan.md and returns structured data", () => {
	const result = validatePlanContent(validPlan);
	assert.equal(result.steps.length, 4);
	assert.equal(result.criteria.length, 3);
	assert.deepEqual(result.approval, { status: "pending", approvals: [] });
	assert.equal(result.steps[0].hasCode, true);
	assert.equal(result.steps[3].hasCode, false);
});

test("rejects plan structure problems", () => {
	badPlan("", /empty/);
	badPlan(plan("## Test Plan", "## Tests"), /heading #5/);
	badPlan(plan("- Reference: `specs/issue-42/think.md`.", "- Nothing."), /reference the think\.md/);
	badPlan(plan("- The Forge RBAC client package is installed.\n", ""), /at least one dependency, environment variable, or service/);
	badPlan(plan("- The Forge RBAC client package is installed.\n", "\n  \n"), /at least one dependency/);
	assert.equal(validatePlanContent(plan("- The Forge RBAC client package is installed.", "- None.")).steps.length > 0, true);
	badPlan(plan("### Step 2:", "### Step 3:"), /sequential/);
});

test("New Code must be a fenced code block or _None_", () => {
	badPlan(plan("- **New Code:** _None._", "- **New Code:** just do it"), /fenced code block/);
	badPlan(plan(/- \*\*New Code:\*\*\n  ```js\n  app\.use[\s\S]*?```\n/.exec(validPlan)[0], "- **New Code:**\n"), /missing or empty required field "- \*\*New Code:\*\*"/);
	badPlan(plan(`  ${F}js\n  app.use("/roles", authenticate, requireRole("admin"), roleRouter);\n  ${F}`, `  Add this:\n  ${F}js\n  x();\n  ${F}`), /only fenced code blocks/);
	badPlan(plan("- **Verification:** `npx markdownlint docs/specs/roles.md`\n", ""), /missing or empty required field "- \*\*Verification:\*\*"/);
	badPlan(plan("- **Serves:** AC-3\n\n## Test Plan", "- **Serves:** none\n\n## Test Plan"), /"Serves" must reference/);
});

test("step fields keep their order and reject unknown fields", () => {
	const swapped = plan("- **Verification:** `npx markdownlint docs/specs/roles.md`\n- **Bootable Check:** `docker compose up -d && curl -f http://localhost:3000/health`\n- **Serves:** AC-3\n\n## Test Plan", "- **Bootable Check:** `docker compose up -d && curl -f http://localhost:3000/health`\n- **Verification:** `npx markdownlint docs/specs/roles.md`\n- **Serves:** AC-3\n\n## Test Plan");
	badPlan(swapped, /duplicated or out of order/);
	badPlan(plan("- **Serves:** AC-3\n\n## Test Plan", "- **Serves:** AC-3\n- **Notes:** hi\n\n## Test Plan"), /unexpected field/);
});

test("code fences cannot break the document structure", () => {
	const tricky = plan(`  ${F}js\n  import { Router } from "express";`, `  ${F}js\n  ## not a heading\n  ### Step 9: not a step\n  - **Verification:** not a field\n  import { Router } from "express";`);
	assert.equal(validatePlanContent(tricky).steps.length, 4);
	badPlan(`${validPlan}\n${F}js\nnever closed\n`, /unclosed code fence/);
});

test("file scope: steps stay in scope and every in-scope file is covered", () => {
	badPlan(plan("- **Files:** `src/app.js`", "- **Files:** `src/server.js`"), /not declared In Scope/);
	badPlan(plan("- **Files:** `src/app.js`", "- **Files:** `src/routes/user.js`"), /Out of Scope/);
	badPlan(plan("- **Files:** `docs/specs/roles.md`", "- **Files:** `tests/routes/role.test.js`"), /"docs\/specs\/roles.md" is not covered/);
	badPlan(plan("- **Out of Scope:** `src/routes/user.js`, `db/`", "- **Out of Scope:** `src/app.js`"), /both In Scope and Out of Scope/);
	badPlan(plan("`src/routes/role.js`, `src/app.js`", "`/etc/passwd`, `src/app.js`"), /workspace-relative/);
	badPlan(plan("- **In Scope:** `src/routes/role.js`, `src/app.js`, `tests/routes/role.test.js`, `docs/specs/roles.md`", "- **In Scope:** the relevant files"), /must list the files/);
});

test("acceptance criteria: 3 to 8, sequential, observable, served, and tested", () => {
	badPlan(plan("- **AC-3:** Given an admin and a valid body, when POST /roles, then the response is 201 and exactly one role is created.\n", ""), /3 to 8 acceptance criteria/);
	badPlan(plan("**AC-3:**", "**AC-4:**"), /sequential/);
	badPlan(plan("Given an unauthenticated request to POST /roles, then", "Requests without a token are rejected and"), /"Given \.\.\., then \.\.\."/);
	badPlan(plan("- **Serves:** AC-3\n\n### Step 2", "- **Serves:** AC-9\n\n### Step 2"), /not an acceptance criterion/);
	const unserved = plan("- **Serves:** AC-1, AC-2, AC-3\n\n### Step 4", "- **Serves:** AC-1, AC-2\n\n### Step 4").replace("- **Serves:** AC-3\n\n### Step 2", "- **Serves:** AC-1\n\n### Step 2").replace("- **Serves:** AC-3\n\n## Test Plan", "- **Serves:** AC-1\n\n## Test Plan");
	badPlan(unserved, /AC-3 is not served/);
});

test("test plan covers every criterion with an existing serving step", () => {
	badPlan(plan("| AC-3 | tests/routes/role.test.js: creates a role | Step 3 |\n", ""), /AC-3 has no row/);
	badPlan(plan("| AC-2 | tests/routes/role.test.js: rejects viewers | Step 3 |", "| AC-2 | tests/routes/role.test.js: rejects viewers | Step 9 |"), /does not exist/);
	badPlan(plan("| AC-2 | tests/routes/role.test.js: rejects viewers | Step 3 |", "| AC-2 | tests/routes/role.test.js: rejects viewers | Step 1 |"), /does not serve AC-2/);
	badPlan(plan("| Criterion | Test | Step |", "| Criterion | Check | Step |"), /columns must be exactly/);
});

test("irreversible changes need a reverse step", () => {
	const docs = plan("`docs/specs/roles.md`\n- **Out", "`docs/specs/roles.md`, `CHANGELOG.md`\n- **Out").replace("- **Files:** `docs/specs/roles.md`", "- **Files:** `docs/specs/roles.md`, `CHANGELOG.md`");
	assert.equal(validatePlanContent(docs).steps.length, 4, "a CHANGELOG.md edit is not a data migration");
	const migration = plan("`docs/specs/roles.md`\n- **Out", "`docs/specs/roles.md`, `db/changelog/roles.xml`\n- **Out").replace("- **Files:** `docs/specs/roles.md`", "- **Files:** `docs/specs/roles.md`, `db/changelog/roles.xml`");
	badPlan(migration.replace("`db/`", "`legacy/`"), /looks like a data or schema migration/);
	const declared = migration.replace("`db/`", "`legacy/`").replace("- **Irreversible Changes:** _None._", "- **Irreversible Changes:** Step 4 reverses Step 3");
	assert.equal(validatePlanContent(declared).steps.length, 4);
	badPlan(declared.replace("Step 4 reverses Step 3", "Step 3 reverses Step 4"), /must come after/);
	badPlan(declared.replace("Step 4 reverses Step 3", "Step 9 reverses Step 3"), /does not exist/);
	badPlan(declared.replace("Step 4 reverses Step 3", "handled elsewhere"), /Step <N> reverses Step <M>/);
});

test("open questions must be answered before Code unless allowed", () => {
	const open = plan(" **Answer:** Yes, it is returned in `data.id`.", "");
	badPlan(open, /still open/);
	assert.equal(validatePlanContent(open, "plan.md", { allowOpenQuestions: true }).steps.length, 4);
	badPlan(plan("- **Assumption:** The Forge RBAC client accepts the request body without transformation.\n- **Question:**", "- **Idea:** x\n- **Question:**"), /must be "Question" or "Assumption"/);
});

test("blast radius check: tier must hold or be raised with a reason", () => {
	badPlan(plan("- **Still Holds:** Yes", "- **Still Holds:** Maybe"), /"Yes" or "Raised to <tier>"/);
	badPlan(plan("- **Still Holds:** Yes", "- **Still Holds:** Raised to Low"), /higher than Medium/);
	badPlan(plan("- **Still Holds:** Yes", "- **Still Holds:** Raised to High"), /"Reason" is empty|must not be/);
	const raised = plan("- **Still Holds:** Yes\n- **Reason:** _None._", "- **Still Holds:** Raised to High\n- **Reason:** Step 2 touches authentication middleware.");
	badPlan(raised, /missing the "- \*\*Rollback:\*\*" field/);
	badPlan(raised.replace("**Reason:** Step 2", "**Rollback:** none\n- **Reason:** Step 2"), /requires "- \*\*Rollback:\*\*"/);
	const withRollback = plan("- **Still Holds:** Yes\n- **Reason:** _None._", "- **Still Holds:** Raised to High\n- **Reason:** Step 2 touches authentication middleware.\n- **Rollback:** Revert the mount in src/app.js and redeploy.");
	assert.equal(validatePlanContent(withRollback).tier, "High");
	const critical = plan("- **Still Holds:** Yes\n- **Reason:** _None._", "- **Still Holds:** Raised to Critical\n- **Reason:** Breaking public contract.\n- **Rollback:** Staged rollout with a feature flag.");
	assert.equal(validatePlanContent(critical).tier, "Critical");
	badPlan(critical, /raising the tier to Critical requires a decision record/, { think: validateThinkContent(validThink) });
});

test("each step names commands in backticks, not opinions", () => {
	badPlan(plan("- **Verification:** `npx markdownlint docs/specs/roles.md`", "- **Verification:** check it manually"), /"Verification" must be a command in backticks/);
	badPlan(plan("- **Verification:** `npx markdownlint docs/specs/roles.md`", "- **Verification:** TBD"), /"Verification" must be a command in backticks/);
	badPlan(plan("- **Bootable Check:** `node -e 'import(\"./src/routes/role.js\")'`", "- **Bootable Check:** it still starts"), /"Bootable Check" must be a command in backticks/);
	badPlan(plan("- **Action:** Document POST /roles, its roles, and its error responses.", "- **Action:** TBD"), /"Action" is a placeholder/);
});

test("cross-checks plan against think.md", () => {
	const parsedThink = validateThinkContent(validThink);
	assert.equal(validatePlanContent(validPlan, "plan.md", { think: parsedThink }).tier, "Medium");
	badPlan(plan("- **Tier from Think:** Medium", "- **Tier from Think:** Low"), /but think\.md sets Medium/, { think: parsedThink });
	const noDocsStep = plan("- **Files:** `docs/specs/roles.md`", "- **Files:** `tests/routes/role.test.js`");
	badPlan(noDocsStep, /not covered/, { think: parsedThink });
	const extra = validateThinkContent(think("`docs/specs/roles.md` - document", "`docs/specs/other.md` - document"));
	badPlan(validPlan, /Persistent Context update "docs\/specs\/other.md"/, { think: extra });
});

const approved = { stage: "approved" };
const thinkApproved = (value) => approvedThink.replace(THINK_APPROVAL, value);
const planApproved = (value) => approvedPlan.replace(PLAN_APPROVAL, value);

test("plan.md has Approval as its last level-two heading", () => {
	badPlan(`${validPlan}\n## Extra\nx\n`, /exactly 9 level-two headings/);
	badPlan(plan("\n## Approval\n- **Approved By:** Pending\n", ""), /exactly 9 level-two headings.*## Approval/);
	badPlan(plan("## Done When", "## Approval\n- **Approved By:** Pending\n\n## Done When").replace(/\n## Approval\n- \*\*Approved By:\*\* Pending\n$/, ""), /heading #8 is "## Approval", expected "## Done When"/);
	badPlan(plan("- **Approved By:** Pending\n", "\n"), /empty section for "## Approval"/);
	badPlan(plan("- **Approved By:** Pending", "- **Approver:** Pending"), /missing the "- \*\*Approved By:\*\*"/);
});

test("plan.md Approved By: exactly Pending at draft, a named Developer when approved", () => {
	for (const value of ["Approved", "pending", PLAN_APPROVAL]) {
		badPlan(plan("- **Approved By:** Pending", `- **Approved By:** ${value}`), /must be exactly "Pending" at the draft stage/);
	}
	const ok = validatePlanContent(approvedPlan, "plan.md", approved);
	assert.deepEqual(ok.approval.approvals, [{ name: "Ada Lovelace", role: "Developer", date: "2026-10-03" }]);
	const both = validatePlanContent(planApproved(`${PLAN_APPROVAL}; Grace Hopper (Architect) on 2026-10-04`), "plan.md", approved);
	assert.equal(both.approval.approvals.length, 2);
	badPlan(validPlan, /must read "<name> \(Developer\) on YYYY-MM-DD" or "<name> \(Developer\) on YYYY-MM-DD; <name> \(Architect\) on YYYY-MM-DD"/, approved);
	for (const value of [
		"Grace Hopper (Architect) on 2026-10-03",
		"Ada Lovelace (Developer) on 2026-10-03; Ada Lovelace (Developer) on 2026-10-03",
		"Ada Lovelace (Product Owner) on 2026-10-03",
		"Ada Lovelace (Developer) on 2026-10-03;",
		"Ada Lovelace (Developer)",
	]) badPlan(planApproved(value), /must read "<name>/, approved);
	badPlan(planApproved("Ada Lovelace (Developer) on 2026-10-33"), /valid date/, approved);
	badPlan(planApproved("Ada Lovelace (Developer) on 2026-10-03; ada lovelace (Architect) on 2026-10-03"), /two different people/, approved);
	for (const name of ["Copilot", "release-bot", "Review Agent", "LLM"]) badPlan(planApproved(`${name} (Developer) on 2026-10-03`), /never an AI or automation/, approved);
	badPlan(planApproved("TBD (Developer) on 2026-10-03"), /placeholder/, approved);
	assert.throws(() => validatePlanContent(approvedPlan, "plan.md", { stage: "final" }), /must be one of: draft, approved/);
});

test("an approved plan needs an approved think.md that is not newer than the plan", () => {
	const draftThink = validateThinkContent(validThink);
	const approvedParsed = validateThinkContent(approvedThink, "think.md", approved);
	assert.equal(validatePlanContent(approvedPlan, "plan.md", { ...approved, think: approvedParsed }).approval.status, "approved");
	badPlan(approvedPlan, /is approved but think\.md is not/, { ...approved, think: draftThink });
	assert.equal(validatePlanContent(validPlan, "plan.md", { think: draftThink }).approval.status, "pending");

	assert.equal(validatePlanContent(planApproved("Ada Lovelace (Developer) on 2026-10-02"), "plan.md", { ...approved, think: approvedParsed }).approval.status, "approved", "the same day is allowed");
	badPlan(planApproved("Ada Lovelace (Developer) on 2026-10-01"), /approval date 2026-10-01 \(Developer\) is before the think\.md approval date 2026-10-02/, { ...approved, think: approvedParsed });
	const lateThink = validateThinkContent(thinkApproved("Ada Lovelace (Developer) on 2026-10-02; Grace Hopper (Architect) on 2026-10-05"), "think.md", approved);
	badPlan(approvedPlan, /before the think\.md approval date 2026-10-05/, { ...approved, think: lateThink });
	badPlan(planApproved(`${PLAN_APPROVAL}; Grace Hopper (Architect) on 2026-10-01`), /\(Architect\) is before the think\.md approval date 2026-10-02/, { ...approved, think: approvedParsed });
});

test("CLI --stage applies to both files and cross-checks approvals", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-stage-"));
	const dir = join(root, "issue-42");
	await mkdir(dir);
	const write = async (thinkMd, planMd) => {
		await writeFile(join(dir, "think.md"), thinkMd);
		await writeFile(join(dir, "plan.md"), planMd);
	};
	const log = console.log;
	const error = console.error;
	const errors = [];
	console.log = () => {};
	console.error = (...a) => errors.push(a.join(" "));
	try {
		await write(validThink, validPlan);
		assert.equal(await runValidator(["--dir", dir]), 0);
		assert.equal(await runValidator(["--dir", dir, "--stage", "draft"]), 0);
		assert.equal(await runValidator(["--dir", dir, "--stage", "approved"]), 1, "drafts are not approved");
		assert.match(errors.at(-1), /\[think\.md\].*must read/);

		await write(approvedThink, approvedPlan);
		assert.equal(await runValidator(["--dir", dir, "--stage", "approved"]), 0);
		assert.equal(await runValidator(["--think", join(dir, "think.md"), "--plan", join(dir, "plan.md"), "--stage", "approved"]), 0);
		assert.equal(await runValidator(["--dir", dir]), 1, "an approved file is not a draft");
		assert.match(errors.at(-1), /exactly "Pending" at the draft stage/);

		await write(approvedThink, planApproved("Ada Lovelace (Developer) on 2026-10-01"));
		assert.equal(await runValidator(["--dir", dir, "--stage", "approved"]), 1);
		assert.match(errors.at(-1), /\[plan\.md\].*before the think\.md approval date/);

		await write(validThink, approvedPlan);
		assert.equal(await runValidator(["--plan", join(dir, "plan.md"), "--stage", "approved"]), 0);

		assert.equal(await runValidator(["--dir", dir, "--stage", "final"]), 1);
		assert.match(errors.at(-1), /Unknown --stage "final"/);
		assert.equal(await runValidator(["--dir", dir, "--stage"]), 1);
		assert.equal(await runValidator(["--help"]), 0);
	} finally {
		console.log = log;
		console.error = error;
	}
});

test("CLI validates a directory and cross-checks think.md with plan.md", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-"));
	const dir = join(root, "issue-42");
	await mkdir(dir);
	await writeFile(join(dir, "think.md"), validThink);
	await writeFile(join(dir, "plan.md"), validPlan);
	const lonely = join(root, "issue-43");
	await mkdir(lonely);
	await writeFile(join(lonely, "plan.md"), validPlan);

	const log = console.log;
	const error = console.error;
	console.log = console.error = () => {};
	try {
		assert.equal(await runValidator(["--dir", dir]), 0);
		assert.equal(await runValidator(["--dir", lonely]), 1);
		assert.equal(await runValidator(["--dir", join(root, "missing")]), 1);
		await writeFile(join(dir, "plan.md"), plan("- **Tier from Think:** Medium", "- **Tier from Think:** Low"));
		assert.equal(await runValidator(["--dir", dir]), 1);
		assert.equal(await runValidator([]), 1);
		assert.equal(await runValidator(["--help"]), 0);
		assert.equal(await runValidator(["--dir", dir, "--allow-open-question"]), 1, "a mistyped flag must not be ignored");
	} finally {
		console.log = log;
		console.error = error;
	}
});
