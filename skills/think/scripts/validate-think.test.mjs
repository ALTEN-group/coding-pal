import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { THINK_APPROVAL, approvedThink, validThink } from "./think-fixtures.mjs";
import { ValidationError, runValidator, validateThinkContent } from "./validate-think.mjs";

const F = "```";
const think = (from, to) => validThink.replace(from, to);
const matches = (pattern) => (err) => err instanceof ValidationError && pattern.test(err.message);
const badThink = (md, pattern, options) => assert.throws(() => validateThinkContent(md, "think.md", options), matches(pattern));

test("accepts explicitly automated approvals without impersonating a person", () => {
	const automated = validThink.replace("Approved By:** Pending", "Approved By:** Automated by Thinker agent on 2026-10-14");
	for (const stage of ["draft", "approved"]) {
		assert.equal(validateThinkContent(automated, "think.md", { stage }).approval.approvals[0].role, "Automation");
	}
	badThink(automated.replace("2026-10-14", "2026-02-30"), /valid date/);
	badThink(automated.replace("Thinker agent", "<name>"), /identity/);
});

test("validates compliant think.md and returns structured data", () => {
	const result = validateThinkContent(validThink);
	assert.equal(result.tier, "Medium");
	assert.equal(result.options.length, 2);
	assert.equal(result.selected.source, "Forge reuse");
	assert.deepEqual(result.contextUpdates, ["docs/specs/roles.md"]);
});

