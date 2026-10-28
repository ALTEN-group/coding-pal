import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ValidationError, runValidator, validatePrContent } from "./validate-pr.mjs";
import {
	CONFIRMED,
	CRITICAL_CONFIRMED,
	HIGH_CONFIRMED,
	PLAN_APPROVAL,
	RECORD_DATE,
	ROLLBACK,
	context,
	plan,
	pending,
	pr,
	progress,
	think,
} from "./pr-fixture.mjs";

const rejects = (body, ctx, pattern) =>
	assert.throws(() => validatePrContent(body, ctx), (err) => err instanceof ValidationError && pattern.test(err.message), `expected ${pattern}`);

const prove = (overrides = {}) => context({ stage: "prove", ...overrides });
const withHuman = (human, opts = {}) => pr({ human, ...opts });

test("accepts a valid pull request at the code stage and returns a summary", () => {
	const result = validatePrContent(pr(), context());
	assert.deepEqual(result, { stage: "code", tier: "Medium", criteria: 3, dependencies: 0, fixLoop: { attempts: 0, limit: 5 }, recordDate: null });
	assert.equal(validatePrContent(pr({ tier: "High", rollback: ROLLBACK }), context({ tier: "High" })).tier, "High");
	assert.equal(validatePrContent(pr({ tier: "Critical", rollback: ROLLBACK }), context({ tier: "Critical" })).tier, "Critical");
	assert.equal(validatePrContent(pr({ tier: "Low" }), context({ tier: "Low" })).tier, "Low");
});

test("ignores HTML comments, including guidance inside the template", () => {
	const body = `<!-- guidance -->\n${pr().replace("## Links", "## Links\n<!-- keep the issue number -->")}`;
	assert.doesNotThrow(() => validatePrContent(body, context()));
});

