import { test } from "node:test";
import assert from "node:assert";
import { parseArgs, maskSecret, scanLines, formatReport } from "./secret-guard.mjs";

test("parseArgs parses flags and files accurately", () => {
	const args = ["--git", "--file", "src/auth.js", "--file", "src/db.js", "--json"];
	const parsed = parseArgs(args);
	assert.strictEqual(parsed.useGit, true);
	assert.deepStrictEqual(parsed.files, ["src/auth.js", "src/db.js"]);
	assert.strictEqual(parsed.json, true);
});

test("maskSecret obfuscates sensitive strings", () => {
	const masked = maskSecret("AKIAIOSFODNN7EXAMPLE");
	assert.strictEqual(masked.startsWith("AKIA"), true);
	assert.strictEqual(masked.endsWith("MPLE"), true);
	assert.ok(masked.includes("****"));
});

test("scanLines detects AWS keys and generic token assignments", () => {
	const targets = [
		{ file: "test.js", lineNum: 1, content: "const clean = 'safe_string';" },
		{ file: "test.js", lineNum: 2, content: "const awsKey = 'AKIAIOSFODNN7EXAMPLE';" },
		{ file: "test.js", lineNum: 3, content: "const apiKey = 'sk_live_1234567890abcdef123456';" },
	];

	const violations = scanLines(targets);
	assert.strictEqual(violations.length, 2);
	assert.strictEqual(violations[0].ruleId, "AWS_ACCESS_KEY");
	assert.strictEqual(violations[1].ruleId, "HARDCODED_CREDENTIAL_ASSIGNMENT");
});

test("scanLines detects private keys and GitHub tokens", () => {
	const targets = [
		{ file: "key.pem", lineNum: 1, content: "-----BEGIN RSA PRIVATE KEY-----" },
		{ file: "gh.js", lineNum: 10, content: "const token = 'ghp_123456789012345678901234567890123456';" },
	];

	const violations = scanLines(targets);
	assert.strictEqual(violations.length, 2);
	assert.strictEqual(violations[0].ruleId, "PRIVATE_KEY_BLOCK");
	assert.strictEqual(violations[1].ruleId, "GITHUB_TOKEN");
});

test("formatReport produces clean passing and failing summaries", () => {
	const pass = { ok: true, violations: [], summary: { linesChecked: 5 } };
	assert.ok(formatReport(pass, false).includes("Passed"));

	const fail = {
		ok: false,
		violations: [{ ruleId: "AWS_ACCESS_KEY", message: "Found key", maskedSnippet: "AKIA****" }],
		summary: { linesChecked: 5 },
	};
	assert.ok(formatReport(fail, false).includes("Failed"));
});
