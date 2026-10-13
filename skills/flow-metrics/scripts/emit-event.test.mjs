import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EVENT_TYPES, ValidationError, buildEvent, coerceField, runEmit, validTimestamp, validateEvent } from "./emit-event.mjs";
import { validEvents } from "./metrics-fixture.mjs";

const matches = (pattern) => (err) => err instanceof ValidationError && pattern.test(err.message);
const base = { t: "2026-10-13T09:30:00Z", id: "issue-42" };

test("every event type in the fixture log validates", () => {
	for (const e of validEvents()) assert.deepEqual(validateEvent(e), e);
	assert.equal(Object.keys(EVENT_TYPES).length, 25);
});

test("pr.authorship needs non-negative integer line counts, at least one positive", () => {
	const ok = { ...base, type: "pr.authorship", ai_lines: 120, human_lines: 0 };
	assert.deepEqual(validateEvent(ok), ok);
	assert.deepEqual(validateEvent({ ...ok, ai_lines: 0, human_lines: 3 }).human_lines, 3);
	assert.throws(() => validateEvent({ ...ok, ai_lines: 0, human_lines: 0 }), matches(/at least one of ai_lines and human_lines must be positive/));
	assert.throws(() => validateEvent({ ...ok, ai_lines: -1 }), matches(/"ai_lines" must be a non-negative integer/));
	assert.throws(() => validateEvent({ ...ok, human_lines: 1.5 }), matches(/"human_lines" must be a non-negative integer/));
	assert.throws(() => validateEvent({ ...base, type: "pr.authorship", ai_lines: 5 }), matches(/requires field "human_lines"/));
	assert.throws(() => validateEvent({ ...ok, share: 1 }), matches(/unknown field "share"/));
	assert.throws(() => buildEvent({ type: "pr.authorship", id: "issue-42", fields: ["ai_lines=0", "human_lines=0"] }), matches(/must be positive/));
});

test("usecase.run validates the five per-use-case measures", () => {
	const ok = { ...base, type: "usecase.run", usecase: "automated-test-creation", minutes: 22.5, iterations: 2, usd: 0.4, human_intervention: false, first_pass: true };
	assert.deepEqual(validateEvent(ok), ok);
	assert.throws(() => validateEvent({ ...ok, usecase: "Test Creation" }), matches(/lowercase slug/));
	assert.throws(() => validateEvent({ ...ok, usecase: 7 }), matches(/lowercase slug/));
	assert.throws(() => validateEvent({ ...ok, minutes: -1 }), matches(/"minutes" must be a non-negative number/));
	assert.throws(() => validateEvent({ ...ok, iterations: 0 }), matches(/"iterations" must be an integer of at least 1/));
	assert.throws(() => validateEvent({ ...ok, iterations: 1.5 }), matches(/"iterations" must be an integer of at least 1/));
	assert.throws(() => validateEvent({ ...ok, usd: -0.1 }), matches(/"usd" must be a non-negative number/));
	assert.throws(() => validateEvent({ ...ok, human_intervention: "no" }), matches(/true or false/));
	assert.throws(() => validateEvent({ ...ok, first_pass: undefined }), matches(/true or false|requires field "first_pass"/));
	const { first_pass: _drop, ...missing } = ok;
	assert.throws(() => validateEvent(missing), matches(/requires field "first_pass"/));
	const built = buildEvent({ type: "usecase.run", id: "issue-42", fields: ["usecase=fix-loop", "minutes=9", "iterations=3", "usd=0.25", "human_intervention=false", "first_pass=false"] }, new Date("2026-10-13T09:30:00Z"));
	assert.equal(JSON.stringify(built), '{"t":"2026-10-13T09:30:00Z","type":"usecase.run","id":"issue-42","usecase":"fix-loop","minutes":9,"iterations":3,"usd":0.25,"human_intervention":false,"first_pass":false}');
	assert.throws(() => buildEvent({ type: "usecase.run", id: "issue-42", fields: ["iterations=zero"] }), matches(/must be a number/));
});

test("rejects a bad shape, timestamp, type, or id", () => {
	assert.throws(() => validateEvent(null), matches(/JSON object/));
	assert.throws(() => validateEvent([]), matches(/JSON object/));
	assert.throws(() => validateEvent({ ...base, type: "pr.opened", t: "2026-10-13" }), matches(/ISO 8601 UTC/));
	assert.throws(() => validateEvent({ ...base, type: "pr.opened", t: "2026-02-30T09:30:00Z" }), matches(/ISO 8601 UTC/));
	assert.throws(() => validateEvent({ ...base, type: "pr.opened", t: "2026-10-13T09:30:00+02:00" }), matches(/ISO 8601 UTC/));
	assert.throws(() => validateEvent({ ...base, type: "pr.closed" }), matches(/unknown event type "pr.closed"/));
	assert.throws(() => validateEvent({ ...base, type: "pr.opened", id: "Issue 42" }), matches(/"id" must be a lowercase/));
	assert.throws(() => validateEvent({ ...base, type: "pr.opened", id: undefined }), matches(/"id"/));
});

