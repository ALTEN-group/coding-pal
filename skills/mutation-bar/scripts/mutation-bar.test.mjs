import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	DEFAULT_MIN_SCORE,
	MutationError,
	effectiveThresholds,
	evaluate,
	parseChangedList,
	parseConfig,
	parseReport,
	renderResult,
	runMutationBar,
	scoreOf,
} from "./mutation-bar.mjs";
import { stryker, validStryker, validSummary } from "./mutation-fixture.mjs";

const defaults = { minScore: 80, perFileMin: null };

test("score counts killed and timeout against survived and uncovered mutants", () => {
	assert.equal(scoreOf({ killed: 6, timeout: 2, survived: 1, noCoverage: 1 }), 80);
	assert.equal(scoreOf({ killed: 0, timeout: 0, survived: 0, noCoverage: 0 }), null);
});

test("parses Stryker JSON, excludes compile/runtime errors and ignored mutants, collects survivors", () => {
	const report = parseReport(validStryker);
	assert.equal(report.kind, "stryker");
	assert.deepEqual(report.files.get("src/a.js").counts, { killed: 8, survived: 1, timeout: 1, noCoverage: 0 });
	assert.deepEqual(report.counts, { killed: 13, survived: 3, timeout: 2, noCoverage: 2 });
	assert.deepEqual(report.files.get("src/a.js").survivors, [{ file: "src/a.js", line: 40, mutator: "ConditionalExpression", status: "Survived" }]);
});

test("parses the generic summary JSON and rejects unknown shapes and statuses", () => {
	const report = parseReport(validSummary);
	assert.equal(report.kind, "summary");
	assert.equal(report.files, null);
	assert.equal(scoreOf(report.counts), 80);
	assert.equal(parseReport('{"killed":1,"survived":0}').counts.timeout, 0);
	assert.throws(() => parseReport('{"killed":-1,"survived":0}'), /non-negative integer/);
	assert.throws(() => parseReport("{ nope"), /not valid JSON/);
	assert.throws(() => parseReport('{"a":1}'), /neither a Stryker JSON/);
	assert.throws(() => parseReport(stryker({ "src/a.js": [["Pending", 1]] })), /unsupported status "Pending"/);
	assert.throws(() => parseReport('{"files":{"src/a.js":{}}}'), /no "mutants" array/);
});

test("the default bar is 80 and the report below it fails", () => {
	assert.equal(DEFAULT_MIN_SCORE, 80);
	const result = evaluate(parseReport(validStryker), defaults);
	assert.equal(result.pass, false);
	assert.equal(result.score, 75);
	assert.match(result.failures[0], /75\.00 is below the minimum 80/);
	assert.deepEqual(result.survivors.map((s) => `${s.file}:${s.line} ${s.mutator}`), [
		"src/a.js:40 ConditionalExpression",
		"src/b.js:12 StringLiteral",
		"src/b.js:14 BlockStatement",
		"src/b.js:30 ArithmeticOperator",
		"src/b.js:31 ArithmeticOperator",
	]);
	const text = renderResult(result);
	assert.match(text, /\| src\/b\.js \| 5 \| 1 \| 2 \| 2 \| 60\.00 \|/);
	assert.match(text, /- src\/b\.js:12 StringLiteral \(Survived\)/);
	assert.match(text, /- src\/b\.js:30 ArithmeticOperator \(NoCoverage\)/);
});

test("a score exactly on the bar passes", () => {
	const result = evaluate(parseReport(validSummary), defaults);
	assert.equal(result.pass, true);
	assert.match(renderResult(result), /Score: 80\.00 \(minimum 80\)/);
});

test("a score that is exactly an integer is not pushed below the bar by floating point error", () => {
	const summary = parseReport(JSON.stringify({ killed: 29, survived: 21 }));
	assert.equal(scoreOf(summary.counts), 58);
	assert.equal(evaluate(summary, { minScore: 58, perFileMin: null }).pass, true);
});

