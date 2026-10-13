import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bundledCatalogPath, loadCatalog } from "./catalog-lib.mjs";
import { discover, renderDiscovery, runDiscover, tokenize } from "./discover.mjs";
import { TODAY, validCatalog } from "./forge-fixture.mjs";

test("tokenizes to lowercase stems without stopwords", () => {
	assert.deepEqual(tokenize("The Sessions of our users, with JWT & policies!"), ["session", "user", "jwt", "policy"]);
	assert.deepEqual(tokenize("2FA for a BFF"), ["2fa", "bff"]);
	assert.deepEqual(tokenize(""), []);
	assert.deepEqual(tokenize(null), []);
	assert.deepEqual(tokenize("access status bus"), ["access", "status", "bus"]);
});

test("ranks the asset that covers the need first and explains the match", () => {
	const result = discover(validCatalog(), "send an email notification when a role is created", { today: TODAY });
	assert.deepEqual(result.terms, ["send", "email", "notification", "when", "role", "created"]);
	assert.equal(result.candidates[0].id, "notify-lib");
	assert.ok(result.candidates[0].matchedTerms.includes("email"));
	assert.deepEqual(result.candidates.map((c) => c.id), ["notify-lib", "rbac-service"]);
	assert.equal(result.candidates[1].matchedTerms.join(), "role");
	const first = result.candidates[0];
	assert.equal(first.status, "active");
	assert.equal(first.version, "0.9.0");
	assert.equal(first.maturity, "beta");
	assert.equal(first.interface.docs, "https://forge.example.com/notify");
	assert.deepEqual(first.composesWith, []);
});

test("is deterministic and field-weighted", () => {
	const a = discover(validCatalog(), "role permission authorization", { today: TODAY });
	const b = discover(validCatalog(), "role permission authorization", { today: TODAY });
	assert.deepEqual(a, b);
	const byName = discover(validCatalog(), "notify", { today: TODAY }).candidates[0];
	assert.equal(byName.id, "notify-lib");
	assert.deepEqual(byName.matchedFields, ["name"]);
});

test("breaks score ties by id", () => {
	const catalog = validCatalog();
	catalog.assets[1] = { ...structuredClone(catalog.assets[0]), id: "another-rbac", composesWith: [] };
	const ids = discover(catalog, "rbac", { today: TODAY }).candidates.map((c) => c.id);
	assert.deepEqual(ids, ["another-rbac", "rbac-service"]);
});

test("filters by kind and limits results", () => {
	assert.deepEqual(discover(validCatalog(), "role email", { kind: "library", today: TODAY }).candidates.map((c) => c.id), ["notify-lib"]);
	assert.equal(discover(validCatalog(), "role email", { limit: 1, today: TODAY }).candidates.length, 1);
	assert.equal(discover(validCatalog(), "role", { kind: "template", today: TODAY }).searched, 0);
});

test("excludes removed assets and flags deprecated ones with their replacement", () => {
	const catalog = validCatalog();
	catalog.assets[1].status = "deprecated";
	catalog.assets[1].replacement = "rbac-service";
	catalog.assets[1].removalDate = "2026-12-31";
	const deprecated = discover(catalog, "email", { today: TODAY }).candidates[0];
	assert.equal(deprecated.deprecated, true);
	assert.equal(deprecated.replacement, "rbac-service");
	assert.equal(deprecated.removalDate, "2026-12-31");
	assert.match(renderDiscovery("email", { terms: ["email"], searched: 2, candidates: [deprecated] }, "c.json"), /DEPRECATED: use rbac-service, removal 2026-12-31/);

	catalog.assets[1].status = "removed";
	catalog.assets[1].removalDate = "2026-10-01";
	const result = discover(catalog, "email", { today: TODAY });
	assert.equal(result.searched, 1);
	assert.deepEqual(result.candidates, []);
});

test("returns no candidates for an unrelated need", () => {
	const result = discover(validCatalog(), "resize product photos", { today: TODAY });
	assert.deepEqual(result.candidates, []);
	assert.match(renderDiscovery("resize product photos", result, "c.json"), /No Forge asset matches/);
	assert.deepEqual(discover({ assets: [] }, "role").candidates, []);
	assert.deepEqual(discover(validCatalog(), "the and of").candidates, []);
});

test("the bundled seed finds Gatelin for sessions and Foxnox for account security", async () => {
	const catalog = await loadCatalog(bundledCatalogPath());
	assert.equal(discover(catalog, "JWT sessions and role based access control for the API", { today: TODAY }).candidates[0].id, "gatelin");
	assert.equal(discover(catalog, "password reset and TOTP two-factor authentication", { today: TODAY }).candidates[0].id, "foxnox");
	assert.equal(discover(catalog, "backend for frontend proxy", { today: TODAY }).candidates[0].id, "gatelin");
	assert.deepEqual(discover(catalog, "video transcoding pipeline", { today: TODAY }).candidates, []);
});

test("CLI prints text and JSON and rejects bad arguments", async () => {
	const root = await mkdtemp(join(tmpdir(), "forge-discover-"));
	const catalog = join(root, "catalog.json");
	await writeFile(catalog, JSON.stringify(validCatalog()));

	const writes = [];
	const out = process.stdout.write.bind(process.stdout);
	const { log, error } = console;
	process.stdout.write = (chunk) => (writes.push(String(chunk)), true);
	console.log = (line) => writes.push(`${line}\n`);
	console.error = () => {};
	try {
		assert.equal(await runDiscover(["--need", "email notification", "--catalog", catalog]), 0);
		assert.match(writes.join(""), /1\. notify-lib/);
		writes.length = 0;
		assert.equal(await runDiscover(["--need", "role", "--catalog", catalog, "--json", "--limit", "1"]), 0);
		const json = JSON.parse(writes.join(""));
		assert.equal(json.candidates[0].id, "rbac-service");
		assert.equal(await runDiscover(["--need", "role"], { FORGE_CATALOG: catalog }), 0);
		assert.equal(await runDiscover(["--catalog", catalog]), 1);
		assert.equal(await runDiscover(["--need", "the of", "--catalog", catalog]), 1);
		assert.equal(await runDiscover(["--need", "role", "--catalog", catalog, "--limit", "0"]), 1);
		assert.equal(await runDiscover(["--need", "role", "--catalog", catalog, "--kind", "service"]), 1);
		assert.equal(await runDiscover(["--need", "role", "--catalog", catalog, "--today", "soon"]), 1);
		assert.equal(await runDiscover(["--need", "role", "--catalog", join(root, "missing.json")]), 1);
		assert.equal(await runDiscover(["--help"]), 0);
		assert.equal(await runDiscover(["--wat"]), 1);
	} finally {
		process.stdout.write = out;
		Object.assign(console, { log, error });
	}
});
