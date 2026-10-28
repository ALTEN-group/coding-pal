import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { context, plan, prove, think } from "./prove-fixture.mjs";
import { ValidationError, runValidator, validateProveContent } from "./validate-prove.mjs";

const rejects = (body, ctx, pattern) =>
	assert.throws(
		() => validateProveContent(body, ctx),
		(err) => err instanceof ValidationError && pattern.test(err.message),
		`expected ${pattern}`,
	);

test("accepts a valid PASS prove.md in both draft and pass stages", () => {
	const draftRes = validateProveContent(prove(), context({ stage: "draft" }));
	assert.deepEqual(draftRes, { status: "PASS", controls: 13, criteria: 3, findings: 0 });

	const passRes = validateProveContent(prove(), context({ stage: "pass" }));
	assert.deepEqual(passRes, { status: "PASS", controls: 13, criteria: 3, findings: 0 });
});

test("accepts N/A (<reason>) in deterministic controls when justified", () => {
	const doc = prove({
		controlOverrides: {
			"preview-smoke": { status: "N/A (CLI package without web UI)", evidence: "No web server or HTML entry point." },
		},
	});
	const res = validateProveContent(doc, context({ stage: "pass" }));
	assert.equal(res.status, "PASS");
});

test("accepts a valid FAIL prove.md in draft stage and rejects it in pass stage", () => {
	const failingDoc = prove({
		controlOverrides: {
			"test-probe": { status: "FAIL", evidence: "2 tests failed in tests/role.test.js" },
		},
		criteria: [
			["AC-1", "`src/routes/role.js` handles unauthenticated requests", "`tests/role.test.js` verifies 401 response", "PASS"],
			["AC-2", "`src/routes/role.js` updates role in store", "`tests/role.test.js` failed on role persistence", "FAIL"],
			["AC-3", "`src/routes/role.js` rejects unknown roles", "`tests/role.test.js` verifies 400 validation error", "PASS"],
		],
		semantic: {
			"Client Intent": "FAIL — Role persistence is broken for valid requests.",
			"Behavioral Experience": "PASS — Error responses are well-structured.",
			"Safety & Blast Radius": "PASS — Only planned files touched.",
		},
		findings: "- **FINDING-1:** (`test-probe` / `src/routes/role.js`) Fix role persistence in updateRole handler so AC-2 passes.",
		verdictStatus: "FAIL",
		verdictSummary: "Role persistence test failed in test-probe and AC-2; requires remediation.",
	});

	const draftRes = validateProveContent(failingDoc, context({ stage: "draft" }));
	assert.deepEqual(draftRes, { status: "FAIL", controls: 13, criteria: 3, findings: 1 });

	rejects(failingDoc, context({ stage: "pass" }), /Verdict Status is FAIL .* required PASS for --stage pass/);
});

test("rejects line-by-line review claims and wrong section structure", () => {
	rejects("", context(), /empty/);
	rejects(prove(), context({ stage: "unknown" }), /--stage must be "draft" or "pass"/);
	rejects(
		prove({ verdictSummary: "Reviewed every file line-by-line and confirmed correctness." }),
		context(),
		/must not claim line-by-line review/,
	);
	rejects(prove().replace("## Findings", "## Issues"), context(), /exactly these level-two headings/);
});