test("rejects empty, wrong heading, and missing or extra sections", () => {
	badThink("", /empty/);
	badThink(think("# Think:", "# Plan:"), /level-one heading/);
	badThink(think("## Options Considered", "## Options"), /heading #2/);
	badThink(`${validThink}\n## Extra\nx\n`, /exactly 10/);
	badThink(think("## Decision Record\n- **Required:** no\n- **Reason:** No public contract changes, schema changes, or boundary shifts. The new endpoint is additive.\n", "## Decision Record\n"), /empty section/);
});

test("requires 2 to 4 sequential options with complete fields", () => {
	badThink(think(/### Option 2:[\s\S]*?(?=## Chosen)/.exec(validThink)[0], ""), /2 to 4 options/);
	badThink(think("### Option 2:", "### Option 3:"), /sequential/);
	badThink(think("- **Source:** Forge reuse", "- **Source:** Open source"), /"Source" must be one of/);
	badThink(think("- **Cost:** Low\n", ""), /missing the "- \*\*Cost:\*\*"/);
});

test("chosen approach must name an existing option and justify a custom build", () => {
	badThink(think("- **Selected:** Option 1", "- **Selected:** Option 5"), /must name one of the options/);
	const custom = think("- **Selected:** Option 1", "- **Selected:** Option 2").replace(
		"- **forge/rbac-service@2.1:** Called by the route handler to create roles. No local persistence.",
		"- **None:** The Forge catalog has no role persistence asset.",
	);
	badThink(custom, /Custom Build Reason/);
	const ok = custom.replace("- **Reasoning:**", "- **Custom Build Reason:** Searched the catalog: no role persistence asset exists.\n- **Reasoning:**");
	assert.equal(validateThinkContent(ok).selected.source, "Custom build");
});

test("Forge bindings must match the selected option", () => {
	badThink(think("- **forge/rbac-service@2.1:** Called by the route handler to create roles. No local persistence.", "- **None:** Not needed."), /uses the Forge/);
	const customWithBinding = think("- **Selected:** Option 1", "- **Selected:** Option 2").replace("- **Reasoning:**", "- **Custom Build Reason:** x reason.\n- **Reasoning:**");
	badThink(customWithBinding, /custom build, so Forge Asset Bindings must state/);
	badThink(think("## Forge Asset Bindings\n", "## Forge Asset Bindings\n- **None:** nothing.\n"), /cannot combine/);
});

test("blast radius tier is required, and High or Critical need a rollback", () => {
	for (const empty of ["None", "none.", "no rollback", "No"]) {
		badThink(think("- **Tier:** Medium", "- **Tier:** High").replace("- **Rollback:** _None._", `- **Rollback:** ${empty}`), /must name the rollback mechanism/);
	}
	badThink(think("- **Tier:** Medium", "- **Tier:** Severe"), /Blast Radius Tier must start with/);
	badThink(think("- **Tier:** Medium", "- **Tier:** High"), /must name the rollback mechanism/);
	const high = think("- **Tier:** Medium", "- **Tier:** High").replace("- **Rollback:** _None._", "- **Rollback:** Feature flag roles-api, disable and redeploy.");
	assert.equal(validateThinkContent(high).tier, "High");
	badThink(think("- **Affected:** New public endpoint POST /roles. Consumer: admin portal.\n", ""), /missing the "- \*\*Affected:\*\*"/);
});

test("Forge bindings must be formatted forge/<id>@<version>", () => {
	const binding = "- **forge/rbac-service@2.1:**";
	badThink(think(binding, "- **some library:**"), /must be formatted "forge\/<asset-id>@<version>"/);
	badThink(think(binding, "- **forge/rbac-service:**"), /must be formatted "forge\/<asset-id>@<version>"/);
	badThink(think(binding, "- **Forge/RBAC_Service@2.1:**"), /must be formatted/);
	assert.equal(validateThinkContent(think(binding, "- **forge/gatelin@0.1.0-alpha.9:**")).tier, "Medium");
});

test("think.md carries no source code and no task checklist", () => {
	const before = "## Constraints & Invariants";
	badThink(think(before, `${F}js\nconst x = 1;\n${F}\n\n${before}`), /must not contain source code; found a "js" code block/);
	badThink(think(before, `${F}sql\nSELECT 1;\n${F}\n\n${before}`), /must not contain source code/);
	badThink(think(before, `- [ ] write the route\n\n${before}`), /task checklist/);
	badThink(think(before, `### Step 1: Do it\n\n${before}`), /implementation steps/);
	assert.equal(validateThinkContent(think(before, `${F}mermaid\nflowchart TD\n  A --> B\n${F}\n\n${before}`)).tier, "Medium");
	assert.equal(validateThinkContent(think(before, `${F}\nA -> B\n${F}\n\n${before}`)).tier, "Medium");
});

test("decision record rules", () => {
	badThink(think("- **Required:** no", "- **Required:** maybe"), /"yes" or "no"/);
	badThink(think("- **Required:** no", "- **Required:** yes"), /missing the "- \*\*Record:\*\*"/);
	const yes = think(/- \*\*Required:\*\* no\n- \*\*Reason:\*\*.*\n/.exec(validThink)[0], "- **Required:** yes\n- **Record:** `docs/decisions/0008-roles.md`\n- **Status:** Drafted, awaiting Architect\n");
	assert.equal(validateThinkContent(yes).decisionRequired, true);
	badThink(yes.replace("Drafted, awaiting Architect", "Done"), /"Status" must be/);
	const signed = (status) => yes.replace("Drafted, awaiting Architect", status);
	const ok = validateThinkContent(signed("Signed by Jane Doe (Architect) on 2026-10-02"));
	assert.equal(ok.decisionRequired, true);
	assert.equal(validateThinkContent(signed("signed by Jane Doe (Architect) on 2026-10-02.")).decisionRequired, true);
	badThink(signed("Signed"), /must read "Signed by <name> \(Architect\) on YYYY-MM-DD"/);
	badThink(signed("Signed by Jane Doe on 2026-10-02"), /must read "Signed by/);
	badThink(signed("Signed by Jane Doe (Developer) on 2026-10-02"), /must read "Signed by/);
	badThink(signed("Signed by Jane Doe (Architect)"), /must read "Signed by/);
	badThink(signed("Signed by Jane Doe (Architect) on 2026-13-40"), /valid date/);
	badThink(signed("Signed by Jane Doe (Architect) on 02/10/2026"), /must read "Signed by/);
	for (const name of ["Copilot", "Claude Sonnet", "GPT-4", "Gemini", "ChatGPT", "OpenAI", "Anthropic", "release-bot", "Review Agent", "dependabot[bot]", "renovate", "github-actions", "AI", "LLM"]) {
		badThink(signed(`Signed by ${name} (Architect) on 2026-10-02`), /never an AI or automation/);
	}
	for (const name of ["TBD", "x", "<name>"]) {
		badThink(signed(`Signed by ${name} (Architect) on 2026-10-02`), /placeholder/);
	}
	const critical = think("- **Tier:** Medium", "- **Tier:** Critical").replace("- **Rollback:** _None._", "- **Rollback:** Staged rollout.");
	badThink(critical, /Critical blast radius requires a decision record/);
});

test("persistent context updates must name files", () => {
	badThink(think("- **Update:** `docs/specs/roles.md` - document", "- **Update:** the docs - document"), /name its file in backticks/);
	badThink(think("- **Update:**", "- **Change:**"), /must be "_None._" or bullets/);
	assert.deepEqual(validateThinkContent(think(/## Persistent Context Updates\n.*\n/.exec(validThink)[0], "## Persistent Context Updates\n_None._\n")).contextUpdates, []);
});

const approved = { stage: "approved" };
const thinkApproved = (value) => approvedThink.replace(THINK_APPROVAL, value);

test("think.md Approved By: exactly Pending at draft, named Developer and Architect when approved", () => {
	assert.deepEqual(validateThinkContent(validThink).approval, { status: "pending", approvals: [] });
	badThink(think("- **Approved By:** Pending\n", ""), /missing the "- \*\*Approved By:\*\*"/);
	for (const value of ["pending", "Pending.", "Approved", THINK_APPROVAL]) {
		badThink(think("- **Approved By:** Pending", `- **Approved By:** ${value}`), /must be exactly "Pending" at the draft stage/);
	}

	const ok = validateThinkContent(approvedThink, "think.md", approved);
	assert.equal(ok.approval.status, "approved");
	assert.deepEqual(ok.approval.approvals.map((a) => [a.name, a.role, a.date]), [
		["Ada Lovelace", "Developer", "2026-10-02"],
		["Grace Hopper", "Architect", "2026-10-02"],
	]);
	badThink(validThink, /must read "<name> \(Developer\) on YYYY-MM-DD; <name> \(Architect\) on YYYY-MM-DD" at the approved stage/, approved);
	const wrongForm = [
		"Ada Lovelace (Developer) on 2026-10-02",
		"Grace Hopper (Architect) on 2026-10-02",
		"Grace Hopper (Architect) on 2026-10-02; Ada Lovelace (Developer) on 2026-10-02",
		"Ada Lovelace (Developer) on 2026-10-02; Grace Hopper (QA and maintainer) on 2026-10-02",
		"Ada Lovelace (Developer) on 2026-10-02; Grace Hopper (Architect)",
		"Ada Lovelace on 2026-10-02; Grace Hopper (Architect) on 2026-10-02",
		"Ada Lovelace (Developer) on 02/10/2026; Grace Hopper (Architect) on 2026-10-02",
		"Ada Lovelace (Developer) on 2026-10-02; Grace Hopper (Architect) on 2026-10-02; Linus T (Architect) on 2026-10-02",
	];
	for (const value of wrongForm) badThink(thinkApproved(value), /must read "<name> \(Developer\)/, approved);
	badThink(thinkApproved("Ada Lovelace (Developer) on 2026-13-40; Grace Hopper (Architect) on 2026-10-02"), /approval date 2026-13-40 must be a valid date/, approved);
	badThink(thinkApproved("Ada Lovelace (Developer) on 2026-10-02; Grace Hopper (Architect) on 2026-02-30"), /valid date/, approved);
	badThink(thinkApproved("Ada Lovelace (Developer) on 2026-10-02; ada lovelace (Architect) on 2026-10-02"), /two different people/, approved);
	for (const name of ["Copilot", "Claude Sonnet", "GPT-4", "release-bot", "Review Agent", "dependabot[bot]", "AI"]) {
		badThink(thinkApproved(`${name} (Developer) on 2026-10-02; Grace Hopper (Architect) on 2026-10-02`), /never an AI or automation/, approved);
		badThink(thinkApproved(`Ada Lovelace (Developer) on 2026-10-02; ${name} (Architect) on 2026-10-02`), /never an AI or automation/, approved);
	}
	for (const name of ["TBD", "x", "<name>"]) {
		badThink(thinkApproved(`${name} (Developer) on 2026-10-02; Grace Hopper (Architect) on 2026-10-02`), /placeholder/, approved);
	}
	assert.throws(() => validateThinkContent(approvedThink, "think.md", { stage: "final" }), /must be one of: draft, approved/);
});

test("CLI validates think.md via --think and --dir", async () => {
	const root = await mkdtemp(join(tmpdir(), "think-"));
	const dir = join(root, "issue-42");
	await mkdir(dir);
	const emptyDir = join(root, "issue-43");
	await mkdir(emptyDir);

	const log = console.log;
	const error = console.error;
	const errors = [];
	console.log = () => {};
	console.error = (...a) => errors.push(a.join(" "));
	try {
		await writeFile(join(dir, "think.md"), validThink);
		assert.equal(await runValidator(["--think", join(dir, "think.md")]), 0);
		assert.equal(await runValidator(["--dir", dir]), 0);
		assert.equal(await runValidator(["--dir", dir, "--stage", "draft"]), 0);
		assert.equal(await runValidator(["--dir", dir, "--stage", "approved"]), 1);
		assert.match(errors.at(-1), /\[think\.md\].*must read/);

		await writeFile(join(dir, "think.md"), approvedThink);
		assert.equal(await runValidator(["--dir", dir, "--stage", "approved"]), 0);
		assert.equal(await runValidator(["--think", join(dir, "think.md"), "--stage", "approved"]), 0);
		assert.equal(await runValidator(["--dir", dir]), 1);
		assert.match(errors.at(-1), /exactly "Pending" at the draft stage/);

		assert.equal(await runValidator(["--dir", emptyDir]), 1);
		assert.equal(await runValidator(["--dir", join(root, "missing")]), 1);
		assert.equal(await runValidator(["--dir", dir, "--stage", "final"]), 1);
		assert.equal(await runValidator(["--dir", dir, "--unknown"]), 1);
		assert.equal(await runValidator([]), 1);
		assert.equal(await runValidator(["--help"]), 0);
	} finally {
		console.log = log;
		console.error = error;
	}
});
