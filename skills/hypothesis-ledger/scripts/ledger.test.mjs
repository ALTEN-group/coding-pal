import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ADD_ENTRY, emptyLedger, validLedger } from "./ledger-fixture.mjs";
import { ValidationError, addDays, addRow, computeStats, dueRows, parseLedger, proposeVerdict, renderStats, runLedger } from "./ledger.mjs";

const edit = (from, to) => validLedger.replace(from, to);
const rejects = (content, pattern) => assert.throws(() => parseLedger(content), (err) => err instanceof ValidationError && pattern.test(err.message));

async function capture(fn) {
	const writes = [];
	const out = process.stdout.write.bind(process.stdout);
	const [log, error] = [console.log, console.error];
	process.stdout.write = (chunk) => (writes.push(String(chunk)), true);
	console.log = (...parts) => writes.push(`${parts.join(" ")}\n`);
	console.error = (...parts) => writes.push(`ERR ${parts.join(" ")}\n`);
	try {
		return { code: await fn(), text: writes.join("") };
	} finally {
		process.stdout.write = out;
		Object.assign(console, { log, error });
	}
}

test("accepts a valid ledger and an empty one", () => {
	const { rows } = parseLedger(validLedger);
	assert.equal(rows.length, 5);
	assert.equal(rows[0].baseline, 45);
	assert.equal(rows[1].deletedDate, null);
	assert.equal(rows[4].deletedDate, "2026-09-10");
	assert.equal(parseLedger(emptyLedger).rows.length, 0);
});

test("rejects structural problems", () => {
	rejects("", /empty/);
	rejects(edit("# Hypothesis Ledger", "# Ledger"), /level-one heading/);
	rejects("# Hypothesis Ledger\n\nnothing here\n", /no hypothesis table/);
	rejects(edit("| Decided |", "| Owner |"), /columns must be exactly/);
	rejects(edit("|---|---|---|---|---|---|---|---|---|---|---|\n", ""), /separator row/);
	rejects(`${validLedger}\ntext\n\n| a | b |\n`, /single contiguous table/);
	rejects(edit("| Remove flag |", "| Remove flag | extra |"), /expected 11 cells/);
});

