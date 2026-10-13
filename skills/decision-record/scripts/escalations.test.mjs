import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { makeEscalation } from "./decision-fixture.mjs";
import {
	ValidationError,
	addDays,
	classifyEscalations,
	parseFields,
	parsePerson,
	runEscalations,
	validDate,
	validateEscalationContent,
} from "./escalations.mjs";

const matches = (pattern) => (err) => err instanceof ValidationError && pattern.test(err.message);
const bad = (md, pattern, options) => assert.throws(() => validateEscalationContent(md, "e.md", options), matches(pattern));

test("accepts a valid open escalation and returns structured data", () => {
	const e = validateEscalationContent(makeEscalation());
	assert.equal(e.status, "Open");
	assert.equal(e.reason, "cross-squad conflict");
	assert.equal(e.options.length, 2);
	assert.equal(e.defaultDate, "2026-10-20");
	assert.equal(e.resolution, "_None._");
});

test("accepts every reason, case-insensitively", () => {
	for (const reason of ["Cross-squad conflict", "security exposure", "compliance obligation", "external commitment", "BUDGET IMPACT"]) {
		assert.equal(validateEscalationContent(makeEscalation({ reason })).reason, reason.toLowerCase());
	}
});

test("rejects structure and field problems", () => {
	bad("", /is empty/);
	bad(makeEscalation().replace("# Escalation:", "# Decision:"), /level-one heading/);
	bad(makeEscalation({ title: "<title>" }), /level-one heading/);
	bad(makeEscalation().replace(/- \*\*Decision:.*\n/, ""), /missing the "- \*\*Decision:\*\*" field/);
	bad(makeEscalation().replace(/- \*\*Recommendation:.*\n/, ""), /Recommendation/);
	bad(makeEscalation({ options: "  1. Only one." }), /at least 2 options/);
	bad(makeEscalation({ options: "  - A\n  - <option>" }), /placeholder/);
	bad(makeEscalation({ defaultDate: "20-10-2026" }), /valid ISO date/);
	bad(makeEscalation({ reason: "because" }), /Reason must be one of/);
	bad(makeEscalation({ status: "Pending" }), /Status must be one of/);
	bad(`${makeEscalation()}\n\`\`\`js\nfoo()\n\`\`\`\n`, /source code blocks/);
});

test("fenced text is not parsed as fields", () => {
	const fields = parseFields("- **A:** one\n```\n- **B:** two\n```\n- **C:** three");
	assert.equal(fields.has("b"), false);
	assert.equal(fields.get("c"), "three");
});

test("the Default Date cannot precede the escalation date", () => {
	bad(makeEscalation({ defaultDate: "2026-10-01" }), /before the escalation date/, { fileDate: "2026-10-13" });
	assert.equal(validateEscalationContent(makeEscalation(), "e.md", { fileDate: "2026-10-13" }).status, "Open");
});

