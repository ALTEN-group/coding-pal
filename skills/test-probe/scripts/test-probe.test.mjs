import { test } from "node:test";
import assert from "node:assert";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, evaluateProbe } from "./test-probe.mjs";

test("parseArgs parses test-cmd and sources accurately", () => {
	const args = ["--test-cmd", "npm test", "--source", "src/a.js", "--source", "src/b.js", "--json"];
	const parsed = parseArgs(args);
	assert.strictEqual(parsed.testCmd, "npm test");
	assert.deepStrictEqual(parsed.sources, ["src/a.js", "src/b.js"]);
	assert.strictEqual(parsed.json, true);
});

test("evaluateProbe approves genuinely falsifiable tests", () => {
	const tempFile = resolve("temp-service.tmp.js");
	writeFileSync(tempFile, "const value = 'fixed';", "utf-8");

	try {
		// Test command checks if the file has 'fixed'
		const testCmd = `node -e "if (!require('node:fs').readFileSync('${tempFile}', 'utf-8').includes('fixed')) process.exit(1)"`;

		const result = evaluateProbe({
			testCmd,
			sources: [tempFile],
			getUnpatchedContent: () => "const value = 'broken';",
		});

		assert.strictEqual(result.ok, true);
		assert.strictEqual(result.type, "FALSIFIABLE_TEST_VERIFIED");
		// Ensure file was restored
		assert.strictEqual(readFileSync(tempFile, "utf-8"), "const value = 'fixed';");
	} finally {
		unlinkSync(tempFile);
	}
});

test("evaluateProbe rejects tautological tests that pass without the fix", () => {
	const tempFile = resolve("temp-service.tmp.js");
	writeFileSync(tempFile, "const value = 'fixed';", "utf-8");

	try {
		// Vacuous test command: passes unconditionally
		const testCmd = `node -e "process.exit(0)"`;

		const result = evaluateProbe({
			testCmd,
			sources: [tempFile],
			getUnpatchedContent: () => "const value = 'broken';",
		});

		assert.strictEqual(result.ok, false);
		assert.strictEqual(result.type, "TAUTOLOGICAL_TEST_DETECTED");
		// Ensure file was restored
		assert.strictEqual(readFileSync(tempFile, "utf-8"), "const value = 'fixed';");
	} finally {
		unlinkSync(tempFile);
	}
});

test("evaluateProbe aborts early if base test fails", () => {
	const tempFile = resolve("temp-service.tmp.js");
	writeFileSync(tempFile, "const value = 'fixed';", "utf-8");

	try {
		const testCmd = `node -e "process.exit(1)"`;

		const result = evaluateProbe({
			testCmd,
			sources: [tempFile],
			getUnpatchedContent: () => "const value = 'broken';",
		});

		assert.strictEqual(result.ok, false);
		assert.strictEqual(result.type, "BASE_TEST_FAILED");
	} finally {
		unlinkSync(tempFile);
	}
});