test("validates header fields and links", () => {
	rejects(prove().replace("# Prove: Add role endpoint", "# Review: Add role endpoint"), context(), /must start with "# Prove: <Title>"/);
	rejects(prove({ issue: "42" }), context(), /header must include "- \*\*Issue:\*\* #<n>"/);
	rejects(prove({ issue: "#99" }), context(), /header Issue is #99 but work item directory is issue-42/);
	rejects(prove({ pr: "19" }), context(), /header must include "- \*\*PR:\*\* #<pr>"/);
	rejects(prove({ thinkLink: "specs/issue-42/think.md" }), context(), /workspace-relative path in backticks/);
	rejects(prove(), context({ linkExists: () => false }), /does not exist/);
	rejects(
		prove({ planLink: "`specs/issue-99/plan.md`" }),
		context({ linkExists: () => true }),
		/is not the plan\.md of this work item/,
	);
	rejects(prove({ branch: "TBD" }), context(), /missing a valid "- \*\*Branch:\*\*"/);
});

test("validates deterministic controls table", () => {
	rejects(prove({ omitControls: ["secret-guard"] }), context(), /missing required controls: secret-guard/);
	rejects(
		prove({ extraControls: [["secret-guard", "PASS", "Duplicate entry"]] }),
		context(),
		/lists "secret-guard" more than once/,
	);
	rejects(
		prove({ controlOverrides: { "scope-guard": { status: "SKIPPED", evidence: "Not run" } } }),
		context(),
		/invalid Status "SKIPPED"/,
	);
	rejects(
		prove({ controlOverrides: { "scope-guard": { status: "PASS", evidence: "TBD" } } }),
		context(),
		/empty or placeholder Evidence/,
	);
});

test("cross-checks criteria verification against plan.md", () => {
	rejects(
		prove({
			criteria: [
				["AC-1", "`src/routes/role.js`", "`tests/role.test.js`", "PASS"],
				["AC-2", "`src/routes/role.js`", "`tests/role.test.js`", "PASS"],
			],
		}),
		context(),
		/missing acceptance criteria from plan\.md: AC-3/,
	);
	rejects(
		prove({
			criteria: [
				["AC-1", "`src/routes/role.js`", "`tests/role.test.js`", "PASS"],
				["AC-2", "`src/routes/role.js`", "`tests/role.test.js`", "PASS"],
				["AC-9", "`src/routes/role.js`", "`tests/role.test.js`", "PASS"],
			],
		}),
		context(),
		/"AC-9" is not an acceptance criterion in plan\.md/,
	);
	rejects(
		prove({
			criteria: [
				["AC-1", "TBD", "`tests/role.test.js`", "PASS"],
				["AC-2", "`src/routes/role.js`", "`tests/role.test.js`", "PASS"],
				["AC-3", "`src/routes/role.js`", "`tests/role.test.js`", "PASS"],
			],
		}),
		context(),
		/AC-1 has empty or placeholder Implementation Evidence/,
	);
});

test("validates semantic review, findings, and verdict consistency", () => {
	rejects(
		prove({
			semantic: {
				"Client Intent": "Looks good.",
				"Behavioral Experience": "PASS — Works well in all scenarios.",
				"Safety & Blast Radius": "PASS — Contained to planned files.",
			},
		}),
		context(),
		/must start with "PASS — <evidence>" or "FAIL — <evidence>"/,
	);
	rejects(
		prove({
			controlOverrides: { "task-gate": { status: "FAIL", evidence: "Lint failed." } },
			verdictStatus: "PASS",
		}),
		context(),
		/Verdict is PASS, but 1 check\(s\) failed/,
	);
	rejects(
		prove({
			findings: "- **FINDING-1:** (`task-gate`) Fix lint error in role.js.",
			verdictStatus: "PASS",
		}),
		context(),
		/Verdict is PASS, but "## Findings" lists 1 finding\(s\)/,
	);
	rejects(
		prove({
			controlOverrides: { "task-gate": { status: "FAIL", evidence: "Lint failed." } },
			findings: "_None._",
			verdictStatus: "FAIL",
		}),
		context(),
		/Verdict is FAIL, but "## Findings" is "_None\._"/,
	);
	rejects(
		prove({
			findings: "- **FINDING-1:** (`task-gate`) Fix lint error in role.js.",
			verdictStatus: "FAIL",
		}),
		context(),
		/Verdict is FAIL, but every Control, Criterion, and Semantic Review dimension is marked PASS/,
	);
});

test("CLI validates prove.md from --dir on disk", async () => {
	const root = await mkdtemp(join(tmpdir(), "prove-test-"));
	const dir = join(root, "specs", "issue-42");
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "think.md"), think());
	await writeFile(join(dir, "plan.md"), plan());
	await writeFile(join(dir, "prove.md"), prove());

	const out = { log: [], error: [] };
	const orig = { log: console.log, error: console.error };
	console.log = (...a) => out.log.push(a.join(" "));
	console.error = (...a) => out.error.push(a.join(" "));
	let code;
	try {
		code = runValidator(["--dir", dir, "--stage", "pass", "--root", root]);
	} finally {
		Object.assign(console, orig);
	}
	assert.equal(code, 0);
	assert.match(out.log.join("\n"), /Validated \(PASS\): 13 controls, 3 criteria, 0 finding\(s\)/);
});
