import { test } from "node:test";
import assert from "node:assert";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, executeStage, runGate, formatReport, main } from "./task-gate.mjs";

test("parseArgs parses stages and flags accurately", () => {
	const args = ["--stage", "lint:node -v", "--stage", "test:npm test", "--no-fail-fast", "--json"];
	const parsed = parseArgs(args);
	assert.strictEqual(parsed.stages.length, 2);
	assert.strictEqual(parsed.stages[0].name, "lint");
	assert.strictEqual(parsed.stages[0].command, "node -v");
	assert.strictEqual(parsed.stages[1].name, "test");
	assert.strictEqual(parsed.failFast, false);
	assert.strictEqual(parsed.json, true);
});

test("executeStage executes shell command and captures exit code", () => {
	const passing = executeStage({ name: "echo_test", command: "node -e 'console.log(\"ok\")'" });
	assert.strictEqual(passing.passed, true);
	assert.strictEqual(passing.exitCode, 0);
	assert.strictEqual(passing.errorSnippet, null);

	const failing = executeStage({ name: "fail_test", command: "node -e 'console.error(\"boom\"); process.exit(1)'" });
	assert.strictEqual(failing.passed, false);
	assert.strictEqual(failing.exitCode, 1);
	assert.ok(failing.errorSnippet.includes("boom"));
});

test("runGate evaluates multiple stages and stops on failure when failFast is true", () => {
	const config = {
		name: "test-pipeline",
		failFast: true,
		stages: [
			{ name: "stage1", command: "node -e 'process.exit(0)'" },
			{ name: "stage2", command: "node -e 'console.error(\"fatal err\"); process.exit(1)'" },
			{ name: "stage3", command: "node -e 'process.exit(0)'" },
		],
	};

	const result = runGate(config);
	assert.strictEqual(result.ok, false);
	assert.strictEqual(result.stages.length, 2); // Stage 3 skipped because failFast is true
	assert.strictEqual(result.failedStage.name, "stage2");
	assert.ok(result.failedStage.errorSnippet.includes("fatal err"));
});

test("formatReport produces structured text and JSON diagnostics", () => {
	const mockResult = {
		ok: false,
		name: "diagnostics-test",
		durationMs: 50,
		failedStage: {
			name: "test-stage",
			command: "run-test",
			exitCode: 1,
			errorSnippet: "TypeError: null is not an object",
		},
		stages: [
			{ name: "test-stage", command: "run-test", status: "failed", exitCode: 1, durationMs: 50, errorSnippet: "TypeError: null is not an object" },
		],
	};

	const textReport = formatReport(mockResult, false);
	assert.ok(textReport.includes("Task Gate: diagnostics-test (FAILED)"));
	assert.ok(textReport.includes("TypeError: null is not an object"));

	const jsonReport = JSON.parse(formatReport(mockResult, true));
	assert.strictEqual(jsonReport.ok, false);
	assert.strictEqual(jsonReport.failedStage.name, "test-stage");
});

test("main() CLI exits with code 0 on success and 1 on failure", () => {
	const passExit = main(["--stage", "check:node -e 'process.exit(0)'", "--json"]);
	assert.strictEqual(passExit, 0);

	const failExit = main(["--stage", "check:node -e 'process.exit(1)'", "--json"]);
	assert.strictEqual(failExit, 1);

	const usageExit = main([]);
	assert.strictEqual(usageExit, 2);
});
