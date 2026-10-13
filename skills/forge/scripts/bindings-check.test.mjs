import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkBindings, parsePlanSteps, parseThink, runBindingsCheck } from "./bindings-check.mjs";
import { TODAY, makeThink, validCatalog, validPlan, validThink } from "./forge-fixture.mjs";

const run = (think, { catalog = validCatalog(), planSteps = null } = {}) => checkBindings(parseThink(think), catalog, { today: TODAY, planSteps });
const rejects = (think, pattern, options) => {
	const { errors } = run(think, options);
	assert.ok(errors.some((e) => pattern.test(e)), `expected ${pattern}, got: ${errors.join(" | ") || "no errors"}`);
};
const warns = (think, pattern, options) => {
	const { warnings, errors } = run(think, options);
	assert.deepEqual(errors, []);
	assert.ok(warnings.some((w) => pattern.test(w)), `expected ${pattern}, got: ${warnings.join(" | ") || "no warnings"}`);
};

test("parses the Think record", () => {
	const think = parseThink(validThink);
	assert.deepEqual(think.bindings.map((b) => [b.id, b.version]), [["rbac-service", "2.1.0"]]);
	assert.equal(think.selected, 1);
	assert.equal(think.selectedOption.source, "Forge reuse");
	assert.match(think.problem, /Admins cannot create/);
	assert.equal(think.options.length, 2);
	assert.equal(think.none, null);
	assert.equal(think.customBuildReason, "");
	const none = parseThink(makeThink({ bindings: "- **None:** No Forge asset covers PDF rendering." }));
	assert.equal(none.none.reason, "No Forge asset covers PDF rendering.");
	assert.equal(parseThink("# Think: x").hasBindingsSection, false);
});

test("accepts a binding to a current, stable asset", () => {
	assert.deepEqual(run(validThink), { errors: [], warnings: [] });
});