test("a report with nothing scorable fails", () => {
	const empty = parseReport(stryker({ "src/a.js": [["Ignored", 1], ["CompileError", 2]] }));
	assert.match(evaluate(empty, defaults).failures[0], /no scorable mutants/);
});

test("per-file minimum fails weak files even when the total passes", () => {
	const report = parseReport(stryker({
		"src/a.js": Array.from({ length: 19 }, (_, i) => ["Killed", i + 1]),
		"src/b.js": [["Killed", 1], ["Survived", 2], ["Survived", 3]],
	}));
	assert.equal(evaluate(report, defaults).pass, true);
	const result = evaluate(report, { minScore: 80, perFileMin: 50 });
	assert.equal(result.pass, false);
	assert.match(result.failures[0], /src\/b\.js scores 33\.33, below the per-file minimum 50/);
});

test("--changed scores only the changed files and reports unknown ones", () => {
	const report = parseReport(validStryker);
	const onlyA = evaluate(report, defaults, { changed: ["src/a.js", "README.md"] });
	assert.equal(onlyA.pass, true);
	assert.equal(onlyA.score, 90);
	assert.deepEqual(onlyA.files.map((f) => f.path), ["src/a.js"]);
	assert.deepEqual(onlyA.unprovenChanged, ["README.md"]);
	assert.match(renderResult(onlyA), /Warning: no mutants for README\.md: not proven/);
	assert.equal(evaluate(report, defaults, { changed: ["src/b.js"] }).pass, false);
	assert.equal(evaluate(report, defaults, { changed: ["/repo/src/a.js"] }).pass, true);
	assert.match(evaluate(report, defaults, { changed: ["README.md"] }).failures[0], /changed files/);
	assert.throws(() => evaluate(parseReport(validSummary), defaults, { changed: ["src/a.js"] }), /no per-file data/);
	assert.throws(() => evaluate(parseReport(validSummary), { minScore: 80, perFileMin: 50 }), /no per-file data/);
});

test("the number of Ignored mutants is reported so a hidden survivor is visible", () => {
	const report = parseReport(validStryker);
	assert.equal(report.ignored, 1);
	assert.equal(report.files.get("src/a.js").ignored, 1);
	assert.equal(report.files.get("src/b.js").ignored, 0);
	const all = evaluate(report, defaults);
	assert.equal(all.ignored, 1);
	assert.match(renderResult(all), /Ignored: 1 mutant excluded from the score/);
	assert.equal(evaluate(report, defaults, { changed: ["src/b.js"] }).ignored, 0);
	assert.match(renderResult(evaluate(report, defaults, { changed: ["src/b.js"] })), /Ignored: 0 mutants/);
	const many = parseReport(stryker({ "src/a.js": [["Killed", 1], ["Ignored", 2], ["Ignored", 3]] }));
	assert.match(renderResult(evaluate(many, defaults)), /Ignored: 2 mutants/);
	// Ignored mutants never change the verdict
	assert.equal(evaluate(many, defaults).pass, true);
	const summary = parseReport(JSON.stringify({ killed: 8, survived: 2, ignored: 3 }));
	assert.match(renderResult(evaluate(summary, { minScore: 80, perFileMin: null })), /Ignored: 3 mutants/);
	assert.doesNotMatch(renderResult(evaluate(parseReport(validSummary), defaults)), /Ignored:/);
	assert.throws(() => parseReport('{"killed":1,"survived":0,"ignored":-1}'), /"ignored" must be a non-negative integer/);
});

