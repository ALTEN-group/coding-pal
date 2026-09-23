import { test } from "node:test";
import assert from "node:assert";
import { parseArgs, extractDeps, evaluateDependencies, formatReport } from "./dependency-guard.mjs";

test("parseArgs parses flags, allow lists, and banned lists accurately", () => {
	const args = ["--manifest", "other/package.json", "--git", "--allow", "zod,dotenv", "--banned", "axios,moment", "--json"];
	const parsed = parseArgs(args);
	assert.strictEqual(parsed.manifest, "other/package.json");
	assert.strictEqual(parsed.useGit, true);
	assert.ok(parsed.allow.has("zod"));
	assert.ok(parsed.allow.has("dotenv"));
	assert.ok(parsed.banned.has("axios"));
	assert.ok(parsed.banned.has("moment"));
	assert.strictEqual(parsed.json, true);
});

test("evaluateDependencies accepts manifests with no new or banned packages", () => {
	const current = {
		dependencies: { express: "^4.18.2" },
		devDependencies: { typescript: "^5.0.0" },
	};
	const baseline = {
		dependencies: { express: "^4.18.2" },
		devDependencies: { typescript: "^5.0.0" },
	};

	const result = evaluateDependencies({ currentManifest: current, baselineManifest: baseline });
	assert.strictEqual(result.ok, true);
	assert.strictEqual(result.violations.length, 0);
});

test("evaluateDependencies flags unauthorized new packages", () => {
	const current = {
		dependencies: { express: "^4.18.2", lodash: "^4.17.21" },
	};
	const baseline = {
		dependencies: { express: "^4.18.2" },
	};

	const result = evaluateDependencies({ currentManifest: current, baselineManifest: baseline });
	assert.strictEqual(result.ok, false);
	assert.strictEqual(result.violations.length, 1);
	assert.strictEqual(result.violations[0].type, "UNAUTHORIZED_NEW_DEPENDENCY");
	assert.strictEqual(result.violations[0].package, "lodash");

	// But permits if explicitly in allowed set
	const permitted = evaluateDependencies({
		currentManifest: current,
		baselineManifest: baseline,
		allowed: new Set(["lodash"]),
	});
	assert.strictEqual(permitted.ok, true);
});

test("evaluateDependencies rejects banned packages and loose versions", () => {
	const current = {
		dependencies: { moment: "^2.29.4", foo: "latest" },
	};

	const result = evaluateDependencies({
		currentManifest: current,
		banned: new Set(["moment"]),
	});

	assert.strictEqual(result.ok, false);
	assert.strictEqual(result.violations.length, 2);
	assert.strictEqual(result.violations[0].type, "BANNED_DEPENDENCY_DETECTED");
	assert.strictEqual(result.violations[0].package, "moment");
	assert.strictEqual(result.violations[1].type, "LOOSE_VERSION_SPECIFIED");
	assert.strictEqual(result.violations[1].package, "foo");
});
