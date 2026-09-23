import { test } from "node:test";
import assert from "node:assert";
import { parseArgs, validateArtifactContent, formatReport, main } from "./validate-contract.mjs";

test("validateArtifactContent approves fully compliant content", () => {
	const content = `<!-- START -->
# Title
## Context
- **Status:** ready
## Steps
All clear.
<!-- END -->`;

	const rules = {
		maxLines: 20,
		requiredMarkers: ["<!-- START -->", "<!-- END -->"],
		requiredHeadings: ["# Title", "## Context"],
		headingSequence: ["Context", "Steps"],
		requiredFields: ["- **Status:**"],
		forbiddenPatterns: ["TODO"],
	};

	const result = validateArtifactContent(content, rules);
	assert.strictEqual(result.ok, true);
	assert.strictEqual(result.violations.length, 0);
});

test("validateArtifactContent catches missing markers and forbidden patterns", () => {
	const content = `# Title
## Context
- **Status:** TODO later
## Steps`;

	const rules = {
		requiredMarkers: ["<!-- START -->"],
		forbiddenPatterns: ["TODO"],
	};

	const result = validateArtifactContent(content, rules);
	assert.strictEqual(result.ok, false);
	assert.strictEqual(result.violations.length, 2);
	assert.strictEqual(result.violations[0].type, "MISSING_REQUIRED_MARKER");
	assert.strictEqual(result.violations[1].type, "FORBIDDEN_PATTERN_DETECTED");
	assert.strictEqual(result.violations[1].line, 3);
});

test("validateArtifactContent catches out-of-sequence headings and line overflow", () => {
	const content = `## Steps
## Context
Extra line`;

	const rules = {
		maxLines: 2,
		headingSequence: ["Context", "Steps"],
	};

	const result = validateArtifactContent(content, rules);
	assert.strictEqual(result.ok, false);
	assert.strictEqual(result.violations.some((v) => v.type === "MAX_LINES_EXCEEDED"), true);
	assert.strictEqual(result.violations.some((v) => v.type === "OUT_OF_SEQUENCE_HEADING"), true);
});

test("formatReport prints clean message or structured JSON", () => {
	const pass = { ok: true, violations: [], summary: { linesChecked: 10 } };
	assert.ok(formatReport(pass, false).includes("Passed"));

	const fail = { ok: false, violations: [{ type: "ERR", message: "Missing item" }] };
	const json = JSON.parse(formatReport(fail, true));
	assert.strictEqual(json.ok, false);
});
