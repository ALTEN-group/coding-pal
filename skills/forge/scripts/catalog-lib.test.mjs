import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	ForgeError,
	bundledCatalogPath,
	compareVersions,
	daysBetween,
	effectiveStatus,
	isIsoDate,
	loadCatalog,
	parseArgs,
	parseSemver,
	resolveCatalogPath,
} from "./catalog-lib.mjs";

test("catalog resolution order is flag, environment, bundled", () => {
	assert.equal(resolveCatalogPath("a.json", { FORGE_CATALOG: "b.json" }), "a.json");
	assert.equal(resolveCatalogPath(null, { FORGE_CATALOG: "b.json" }), "b.json");
	assert.equal(resolveCatalogPath(undefined, {}), bundledCatalogPath());
	assert.match(bundledCatalogPath(), /skills[\\/]forge[\\/]catalog\.json$/);
});

test("loads the catalog and reports unreadable, invalid, and malformed files", async () => {
	const root = await mkdtemp(join(tmpdir(), "forge-lib-"));
	await writeFile(join(root, "ok.json"), JSON.stringify({ version: 1, assets: [] }));
	await writeFile(join(root, "bad.json"), "{ nope");
	await writeFile(join(root, "shape.json"), JSON.stringify({ version: 1 }));
	assert.deepEqual((await loadCatalog(join(root, "ok.json"))).assets, []);
	await assert.rejects(loadCatalog(join(root, "missing.json")), (err) => err instanceof ForgeError && /not found/.test(err.message));
	await assert.rejects(loadCatalog(join(root, "bad.json")), /not valid JSON/);
	await assert.rejects(loadCatalog(join(root, "shape.json")), /"assets" array/);
});

test("compares semantic versions including prerelease precedence", () => {
	assert.ok(compareVersions("1.2.0", "1.10.0") < 0);
	assert.ok(compareVersions("1.0.0", "1.0.0-rc.1") > 0);
	assert.ok(compareVersions("0.1.0-alpha.9", "0.1.0-alpha.10") < 0);
	assert.ok(compareVersions("0.1.0-alpha.3", "0.1.0-beta") < 0);
	assert.ok(compareVersions("1.0.0-alpha", "1.0.0-alpha.1") < 0);
	assert.ok(compareVersions("1.0.0-1", "1.0.0-alpha") < 0);
	assert.equal(compareVersions("1.0.0+build.5", "1.0.0"), 0);
	assert.equal(parseSemver("2.1"), null);
	assert.equal(parseSemver("01.0.0"), null);
	assert.throws(() => compareVersions("2.1", "1.0.0"), ForgeError);
});

test("validates ISO dates and measures days", () => {
	assert.equal(isIsoDate("2026-10-13"), true);
	assert.equal(isIsoDate("2026-02-30"), false);
	assert.equal(isIsoDate("13/10/2026"), false);
	assert.equal(isIsoDate(null), false);
	assert.equal(daysBetween("2026-10-01", "2026-10-13"), 12);
});

test("a past removal date makes an asset removed", () => {
	assert.equal(effectiveStatus({ status: "deprecated", removalDate: "2026-10-12" }, "2026-10-13"), "removed");
	assert.equal(effectiveStatus({ status: "deprecated", removalDate: "2026-12-01" }, "2026-10-13"), "deprecated");
	assert.equal(effectiveStatus({ status: "removed", removalDate: null }, "2026-10-13"), "removed");
	assert.equal(effectiveStatus({ status: "active", removalDate: null }, "2026-10-13"), "active");
});

test("parses flags and reports problems", () => {
	const parsed = parseArgs(["--need", "x", "--json", "--stale-days", "9"], { values: ["--need", "--stale-days"], booleans: ["--json"] });
	assert.equal(parsed.need, "x");
	assert.equal(parsed.json, true);
	assert.equal(parsed.staleDays, "9");
	assert.deepEqual(parsed.problems, []);
	assert.match(parseArgs(["--need"], { values: ["--need"] }).problems[0], /needs a value/);
	assert.match(parseArgs(["--wat"], {}).problems[0], /Unknown argument/);
	assert.equal(parseArgs(["-h"], {}).help, true);
});
