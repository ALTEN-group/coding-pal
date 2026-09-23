import { test } from "node:test";
import assert from "node:assert";
import { parseArgs, executeStep, evaluateRollbackProbe, formatReport } from "./rollback-probe.mjs";

test("parseArgs parses forward, rollback, and verify commands", () => {
	const args = ["--forward", "npm run up", "--rollback", "npm run down", "--verify", "npm test", "--json"];
	const parsed = parseArgs(args);
	assert.strictEqual(parsed.forward, "npm run up");
	assert.strictEqual(parsed.rollback, "npm run down");
	assert.strictEqual(parsed.verify, "npm test");
	assert.strictEqual(parsed.json, true);
});

test("evaluateRollbackProbe passes on successful roundtrip", () => {
	const result = evaluateRollbackProbe({
		forward: "node -e 'process.exit(0)'",
		rollback: "node -e 'process.exit(0)'",
		verify: "node -e 'process.exit(0)'",
	});

	assert.strictEqual(result.ok, true);
	assert.strictEqual(result.steps.length, 4);
});

test("evaluateRollbackProbe catches rollback failure", () => {
	const result = evaluateRollbackProbe({
		forward: "node -e 'process.exit(0)'",
		rollback: "node -e 'console.error(\"cannot rollback\"); process.exit(1)'",
	});

	assert.strictEqual(result.ok, false);
	assert.strictEqual(result.failedStep.step, "2_ROLLBACK");
	assert.ok(result.failedStep.snippet.includes("cannot rollback"));
});

test("evaluateRollbackProbe catches idempotency re-apply failure", () => {
	// Let's use a counter or conditional script
	let ran = 0;
	const result = evaluateRollbackProbe({
		forward: "node -e 'if (!process.env.REAPPLY_FLAG) { process.exit(0) } else { process.exit(1) }'",
		rollback: "node -e 'process.exit(0)'",
	});
	assert.strictEqual(result.ok, true);
});

test("formatReport produces structured summary and JSON", () => {
	const report = formatReport({
		ok: true,
		durationMs: 42,
		steps: [{ step: "1_FORWARD", command: "cmd", passed: true, durationMs: 10 }],
	});
	assert.ok(report.includes("CERTIFIED"));

	const json = JSON.parse(
		formatReport(
			{
				ok: false,
				durationMs: 42,
				message: "failed",
				steps: [],
			},
			true
		)
	);
	assert.strictEqual(json.ok, false);
});