test("rejects missing, unknown, and mistyped fields", () => {
	assert.throws(() => validateEvent({ ...base, type: "code.first_run" }), matches(/requires field "green"/));
	assert.throws(() => validateEvent({ ...base, type: "code.first_run", green: "yes" }), matches(/true or false/));
	assert.throws(() => validateEvent({ ...base, type: "pr.opened", branch: "x" }), matches(/unknown field "branch"/));
	assert.throws(() => validateEvent({ ...base, type: "code.fix_loop", count: -1 }), matches(/non-negative integer/));
	assert.throws(() => validateEvent({ ...base, type: "code.fix_loop", count: 1.5 }), matches(/non-negative integer/));
	assert.throws(() => validateEvent({ ...base, type: "pr.validated", tier: "Huge" }), matches(/one of: Low, Medium, High, Critical/));
	assert.throws(() => validateEvent({ ...base, type: "pr.validated", tier: "Low", ci_green_at: "yesterday" }), matches(/ISO 8601 UTC/));
	assert.throws(() => validateEvent({ ...base, type: "release.production", percent: 101 }), matches(/0 to 100/));
	assert.throws(() => validateEvent({ ...base, type: "stage.assisted", stage: "code", share: 1.2 }), matches(/0 to 1/));
	assert.throws(() => validateEvent({ ...base, type: "stage.assisted", stage: "build", share: 0.5 }), matches(/one of: meet/));
	assert.throws(() => validateEvent({ ...base, type: "ai.cost", usd: -1, stage: "code", change: "issue-42" }), matches(/non-negative number/));
	assert.throws(() => validateEvent({ ...base, type: "ai.cost", usd: 1, stage: "code", change: "Bad Id" }), matches(/lowercase id/));
	assert.throws(() => validateEvent({ ...base, type: "hypothesis.closed", verdict: "maybe" }), matches(/validated, invalidated, inconclusive/));
});

test("coerces --field values using the schema", () => {
	assert.equal(coerceField("code.first_run", "green", "true"), true);
	assert.equal(coerceField("code.fix_loop", "count", "3"), 3);
	assert.equal(coerceField("ai.cost", "usd", "1.25"), 1.25);
	assert.equal(coerceField("ai.cost", "stage", "code"), "code");
	assert.throws(() => coerceField("code.first_run", "green", "1"), matches(/true or false/));
	assert.throws(() => coerceField("code.fix_loop", "count", "many"), matches(/must be a number/));
	assert.throws(() => coerceField("pr.opened", "x", "1"), matches(/unknown field "x" for pr.opened; allowed: none/));
	assert.throws(() => coerceField("nope", "x", "1"), matches(/unknown event type/));
});

test("builds events with a stable key order and a default timestamp", () => {
	const now = new Date("2026-10-13T09:30:15.123Z");
	const event = buildEvent({ type: "ai.cost", id: "issue-42", fields: ["change=issue-42", "stage=code", "usd=2"] }, now);
	assert.equal(JSON.stringify(event), '{"t":"2026-10-13T09:30:15Z","type":"ai.cost","id":"issue-42","usd":2,"stage":"code","change":"issue-42"}');
	assert.throws(() => buildEvent({ type: "pr.opened", id: "issue-42", fields: ["oops"] }), matches(/key=value/));
	assert.throws(() => buildEvent({ type: "ai.cost", id: "issue-42", fields: ["usd=1", "usd=2"] }), matches(/unknown field|set twice|requires/));
	assert.equal(validTimestamp("2026-10-13T09:30:00.250Z"), true);
	assert.equal(validTimestamp(42), false);
});

test("CLI appends validated events and refuses invalid ones", async () => {
	const dir = await mkdtemp(join(tmpdir(), "events-"));
	const log = join(dir, "metrics", "events.jsonl");
	const now = new Date("2026-10-13T09:30:00Z");

	const [out, error, warn] = [console.log, console.error, console.warn];
	console.log = console.error = console.warn = () => {};
	try {
		assert.equal(await runEmit(["--log", log, "--type", "code.first_run", "--id", "issue-42", "--field", "green=true"], now), 0);
		assert.equal(await runEmit(["--log", log, "--type", "pr.opened", "--id", "issue-42", "--t", "2026-10-13T10:00:00Z"], now), 0);
		assert.equal(await runEmit(["--log", log, "--type", "code.first_run", "--id", "issue-42"], now), 1, "missing green");
		assert.equal(await runEmit(["--log", log, "--type", "pr.nope", "--id", "issue-42"], now), 1);
		assert.equal(await runEmit(["--log", log, "--type", "pr.opened", "--id", "issue-42", "--field", "x=1"], now), 1);
		assert.equal(await runEmit(["--log", log, "--type", "pr.opened"], now), 1);
		assert.equal(await runEmit(["--log", log, "--type", "pr.opened", "--id", "issue-42", "--feild", "x=1"], now), 1, "unknown flag");
		assert.equal(await runEmit(["--log", log, "--type", "pr.opened", "--id"], now), 1, "flag without a value");
		assert.equal(await runEmit(["--help"]), 0);
		assert.equal(await runEmit([]), 1);

		const lines = (await readFile(log, "utf-8")).trimEnd().split("\n");
		assert.equal(lines.length, 2);
		assert.deepEqual(JSON.parse(lines[0]), { t: "2026-10-13T09:30:00Z", type: "code.first_run", id: "issue-42", green: true });

		await writeFile(log, `${lines[0]}`);
		assert.equal(await runEmit(["--log", log, "--type", "pr.opened", "--id", "issue-42"], now), 0);
		assert.equal((await readFile(log, "utf-8")).trimEnd().split("\n").length, 2, "a missing final newline is repaired");
	} finally {
		Object.assign(console, { log: out, error, warn });
	}
});