test("resolution rules keep decisions with named people", () => {
	const decided = makeEscalation({ status: "Decided", resolution: "Decided by Dana Roy (Architect) on 2026-10-15" });
	assert.equal(validateEscalationContent(decided).resolvedBy.name, "Dana Roy");
	bad(makeEscalation({ status: "Decided" }), /needs "- \*\*Resolution:\*\* Decided by/);
	bad(makeEscalation({ status: "Decided", resolution: "Decided by Copilot (Architect) on 2026-10-15" }), /looks like an AI/);
	bad(makeEscalation({ status: "Decided", resolution: "Decided by Dana Roy (Wizard) on 2026-10-15" }), /role "Wizard"/);
	bad(makeEscalation({ status: "Decided", resolution: "Decided by Dana Roy (Architect) on 2026-99-15" }), /valid ISO date/);
	const adopted = makeEscalation({ status: "Adopted by default", resolution: "Adopted by default on 2026-10-21" });
	assert.equal(validateEscalationContent(adopted).status, "Adopted by default");
	bad(makeEscalation({ status: "Adopted by default" }), /adopted by default needs/);
	bad(makeEscalation({ status: "Adopted by default", resolution: "Adopted by default on 2026-10-19" }), /before the Default Date/);
	bad(makeEscalation({ status: "Adopted by default", resolution: "Adopted by default on 2026-13-19" }), /valid ISO date/);
	bad(makeEscalation({ resolution: "Decided by Dana Roy (Architect) on 2026-10-15" }), /Open escalation must not carry/);
});

test("helpers", () => {
	assert.equal(validDate("2026-02-30"), false);
	assert.equal(addDays("2026-10-30", 3), "2026-11-02");
	assert.deepEqual(parsePerson("Sam Lee (Developer)", "x", "f"), { name: "Sam Lee", role: "Developer" });
	assert.throws(() => parsePerson("Sam", "x", "f"), matches(/formatted/));
});

const record = (file, defaultDate, status = "Open") => ({ file, defaultDate, status, recommendation: "r" });

test("classifies overdue, due soon, later, and closed", () => {
	const result = classifyEscalations(
		[record("a", "2026-10-12"), record("b", "2026-10-13"), record("c", "2026-10-15"), record("d", "2026-10-16"), record("e", "2026-10-01", "Decided")],
		"2026-10-13",
	);
	assert.deepEqual(result.overdue.map((r) => r.file), ["a"]);
	assert.deepEqual(result.dueSoon.map((r) => r.file), ["b", "c"]);
	assert.deepEqual(result.later.map((r) => r.file), ["d"]);
	assert.deepEqual(result.closed.map((r) => r.file), ["e"]);
	assert.throws(() => classifyEscalations([], "13/10/2026"), matches(/--today/));
});

test("CLI lists due escalations and fails on overdue ones", async () => {
	const dir = await mkdtemp(join(tmpdir(), "escalations-"));
	await writeFile(join(dir, "2026-10-01-late.md"), makeEscalation({ title: "Late", defaultDate: "2026-10-10" }));
	await writeFile(join(dir, "2026-10-12-soon.md"), makeEscalation({ title: "Soon", defaultDate: "2026-10-14" }));
	await writeFile(join(dir, "README.md"), "# Escalations\n");
	const empty = join(dir, "empty");
	await mkdir(empty);

	const lines = [];
	const [log, error, warn] = [console.log, console.error, console.warn];
	console.log = (line) => lines.push(String(line));
	console.error = console.warn = () => {};
	try {
		assert.equal(await runEscalations(["due", "--dir", dir, "--today", "2026-10-13"]), 1);
		assert.ok(lines.some((l) => l.includes("[overdue]") && l.includes("2026-10-01-late.md")));
		assert.ok(lines.some((l) => l.includes("[due soon]") && l.includes("2026-10-12-soon.md")));
		assert.ok(lines.at(-1).includes("1 overdue, 1 due within 2 days"));
		assert.equal(await runEscalations(["due", "--dir", dir, "--today", "2026-10-05"]), 0);
		assert.equal(await runEscalations(["due", "--dir", empty, "--today", "2026-10-13"]), 0);
		assert.equal(await runEscalations(["due", "--dir", dir]), 1, "the late escalation is overdue today");
		assert.equal(await runEscalations(["due", "--dir", dir, "--today", "soon"]), 1);
		assert.equal(await runEscalations(["due", "--dir", join(dir, "missing")]), 1);
		await writeFile(join(dir, "billing.md"), makeEscalation());
		assert.equal(await runEscalations(["due", "--dir", dir, "--today", "2026-10-05"]), 1, "bad file name");
		await writeFile(join(dir, "billing.md"), "# Escalation: broken\n");
		assert.equal(await runEscalations(["due", "--dir", dir, "--today", "2026-10-05"]), 1, "invalid record");
		assert.equal(await runEscalations(["list", "--dir", dir]), 1);
		assert.equal(await runEscalations(["due", "--dir", dir, "--today"]), 1, "flag without a value must not fall back to the real date");
		assert.equal(await runEscalations(["due", "--dir", dir, "--toady", "2026-10-05"]), 1, "unknown flag");
		assert.equal(await runEscalations([]), 1);
		assert.equal(await runEscalations(["--help"]), 0);
	} finally {
		Object.assign(console, { log, error, warn });
	}
});
