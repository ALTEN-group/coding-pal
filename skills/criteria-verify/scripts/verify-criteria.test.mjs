import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	VERDICTS,
	VerifyError,
	criteriaInText,
	evaluate,
	parseCriteria,
	parseJUnit,
	parseReport,
	parseTestPlan,
	renderTable,
	runVerifyCriteria,
	testPathOf,
} from "./verify-criteria.mjs";
import { jestJson, jestPass, junitPass, validPlan } from "./criteria-fixture.mjs";

const verdicts = (result) => Object.fromEntries(result.criteria.map((c) => [c.id, c.verdict]));

test("parses criteria and the test plan, ignoring fenced headings", () => {
	assert.deepEqual(parseCriteria(validPlan).map((c) => c.id), ["AC-1", "AC-2", "AC-3"]);
	const rows = parseTestPlan(validPlan);
	assert.equal(rows.length, 3);
	assert.equal(rows[2].path, "tests/routes/role.test.js");
	assert.throws(() => parseCriteria("# Plan\n\n## Done When\n- x"), /no acceptance criteria/);
	assert.throws(() => parseCriteria(`${validPlan}\n## Acceptance Criteria\n- **AC-1:** again\n`), /more than once/);
});

test("extracts test paths from Test Plan cells", () => {
	assert.equal(testPathOf("tests/a.test.js: does x"), "tests/a.test.js");
	assert.equal(testPathOf("`./tests/a.test.js` does x"), "tests/a.test.js");
	assert.equal(testPathOf("rejects viewers"), null);
});

test("maps tests to criteria by word-bounded, case-insensitive tokens", () => {
	assert.deepEqual(criteriaInText("ac-1 and AC-2, not AC-12 or XAC-3 or AC-4x"), ["AC-1", "AC-2", "AC-12"]);
	assert.deepEqual(criteriaInText("no criterion here"), []);
});

test("parses JUnit with entities, CDATA, suite file, and statuses", () => {
	const tests = parseJUnit(junitPass);
	assert.equal(tests.length, 4);
	assert.equal(tests[1].name, "AC-2 rejects viewers & guests");
	assert.equal(tests[2].file, "tests/routes/role.test.js");
	assert.ok(tests.every((t) => t.status === "passed"));
	const xml = `<testsuite name="s"><testcase name="AC-1 a"><failure message="x"/></testcase><testcase name="AC-2 b"><error/></testcase><testcase name="AC-3 c"><skipped/></testcase></testsuite>`;
	assert.deepEqual(parseJUnit(xml).map((t) => t.status), ["failed", "failed", "skipped"]);
	const flaky = `<testsuite><testcase name="AC-1 a"><flakyFailure message="x"/></testcase><testsuite name="empty"/></testsuite>`;
	assert.equal(parseJUnit(flaky)[0].status, "passed");
});

test("parses Jest and Vitest JSON and rejects unknown formats", () => {
	const tests = parseReport(jestPass, "jest.json");
	assert.equal(tests.length, 3);
	assert.equal(tests[0].file, "/work/repo/tests/routes/role.test.js");
	assert.throws(() => parseReport("plain text"), /neither JUnit XML nor/);
	assert.throws(() => parseReport("{ nope"), /not valid JSON/);
	assert.throws(() => parseReport('{"a":1}'), /testResults/);
	assert.throws(() => parseReport("<testsuites/>"), /no test results/);
	const pending = parseReport(jestJson([["AC-1 a", "pending"], ["AC-2 b", "todo"]]));
	assert.deepEqual(pending.map((t) => t.status), ["skipped", "skipped"]);
});

test("passes when every criterion has a passing mapped test", () => {
	const result = evaluate(validPlan, parseReport(junitPass, "junit.xml"));
	assert.equal(result.pass, true);
	assert.deepEqual(result.unmapped.map((t) => t.name), ["health check responds"]);
	const table = renderTable(result);
	assert.match(table, /\| AC-1 \| .*\(passed\) \| PASS \|/);
	assert.match(table, /Unmapped tests \(informational, 1 of 4\)/);
	assert.doesNotMatch(table, /Unverified criteria/);
});

test("fails a criterion with a failed mapped test even if another passes", () => {
	const tests = parseReport(jestJson([
		["AC-1 rejects unauthenticated requests", "passed"],
		["AC-2 rejects viewers", "passed"],
		["AC-2 rejects guests", "failed"],
		["AC-3 creates a role", "passed"],
	]));
	const result = evaluate(validPlan, tests);
	assert.equal(result.pass, false);
	assert.equal(verdicts(result)["AC-2"], VERDICTS.fail);
	assert.match(renderTable(result), /AC-2: 1 mapped test\(s\) failed: "role routes AC-2 rejects guests"/);
});

test("a criterion with no mapped test, or only skipped tests, is unverified", () => {
	const tests = parseReport(jestJson([
		["AC-1 rejects unauthenticated requests", "passed"],
		["AC-2 rejects viewers", "pending"],
	]));
	const result = evaluate(validPlan, tests);
	assert.deepEqual(verdicts(result), { "AC-1": VERDICTS.pass, "AC-2": VERDICTS.notPassing, "AC-3": VERDICTS.notCovered });
});