test("rejects bad hypothesis definitions", () => {
	rejects(edit("| #12 |", "| 12 |"), /Issue must look like/);
	rejects(edit("| #12 |", "| #15 |"), /duplicate hypothesis for #15/);
	rejects(edit("Automatic reconciliation cuts the morning dispatch delay", "TBD"), /Hypothesis is empty/);
	rejects(edit("| 45 | 10 |", "| forty | 10 |"), /Baseline must be a number/);
	rejects(edit("| 45 | 10 |", "| 45 | ten |"), /Target must be a number/);
	rejects(edit("| 45 | 10 | down |", "| 45 | 45 | down |"), /Target must differ/);
	rejects(edit("| 10 | down |", "| 10 | up |"), /contradicts/);
	rejects(edit("| down | 2026-09-30 | Validated", "| sideways | 2026-09-30 | Validated"), /Direction must be up or down/);
	rejects(edit("2026-09-30 | Validated", "2026-13-40 | Validated"), /Watch Ends must be an ISO date/);
});

test("rejects bad verdicts, actions, and decisions", () => {
	rejects(edit("| Validated |", "| Won |"), /Verdict must be one of/);
	rejects(edit("| Remove flag |", "| Invest further now |"), /Validated verdict needs Action/);
	rejects(edit("| Iterate once |", "| Remove flag |"), /Inconclusive verdict needs Action/);
	rejects(edit("| Delete feature (Pending) |", "| Keep it |"), /Invalidated verdict needs Action/);
	rejects(edit("Observed 8 on 2026-10-02 (dashboards/dispatch-delay.png)", "_None._"), /needs Evidence/);
	rejects(edit("Sam Lee (Product Owner) on 2026-10-05 |\n| #15", "Sam Lee (Developer) on 2026-10-05 |\n| #15"), /only the Product Owner decides/);
	rejects(edit("Sam Lee (Product Owner) on 2026-10-05 |\n| #15", "Sam Lee on 2026-10-05 |\n| #15"), /only the Product Owner decides/);
	rejects(edit("Sam Lee (Product Owner) on 2026-10-05 |\n| #15", "_None._ |\n| #15"), /only the Product Owner decides/);
	rejects(edit("(Product Owner) on 2026-10-05 |\n| #15", "(Product Owner) on 2026-02-30 |\n| #15"), /not a valid ISO date/);
	rejects(edit("(Product Owner) on 2026-10-05 |\n| #15", "(Product Owner) on 2026-09-01 |\n| #15"), /before the watch window ends/);
	for (const name of ["Copilot", "Claude", "GPT-4", "Gemini", "ChatGPT", "OpenAI", "Anthropic", "release-bot", "agent", "dependabot", "renovate", "github-actions", "AI", "LLM", "dependabot[bot]"]) {
		rejects(edit("Sam Lee (Product Owner) on 2026-10-05 |\n| #15", `${name} (Product Owner) on 2026-10-05 |\n| #15`), /is not a named person \(it looks like an AI\)/);
	}
	for (const name of ["x", "TBD", "<name>", "N/A", "Product Owner"]) {
		rejects(edit("Sam Lee (Product Owner) on 2026-10-05 |\n| #15", `${name} (Product Owner) on 2026-10-05 |\n| #15`), /Decided/);
	}
	rejects(edit("Delete feature (Deleted 2026-09-10)", "Delete feature (Deleted 2026-09-01)"), /cannot be deleted/);
	rejects(edit("| Open | _None._ | _None._ | _None._ |", "| Open | _None._ | Remove | _None._ |"), /Open row must have Action/);
	rejects(edit("| Open | _None._ | _None._ | _None._ |", "| Open | _None._ | _None._ | Sam Lee (Product Owner) on 2026-11-01 |"), /Open row must have Decided/);
});

test("adds an Open row, creates a missing ledger, and rejects duplicates", () => {
	const next = addRow(validLedger, ADD_ENTRY);
	const rows = parseLedger(next).rows;
	assert.equal(rows.length, 6);
	assert.equal(rows[5].issue, "#30");
	assert.equal(rows[5].verdict, "Open");
	assert.ok(next.startsWith("# Hypothesis Ledger"));
	assert.equal(parseLedger(addRow(null, { ...ADD_ENTRY, issue: "#30" })).rows.length, 1);
	assert.equal(parseLedger(addRow(emptyLedger, ADD_ENTRY)).rows.length, 1);
	assert.throws(() => addRow(validLedger, { ...ADD_ENTRY, issue: "#12" }), /already has a hypothesis/);
	assert.throws(() => addRow(validLedger, { ...ADD_ENTRY, direction: "up" }), /contradicts/);
	assert.throws(() => addRow(validLedger, { ...ADD_ENTRY, hypothesis: "a | b" }), /cannot contain/);
	assert.throws(() => addRow(validLedger, { ...ADD_ENTRY, watchEnds: "soon" }), /Watch Ends/);
});

test("proposes verdicts with the maths and respects direction and tolerance", () => {
	const up = { baseline: 200, target: 260, direction: "up" };
	assert.deepEqual(proposeVerdict(up, 260), { progress: 1, verdict: "Validated", reason: "the metric reached or passed the target", actions: ["Remove flag", "Invest further"] });
	assert.equal(proposeVerdict(up, 300).verdict, "Validated");
	assert.equal(proposeVerdict(up, 230).verdict, "Inconclusive");
	assert.equal(proposeVerdict(up, 230).progress, 0.5);
	assert.equal(proposeVerdict(up, 200).verdict, "Inconclusive");
	assert.equal(proposeVerdict(up, 198).verdict, "Inconclusive");
	assert.equal(proposeVerdict(up, 190).verdict, "Invalidated");
	assert.deepEqual(proposeVerdict(up, 190).actions, ["Delete feature"]);
	assert.equal(proposeVerdict(up, 190, 0.5).verdict, "Inconclusive");
	const downward = { baseline: 45, target: 10, direction: "down" };
	assert.equal(proposeVerdict(downward, 8).verdict, "Validated");
	assert.equal(proposeVerdict(downward, 50).verdict, "Invalidated");
	assert.equal(proposeVerdict(downward, 30).verdict, "Inconclusive");
	assert.throws(() => proposeVerdict(up, Number.NaN), ValidationError);
	assert.throws(() => proposeVerdict(up, 1, -1), ValidationError);
	assert.throws(() => proposeVerdict({ baseline: 5, target: 5, direction: "up" }, 5), /Target must differ from Baseline/);
	// Exactly on the tolerance boundary stays Inconclusive despite floating-point noise (6.15 - 6) / (3 - 6).
	assert.equal(proposeVerdict({ baseline: 6, target: 3, direction: "down" }, 6.15).verdict, "Inconclusive");
	assert.equal(proposeVerdict({ baseline: 0.1, target: 0.3, direction: "up" }, 0.09).verdict, "Inconclusive");
	assert.equal(proposeVerdict({ baseline: 6, target: 3, direction: "down" }, 6.16).verdict, "Invalidated");
});

test("rejects issue numbers with leading zeros so #1 and #01 cannot both exist", () => {
	rejects(edit("| #21 |", "| #021 |"), /without leading zeros/);
});

test("lists due reviews and overdue deletions", () => {
	const { rows } = parseLedger(validLedger);
	const due = dueRows(rows, "2026-11-01");
	assert.deepEqual(due.reviews.map((r) => r.issue), ["#21"]);
	assert.equal(due.reviews[0].daysOver, 1);
	assert.deepEqual(due.deletions.map((d) => d.issue), ["#15"]);
	assert.equal(due.deletions[0].deleteBy, "2026-10-19");
	assert.deepEqual(dueRows(rows, "2026-10-31").reviews, []);
	assert.deepEqual(dueRows(rows, "2026-10-19").deletions, []);
	assert.equal(dueRows(rows, "2026-10-20").deletions.length, 1);
	assert.equal(addDays("2026-12-25", 10), "2027-01-04");
});

test("computes validation and deletion rates and warns on a rate near 100%", () => {
	const stats = computeStats(parseLedger(validLedger).rows);
	assert.equal(stats.closed, 4);
	assert.equal(stats.validationRate, 0.25);
	assert.equal(stats.deletedInCycle, 1);
	assert.equal(stats.pendingDeletion, 1);
	assert.equal(stats.deletionRate, 0.5);
	assert.match(renderStats(stats), /validation rate: 25\.0% \(1 validated \/ 4 closed\)/);
	assert.match(renderStats(stats), /deletion rate: 50\.0%/);
	assert.doesNotMatch(renderStats(stats), /close to 100%/);
	assert.equal(computeStats(parseLedger(validLedger).rows, 8).deletionRate, 0.5);
	assert.equal(computeStats(parseLedger(validLedger).rows, 7).deletionRate, 0);

	const empty = computeStats([]);
	assert.equal(empty.validationRate, null);
	assert.match(renderStats(empty), /n\/a/);

	const allValidated = [1, 2, 3].map((i) => `| #${i} | h | m | 1 | 2 | up | 2026-01-01 | Validated | observed 2 | Remove flag | A (Product Owner) on 2026-01-02 |`);
	const text = renderStats(computeStats(parseLedger(`${emptyLedger}${allValidated.join("\n")}\n`).rows));
	assert.match(text, /100\.0%/);
	assert.match(text, /close to 100%/);
});

test("CLI covers every subcommand and never writes a verdict", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ledger-"));
	const file = join(dir, "specs", "learn", "hypotheses.md");
	const existing = join(dir, "hypotheses.md");
	await writeFile(existing, validLedger);

	let result = await capture(() => runLedger(["validate", "--file", existing]));
	assert.equal(result.code, 0);
	assert.match(result.text, /Validated 5 hypothesis row/);

	result = await capture(() => runLedger(["due", "--file", existing, "--today", "2026-11-01"]));
	assert.equal(result.code, 0);
	assert.match(result.text, /- #21: Weekly active planners \(watch ended 2026-10-31, 1 day/);
	assert.match(result.text, /- #15: decided 2026-10-05, delete by 2026-10-19/);

	result = await capture(() => runLedger(["due", "--file", existing, "--cycle-days", "30"]));
	assert.equal(result.code, 0);

	result = await capture(() => runLedger(["stats", "--file", existing]));
	assert.match(result.text, /Hypothesis validation rate: 25\.0%/);

	const before = await readFile(existing, "utf-8");
	result = await capture(() => runLedger(["propose", "--file", existing, "--issue", "21", "--observed", "270", "--today", "2026-10-20"]));
	assert.equal(result.code, 0);
	assert.match(result.text, /PROPOSED verdict: Validated/);
	assert.match(result.text, /progress = \(270 - 200\) \/ \(260 - 200\) = 1\.1667/);
	assert.match(result.text, /watch window ends 2026-10-31: this proposal is premature/);
	assert.match(result.text, /Nothing was written/);
	assert.equal(await readFile(existing, "utf-8"), before);

	result = await capture(() => runLedger(["propose", "--file", existing, "--issue", "#21", "--observed", "150", "--tolerance", "0.1"]));
	assert.match(result.text, /PROPOSED verdict: Invalidated/);

	result = await capture(() => runLedger(["propose", "--file", existing, "--issue", "12", "--observed", "9"]));
	assert.equal(result.code, 1);
	assert.match(result.text, /already has a Validated verdict/);
	assert.equal((await capture(() => runLedger(["propose", "--file", existing, "--issue", "99", "--observed", "9"]))).code, 1);
	assert.equal((await capture(() => runLedger(["propose", "--file", existing, "--issue", "21"]))).code, 1);
	assert.equal((await capture(() => runLedger(["propose", "--file", existing, "--issue", "21", "--observed", "x"]))).code, 1);

	const add = ["add", "--file", file, "--issue", "30", "--hypothesis", "Order templates shorten order entry", "--metric", "Minutes per order", "--baseline", "6", "--target", "3", "--direction", "down", "--watch-ends", "2026-11-30"];
	assert.equal((await capture(() => runLedger(add))).code, 0);
	assert.equal(parseLedger(await readFile(file, "utf-8")).rows[0].issue, "#30");
	result = await capture(() => runLedger(add));
	assert.equal(result.code, 1);
	assert.match(result.text, /already has a hypothesis/);
	assert.equal((await capture(() => runLedger(add.slice(0, -2)))).code, 1);

	await writeFile(existing, edit("| Remove flag |", "| Maybe |"));
	assert.equal((await capture(() => runLedger(["validate", "--file", existing]))).code, 1);
	assert.equal((await capture(() => runLedger(["validate", "--file", join(dir, "missing.md")]))).code, 1);
	assert.equal((await capture(() => runLedger(["validate"]))).code, 1);
	assert.equal((await capture(() => runLedger(["due", "--file", file, "--today", "yesterday"]))).code, 1);
	assert.equal((await capture(() => runLedger(["due", "--file", file, "--cycle-days", "x"]))).code, 1);
	for (const bad of ["-5", "1.5", "1e1"]) {
		assert.equal((await capture(() => runLedger(["due", "--file", file, "--cycle-days", bad]))).code, 1, `cycle-days ${bad}`);
	}
	assert.equal((await capture(() => runLedger(["propose", "--file", existing, "--issue", "21", "--observed", "0x10"]))).code, 1);
	assert.equal((await capture(() => runLedger(["due", "--file", file, "--bogus", "1"]))).code, 1);
	assert.equal((await capture(() => runLedger(["frobnicate", "--file", file]))).code, 1);
	assert.equal((await capture(() => runLedger(["validate", "stray"]))).code, 1);
	assert.equal((await capture(() => runLedger([]))).code, 1);
	assert.equal((await capture(() => runLedger(["--help"]))).code, 0);
	assert.equal((await capture(() => runLedger(["stats", "--help"]))).code, 0);
});
