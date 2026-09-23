import test from "node:test";
import assert from "node:assert/strict";
import {
	matchPath,
	parseNumstat,
	evaluateScope,
	main,
} from "./scope-guard.mjs";

test("matchPath accurately matches exact, prefix, and wildcard patterns", () => {
	// Exact matches
	assert.equal(matchPath("src/index.js", "src/index.js"), true);
	assert.equal(matchPath("./src/index.js", "src/index.js"), true);
	assert.equal(matchPath("src/index.js", "src/other.js"), false);

	// Directory prefixes
	assert.equal(matchPath("src/auth/login.js", "src/auth"), true);
	assert.equal(matchPath("src/auth/login.js", "src/auth/"), true);
	assert.equal(matchPath("src/auth-helpers/login.js", "src/auth"), false);

	// Wildcards
	assert.equal(matchPath("package-lock.json", "*-lock.json"), true);
	assert.equal(matchPath("yarn.lock", "*.lock"), true);
	assert.equal(matchPath(".env.local", ".env*"), true);
	assert.equal(matchPath("services/.env.production", "**/.env*"), true);

	// Globstars
	assert.equal(matchPath("src/api/v1/users.ts", "src/**/*.ts"), true);
	assert.equal(matchPath("src/api/v1/users.js", "src/**/*.ts"), false);
});

test("parseNumstat extracts additions, deletions, and filenames", () => {
	const raw = `10\t5\tsrc/auth.js\n-\t-\tassets/logo.png\n2\t1\tsrc/{old => new}/service.js`;
	const stats = parseNumstat(raw);

	assert.equal(stats.length, 3);
	assert.deepEqual(stats[0], {
		file: "src/auth.js",
		additions: 10,
		deletions: 5,
	});
	assert.deepEqual(stats[1], {
		file: "assets/logo.png",
		additions: 0,
		deletions: 0,
	});
	assert.deepEqual(stats[2], {
		file: "src/new/service.js",
		additions: 2,
		deletions: 1,
	});
});

test("evaluateScope permits valid changes within allowed paths", () => {
	const result = evaluateScope({
		files: ["src/auth/service.js", "src/auth/types.ts"],
		diffStats: [
			{ file: "src/auth/service.js", additions: 25, deletions: 10 },
			{ file: "src/auth/types.ts", additions: 5, deletions: 0 },
		],
		allowedPaths: ["src/auth/**"],
		forbiddenPaths: ["*.lock", ".env*"],
		maxAdditions: 50,
		maxDeletions: 20,
	});

	assert.equal(result.ok, true);
	assert.equal(result.violations.length, 0);
	assert.equal(result.summary.filesChecked, 2);
	assert.equal(result.summary.totalAdditions, 30);
	assert.equal(result.summary.totalDeletions, 10);
});

test("evaluateScope rejects modifications outside allowed scopes", () => {
	const result = evaluateScope({
		files: ["src/auth/service.js", "src/billing/payment.js"],
		allowedPaths: ["src/auth/**"],
	});

	assert.equal(result.ok, false);
	assert.equal(result.violations.length, 1);
	assert.equal(result.violations[0].type, "OUT_OF_SCOPE");
	assert.equal(result.violations[0].file, "src/billing/payment.js");
});

test("evaluateScope rejects modifications to forbidden files even if inside allowed scope", () => {
	const result = evaluateScope({
		files: ["src/config/.env.local", "src/config/config.json"],
		allowedPaths: ["src/config/**"],
		forbiddenPaths: ["**/.env*", "*.lock"],
	});

	assert.equal(result.ok, false);
	assert.equal(result.violations.length, 1);
	assert.equal(result.violations[0].type, "FORBIDDEN_PATH");
	assert.equal(result.violations[0].file, "src/config/.env.local");
});

test("evaluateScope enforces churn limits on additions and deletions", () => {
	const result = evaluateScope({
		files: ["src/index.js"],
		diffStats: [{ file: "src/index.js", additions: 150, deletions: 80 }],
		allowedPaths: ["src/**"],
		maxAdditions: 100,
		maxDeletions: 50,
	});

	assert.equal(result.ok, false);
	assert.equal(result.violations.length, 2);
	assert.equal(result.violations[0].type, "EXCESSIVE_ADDITIONS");
	assert.equal(result.violations[1].type, "EXCESSIVE_DELETIONS");
});

test("main() CLI exits 0 on valid inputs and 1 on violations", async () => {
	// Valid files check
	const passCode = await main([
		"--scope", "src/**",
		"--file", "src/app.js",
		"--json",
	]);
	assert.equal(passCode, 0);

	// Scope breach check
	const failCode = await main([
		"--scope", "src/auth/**",
		"--file", "src/billing/invoice.js",
		"--json",
	]);
	assert.equal(failCode, 1);

	// Forbidden file check
	const forbiddenCode = await main([
		"--file", "package-lock.json",
		"--json",
	]);
	assert.equal(forbiddenCode, 1);
});