test("rejects a missing section, malformed labels, and empty sections", () => {
	rejects(validThink.replace("## Forge Asset Bindings", "## Other"), /Missing ## Forge Asset Bindings/);
	rejects(makeThink({ bindings: "- **rbac-service:** Wrong label form." }), /must be forge\/<id>@<version> or None/);
	rejects(makeThink({ bindings: "- **forge/rbac-service:** No version." }), /must be forge\/<id>@<version> or None/);
	rejects(makeThink({ bindings: "_None._" }), /State real bindings/);
	rejects(makeThink({ bindings: "- **forge/rbac-service@2.1.0:**" }), /say how the asset is composed/);
	rejects(makeThink({ bindings: "```markdown\n- **forge/rbac-service@2.1.0:** Only an example in a fence.\n```" }), /State real bindings/);
});

test("rejects unknown assets and duplicate bindings", () => {
	rejects(makeThink({ bindings: "- **forge/ghost@1.0.0:** Composed." }), /no asset "ghost"/);
	const twice = "- **forge/rbac-service@2.1.0:** First use.\n- **forge/rbac-service@2.1.0:** Second use.";
	rejects(makeThink({ bindings: twice }), /bound more than once/);
});

test("a deprecated asset is an error that names the replacement, a removed one is unbindable", () => {
	const deprecated = validCatalog();
	deprecated.assets[0].status = "deprecated";
	deprecated.assets[0].replacement = "notify-lib";
	deprecated.assets[0].removalDate = "2026-12-31";
	rejects(validThink, /rbac-service is deprecated \(removal 2026-12-31\); bind notify-lib instead/, { catalog: deprecated });

	const removed = validCatalog();
	removed.assets[0].status = "removed";
	removed.assets[0].removalDate = "2026-10-01";
	removed.assets[0].replacement = "notify-lib";
	rejects(validThink, /was removed on 2026-10-01; bind notify-lib instead/, { catalog: removed });

	const lapsed = validCatalog();
	lapsed.assets[0].status = "deprecated";
	lapsed.assets[0].replacement = "notify-lib";
	lapsed.assets[0].removalDate = "2026-10-12";
	rejects(validThink, /was removed/, { catalog: lapsed });
});

test("version must equal the catalog version, older warns, newer fails", () => {
	warns(makeThink({ bindings: "- **forge/rbac-service@2.0.0:** Composed." }), /stale binding, the catalog has 2\.1\.0/);
	rejects(makeThink({ bindings: "- **forge/rbac-service@2.2.0:** Composed." }), /newer than the catalog's 2\.1\.0/);
	rejects(makeThink({ bindings: "- **forge/rbac-service@2.1:** Composed." }), /not a semantic version; the catalog has 2\.1\.0/);
	assert.deepEqual(run(makeThink({ bindings: "- **forge/rbac-service@2.1.0+build.7:** Composed." })), { errors: [], warnings: [] });
});

test("alpha and beta assets warn unless the reasoning acknowledges the maturity", () => {
	const beta = "- **forge/notify-lib@0.9.0:** Sends the confirmation email.";
	warns(makeThink({ bindings: beta }), /notify-lib is beta; acknowledge/);
	const acknowledged = makeThink({ bindings: beta, reasoning: "The library is beta, so we pin 0.9.0 and review each upgrade." });
	assert.deepEqual(run(acknowledged), { errors: [], warnings: [] });
});

test("None with a reason is allowed, without a reason or beside real bindings it fails", () => {
	const custom = makeThink({ source: "Custom build", bindings: "- **None:** No Forge asset renders PDFs.", reason: "Searched the Forge for PDF rendering: nothing." });
	assert.deepEqual(run(custom.replace("Add a thin route that calls the role service for role creation.", "Render invoices as PDF files")).errors, []);
	rejects(makeThink({ bindings: "- **None:**" }), /None binding needs a reason/);
	rejects(makeThink({ bindings: "- **None:** Reason.\n- **forge/rbac-service@2.1.0:** Composed." }), /None cannot be combined/);
});

test("Forge reuse and Hybrid selections need real bindings", () => {
	rejects(makeThink({ bindings: "- **None:** No reason." }), /Forge reuse selection needs at least one/);
	rejects(makeThink({ source: "Hybrid", bindings: "- **None:** No reason." }), /Hybrid selection needs at least one/);
});

test("a Custom build needs a reason and prints the Forge matches to challenge it", () => {
	const bindings = "- **None:** Built in-house.";
	const noReason = makeThink({ source: "Custom build", bindings });
	rejects(noReason, /Custom build needs a Custom Build Reason/);
	const challenged = makeThink({ source: "Custom build", bindings, reason: "Nothing fits.", approach: "Add roles and permission checks with email notification" });
	const { errors, warnings } = run(challenged);
	assert.deepEqual(errors, []);
	assert.match(warnings.join("\n"), /Custom build selected, but the Forge matches: rbac-service \(score [\d.]+; .*role.*permission/);
	assert.match(warnings.join("\n"), /notify-lib/);
	const unrelated = makeThink({ source: "Custom build", bindings, reason: "Nothing fits.", approach: "Resize photos", problem: "Photos are too large." });
	assert.deepEqual(run(unrelated), { errors: [], warnings: [] });
	const emptyReason = makeThink({ source: "Custom build", bindings, reason: "_None._" });
	rejects(emptyReason, /Custom Build Reason/);
});

test("parses plan steps fence-aware and reads only Action and New Code", () => {
	const steps = parsePlanSteps(validPlan);
	assert.deepEqual(steps.map((s) => s.n), [1, 2]);
	assert.match(steps[0].text, /RBAC Service client/);
	assert.match(steps[0].text, /@example\/rbac-client/);
	assert.doesNotMatch(steps[0].text, /Verification|Bootable/);
	assert.doesNotMatch(steps[1].text, /rbac/i);
});

test("with a plan, every bound asset must be composed by a step", () => {
	const steps = parsePlanSteps(validPlan);
	assert.deepEqual(run(validThink, { planSteps: steps }), { errors: [], warnings: [] });
	const idOnly = parsePlanSteps(validPlan.replace("RBAC Service client", "client").replace("@example/rbac-client", "@example/rbac-service-client"));
	assert.deepEqual(run(validThink, { planSteps: idOnly }).warnings, []);
	const without = parsePlanSteps(validPlan.replace("RBAC Service client", "client").replace("@example/rbac-client", "@example/auth"));
	warns(validThink, /no plan step composes rbac-service/, { planSteps: without });
	warns(validThink, /no plan step composes rbac-service/, { planSteps: [] });
	const artifact = parsePlanSteps(validPlan.replace("RBAC Service client", "client").replace("@example/rbac-client", "ghcr.io/example/rbac-service:2.1.0"));
	assert.deepEqual(run(validThink, { planSteps: artifact }), { errors: [], warnings: [] });
});

test("CLI checks think.md and plan.md against a catalog", async () => {
	const root = await mkdtemp(join(tmpdir(), "forge-bindings-"));
	const catalog = join(root, "catalog.json");
	const think = join(root, "think.md");
	const plan = join(root, "plan.md");
	await writeFile(catalog, JSON.stringify(validCatalog()));
	await writeFile(think, validThink);
	await writeFile(plan, validPlan);
	await writeFile(join(root, "bad-think.md"), makeThink({ bindings: "- **forge/ghost@1.0.0:** Composed." }));
	await writeFile(join(root, "unplanned.md"), validPlan.replace("RBAC Service client", "client").replace("@example/rbac-client", "@example/auth"));

	const lines = [];
	const { log, error, warn } = console;
	console.log = console.error = console.warn = (line) => lines.push(String(line));
	try {
		assert.equal(await runBindingsCheck(["--think", think, "--catalog", catalog, "--plan", plan, "--today", TODAY]), 0);
		assert.match(lines.join("\n"), /✓ \[think\.md\] Forge bindings valid: 1 binding/);
		assert.equal(await runBindingsCheck(["--think", think, "--plan", plan], { FORGE_CATALOG: catalog }), 0);
		lines.length = 0;
		assert.equal(await runBindingsCheck(["--think", think, "--catalog", catalog, "--plan", join(root, "unplanned.md")]), 0);
		assert.match(lines.join("\n"), /⚠ \[think\.md\] .*no plan step composes rbac-service/);
		lines.length = 0;
		assert.equal(await runBindingsCheck(["--think", join(root, "bad-think.md"), "--catalog", catalog]), 1);
		assert.match(lines.join("\n"), /✗ \[think\.md\] .*no asset "ghost"/);
		assert.equal(await runBindingsCheck(["--think", join(root, "missing.md"), "--catalog", catalog]), 1);
		assert.equal(await runBindingsCheck(["--think", think, "--catalog", catalog, "--plan", join(root, "missing.md")]), 1);
		assert.equal(await runBindingsCheck(["--think", think, "--catalog", join(root, "missing.json")]), 1);
		assert.equal(await runBindingsCheck(["--catalog", catalog]), 1);
		assert.equal(await runBindingsCheck(["--think", think, "--today", "soon"]), 1);
		assert.equal(await runBindingsCheck(["--help"]), 0);
		assert.equal(await runBindingsCheck(["--wat"]), 1);
	} finally {
		Object.assign(console, { log, error, warn });
	}
});
