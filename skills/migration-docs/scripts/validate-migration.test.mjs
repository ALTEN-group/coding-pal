import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	ValidationError,
	parseDuration,
	runValidator,
	validateAssessmentContent,
	validatePlanContent,
	validateRunbookContent,
} from "./validate-migration.mjs";
import { validAssessment, validPlan, validRunbook } from "./migration-fixture.mjs";

const edit = (from, to, source) => {
	assert.ok(source.includes(from), `fixture does not contain: ${from}`);
	return source.replace(from, to);
};
const rejects = (fn, pattern) => assert.throws(fn, (err) => err instanceof ValidationError && pattern.test(err.message));
const assessment = () => validateAssessmentContent(validAssessment);
const plan = () => validatePlanContent(validPlan, "migration-plan.md", { assessment: assessment() });

test("accepts a valid assessment, plan, and runbook and cross-checks them", () => {
	const a = assessment();
	assert.equal(a.budget, "config-only");
	assert.equal(a.inventory.length, 6);
	assert.equal(a.changes.length, 1);
	const p = plan();
	assert.equal(p.waves.length, 2);
	assert.deepEqual(p.waves[1].components, ["S-1", "S-4"]);
	const r = validateRunbookContent(validRunbook, "runbook.md", { plan: p });
	assert.equal(r.waves.length, 2);
	assert.equal(r.waves[1].steps.length, 4);
	assert.equal(parseDuration("4h"), 240);
	assert.equal(parseDuration("soon"), null);
});

test("assessment rejects structural problems", () => {
	rejects(() => validateAssessmentContent(""), /empty/);
	rejects(() => validateAssessmentContent(edit("# Migration Assessment:", "# Assessment:", validAssessment)), /level-one heading/);
	rejects(() => validateAssessmentContent(edit("## Risks", "## Threats", validAssessment)), /heading 5/);
	rejects(() => validateAssessmentContent(`${validAssessment}\n## Extra\nx\n`), /exactly 6/);
	rejects(() => validateAssessmentContent(edit("| ID | Component | Type |", "| ID | Name | Type |", validAssessment)), /columns must be exactly/);
	rejects(() => validateAssessmentContent(edit("docker/docker-compose.yml |\n| S-2", "TBD |\n| S-2", validAssessment)), /placeholder/);
});

test("assessment rejects secrets", () => {
	rejects(() => validateAssessmentContent(edit("- **Driver:**", "- **Note:** password=hunter2hunter2\n- **Driver:**", validAssessment)), /secret value/);
});

test("assessment validates scope fields and the budget", () => {
	rejects(() => validateAssessmentContent(edit("- **Change Budget:** config-only\n", "", validAssessment)), /Change Budget/);
	rejects(() => validateAssessmentContent(edit("config-only", "whatever", validAssessment)), /Change Budget must be one of/);
	rejects(() => validateAssessmentContent(edit("- **Target:** Azure, West Europe landing zone", "- **Target:** TBD", validAssessment)), /placeholder/);
});

test("assessment validates the inventory", () => {
	rejects(() => validateAssessmentContent(edit("| Compute |", "| Server |", validAssessment)), /Type must be one of/);
	rejects(() => validateAssessmentContent(edit("S-2, S-3, S-6", "S-2, S-9", validAssessment)), /unknown component "S-9"/);
	rejects(() => validateAssessmentContent(edit("S-2, S-3, S-6", "S-1", validAssessment)), /cannot depend on itself/);
	rejects(() => validateAssessmentContent(edit("| S-6 | Corporate LDAP", "| S-5 | Corporate LDAP", validAssessment)), /declared twice/);
});

test("assessment validates the target mapping", () => {
	rejects(() => validateAssessmentContent(edit("| S-6 | Retain |", "| S-9 | Retain |", validAssessment)), /unknown component "S-9"/);
	rejects(() => validateAssessmentContent(edit("| S-4 | Rehost |", "| S-3 | Rehost |", validAssessment)), /more than once|missing inventory component S-4/);
	rejects(() => validateAssessmentContent(edit("| S-5 | Retire |", "| S-5 | Delete |", validAssessment)), /Strategy must be one of/);
	rejects(() => validateAssessmentContent(edit("| Retain | On-premise LDAP over site-to-site VPN | None |", "| Retain | On-premise LDAP over site-to-site VPN | Config |", validAssessment)), /must have Application Impact None/);
	rejects(() => validateAssessmentContent(edit("| S-2 | Replatform |", "| S-2 | Refactor |", validAssessment)), /decision record/);
	rejects(() => validateAssessmentContent(validAssessment.replace(/\| S-4 \|[^\n]*\n/, "").replace("| S-4 | Rehost", "| S-4 | Rehost")), /missing inventory component|unknown/);
});

