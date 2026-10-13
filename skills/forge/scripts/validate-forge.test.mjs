import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bundledCatalogPath } from "./catalog-lib.mjs";
import { TODAY, validCatalog } from "./forge-fixture.mjs";
import { runValidator, validateCatalog } from "./validate-forge.mjs";

const check = (mutate) => {
	const catalog = validCatalog();
	mutate(catalog);
	return validateCatalog(catalog, { today: TODAY });
};
const rejects = (mutate, pattern) => {
	const { errors } = check(mutate);
	assert.ok(errors.some((e) => pattern.test(e)), `expected ${pattern}, got: ${errors.join(" | ") || "no errors"}`);
};

test("accepts a valid catalog", () => {
	assert.deepEqual(validateCatalog(validCatalog(), { today: TODAY }), { errors: [], warnings: [] });
});

test("rejects a wrong catalog version, non-object catalogs, and a missing assets array", () => {
	rejects((c) => (c.version = 2), /version must be 1/);
	assert.match(validateCatalog([], { today: TODAY }).errors[0], /JSON object/);
	assert.match(validateCatalog({ version: 1 }, { today: TODAY }).errors.join(), /"assets" must be an array/);
});

test("rejects duplicate ids, malformed ids, and non-object assets", () => {
	rejects((c) => (c.assets[1].id = "rbac-service"), /rbac-service: duplicate id/);
	rejects((c) => (c.assets[1].id = "Notify Lib"), /assets\[1\]: id must be/);
	rejects((c) => (c.assets[1] = "nope"), /assets\[1\]: must be an object/);
});

test("enforces kind, maturity, status, and unknown fields", () => {
	rejects((c) => (c.assets[0].kind = "service"), /kind must be one of/);
	rejects((c) => (c.assets[0].maturity = "gamma"), /maturity must be one of/);
	rejects((c) => (c.assets[0].status = "retired"), /status must be one of/);
	rejects((c) => (c.assets[0].extra = 1), /unknown field "extra"/);
	rejects((c) => (c.assets[0].interface.extra = 1), /unknown interface field/);
});

test("requires name, summary, capabilities, keywords, license", () => {
	rejects((c) => delete c.assets[0].name, /name is required/);
	rejects((c) => (c.assets[0].summary = " "), /summary is required/);
	rejects((c) => (c.assets[0].capabilities = []), /capabilities/);
	rejects((c) => (c.assets[0].keywords = [""]), /keywords/);
	rejects((c) => delete c.assets[0].license, /license is required/);
});

test("checks the version string and the release date", () => {
	rejects((c) => (c.assets[0].version = "2.1"), /not a semantic version/);
	rejects((c) => (c.assets[0].version = "v2.1.0"), /not a semantic version/);
	rejects((c) => (c.assets[0].releasedAt = "07/09/2026"), /releasedAt must be an ISO date/);
	rejects((c) => (c.assets[0].releasedAt = "2026-10-14"), /in the future/);
	rejects((c) => (c.assets[0].version = "2.1.0-rc.1"), /maturity stable needs/);
	rejects((c) => (c.assets[0].version = "0.9.0"), /maturity stable needs/);
	const prerelease = check((c) => {
		c.assets[0].version = "0.1.0-alpha.9";
		c.assets[0].maturity = "alpha";
	});
	assert.deepEqual(prerelease.errors, []);
});

test("requires https URLs", () => {
	rejects((c) => (c.assets[0].docs = "http://forge.example.com"), /docs must be an https URL/);
	rejects((c) => (c.assets[0].repository = "github.com/x/y"), /repository must be an https URL/);
	rejects((c) => (c.assets[0].interface.docs = "ftp://x"), /interface.docs must be an https URL/);
	rejects((c) => (c.assets[0].interface.integrationGuide = "http://x.example"), /integrationGuide must be an https URL/);
	rejects((c) => (c.assets[0].tests.ci = "http://ci.example"), /tests.ci must be an https URL/);
});

test("certifies interface, artifacts, tests, and owner", () => {
	rejects((c) => delete c.assets[0].interface, /interface is required/);
	rejects((c) => delete c.assets[0].interface.contract, /interface.contract is required/);
	rejects((c) => delete c.assets[0].interface.type, /interface.type is required/);
	rejects((c) => (c.assets[0].artifacts = []), /artifacts must list/);
	rejects((c) => (c.assets[0].artifacts = [{ type: "zip", ref: "x" }]), /artifact type must be one of/);
	rejects((c) => (c.assets[0].artifacts = [{ type: "docker-image" }]), /needs a ref/);
	rejects((c) => delete c.assets[0].tests, /tests must name/);
	rejects((c) => (c.assets[0].tests = { ci: "", coverage: "" }), /tests must name/);
	rejects((c) => (c.assets[0].owner = ""), /owner is required/);
	rejects((c) => delete c.assets[0].owner, /owner is required/);
});