test("rejects empty bodies and wrong section structure", () => {
	rejects("", context(), /empty/);
	rejects(pr().replace("## Dependencies", "## Packages"), context(), /exactly these level-two headings/);
	rejects(pr().replace("## Links\n", "## Links\n\n## Extra\nx\n"), context(), /exactly these level-two headings/);
	rejects(`${pr()}\n## Notes\nx\n`, context(), /exactly these level-two headings/);
	rejects(pr().replace(/## Dependencies\n_None\._\n\n/, "## Dependencies\n\n"), context(), /"## Dependencies" is empty/);
	const [links, ...rest] = pr().split("## Acceptance Criteria Traceability");
	rejects(`${links}## Dependencies\n_None._\n\n## Acceptance Criteria Traceability${rest.join("")}`, context(), /exactly these level-two headings/);
});

test("rejects bad links", () => {
	rejects(pr({ closes: "42" }), context(), /"Closes" must be "#<issue number>"/);
	rejects(pr({ closes: "#43" }), context(), /work item is issue 42/);
	rejects(pr().replace("- **Closes:** #42\n", ""), context(), /missing the "- \*\*Closes:\*\*"/);
	rejects(pr().replace(/- \*\*Plan:\*\* .*\n/, ""), context(), /missing the "- \*\*Plan:\*\*"/);
	rejects(pr().replace("`specs/issue-42/plan.md`", "specs/issue-42/plan.md"), context(), /must be a workspace-relative path in backticks/);
	rejects(pr().replace("`specs/issue-42/think.md`", "`../specs/issue-42/think.md`"), context(), /without spaces or "\.\."/);
	rejects(pr().replace("`specs/issue-42/think.md`", "`/etc/think.md`"), context(), /without spaces or "\.\."/);
	rejects(pr(), context({ linkExists: () => false }), /does not resolve to an existing file/);
	rejects(pr().replace("specs/issue-42/plan.md", "specs/issue-43/plan.md"), context({ linkExists: () => true }), /is not the plan\.md of this work item/);
});

test("requires every acceptance criterion to be traced to a test with status Passing", () => {
	rejects(pr({ status: "Failing" }), context(), /AC-1 has status "Failing"/);
	rejects(pr({ status: "Pending" }), context(), /must be "Passing"/);
	rejects(pr().replace(/\| AC-3 .*\n/, ""), context(), /missing acceptance criteria: AC-3/);
	rejects(pr().replace("| AC-3 |", "| AC-9 |"), context(), /"AC-9" is not an acceptance criterion/);
	rejects(pr().replace("| AC-3 |", "| AC-2 |"), context(), /AC-2 more than once/);
	rejects(pr().replace("tests/routes/role.test.js: AC-1 rejects unauthenticated requests", "TBD"), context(), /AC-1 has no test/);
	rejects(pr().replace("| Criterion | Test | Status |", "| Criterion | Evidence | Status |"), context(), /columns must be exactly/);
	rejects(pr().replace(/\|---\|---\|---\|[\s\S]*?\n\n/, "\n"), context(), /Markdown table/);
});

test("dependencies are declared, justified, and bounded by the plan", () => {
	const declared = "- **zod:** Input validation; MIT licence, no known advisories.";
	const planned = plan({ extra: "- Add the `zod` package for body validation.\n" });
	assert.equal(validatePrContent(pr({ dependencies: declared }), context({ planText: planned })).dependencies, 1);
	assert.doesNotThrow(() => validatePrContent(pr({ dependencies: declared }), context({ planText: planned, addedDeps: ["zod"] })));

	rejects(pr(), context({ addedDeps: ["zod"] }), /"zod" was added but is not declared/);
	rejects(pr({ dependencies: declared }), context({ addedDeps: ["zod"] }), /does not appear in plan\.md/);
	rejects(pr({ dependencies: declared }), context({ planText: plan({ extra: "- Add zod-to-json.\n" }) }), /does not appear in plan\.md/);
	rejects(pr({ dependencies: "- **zod:** TBD" }), context({ planText: planned }), /has no reason/);
	rejects(pr({ dependencies: `${declared}\n${declared}` }), context({ planText: planned }), /more than once/);
	rejects(pr({ dependencies: "We added zod." }), context({ planText: planned }), /must be "_None\._" or bullets/);
});

test("blast radius tier must equal the effective tier and rollback must match think.md", () => {
	rejects(pr({ tier: "Low" }), context(), /Tier is Low but the effective tier .* is Medium/);
	rejects(pr({ tier: "Medium" }), context({ tier: "High" }), /Tier is Medium but the effective tier .* is High/);
	rejects(pr().replace("- **Tier:** Medium\n", ""), context(), /missing the "- \*\*Tier:\*\*"/);
	rejects(pr().replace("- **Tier:** Medium", "- **Tier:** Huge"), context(), /pr Tier must start with one of/);
	rejects(pr().replace("- **Rollback:** _None._\n", ""), context(), /missing the "- \*\*Rollback:\*\*"/);

	const raised = plan({ tierFromThink: "Medium", stillHolds: "Raised to High", reason: "Touches authentication." });
	const raisedThink = think({ tier: "Medium", rollback: ROLLBACK });
	const raisedCtx = () => context({ planText: raised, thinkText: raisedThink, progress: progress(raised) });
	rejects(pr({ tier: "Medium" }), raisedCtx(), /effective tier .* is High/);
	assert.equal(validatePrContent(pr({ tier: "High", rollback: ROLLBACK }), raisedCtx()).tier, "High");

	rejects(pr({ tier: "High", rollback: "_None._" }), context({ tier: "High" }), /Rollback is required for High/);
	rejects(pr({ tier: "Critical", rollback: "Redeploy." }), context({ tier: "Critical" }), /must contain the rollback mechanism recorded in think\.md/);
	rejects(pr({ tier: "High", rollback: ROLLBACK }), context({ tier: "High", thinkText: think({ tier: "High" }) }), /think\.md has no Rollback mechanism/);
	assert.doesNotThrow(() => validatePrContent(pr({ tier: "High", rollback: `Per runbook: ${ROLLBACK.toUpperCase()}` }), context({ tier: "High" })));
});

test("code stage: every step done, attempts within the limit, plan unchanged", () => {
	const planText = plan();
	rejects(pr(), context({ progress: null }), /progress\.json not found/);
	rejects(pr(), context({ planText: `${planText}\nextra\n`, progress: progress(planText) }), /plan changed after Code started/);
	rejects(pr(), context({ progress: progress(planText, { status: "pending" }) }), /not all plan steps are done \(open: Step 1, Step 2\)/);
	const missing = progress(planText);
	delete missing.steps[2];
	rejects(pr(), context({ progress: missing }), /tracks 1 steps but plan\.md has 2/);
	const unverified = progress(planText);
	unverified.steps[1].verifiedAt = null;
	rejects(pr(), context({ progress: unverified }), /no verifiedAt for Step 1/);
	rejects(pr(), context({ progress: progress(planText, { attempts: 6, limit: 5 }) }), /exceed the limit \(5\)/);
	rejects(pr(), context({ progress: progress(planText, { attempts: 1, limit: 9 }) }), /limit is 9; the fix-loop limit is 5/);
	const tampered = progress(planText, { attempts: 2 });
	tampered.steps[1].attempts = 0;
	rejects(pr(), context({ progress: tampered }), /does not match the step attempts/);
	const hidden = progress(planText, { attempts: 0 });
	hidden.steps[1].attempts = -3;
	hidden.steps[2].attempts = 3;
	rejects(pr(), context({ progress: hidden }), /non-negative integers/);
	const renumbered = progress(planText);
	renumbered.steps = { 7: renumbered.steps[1], 8: renumbered.steps[2] };
	rejects(pr(), context({ progress: renumbered }), /exactly the keys 1 to 2/);
	assert.equal(validatePrContent(pr(), context({ progress: progress(planText, { attempts: 5 }) })).fixLoop.attempts, 5);
	assert.equal(validatePrContent(pr(), context({ progress: progress(planText, { attempts: 7, limit: 8 }), maxFixLoop: 8 })).fixLoop.limit, 8);
});

test("code stage: the plan must be approved by a named Developer", () => {
	const unapproved = (approval) => context({ planText: plan({ approval }) });
	const notApproved = /plan is not approved by a Developer; Code starts only from an approved plan/;
	assert.doesNotThrow(() => validatePrContent(pr(), unapproved(`${PLAN_APPROVAL}; Grace Hopper (Architect) on 2026-10-04`)));
	for (const value of [
		"Pending",
		"Approved",
		"Ada Lovelace (Architect) on 2026-10-03",
		"Ada Lovelace (Developer)",
		"Ada Lovelace (Developer) on 03/10/2026",
		"Ada Lovelace (Developer) on 2026-10-03; Grace Hopper (Developer) on 2026-10-03",
	]) {
		rejects(pr(), unapproved(value), notApproved);
	}
	for (const name of ["Copilot", "Claude Sonnet", "release-bot", "dependabot[bot]", "Review Agent", "AI", "TBD", "x"]) {
		rejects(pr(), unapproved(`${name} (Developer) on 2026-10-03`), /approver ".*" is a placeholder or an AI/);
	}
	rejects(pr(), unapproved("Ada Lovelace (Developer) on 2026-13-40"), /approval date 2026-13-40 is not a valid date/);
	rejects(pr(), unapproved(`${PLAN_APPROVAL}; ada  lovelace (Architect) on 2026-10-04`), /two different people/);

	const withoutSection = plan().replace(/\n## Approval\n- \*\*Approved By:\*\* .*\n/, "\n");
	rejects(pr(), context({ planText: withoutSection }), /no "## Approval" section/);
	rejects(pr(), context({ planText: plan().replace("**Approved By:**", "**Approver:**") }), /no "- \*\*Approved By:\*\*" field/);
	const fenced = plan().replace(/\n## Approval\n- \*\*Approved By:\*\* .*\n/, `\n\`\`\`md\n## Approval\n- **Approved By:** ${PLAN_APPROVAL}\n\`\`\`\n`);
	rejects(pr(), context({ planText: fenced }), /no "## Approval" section/);

	assert.doesNotThrow(() => validatePrContent(pr({ human: CONFIRMED }), prove({ planText: plan({ approval: "Pending" }) })), "the approval gate belongs to the code stage");
});

test("code stage: Human Validation stays Pending and carries exactly the tier's fields", () => {
	rejects(withHuman(CONFIRMED), context(), /must be Pending at the code stage/);
	rejects(withHuman({ ...pending("Medium"), "Client Intent": "Confirmed by Ada Lovelace (Developer) on 2026-10-14" }), context(), /"Client Intent" must be Pending/);
	rejects(withHuman({ "Client Intent": "Pending", "Behavioral Experience": "Pending" }), context(), /missing the "- \*\*Safety & Blast Radius:\*\*"/);
	rejects(withHuman({ ...pending("Medium"), "Joint Sign-off": "Pending" }), context(), /"Joint Sign-off" is not used at blast radius Medium/);
	rejects(withHuman(pending("Medium")).replace("- **Client Intent:** Pending", "- **Client Intent:** Pending\n- **Client Intent:** Pending"), context(), /repeats the field/);
	rejects(withHuman(pending("Medium")).replace("## Human Validation\n", "## Human Validation\nLooks good to me.\n"), context(), /holds only its fields/);
	rejects(withHuman(pending("High"), { tier: "High", rollback: ROLLBACK }).replace("- **Rollback Validated:** Pending\n", ""), context({ tier: "High" }), /missing the "- \*\*Rollback Validated:\*\*"/);
	rejects(withHuman(pending("Critical"), { tier: "Critical", rollback: ROLLBACK }).replace("- **Staged Rollout:** Pending\n", ""), context({ tier: "Critical" }), /missing the "- \*\*Staged Rollout:\*\*"/);
});

test("rejects line-by-line review claims at both stages", () => {
	for (const claim of ["I reviewed the diff line by line", "Line-by-line review done", "line by line"]) {
		const human = { ...pending("Medium"), "Client Intent": claim };
		rejects(withHuman(human), context(), /must not claim line-by-line review/);
		rejects(withHuman({ ...CONFIRMED, "Client Intent": `${claim} Confirmed by Ada Lovelace (Developer) on 2026-10-14` }), prove(), /must not claim line-by-line review/);
	}
	assert.doesNotThrow(() => validatePrContent(pr().replace("## Dependencies", "<!-- do not claim line-by-line review -->\n## Dependencies"), context()));
});

test("prove stage: Low accepts Auto-merge or a Developer acknowledgement", () => {
	const auto = Object.fromEntries(Object.keys(CONFIRMED).map((k) => [k, "Auto-merge"]));
	const low = { tier: "Low" };
	assert.equal(validatePrContent(pr({ ...low, human: auto }), prove(low)).recordDate, RECORD_DATE);
	assert.equal(validatePrContent(pr({ ...low, human: CONFIRMED }), prove(low)).tier, "Low");
	rejects(pr({ ...low, human: { ...auto, "Client Intent": "Pending" } }), prove(low), /"Client Intent" is still Pending/);
	rejects(pr({ ...low, human: { ...auto, "Client Intent": CONFIRMED["Client Intent"] } }), prove(low), /"Behavioral Experience" must be "Confirmed by/);
	rejects(pr({ ...low, human: { ...CONFIRMED, "Safety & Blast Radius": "Confirmed by Grace Hopper (Architect) on 2026-10-14" } }), prove(low), /cannot be confirmed by role Architect/);
});

test("prove stage: Medium needs a Developer for all three questions unless allowAutoProve is set", () => {
	assert.doesNotThrow(() => validatePrContent(pr({ human: CONFIRMED }), prove()));
	rejects(pr({ human: pending("Medium") }), prove(), /is still Pending/);
	rejects(pr({ human: { ...CONFIRMED, "Client Intent": "Auto-merge" } }), prove(), /must be "Confirmed by <name> \(<role>\) on YYYY-MM-DD"/);
	const auto = Object.fromEntries(Object.keys(CONFIRMED).map((k) => [k, "Auto-merge"]));
	rejects(pr({ human: auto }), prove(), /must be "Confirmed by <name> \(<role>\) on YYYY-MM-DD"/);
	assert.doesNotThrow(() => validatePrContent(pr({ human: auto }), prove({ allowAutoProve: true })));
	rejects(pr({ tier: "High", rollback: ROLLBACK, human: { ...auto, "Rollback Validated": "Auto-merge" } }), prove({ tier: "High", allowAutoProve: true }), /must be "Confirmed by/);
	rejects(pr({ human: { ...CONFIRMED, "Client Intent": "Confirmed by Alan Turing (Product Owner) on 2026-10-14" } }), prove(), /cannot be confirmed by role Product Owner at this blast radius; allowed: Developer/);
	rejects(pr({ human: { ...CONFIRMED, "Client Intent": "Confirmed by Ada Lovelace (Reviewer) on 2026-10-14" } }), prove(), /role "Reviewer" must be one of: Product Owner, Developer, Architect, DevOps, QA and maintainer/);
});

test("prove stage: confirmations name a person, a real date, and not before the record date", () => {
	const confirm = (value) => pr({ human: { ...CONFIRMED, "Client Intent": value } });
	rejects(confirm("Confirmed by Code Agent (Developer) on 2026-10-14"), prove(), /must name a person, not an agent/);
	rejects(confirm("Confirmed by Copilot (Developer) on 2026-10-14"), prove(), /must name a person/);
	rejects(confirm("Confirmed by dependabot[bot] (Developer) on 2026-10-14"), prove(), /must name a person/);
	rejects(confirm("Confirmed by <name> (Developer) on 2026-10-14"), prove(), /must name a person/);
	rejects(confirm("Confirmed by A (Developer) on 2026-10-14"), prove(), /must name a person/);
	rejects(confirm("Confirmed by Ada Lovelace (Developer) on 14/10/2026"), prove(), /formatted YYYY-MM-DD/);
	rejects(confirm("Confirmed by Ada Lovelace (Developer) on 2026-02-31"), prove(), /real date/);
	rejects(confirm("Confirmed by Ada Lovelace (Developer) on 2026-10-12"), prove(), /before the pull request record date 2026-10-13/);
	rejects(confirm("Confirmed by Ada Lovelace (Developer)"), prove(), /must be "Confirmed by/);
	assert.doesNotThrow(() => validatePrContent(confirm("Confirmed by Ada Lovelace (Developer) on 2026-10-12"), prove({ prDate: "2026-10-01" })));
	assert.doesNotThrow(() => validatePrContent(confirm("Confirmed by Ada Lovelace (Developer) on 2026-10-13"), prove()));
	rejects(confirm("Confirmed by Ada Lovelace (Developer) on 2026-10-14"), prove({ prDate: "tomorrow" }), /--pr-date must be formatted/);
	rejects(pr({ human: CONFIRMED }), prove({ progress: null }), /cannot determine the pull request record date/);
	assert.doesNotThrow(() => validatePrContent(pr({ human: CONFIRMED }), prove({ progress: null, prDate: "2026-10-14" })));
});

test("prove stage: High needs a Developer and an Architect, two people, and a validated rollback", () => {
	const high = { tier: "High", rollback: ROLLBACK };
	const ctx = () => prove({ tier: "High" });
	assert.doesNotThrow(() => validatePrContent(pr({ ...high, human: HIGH_CONFIRMED }), ctx()));
	rejects(pr({ ...high, human: { ...HIGH_CONFIRMED, "Safety & Blast Radius": CONFIRMED["Safety & Blast Radius"] } }), ctx(), /dual validation/);
	const architectOnly = Object.fromEntries(Object.keys(CONFIRMED).map((k) => [k, "Confirmed by Grace Hopper (Architect) on 2026-10-14"]));
	rejects(pr({ ...high, human: { ...HIGH_CONFIRMED, ...architectOnly } }), ctx(), /dual validation/);
	rejects(pr({ ...high, human: { ...HIGH_CONFIRMED, "Safety & Blast Radius": "Confirmed by Ada Lovelace (Architect) on 2026-10-14" } }), ctx(), /two different people/);
	rejects(pr({ ...high, human: { ...HIGH_CONFIRMED, "Safety & Blast Radius": "Confirmed by  ada lovelace (Architect) on 2026-10-14" } }), ctx(), /two different people/);
	rejects(pr({ ...high, human: { ...HIGH_CONFIRMED, "Client Intent": "Confirmed by Alan Turing (Product Owner) on 2026-10-14" } }), ctx(), /cannot be confirmed by role Product Owner/);
	rejects(pr({ ...high, human: { ...HIGH_CONFIRMED, "Rollback Validated": "Pending" } }), ctx(), /"Rollback Validated" is still Pending/);
	assert.doesNotThrow(() => validatePrContent(pr({ ...high, human: { ...HIGH_CONFIRMED, "Rollback Validated": "Revert the merge commit by Dev Ops (DevOps) on 2026-10-14; Alan Turing (Product Owner) on 2026-10-14" } }), ctx()));
});

test("prove stage: Rollback Validated names a DevOps person and a Product Owner, two different people, and the mechanism", () => {
	const high = { tier: "High", rollback: ROLLBACK };
	const ctx = () => prove({ tier: "High" });
	const rollback = (value) => pr({ ...high, human: { ...HIGH_CONFIRMED, "Rollback Validated": value } });
	const DEVOPS = "Dana Ops (DevOps) on 2026-10-14";
	const OWNER = "Alan Turing (Product Owner) on 2026-10-14";
	assert.doesNotThrow(() => validatePrContent(rollback(`${ROLLBACK} by ${DEVOPS}; ${OWNER}`), ctx()));
	assert.doesNotThrow(() => validatePrContent(rollback(`${ROLLBACK} by Dana Ops (DevOps) on 2026-10-14; Alan Turing (Product Owner) on 2026-10-20`), ctx()));

	for (const value of [
		"Revert it",
		`${ROLLBACK} by ${DEVOPS}`,
		`${ROLLBACK} by ${OWNER}`,
		`${ROLLBACK} by ${DEVOPS}; ${OWNER}; Extra Person (Developer) on 2026-10-14`,
		`${ROLLBACK} by ${DEVOPS} and ${OWNER}`,
		`${ROLLBACK} by Grace Hopper (Architect) on 2026-10-14`,
	]) {
		rejects(rollback(value), ctx(), /"Rollback Validated" must be "<mechanism> by <name> \(DevOps\) on YYYY-MM-DD; <name> \(Product Owner\) on YYYY-MM-DD"/);
	}
	rejects(rollback(`${ROLLBACK} by Grace Hopper (Architect) on 2026-10-14; ${OWNER}`), ctx(), /validated first by a DevOps person \(found role "Architect"\)/);
	rejects(rollback(`${ROLLBACK} by Ada Lovelace (Developer) on 2026-10-14; ${OWNER}`), ctx(), /validated first by a DevOps person/);
	rejects(rollback(`${ROLLBACK} by Dana Ops (devops) on 2026-10-14; ${OWNER}`), ctx(), /validated first by a DevOps person/);
	rejects(rollback(`${ROLLBACK} by ${OWNER}; ${DEVOPS}`), ctx(), /validated first by a DevOps person \(found role "Product Owner"\)/);
	rejects(rollback(`${ROLLBACK} by ${DEVOPS}; Grace Hopper (Architect) on 2026-10-14`), ctx(), /also be validated by a Product Owner \(found role "Architect"\)/);
	rejects(rollback(`${ROLLBACK} by ${DEVOPS}; Alan Turing (product owner) on 2026-10-14`), ctx(), /also be validated by a Product Owner/);
	rejects(rollback(`${ROLLBACK} by Dana Ops (DevOps) on 2026-10-14; dana  ops (Product Owner) on 2026-10-14`), ctx(), /two different people: the DevOps person and the Product Owner/);
	for (const name of ["Copilot", "Claude Sonnet", "release-bot", "github-actions", "dependabot[bot]", "Review Agent", "TBD"]) {
		rejects(rollback(`${ROLLBACK} by ${name} (DevOps) on 2026-10-14; ${OWNER}`), ctx(), /must name a person/);
		rejects(rollback(`${ROLLBACK} by ${DEVOPS}; ${name} (Product Owner) on 2026-10-14`), ctx(), /must name a person/);
	}
	rejects(rollback(`${ROLLBACK} by Dana Ops (DevOps) on 2026-13-40; ${OWNER}`), ctx(), /must be a real date/);
	rejects(rollback(`${ROLLBACK} by ${DEVOPS}; Alan Turing (Product Owner) on 14/10/2026`), ctx(), /must be a real date/);
	rejects(rollback(`${ROLLBACK} by Dana Ops (DevOps) on 2026-10-12; ${OWNER}`), ctx(), /before the pull request record date/);
	rejects(rollback(`${ROLLBACK} by ${DEVOPS}; Alan Turing (Product Owner) on 2026-10-12`), ctx(), /before the pull request record date/);
	rejects(rollback(`Restart the pod by ${DEVOPS}; ${OWNER}`), ctx(), /name the rollback mechanism recorded in think\.md/);
	const critical = { tier: "Critical", rollback: ROLLBACK };
	rejects(pr({ ...critical, human: { ...CRITICAL_CONFIRMED, "Rollback Validated": `${ROLLBACK} by Grace Hopper (Architect) on 2026-10-14` } }), prove({ tier: "Critical" }), /must be "<mechanism> by <name> \(DevOps\)/);
});

test("prove stage: Critical needs an Architect and Product Owner joint sign-off, a staged rollout, and a validated rollback", () => {
	const critical = { tier: "Critical", rollback: ROLLBACK };
	const ctx = () => prove({ tier: "Critical" });
	assert.doesNotThrow(() => validatePrContent(pr({ ...critical, human: CRITICAL_CONFIRMED }), ctx()));
	const without = (field) => pr({ ...critical, human: { ...CRITICAL_CONFIRMED, [field]: "Pending" } });
	rejects(without("Joint Sign-off"), ctx(), /"Joint Sign-off" is still Pending/);
	rejects(without("Staged Rollout"), ctx(), /"Staged Rollout" needs a reference/);
	rejects(without("Rollback Validated"), ctx(), /"Rollback Validated" is still Pending/);
	rejects(without("Client Intent"), ctx(), /"Client Intent" is still Pending/);
	const joint = (value) => pr({ ...critical, human: { ...CRITICAL_CONFIRMED, "Joint Sign-off": value } });
	rejects(joint("Confirmed by Grace Hopper (Architect) on 2026-10-15"), ctx(), /must be "Confirmed by <name> \(Architect\) and <name> \(Product Owner\)/);
	rejects(joint("Confirmed by Grace Hopper (Architect) and Ada Lovelace (Developer) on 2026-10-15"), ctx(), /one Architect and one Product Owner/);
	rejects(joint("Confirmed by Grace Hopper (Architect) and Grace Hopper (Architect) on 2026-10-15"), ctx(), /one Architect and one Product Owner/);
	rejects(joint("Confirmed by Grace Hopper (Architect) and Grace Hopper (Product Owner) on 2026-10-15"), ctx(), /two different people/);
	rejects(joint("Confirmed by Grace Hopper (Architect) and grace  hopper (Product Owner) on 2026-10-15"), ctx(), /two different people/);
	rejects(joint("Confirmed by Grace Hopper (Architect) and Copilot (Product Owner) on 2026-10-15"), ctx(), /must name a person/);
	rejects(joint("Confirmed by Grace Hopper (Architect) and Alan Turing (Product Owner) on 2026-10-01"), ctx(), /before the pull request record date/);
	assert.doesNotThrow(() => validatePrContent(joint("Confirmed by Alan Turing (Product Owner) and Grace Hopper (Architect) on 2026-10-15"), ctx()));
});

test("rejects an unknown stage", () => {
	rejects(pr(), context({ stage: "merge" }), /--stage must be "code" or "prove"/);
});

async function workItem({ body = pr(), planText = plan(), thinkText = think(), progressJson = progress(planText) } = {}) {
	const root = await mkdtemp(join(tmpdir(), "pr-record-"));
	const dir = join(root, "specs", "issue-42");
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "plan.md"), planText);
	await writeFile(join(dir, "think.md"), thinkText);
	if (progressJson) await writeFile(join(dir, "progress.json"), JSON.stringify(progressJson));
	await writeFile(join(root, "pr.md"), body);
	return { root, dir, body: join(root, "pr.md") };
}

function run(args) {
	const out = { log: [], error: [] };
	const original = { log: console.log, error: console.error };
	console.log = (...a) => out.log.push(a.join(" "));
	console.error = (...a) => out.error.push(a.join(" "));
	try {
		out.code = runValidator(args);
	} finally {
		Object.assign(console, original);
	}
	return out;
}

test("CLI validates the code stage against files on disk", async () => {
	const w = await workItem();
	const result = run(["--body", w.body, "--dir", w.dir, "--stage", "code", "--root", w.root]);
	assert.equal(result.code, 0);
	assert.match(result.log.join("\n"), /Validated \(code stage\): blast radius Medium, 3 criteria traced, 0 declared dependencies, fix loop 0\/5/);
});

test("CLI validates the prove stage and uses the progress record date", async () => {
	const w = await workItem({ body: pr({ human: CONFIRMED }) });
	const result = run(["--body", w.body, "--dir", w.dir, "--stage", "prove", "--root", w.root]);
	assert.equal(result.code, 0);
	assert.match(result.log.join("\n"), /record date 2026-10-13/);
	assert.equal(run(["--body", w.body, "--dir", w.dir, "--stage", "prove", "--root", w.root, "--pr-date", "2026-10-20"]).code, 1);
});

test("CLI checks added dependencies, links, and failures", async () => {
	const planText = plan({ extra: "- Add the `zod` package.\n" });
	const w = await workItem({ body: pr({ dependencies: "- **zod:** Validation; MIT, no advisories." }), planText });
	const base = ["--body", w.body, "--dir", w.dir, "--stage", "code", "--root", w.root];
	assert.equal(run([...base, "--added-deps", "zod"]).code, 0);
	let result = run([...base, "--added-deps", "zod,left-pad"]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /"left-pad" was added but is not declared/);

	const other = await mkdtemp(join(tmpdir(), "pr-record-empty-"));
	result = run(["--body", w.body, "--dir", w.dir, "--stage", "code", "--root", other]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /does not resolve to an existing file/);

	const noProgress = await workItem({ progressJson: null });
	result = run(["--body", noProgress.body, "--dir", noProgress.dir, "--stage", "code", "--root", noProgress.root]);
	assert.match(result.error.join("\n"), /progress\.json not found/);
	assert.equal(run(["--body", noProgress.body, "--dir", noProgress.dir, "--stage", "code", "--root", noProgress.root, "--max-fix-loop", "x"]).code, 1);
	const fresh = await workItem();
	result = run(["--body", fresh.body, "--dir", fresh.dir, "--stage", "code", "--root", fresh.root, "--max-fix-loop", "6"]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /can only lower the fix-loop limit of 5/);
	assert.equal(run(["--body", fresh.body, "--dir", fresh.dir, "--stage", "code", "--root", fresh.root, "--max-fix-loop", "5"]).code, 0);
});

test("CLI refuses the code stage for a plan that is not approved", async () => {
	const planText = plan({ approval: "Pending" });
	const w = await workItem({ planText });
	const result = run(["--body", w.body, "--dir", w.dir, "--stage", "code", "--root", w.root]);
	assert.equal(result.code, 1);
	assert.match(result.error.join("\n"), /plan is not approved by a Developer; Code starts only from an approved plan/);
});

test("CLI reports missing inputs and usage errors", async () => {
	const w = await workItem();
	assert.equal(run([]).code, 1);
	assert.equal(run(["--help"]).code, 0);
	assert.equal(run(["--bogus"]).code, 1);
	assert.equal(run(["--body", w.body, "--dir", w.dir]).code, 1);
	assert.equal(run(["--body", join(w.root, "nope.md"), "--dir", w.dir, "--stage", "code"]).code, 1);
	assert.equal(run(["--body", w.body, "--dir", join(w.root, "specs", "issue-9"), "--stage", "code"]).code, 1);
	await writeFile(join(w.dir, "progress.json"), "{ nope");
	const result = run(["--body", w.body, "--dir", w.dir, "--stage", "code", "--root", w.root]);
	assert.match(result.error.join("\n"), /progress\.json is not valid JSON/);
	assert.equal(run(["--body", w.body, "--dir", w.dir, "--stage", "merge", "--root", w.root]).code, 1);
});