test("the change register stays inside the change budget and matches the mapping", () => {
	rejects(() => validateAssessmentContent(edit("| C-1 | S-1 | Config |", "| C-1 | S-1 | Code |", validAssessment)), /Change Budget is config-only/);
	rejects(() => validateAssessmentContent(edit("| Rehost | Azure VM, same image | Config |", "| Rehost | Azure VM, same image | None |", validAssessment)), /declares Application Impact None but the change register shows Config/);
	const noChanges = validAssessment.replace(/\| C-1 \|[^\n]*\n/, "| C-1 | S-1 | Config | x | y | Developer |\n").replace(/\| C-1 \| S-1 \| Config \| x \| y \| Developer \|\n/, "_None._\n").replace(/\| ID \| Component \| Type \| Change[^\n]*\n\|---[^\n]*\n/, "");
	rejects(() => validateAssessmentContent(noChanges), /declares Application Impact Config but the change register shows None/);
	rejects(() => validateAssessmentContent(edit("Developer |", "Developer |\n| C-2 | S-1 | Config | Another | | Developer |", validAssessment)), /empty or a placeholder/);
	rejects(() => validateAssessmentContent(edit("| C-1 | S-1 | Config |", "| C-1 | S-9 | Config |", validAssessment)), /unknown component "S-9"/);
});

test("a none budget forbids every change, minimal-code allows code", () => {
	rejects(() => validateAssessmentContent(edit("config-only", "none", validAssessment)), /Change Budget is none/);
	const code = edit("| C-1 | S-1 | Config |", "| C-1 | S-1 | Code |", edit("config-only", "minimal-code", validAssessment)).replace("| Rehost | Azure VM, same image | Config |", "| Rehost | Azure VM, same image | Code |");
	assert.equal(validateAssessmentContent(code).changes[0].Type, "Code");
});

test("risks need valid levels and open questions need a list", () => {
	rejects(() => validateAssessmentContent(edit("| Medium | High |", "| Medium | Severe |", validAssessment)), /Impact must be one of/);
	rejects(() => validateAssessmentContent(edit("- The backup retention requirement for invoices is not documented. Ask the compliance officer.", "Unknown.", validAssessment)), /bulleted list/);
});

test("plan rejects structural problems", () => {
	rejects(() => validatePlanContent(edit("## Waves", "## Phases", validPlan)), /heading 2/);
	rejects(() => validatePlanContent(edit("./assessment.md", "TBD", validPlan)), /placeholder/);
	rejects(() => validatePlanContent(edit("| 2 | S-1, S-4 |", "| 3 | S-1, S-4 |", validPlan)), /consecutively from 1/);
	rejects(() => validatePlanContent(edit("| 1 | S-2, S-3 | - |", "| 1 | S-2, S-3 | 1 |", validPlan)), /lower wave numbers/);
	rejects(() => validatePlanContent(edit("| 30m |", "| soon |", validPlan)), /Downtime Budget/);
	rejects(() => validatePlanContent(edit("S-1, S-4", "S-2, S-4", validPlan)), /more than one wave/);
	rejects(() => validatePlanContent(edit("- **Secrets:**", "- **Other:**", validPlan)), /Secrets/);
});

test("plan requires validation, rollback, and data rows for every wave", () => {
	rejects(() => validatePlanContent(validPlan.replace(/\| V-[23] \|[^\n]*\n/g, "")), /wave 2 has no validation check/);
	rejects(() => validatePlanContent(validPlan.replace(/\| 2 \| Any V-2[^\n]*\n/, "")), /exactly one Rollback row/);
	rejects(() => validatePlanContent(edit("- **Point of No Return:**", "- **Gate:**", validPlan)), /Point of No Return/);
	rejects(() => validatePlanContent(edit("| S-3 | azcopy sync from the NFS share | Final Delta |", "| S-3 | azcopy sync from the NFS share | Sometimes |", validPlan)), /Sync must be one of/);
	rejects(() => validatePlanContent(edit("| V-3 | LDAP login time over the VPN | 2 |", "| V-3 | LDAP login time over the VPN | 5 |", validPlan)), /unknown wave/);
});

test("plan open questions block unless drafting", () => {
	const open = edit("_None._\n", "- Who approves the window?\n", validPlan.replace(/_None\._\n$/, "_None._\n"));
	rejects(() => validatePlanContent(open), /open item/);
	assert.equal(validatePlanContent(open, "migration-plan.md", { allowOpenQuestions: true }).openItems, 1);
});

test("plan cross-checks against the assessment", () => {
	const a = assessment();
	const check = (source, pattern) => rejects(() => validatePlanContent(source, "migration-plan.md", { assessment: a }), pattern);
	check(edit("| 1 | S-2, S-3 |", "| 1 | S-2, S-3, S-5 |", validPlan), /not migrated/);
	check(edit("| 1 | S-2, S-3 |", "| 1 | S-2 |", validPlan), /missing from the waves|not in any wave/);
	check(edit("| 1 | S-2, S-3 | - |", "| 1 | S-1, S-4 | - |", edit("| 2 | S-1, S-4 | 1 |", "| 2 | S-2, S-3 | 1 |", validPlan)), /moves later/);
	check(validPlan.replace(/\| S-3 \| azcopy[^\n]*\n/, ""), /missing stateful component S-3/);
	check(edit("| S-3 | azcopy", "| S-4 | azcopy", validPlan), /not a migrated Database or Storage|missing stateful/);
	check(validPlan.replace(/\| S-5 \|[^\n]*\n/, "").replace("| Component | Condition |\n|---|---|\n", "_None._\n"), /missing retired component S-5/);
});