test("warns when the integration guide is missing", () => {
	const { errors, warnings } = check((c) => delete c.assets[0].interface.integrationGuide);
	assert.deepEqual(errors, []);
	assert.match(warnings[0], /integrationGuide is missing/);
});

test("composesWith ids must exist and not point at the asset itself", () => {
	rejects((c) => (c.assets[0].composesWith = ["ghost"]), /unknown asset "ghost"/);
	rejects((c) => (c.assets[0].composesWith = ["rbac-service"]), /not list the asset itself/);
	rejects((c) => delete c.assets[0].composesWith, /composesWith must be a list/);
	const { warnings } = check((c) => {
		c.assets[1].status = "deprecated";
		c.assets[1].replacement = "rbac-service";
		c.assets[1].removalDate = "2026-12-31";
	});
	assert.match(warnings[0], /composesWith "notify-lib" is deprecated/);
});

test("active assets carry no replacement or removal date", () => {
	rejects((c) => (c.assets[0].replacement = "notify-lib"), /active asset has no replacement/);
	rejects((c) => (c.assets[0].removalDate = "2027-01-01"), /active asset has no replacement/);
});

test("deprecation needs a real replacement and a future removal date", () => {
	const deprecate = (c, patch) => {
		c.assets[1].status = "deprecated";
		Object.assign(c.assets[1], { replacement: "rbac-service", removalDate: "2026-12-31" }, patch);
	};
	assert.deepEqual(check((c) => deprecate(c, {})).errors, []);
	rejects((c) => deprecate(c, { replacement: null }), /deprecated needs a replacement/);
	rejects((c) => deprecate(c, { removalDate: null }), /deprecated needs a removalDate/);
	rejects((c) => deprecate(c, { replacement: "ghost" }), /replacement references unknown asset/);
	rejects((c) => deprecate(c, { replacement: "notify-lib" }), /replacement must not be the asset itself/);
	rejects((c) => deprecate(c, { removalDate: "2026-10-01" }), /has passed; set status removed/);
	rejects((c) => deprecate(c, { removalDate: "2026-09-15" }), /has passed|after releasedAt/);
	rejects((c) => deprecate(c, { removalDate: "soon" }), /removalDate must be an ISO date/);
	rejects((c) => {
		c.assets[0].status = "deprecated";
		c.assets[0].replacement = "notify-lib";
		c.assets[0].removalDate = "2026-12-31";
		c.assets[1].status = "deprecated";
		c.assets[1].replacement = "rbac-service";
		c.assets[1].removalDate = "2026-12-31";
	}, /replacement "notify-lib" is not active/);
});

test("a removed asset needs a removal date that has passed", () => {
	const remove = (c, patch) => {
		c.assets[1].status = "removed";
		Object.assign(c.assets[1], { removalDate: "2026-10-01" }, patch);
	};
	assert.deepEqual(check((c) => remove(c, {})).errors, []);
	rejects((c) => remove(c, { removalDate: null }), /removed needs a removalDate/);
	rejects((c) => remove(c, { removalDate: "2026-12-01" }), /in the future; keep status deprecated/);
	assert.deepEqual(check((c) => remove(c, { replacement: "rbac-service" })).errors, []);
	rejects((c) => remove(c, { replacement: "ghost" }), /replacement references unknown asset "ghost"/);
});

test("CLI validates a catalog file, the environment catalog, and the bundled seed", async () => {
	const root = await mkdtemp(join(tmpdir(), "forge-validate-"));
	const good = join(root, "good.json");
	const bad = join(root, "bad.json");
	await writeFile(good, JSON.stringify(validCatalog()));
	await writeFile(bad, JSON.stringify({ ...validCatalog(), version: 9 }));
	await writeFile(join(root, "garbage.json"), "not json");

	const quiet = async (fn) => {
		const { log, error, warn } = console;
		const lines = [];
		console.log = console.error = console.warn = (line) => lines.push(String(line));
		try {
			return [await fn(), lines];
		} finally {
			Object.assign(console, { log, error, warn });
		}
	};

	assert.equal((await quiet(() => runValidator(["--catalog", good, "--today", TODAY])))[0], 0);
	const [code, lines] = await quiet(() => runValidator(["--catalog", bad, "--today", TODAY]));
	assert.equal(code, 1);
	assert.match(lines.join("\n"), /version must be 1/);
	assert.equal((await quiet(() => runValidator([], { FORGE_CATALOG: good })))[0], 0);
	assert.equal((await quiet(() => runValidator(["--catalog", join(root, "garbage.json")])))[0], 1);
	assert.equal((await quiet(() => runValidator(["--catalog", join(root, "missing.json")])))[0], 1);
	assert.equal((await quiet(() => runValidator(["--catalog", good, "--today", "tomorrow"])))[0], 1);
	assert.equal((await quiet(() => runValidator(["--wat"])))[0], 1);
	assert.equal((await quiet(() => runValidator(["--help"])))[0], 0);
	assert.equal((await quiet(() => runValidator(["--catalog", bundledCatalogPath(), "--today", TODAY])))[0], 0);
});