test("tests naming an unknown criterion stay unmapped", () => {
	const result = evaluate(validPlan, parseReport(jestJson([["AC-9 something", "passed"]])));
	assert.equal(result.unmapped.length, 1);
	assert.equal(result.pass, false);
});

test("rejects a Test Plan row for a criterion the plan does not define", () => {
	const plan = validPlan.replace("| AC-3 |", "| AC-7 |");
	assert.throws(() => evaluate(plan, parseReport(jestPass)), VerifyError);
});

test("one test may serve several criteria and reports are combined", () => {
	const both = parseReport(jestJson([["AC-1 and AC-2 share a flow", "passed"]]), "a.json");
	const third = parseReport(jestJson([["AC-3 creates a role", "passed"]]), "b.json");
	assert.equal(evaluate(validPlan, [...both, ...third]).pass, true);
});

test("--require-test-files demands the Test Plan files in the reports", () => {
	assert.equal(evaluate(validPlan, parseReport(jestPass), { requireTestFiles: true }).pass, true);
	assert.equal(evaluate(validPlan, parseReport(junitPass), { requireTestFiles: true }).pass, true);
	const elsewhere = parseReport(jestJson([
		["AC-1 a", "passed"],
		["AC-2 b", "passed"],
		["AC-3 c", "passed"],
	], "/work/repo/tests/other.test.js"));
	const result = evaluate(validPlan, elsewhere, { requireTestFiles: true });
	assert.equal(verdicts(result)["AC-1"], VERDICTS.fileMissing);
	assert.match(renderTable(result), /not in any report: tests\/routes\/role\.test\.js/);
	assert.equal(evaluate(validPlan, elsewhere).pass, true);

	const noPath = validPlan.replace("tests/routes/role.test.js: AC-1 rejects unauthenticated requests", "an unauthenticated request is rejected");
	assert.match(renderTable(evaluate(noPath, parseReport(jestPass), { requireTestFiles: true })), /names no test file/);
});

test("CLI verifies plans against reports and returns exit codes", async () => {
	const root = await mkdtemp(join(tmpdir(), "criteria-"));
	const write = async (name, text) => {
		await writeFile(join(root, name), text);
		return join(root, name);
	};
	const plan = await write("plan.md", validPlan);
	const junit = await write("junit.xml", junitPass);
	const jest = await write("jest.json", jestPass);
	const failing = await write("failing.json", jestJson([["AC-1 a", "failed"]]));

	const writes = [];
	const out = process.stdout.write.bind(process.stdout);
	const { log, error } = console;
	process.stdout.write = (chunk) => (writes.push(String(chunk)), true);
	console.log = console.error = () => {};
	try {
		assert.equal(await runVerifyCriteria(["--plan", plan, "--report", junit]), 0);
		assert.equal(await runVerifyCriteria(["--plan", plan, "--report", jest, "--require-test-files"]), 0);
		assert.equal(await runVerifyCriteria(["--plan", plan, "--report", failing, "--report", jest]), 1);
		assert.equal(await runVerifyCriteria(["--plan", plan, "--report", jest, "--json"]), 0);
		assert.equal(JSON.parse(writes.at(-1)).pass, true);
		assert.equal(await runVerifyCriteria(["--plan", plan, "--report", join(root, "missing.xml")]), 1);
		assert.equal(await runVerifyCriteria(["--plan", plan, "--report", await write("bad.txt", "nope")]), 1);
		assert.equal(await runVerifyCriteria(["--plan", plan]), 1);
		assert.equal(await runVerifyCriteria(["--plan", plan, "--report", jest, "--require-test-file"]), 1);
		assert.equal(await runVerifyCriteria(["--help"]), 0);
	} finally {
		process.stdout.write = out;
		Object.assign(console, { log, error });
	}
});

test("a comment marker inside CDATA output cannot hide a failing testcase that follows it", () => {
	const xml = `<testsuite file="tests/a.test.js">
<testcase name="AC-1 a"><system-out><![CDATA[ log <!-- start ]]></system-out></testcase>
<testcase name="AC-1 b"><failure message="boom"/></testcase>
<testcase name="c"><system-out><![CDATA[ end --> ]]></system-out></testcase>
</testsuite>`;
	assert.deepEqual(parseJUnit(xml).map((t) => `${t.name}:${t.status}`), ["AC-1 a:passed", "AC-1 b:failed", "c:passed"]);
});

test("reads a Jest JSON report that starts with a byte order mark", () => {
	assert.equal(parseReport(`\uFEFF${jestPass}`, "jest.json").length, 3);
});

test("parses TAP and runner line reports with optional # file: headers", () => {
	const tapReport = [
		"# file: tests/routes/role.test.js",
		"ok   AC-1 rejects unauthenticated requests",
		"ok 2 - AC-2 rejects viewers",
		"ok   AC-3 creates a role",
		"ok   unrelated test",
	].join("\n");
	const tests = parseReport(tapReport, "test-output.log");
	assert.equal(tests.length, 4);
	assert.equal(tests[0].file, "tests/routes/role.test.js");
	const result = evaluate(validPlan, tests, { requireTestFiles: true });
	assert.equal(result.pass, true);
});