test("parses the changed list and the config", () => {
	assert.deepEqual(parseChangedList("# changed\nsrc\\a.js\n\n./src/b.js\nsrc/a.js\n"), ["src/a.js", "src/b.js"]);
	assert.throws(() => parseChangedList("\n# nothing\n"), /lists no paths/);
	assert.deepEqual(parseConfig('{"minScore": 90, "perFileMin": 60}'), { minScore: 90, perFileMin: 60 });
	assert.throws(() => parseConfig('{"minScore": 101}'), /between 0 and 100/);
	assert.throws(() => parseConfig('{"perFileMin": "high"}'), /perFileMin/);
	assert.throws(() => parseConfig("[]"), /JSON object/);
	assert.throws(() => parseConfig("{"), /not valid JSON/);
});

test("the CLI can only raise the minimum above the config, never lower it", () => {
	assert.deepEqual(effectiveThresholds({}, {}), { minScore: 80, perFileMin: null });
	assert.deepEqual(effectiveThresholds({ minScore: 85, perFileMin: 50 }, {}), { minScore: 85, perFileMin: 50 });
	assert.deepEqual(effectiveThresholds({ minScore: 85 }, { minScore: 90, perFileMin: 70 }), { minScore: 90, perFileMin: 70 });
	assert.throws(() => effectiveThresholds({}, { minScore: 70 }), /a control cannot be weakened/);
	assert.throws(() => effectiveThresholds({ minScore: 85 }, { minScore: 84 }), /a control cannot be weakened/);
	assert.throws(() => effectiveThresholds({ perFileMin: 60 }, { perFileMin: 10 }), /a control cannot be weakened/);
	assert.throws(() => effectiveThresholds({}, { minScore: 120 }), MutationError);
});

test("CLI gates a report, honours config, changed list, and raises", async () => {
	const root = await mkdtemp(join(tmpdir(), "mutation-"));
	const write = async (name, text) => {
		await writeFile(join(root, name), text);
		return join(root, name);
	};
	const report = await write("stryker.json", validStryker);
	const summary = await write("summary.json", validSummary);
	const changed = await write("changed.txt", "src/a.js\n");
	const lenient = await write("lenient.json", '{"minScore": 70}');
	const strict = await write("strict.json", '{"minScore": 95}');

	const writes = [];
	const out = process.stdout.write.bind(process.stdout);
	const { log, error } = console;
	process.stdout.write = (chunk) => (writes.push(String(chunk)), true);
	console.log = console.error = () => {};
	const cwd = process.cwd();
	try {
		assert.equal(await runMutationBar(["--report", report]), 1);
		assert.match(writes.join(""), /src\/b\.js:12 StringLiteral/);
		assert.equal(await runMutationBar(["--report", report, "--changed", changed]), 0);
		assert.equal(await runMutationBar(["--report", report, "--changed", changed, "--min-score", "95"]), 1);
		assert.equal(await runMutationBar(["--report", report, "--config", lenient]), 0);
		assert.equal(await runMutationBar(["--report", report, "--config", lenient, "--min-score", "60"]), 1);
		assert.equal(await runMutationBar(["--report", summary, "--config", strict]), 1);
		assert.equal(await runMutationBar(["--report", summary]), 0);
		assert.equal(await runMutationBar(["--report", report, "--per-file-min", "70"]), 1);
		assert.equal(await runMutationBar(["--report", report, "--config", join(root, "missing.json")]), 1);
		assert.equal(await runMutationBar(["--report", join(root, "missing.json")]), 1);
		assert.equal(await runMutationBar(["--report", report, "--min-score", "abc"]), 1);
		assert.equal(await runMutationBar(["--report", report, "--bogus"]), 1);
		assert.equal(await runMutationBar([]), 1);
		assert.equal(await runMutationBar(["--help"]), 0);

		// mutation-bar.json in the working directory applies without --config
		await write("mutation-bar.json", '{"minScore": 95}');
		process.chdir(root);
		assert.equal(await runMutationBar(["--report", summary]), 1);
		assert.equal(await runMutationBar(["--report", summary, "--min-score", "90"]), 1);
	} finally {
		process.chdir(cwd);
		process.stdout.write = out;
		Object.assign(console, { log, error });
	}
});
