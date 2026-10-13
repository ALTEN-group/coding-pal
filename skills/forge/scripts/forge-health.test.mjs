import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseThink } from "./bindings-check.mjs";
import { TODAY, makeThink, validCatalog, validThink } from "./forge-fixture.mjs";
import { computeHealth, renderHealth, runHealth } from "./forge-health.mjs";

const item = (issue, think) => ({ issue, think: parseThink(think) });

test("computes the share of work items that bind a Forge asset", () => {
	const items = [
		item("issue-1", validThink),
		item("issue-2", makeThink({ source: "Custom build", bindings: "- **None:** Nothing fits.", reason: "Searched." })),
	];
	const health = computeHealth(validCatalog(), items, { today: TODAY });
	assert.equal(health.shareBinding, 0.5);
	assert.deepEqual(health.bindingItems, ["issue-1"]);
	assert.equal(computeHealth(validCatalog(), [], { today: TODAY }).shareBinding, null);
});

test("flags assets without an owner and assets with an old release", () => {
	const catalog = validCatalog();
	catalog.assets[0].owner = "";
	const health = computeHealth(catalog, [], { today: TODAY, staleDays: 60 });
	assert.deepEqual(health.withoutOwner, ["rbac-service"]);
	assert.deepEqual(health.stale, [{ id: "rbac-service", releasedAt: "2026-08-01", ageDays: 73 }]);
	assert.deepEqual(computeHealth(validCatalog(), [], { today: TODAY }).stale, []);
	const removed = validCatalog();
	removed.assets[0] = { ...removed.assets[0], status: "removed", removalDate: "2026-10-01", owner: "" };
	assert.deepEqual(computeHealth(removed, [], { today: TODAY, staleDays: 1 }).withoutOwner, []);
});

test("flags non-current, retired, and unknown bindings and custom builds without a reason", () => {
	const catalog = validCatalog();
	catalog.assets[1].status = "deprecated";
	catalog.assets[1].replacement = "rbac-service";
	catalog.assets[1].removalDate = "2026-12-31";
	const items = [
		item("issue-1", makeThink({ bindings: "- **forge/rbac-service@2.0.0:** Composed." })),
		item("issue-2", makeThink({ bindings: "- **forge/notify-lib@0.9.0:** Composed.\n- **forge/ghost@1.0.0:** Composed." })),
		item("issue-3", makeThink({ source: "Custom build", bindings: "- **None:** Built in-house." })),
		item("issue-4", makeThink({ source: "Custom build", bindings: "- **None:** Built in-house.", reason: "Searched the Forge." })),
	];
	const health = computeHealth(catalog, items, { today: TODAY });
	assert.deepEqual(health.nonCurrent, [{ issue: "issue-1", label: "forge/rbac-service@2.0.0", current: "2.1.0" }]);
	assert.deepEqual(health.retired, [{ issue: "issue-2", label: "forge/notify-lib@0.9.0", status: "deprecated", replacement: "rbac-service" }]);
	assert.deepEqual(health.unknown, [{ issue: "issue-2", label: "forge/ghost@1.0.0" }]);
	assert.deepEqual(health.emptyCustomReasons, ["issue-3"]);
});

test("renders a Markdown report", () => {
	const health = computeHealth(validCatalog(), [item("issue-1", validThink)], { today: TODAY });
	const text = renderHealth(health, { catalogPath: "catalog.json", specsDir: "specs" });
	assert.match(text, /^# Forge Health/);
	assert.match(text, /\| Work items binding at least one Forge asset \| 1 of 1 \(100%\) \|/);
	assert.match(text, /\| Assets without an owner \| 0 \| Healthy \|/);
	assert.match(text, /_None\._/);
	const warned = renderHealth(computeHealth(validCatalog(), [item("issue-9", makeThink({ bindings: "- **forge/rbac-service@1.0.0:** Composed." }))], { today: TODAY }), { catalogPath: "c", specsDir: "s" });
	assert.match(warned, /issue-9: forge\/rbac-service@1\.0\.0 \(catalog has 2\.1\.0\)/);
	assert.match(renderHealth(computeHealth(validCatalog(), [], { today: TODAY }), { catalogPath: "c", specsDir: "s" }), /n\/a \(no work items\)/);
});

test("CLI reports on a specs directory, ignores other folders, and honours --strict", async () => {
	const root = await mkdtemp(join(tmpdir(), "forge-health-"));
	const specs = join(root, "specs");
	const catalog = join(root, "catalog.json");
	await writeFile(catalog, JSON.stringify(validCatalog()));
	for (const [name, content] of [
		["issue-2", makeThink({ bindings: "- **forge/rbac-service@2.0.0:** Composed." })],
		["issue-10", validThink],
	]) {
		await mkdir(join(specs, name), { recursive: true });
		await writeFile(join(specs, name, "think.md"), content);
	}
	await mkdir(join(specs, "issue-3"));
	await mkdir(join(specs, "triage"));

	const writes = [];
	const out = process.stdout.write.bind(process.stdout);
	const { log, error } = console;
	process.stdout.write = (chunk) => (writes.push(String(chunk)), true);
	console.log = console.error = () => {};
	try {
		assert.equal(await runHealth(["--specs", specs, "--catalog", catalog, "--today", TODAY]), 0);
		const report = writes.join("");
		assert.match(report, /2 work item\(s\)/);
		assert.ok(report.indexOf("issue-2: forge/rbac-service@2.0.0") > -1);
		assert.equal(await runHealth(["--specs", specs, "--catalog", catalog, "--today", TODAY, "--strict"]), 1);
		assert.equal(await runHealth(["--specs", specs, "--catalog", catalog, "--today", TODAY, "--stale-days", "30", "--strict"]), 1);
		assert.equal(await runHealth(["--specs", specs], { FORGE_CATALOG: catalog }), 0);
		assert.equal(await runHealth(["--specs", join(root, "nope"), "--catalog", catalog]), 1);
		assert.equal(await runHealth(["--catalog", catalog]), 1);
		assert.equal(await runHealth(["--specs", specs, "--catalog", catalog, "--stale-days", "0"]), 1);
		assert.equal(await runHealth(["--specs", specs, "--catalog", catalog, "--today", "soon"]), 1);
		assert.equal(await runHealth(["--specs", specs, "--catalog", join(root, "missing.json")]), 1);
		assert.equal(await runHealth(["--help"]), 0);
		assert.equal(await runHealth(["--wat"]), 1);
		await writeFile(join(specs, "issue-2", "think.md"), validThink);
		assert.equal(await runHealth(["--specs", specs, "--catalog", catalog, "--today", TODAY, "--strict"]), 0);
	} finally {
		process.stdout.write = out;
		Object.assign(console, { log, error });
	}
});