test("runbook rejects structural problems", () => {
	const r = (source, pattern) => rejects(() => validateRunbookContent(source), pattern);
	r(edit("## Go/No-Go Criteria", "## Gates", validRunbook), /heading 2/);
	r(edit("## Post-Cutover", "## After", validRunbook), /last heading/);
	r(edit("## Wave 2: Application", "## Phase 2: Application", validRunbook), /Wave <n>/);
	r(edit("## Wave 2: Application", "## Wave 3: Application", validRunbook), /consecutively from 1/);
	r(edit("- [ ] The rollback has been rehearsed in staging.\n", "", validRunbook), /at least 3 checklist/);
	r(edit("- **Hypercare:**", "- **Care:**", validRunbook), /Hypercare/);
	r(edit("### Step 1.2:", "### Step 1.3:", validRunbook), /must be "### Step 1.2/);
	r(edit("- **Verification:** Lag is 0 bytes.\n", "", validRunbook), /Verification/);
	r(edit("- **Duration:** 10m", "- **Duration:** soon", validRunbook), /Duration must be a duration/);
});

test("runbook rollback gaps respect the point of no return", () => {
	const p = plan();
	assert.ok(validateRunbookContent(validRunbook, "runbook.md", { plan: p }));
	const noPoint = { ...p, pointOfNoReturn: "None" };
	rejects(() => validateRunbookContent(validRunbook, "runbook.md", { plan: noPoint }), /no Point of No Return/);
});

test("runbook cross-checks against the plan", () => {
	const p = plan();
	const check = (source, pattern) => rejects(() => validateRunbookContent(source, "runbook.md", { plan: p }), pattern);
	check(validRunbook.replace(/## Wave 2: Application[\s\S]*## Post-Cutover/, "## Post-Cutover"), /1 wave section/);
	check(edit("sync\` for S-3", "sync\` for the share", validRunbook), /never addresses component S-3/);
	check(edit("Replication lag is below 5 seconds (V-1).", "Replication lag is below 5 seconds.", edit("The manifest diff is empty (V-1).", "The manifest diff is empty.", validRunbook)), /never runs validation check V-1/);
});

async function tempDir(files) {
	const dir = await mkdtemp(join(tmpdir(), "migration-docs-"));
	for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
	return dir;
}

async function capture(fn) {
	const logs = [];
	const errors = [];
	const { log, error } = console;
	console.log = (...a) => logs.push(a.join(" "));
	console.error = (...a) => errors.push(a.join(" "));
	try {
		return { code: await fn(), logs, errors };
	} finally {
		console.log = log;
		console.error = error;
	}
}

test("CLI validates a directory and reports each record", async () => {
	const dir = await tempDir({ "assessment.md": validAssessment, "migration-plan.md": validPlan, "runbook.md": validRunbook });
	const { code, logs } = await capture(() => runValidator(["--dir", dir]));
	assert.equal(code, 0);
	assert.equal(logs.length, 3);
	assert.match(logs[0], /assessment\.md\] Validated: "Orders Platform" \(6 component\(s\), 1 application change\(s\), budget config-only\)/);
});

test("CLI accepts an assessment-only directory and fails on invalid or missing input", async () => {
	const only = await tempDir({ "assessment.md": validAssessment });
	assert.equal((await capture(() => runValidator(["--dir", only]))).code, 0);

	const empty = await tempDir({});
	const missing = await capture(() => runValidator(["--dir", empty]));
	assert.equal(missing.code, 1);
	assert.match(missing.errors.join("\n"), /does not contain assessment\.md/);

	const bad = await tempDir({ "assessment.md": validAssessment, "migration-plan.md": edit("./assessment.md", "./other.md", validPlan) });
	const wrongRef = await capture(() => runValidator(["--dir", bad]));
	assert.equal(wrongRef.code, 1);
	assert.match(wrongRef.errors.join("\n"), /does not resolve/);

	const broken = await tempDir({ "assessment.md": edit("## Risks", "## Threats", validAssessment) });
	const result = await capture(() => runValidator(["--assessment", join(broken, "assessment.md")]));
	assert.equal(result.code, 1);
	assert.match(result.errors.join("\n"), /Validation failed/);

	assert.equal((await capture(() => runValidator([]))).code, 1);
	assert.equal((await capture(() => runValidator(["--help"]))).code, 0);
});
