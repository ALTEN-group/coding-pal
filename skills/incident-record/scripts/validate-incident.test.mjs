import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { INCIDENT_NAME, noControlIncident, validIncident } from "./incident-fixture.mjs";
import { ValidationError, checkFileName, isIsoTimestamp, restoreStatus, runValidator, testExistsUnder, validateIncidentContent, workingDaysAfter } from "./validate-incident.mjs";

const edit = (from, to) => validIncident.replace(from, to);
const rejects = (markdown, pattern, options) =>
	assert.throws(() => validateIncidentContent(markdown, "incident.md", options), (err) => err instanceof ValidationError && pattern.test(err.message));

test("accepts a valid incident and returns structured data", () => {
	const incident = validateIncidentContent(validIncident);
	assert.equal(incident.title, "Checkout returns 5xx after the order-total release");
	assert.equal(incident.severity, "SEV2");
	assert.equal(incident.timeToRestoreMinutes, 12);
	assert.equal(incident.mechanism, "flag off");
	assert.equal(incident.concludedBy.role, "Developer");
	assert.deepEqual(incident.controls.map((c) => c.kind), ["gate", "probe"]);
	assert.equal(incident.triageIssue, "#57");
	assert.deepEqual(incident.postmortemActions, [{ action: "Document the zero-item basket rule in the checkout glossary", owner: "Sam Lee" }]);
	const none = validateIncidentContent(noControlIncident);
	assert.deepEqual(none.controls, []);
	assert.match(none.noControlReason, /zero-item contract test/);
	assert.equal(none.triageIssue, "_None._");
});

