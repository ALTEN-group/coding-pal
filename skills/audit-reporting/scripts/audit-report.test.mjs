import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditReportError, normalizeAuditReport } from "./audit-report.mjs";

const validReport = `CLI preamble ignored
<!-- AUDIT-REPORT:START -->
## Executive Summary

Two concrete issues require action.

## Critical

### Unsafe query
- **Location:** \`src/db.js:20\`
- **Category:** Security
- **Evidence:** User input is concatenated into a SQL statement.
- **Impact:** An attacker can alter the executed query.
- **Recommendation:** Replace interpolation with a parameterized query at this call site.

## Important

### Missing timeout
- **Location:** \`src/client.js:8\`
- **Category:** Reliability
- **Evidence:** The outbound request has no timeout or abort signal.
- **Impact:** A stalled dependency can retain resources indefinitely.
- **Recommendation:** Add a bounded timeout and handle abort errors.

## Suggestions

_No findings._
<!-- AUDIT-REPORT:END -->
CLI footer ignored`;

test("normalizes ordering, identifiers, and counts deterministically", () => {
	const options = { scopes: ["src", "db/liquibase"] };
	const normalized = normalizeAuditReport(validReport, options);
	assert.match(normalized, /## Critical \(1\)/);
	assert.match(normalized, /### AUDIT-001: Unsafe query/);
	assert.match(normalized, /## Important \(1\)/);
	assert.match(normalized, /### AUDIT-002: Missing timeout/);
	assert.equal(normalizeAuditReport(normalized, options), normalized);
});

test("accepts an explicit empty report", () => {
	const input = `<!-- AUDIT-REPORT:START -->
## Executive Summary

No actionable findings were identified in the audited scope.

## Critical

_No findings._

## Important

_No findings._

## Suggestions

_No findings._
<!-- AUDIT-REPORT:END -->`;
	const normalized = normalizeAuditReport(input, { scopes: ["src"] });
	assert.match(normalized, /## Critical \(0\)\n\n_No findings\._/);
});

test("rejects findings outside configured scopes", () => {
	const outsideScope = validReport.replace("src/db.js:20", "tests/db.test.js:20");
	assert.throws(
		() => normalizeAuditReport(outsideScope, { scopes: ["src", "db/liquibase"] }),
		(error) => error instanceof AuditReportError && /outside configured scopes/.test(error.message),
	);
});

test("rejects missing evidence", () => {
	const missingEvidence = validReport.replace("- **Evidence:** User input is concatenated into a SQL statement.\n", "");
	assert.throws(
		() => normalizeAuditReport(missingEvidence, { scopes: ["src"] }),
		(error) => error instanceof AuditReportError && /missing Evidence/.test(error.message),
	);
});

test("rejects duplicate findings", () => {
	const duplicateFinding = `### Unsafe query
- **Location:** \`src/db.js:20\`
- **Category:** Security
- **Evidence:** User input is concatenated into a SQL statement.
- **Impact:** An attacker can alter the executed query.
- **Recommendation:** Replace interpolation with a parameterized query at this call site.`;
	const duplicate = validReport.replace("\n\n## Important", `\n\n${duplicateFinding}\n\n## Important`);
	assert.throws(
		() => normalizeAuditReport(duplicate, { scopes: ["src"] }),
		(error) => error instanceof AuditReportError && /duplicate finding/.test(error.message),
	);
});

test("rejects missing markers and reordered sections", () => {
	assert.throws(() => normalizeAuditReport(validReport.replace("<!-- AUDIT-REPORT:END -->", "")), /report markers/);
	const reordered = validReport
		.replace("## Critical", "## TEMP")
		.replace("## Important", "## Critical")
		.replace("## TEMP", "## Important");
	assert.throws(() => normalizeAuditReport(reordered), /plain-text headings/);
});

test("rejects reordered finding fields", () => {
	const reordered = validReport.replace(
		"- **Location:** `src/db.js:20`\n- **Category:** Security",
		"- **Category:** Security\n- **Location:** `src/db.js:20`",
	);
	assert.throws(() => normalizeAuditReport(reordered, { scopes: ["src"] }), /duplicated or reordered/);
});

test("rejects reports larger than 60 KiB", () => {
	assert.throws(() => normalizeAuditReport(`${validReport}${"x".repeat(60 * 1024)}`), /exceeds 60 KiB/);
});