test("rejects structure problems", () => {
	rejects("", /empty/);
	rejects(edit("# Incident:", "# Postmortem:"), /level-one heading/);
	rejects(edit("# Incident: Checkout returns 5xx after the order-total release", "# Incident: TBD"), /level-one heading/);
	rejects(`intro\n${validIncident}`, /level-one heading/);
	rejects(edit("## Repair", "## Fix"), /heading 5/);
	rejects(`${validIncident}\n## Extra\nx\n`, /exactly 7/);
	rejects(edit("## Detect\nThe checkout error-rate alert fired at 09:30 and the support desk reported failed payments at 09:33.\n", "## Detect\n"), /## Detect is empty/);
	rejects(edit("## Ambiguities & Open Questions\n_None._\n", "## Ambiguities & Open Questions\n"), /Ambiguities/);
});

test("rejects bad summary fields and time order", () => {
	rejects(edit("- **Severity:** SEV2\n", ""), /missing the "- \*\*Severity:\*\*"/);
	rejects(edit("SEV2", "SEV4"), /Severity" must be one of/);
	rejects(edit("- **Tier:** High", "- **Tier:** Huge"), /Tier" must be one of/);
	rejects(edit("2026-10-13T09:30:00Z", "2026-10-13 09:30"), /ISO 8601 UTC timestamp/);
	rejects(edit("- **Detected At:** 2026-10-13T09:30:00Z", "- **Detected At:** 2026-10-13T09:50:00Z"), /Detected At must not be after Mitigated At/);
	rejects(edit("- **Resolved At:** 2026-10-13T15:10:00Z", "- **Resolved At:** 2026-10-13T09:40:00Z"), /Mitigated At must not be after Resolved At/);
	rejects(edit("Robin Park (DevOps)", "DevOps"), /Rollback Decided By" must be/);
	rejects(edit("Robin Park (DevOps)", "Robin Park (Developer)"), /Rollback Decided By" must be/);
});

test("requires mitigation before diagnosis and a human-concluded cause", () => {
	rejects(edit("- **Mechanism:** flag off", "- **Mechanism:** hope"), /Mechanism" must be one of/);
	rejects(edit("- **Diagnosis Started At:** 2026-10-13T09:50:00Z", "- **Diagnosis Started At:** 2026-10-13T09:40:00Z"), /mitigation precedes diagnosis/);
	rejects(edit("- **Diagnosis Started At:** 2026-10-13T09:50:00Z", "- **Diagnosis Started At:** 2026-10-13T16:00:00Z"), /after Resolved At/);
	rejects(edit(/- \*\*Cause:\*\*.*\n/.exec(validIncident)[0], "- **Cause:** TBD\n"), /Cause" is empty/);
	rejects(edit(/- \*\*Evidence:\*\*.*\n/.exec(validIncident)[0], "- **Evidence:** It was probably the cache.\n"), /correlate logs, traces, deploys, or diffs/);
	rejects(edit("Alex Kim (Developer)", "Alex Kim"), /Concluded By" must be/);
	rejects(edit("Alex Kim (Developer)", "Alex Kim (Product Owner)"), /Concluded By" must be/);
	rejects(edit("- **Concluded By:** Alex Kim (Developer)\n", ""), /missing the "- \*\*Concluded By:\*\*"/);
});

test("requires a failing test before the fix", () => {
	rejects(edit("`tests/unit/order-total.test.ts`", "tests/unit/order-total.test.ts"), /path in backticks/);
	rejects(edit("`tests/unit/order-total.test.ts`", "`../order-total.test.ts`"), /no ".."/);
	rejects(edit("`tests/unit/order-total.test.ts`", "`/etc/order-total.test.ts`"), /workspace-relative/);
	rejects(edit("- **Failed Before Fix:** yes", "- **Failed Before Fix:** no"), /Failed Before Fix" must be "yes"/);
	rejects(edit("- **Passes After Fix:** yes", "- **Passes After Fix:** unknown"), /Passes After Fix" must be "yes"/);
	rejects(edit("- **Test Commit:** a1b2c3d", "- **Test Commit:** latest"), /hexadecimal commit id/);
	rejects(edit("- **Fix Commit:** e4f5a6b", "- **Fix Commit:** a1b2c3d"), /different commits/);
	rejects(edit("test 2026-10-13T10:05:00Z, fix 2026-10-13T10:40:00Z", "fix 2026-10-13T10:40:00Z, test 2026-10-13T10:05:00Z"), /Commit Order/);
	rejects(edit("test 2026-10-13T10:05:00Z, fix 2026-10-13T10:40:00Z", "test 2026-10-13T10:45:00Z, fix 2026-10-13T10:40:00Z"), /Test Commit must come before the Fix Commit/);
	rejects(edit("test 2026-10-13T10:05:00Z", "test 2026-10-13T09:45:00Z"), /Test Commit is dated before Diagnosis/);
	rejects(edit("fix 2026-10-13T10:40:00Z", "fix 2026-10-13T16:40:00Z"), /Fix Commit is dated after Resolved At/);
});

test("checks the reproducing test exists under --tests-dir", async () => {
	const root = await mkdtemp(join(tmpdir(), "incident-"));
	await mkdir(join(root, "tests", "unit"), { recursive: true });
	await writeFile(join(root, "tests", "unit", "order-total.test.ts"), "// test");
	assert.equal(testExistsUnder("unit/order-total.test.ts", join(root, "tests")), true);
	assert.equal(testExistsUnder("tests/unit/order-total.test.ts", root), true);
	assert.equal(testExistsUnder("unit/missing.test.ts", join(root, "tests")), false);
	assert.equal(testExistsUnder("unit", join(root, "tests")), false);
	assert.doesNotThrow(() => validateIncidentContent(edit("tests/unit/order-total.test.ts", "unit/order-total.test.ts"), "incident.md", { testsDir: join(root, "tests") }));
	rejects(edit("tests/unit/order-total.test.ts", "unit/other.test.ts"), /does not exist under/, { testsDir: join(root, "tests") });
});

test("enforces the review within five working days, Monday to Friday", () => {
	assert.equal(workingDaysAfter("2026-10-13", "2026-10-13"), 0);
	assert.equal(workingDaysAfter("2026-10-13", "2026-10-15"), 2);
	assert.equal(workingDaysAfter("2026-10-16", "2026-10-19"), 1);
	assert.equal(workingDaysAfter("2026-10-13", "2026-10-20"), 5);
	assert.doesNotThrow(() => validateIncidentContent(edit("- **Review Date:** 2026-10-15", "- **Review Date:** 2026-10-20")));
	rejects(edit("- **Review Date:** 2026-10-15", "- **Review Date:** 2026-10-21"), /6 working days/);
	rejects(edit("- **Review Date:** 2026-10-15", "- **Review Date:** 2026-10-12"), /before Resolved At/);
	rejects(edit("- **Review Date:** 2026-10-15", "- **Review Date:** 2026-10-17"), /weekend/);
	rejects(edit("- **Review Date:** 2026-10-15", "- **Review Date:** next week"), /ISO date/);
	rejects(edit("Jo Martin (QA and maintainer)", "Jo Martin"), /Reviewed By" must be/);
	rejects(edit(/- \*\*What Should Have Caught This:\*\*.*\n/.exec(validIncident)[0], "- **What Should Have Caught This:** TBD\n"), /What Should Have Caught This" is empty/);
});

test("rejects AI names and placeholders as the person who decided, concluded, or reviewed", () => {
	const fields = [
		["Rollback Decided By", "Robin Park (DevOps)", "DevOps"],
		["Concluded By", "Alex Kim (Developer)", "Developer"],
		["Reviewed By", "Jo Martin (QA and maintainer)", "QA and maintainer"],
	];
	for (const [label, original, role] of fields) {
		for (const name of ["Copilot", "Claude", "GPT-4", "Gemini", "ChatGPT", "OpenAI", "Anthropic", "release-bot", "agent", "dependabot", "renovate", "github-actions", "AI", "LLM", "dependabot[bot]"]) {
			rejects(edit(original, `${name} (${role})`), new RegExp(`${label}" ".*" is not a named person \\(it looks like an AI\\)`));
		}
		for (const name of ["x", "TBD", "<name>", "N/A"]) {
			rejects(edit(original, `${name} (${role})`), new RegExp(`${label}"`));
		}
		assert.doesNotThrow(() => validateIncidentContent(edit(original, `Dana Reed (${role})`)), label);
	}
	rejects(edit("Alex Kim (Developer)", "Developer (Developer)"), /not a named person/);
});

test("hardens controls and links the Triage issue", () => {
	rejects(edit("  - gate: require the mutation score bar on the order-total module\n  - probe: add a preview smoke check that submits a gift-card-only basket\n", ""), /needs at least one item/);
	rejects(edit("gate: require", "linter: require"), /Control Hardening item must be/);
	rejects(edit("- **Control Hardening:**\n", "- **Control Hardening:** gate: x\n"), /must list nested items/);
	rejects(noControlIncident.replace("None: the", "None: TBD").replace(/None: TBD.*\n/, "None: TBD\n"), /needs a reason/);
	rejects(noControlIncident.replace("- **Control Hardening:** None: ", "- **Control Hardening:** None: x\n  - gate: y\n  - z: "), /cannot be "None" and also list items/);
	rejects(edit("- **Triage Issue:** #57", "- **Triage Issue:** _None._"), /only when Control Hardening is "None"/);
	rejects(edit("- **Triage Issue:** #57", "- **Triage Issue:** 57"), /must be #<number> or _None\._/);
	rejects(edit("- **Triage Issue:** #57", "- **Triage Issue:** Pending"), /must be #<number> or _None\._/);
	rejects(edit("- **Triage Issue:** #57", "- **Triage Issue:** TBD"), /empty or a placeholder/);
	rejects(noControlIncident.replace("- **Triage Issue:** _None._", "- **Triage Issue:** #57"), /must be _None\._/);
	assert.equal(validateIncidentContent(edit("- **Triage Issue:** #57", "- **Triage Issue:** Pending"), "incident.md", { stage: "draft" }).triageIssue, "Pending");
	assert.throws(() => validateIncidentContent(noControlIncident.replace("- **Triage Issue:** _None._", "- **Triage Issue:** Pending"), "incident.md", { stage: "draft" }), /only applies when Control Hardening lists items/);
	assert.throws(() => validateIncidentContent(validIncident, "incident.md", { stage: "later" }), /stage must be/);
});

test("requires an owner on every postmortem action", () => {
	rejects(edit("(owner: Sam Lee)", ""), /needs an owner/);
	rejects(edit("(owner: Sam Lee)", "(owner: TBD)"), /needs an owner/);
	rejects(edit("  - Document the zero-item basket rule in the checkout glossary (owner: Sam Lee)\n", ""), /Postmortem Actions" needs at least one item/);
	rejects(edit("- **Postmortem Actions:**\n", "- **Postmortem Actions:** fix it\n"), /must be _None\._ or nested items/);
	const none = edit("- **Postmortem Actions:**\n  - Document the zero-item basket rule in the checkout glossary (owner: Sam Lee)\n", "- **Postmortem Actions:** _None._\n");
	assert.deepEqual(validateIncidentContent(none).postmortemActions, []);
});

test("helpers: timestamps, file names, restore status", () => {
	assert.equal(isIsoTimestamp("2026-10-13T09:30:00Z"), true);
	assert.equal(isIsoTimestamp("2026-10-13T09:30:00+02:00"), false);
	assert.equal(isIsoTimestamp("2026-02-30T09:30:00Z"), false);
	assert.deepEqual(checkFileName(`docs/incidents/${INCIDENT_NAME}`, "2026-10-13T09:30:00Z"), { date: "2026-10-13", slug: "checkout-5xx" });
	assert.throws(() => checkFileName("docs/incidents/checkout.md", "2026-10-13T09:30:00Z"), /file name must be/);
	assert.throws(() => checkFileName("2026-10-14-checkout.md", "2026-10-13T09:30:00Z"), /must match the Detected At date/);
	assert.match(restoreStatus(14), /^met/);
	assert.match(restoreStatus(15), /^missed/);
	assert.match(restoreStatus(16), /^missed/);
});

test("rejects a field declared twice and Triage issue numbers with leading zeros", () => {
	rejects(edit("- **Concluded By:** Alex Kim (Developer)", "- **Concluded By:** Alex Kim (Developer)\n- **Concluded By:** Sam Lee (DevOps)"), /"Concluded By" is declared twice/);
	rejects(edit("- **Triage Issue:** #57", "- **Triage Issue:** #057"), /Triage Issue/);
	rejects(edit("- **Triage Issue:** #57", "- **Triage Issue:** #0"), /Triage Issue/);
});

test("CLI validates a file, reports time to restore, and fails on bad input", async () => {
	const root = await mkdtemp(join(tmpdir(), "incident-cli-"));
	const file = join(root, INCIDENT_NAME);
	await writeFile(file, validIncident);
	await mkdir(join(root, "tests", "unit"), { recursive: true });
	await writeFile(join(root, "tests", "unit", "order-total.test.ts"), "// test");

	const logs = [];
	const [log, error] = [console.log, console.error];
	console.log = (...parts) => logs.push(parts.join(" "));
	console.error = (...parts) => logs.push(parts.join(" "));
	try {
		assert.equal(await runValidator(["--file", file, "--tests-dir", root]), 0);
		assert.match(logs.join("\n"), /Time to restore: 12 min, met \(target under 15 min\)/);
		assert.equal(await runValidator(["--file", file, "--tests-dir", join(root, "elsewhere")]), 1);
		assert.equal(await runValidator(["--file", file, "--stage", "draft"]), 0);

		const slow = join(root, "2026-10-13-slow.md");
		await writeFile(slow, edit("2026-10-13T09:42:00Z", "2026-10-13T10:00:00Z").replace("- **Diagnosis Started At:** 2026-10-13T09:50:00Z", "- **Diagnosis Started At:** 2026-10-13T10:01:00Z"));
		assert.equal(await runValidator(["--file", slow]), 0);
		assert.match(logs.join("\n"), /Time to restore: 30 min, missed/);

		const badName = join(root, "incident.md");
		await writeFile(badName, validIncident);
		assert.equal(await runValidator(["--file", badName]), 1);
		assert.equal(await runValidator(["--file", join(root, "missing.md")]), 1);
		assert.equal(await runValidator([]), 1);
		assert.equal(await runValidator(["--help"]), 0);
		for (const bad of [["--tests-dir"], ["--tests-dir", ""], ["--stage"], ["--bogus"]]) {
			assert.equal(await runValidator(["--file", file, ...bad]), 1, bad.join(" "));
		}
	} finally {
		Object.assign(console, { log, error });
	}
});
