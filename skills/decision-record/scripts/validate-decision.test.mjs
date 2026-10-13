import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	DATA_MODEL_EXTRA,
	MODEL_EXTRA,
	SIGNED,
	THINK_NO,
	THINK_SIGNED,
	TOOLING_EXTRA,
	makeDecision,
	makeEscalation,
} from "./decision-fixture.mjs";
import {
	ValidationError,
	checkRecordSet,
	crossCheckThink,
	parseThinkDecision,
	recordNumber,
	runValidator,
	validateDecisionContent,
} from "./validate-decision.mjs";

const matches = (pattern) => (err) => err instanceof ValidationError && pattern.test(err.message);
const bad = (md, pattern) => assert.throws(() => validateDecisionContent(md), matches(pattern));
const signed = (over = {}) => makeDecision({ status: "Accepted", signature: SIGNED, ...over });

test("accepts a valid drafted record and returns structured data", () => {
	const r = validateDecisionContent(makeDecision());
	assert.equal(r.status, "Drafted");
	assert.equal(r.type, "contract-change");
	assert.equal(r.deciders.length, 2);
	assert.equal(r.options.length, 2);
	assert.equal(r.supersedes, null);
	assert.equal(r.signature.signed, false);
});

test("accepts signed records with an issue reference as the source", () => {
	const r = validateDecisionContent(signed({ source: "#42" }));
	assert.equal(r.signature.by.name, "Dana Roy");
	assert.equal(validateDecisionContent(signed({ status: "Rejected" })).status, "Rejected");
	assert.equal(validateDecisionContent(signed({ status: "Superseded", supersedes: "0001" })).supersedes, 1);
});

test("rejects heading and section problems", () => {
	bad("", /is empty/);
	bad(makeDecision().replace("# Decision:", "# ADR:"), /level-one heading/);
	bad(makeDecision({ title: "<title>" }), /level-one heading/);
	bad(makeDecision().replace("## Consequences", "## Recorded As"), /heading #4/);
	bad(makeDecision().replace("## Decision\n", "## Decision\n\n## Extra\nx\n## Tail\n"), /exactly 4/);
	bad(makeDecision().replace(/## Context\n.*\n/, "## Context\n"), /empty section for "## Context"/);
	bad(`${makeDecision()}\n\`\`\`js\nfoo()\n\`\`\`\n`, /source code blocks/);
});

test("a heading inside a code fence is not a section", () => {
	const md = makeDecision().replace("## Consequences\n", "## Consequences\n```text\n## Not a heading\n```\n");
	assert.equal(validateDecisionContent(md).status, "Drafted");
});

test("rejects header field problems", () => {
	bad(makeDecision({ status: "Pending" }), /Status must be one of/);
	bad(makeDecision({ date: "2026-13-40" }), /valid ISO date/);
	bad(makeDecision({ type: "architecture" }), /Type must be one of/);
	bad(makeDecision({ supersedes: "1" }), /Supersedes must be a 4-digit/);
	bad(makeDecision().replace("- **Status:** Drafted\n", ""), /missing the "- \*\*Status:\*\*" field/);
	bad(makeDecision({ source: "../secret.md" }), /workspace-relative/);
	bad(makeDecision({ source: "/etc/think.md" }), /workspace-relative/);
});

test("deciders must be named people with a role and include the Architect", () => {
	bad(makeDecision({ deciders: "Sam Lee (Developer)" }), /must include an Architect/);
	bad(makeDecision({ deciders: "Sam Lee, Dana Roy (Architect)" }), /formatted "<name> \(<role>\)"/);
	bad(makeDecision({ deciders: "Sam Lee (Wizard), Dana Roy (Architect)" }), /role "Wizard"/);
	bad(makeDecision({ deciders: "Copilot Agent (Developer), Dana Roy (Architect)" }), /looks like an AI/);
	bad(makeDecision({ deciders: "Dana Roy (Architect), Dana Roy (Developer)" }), /twice/);
});

test("only a human Architect signs, and AI may only draft", () => {
	bad(makeDecision({ signature: SIGNED }), /Drafted record must carry/);
	bad(signed({ signature: "Drafted: unsigned" }), /Accepted record needs/);
	bad(signed({ signature: "Signed by Sam Lee (Developer) on 2026-10-14" }), /must be by an Architect/);
	bad(signed({ signature: "Signed by Eve Park (Architect) on 2026-10-14" }), /must match an Architect listed in Deciders/);
	bad(signed({ signature: "Signed by Claude (Architect) on 2026-10-14", deciders: "Claude (Architect)" }), /looks like an AI/);
	bad(signed({ signature: "Signed by Dana Roy (Architect) on 2026-02-30" }), /valid ISO date/);
	bad(signed({ signature: "Signed by Dana Roy (Architect) on 2026-10-01" }), /before the record Date/);
	bad(signed({ status: "Rejected", signature: "Drafted: unsigned" }), /Rejected record needs/);
});

test("a bare role, a placeholder, or an AI is never a named person", () => {
	for (const name of ["Architect", "The Architect", "<name>", "TBD", "unknown", "Team", "123", "GPT4", "Claude3", "gpt-4o", "dependabot", "renovate[bot]", "github-actions", "AI"]) {
		bad(makeDecision({ deciders: `${name} (Architect)` }), /not a named person/);
		bad(signed({ signature: `Signed by ${name} (Architect) on 2026-10-14`, deciders: `${name} (Architect)` }), /not a named person/);
	}
	bad(makeDecision({ deciders: "Developer (Developer), Dana Roy (Architect)" }), /not a named person/);
	bad(signed({ signature: "Signed by Architect on 2026-10-14" }), /Signature must be formatted "<name> \(<role>\)"/);
	for (const name of ["Zoë Müller", "Ai Tanaka", "Anna Botha", "李 雷"]) {
		assert.equal(validateDecisionContent(makeDecision({ deciders: `${name} (Architect)` })).deciders[0].name, name);
	}
	assert.equal(validateDecisionContent(signed({ signature: "Signed by dana  roy (Architect) on 2026-10-14" })).signature.signed, true);
});

test("a source or evaluation report URL is not a workspace path", () => {
	bad(makeDecision({ source: "https://example.com/think.md" }), /workspace-relative/);
});

test("options need 2 or more sequential blocks with pros and cons", () => {
	bad(makeDecision({ options: "### Option 1: Only one\n- **Pros:** a\n- **Cons:** b\n" }), /2 or more/);
	bad(makeDecision({ options: "### Option 1: A\n- **Pros:** a\n- **Cons:** b\n\n### Option 3: B\n- **Pros:** a\n- **Cons:** b\n" }), /numbered 3/);
	bad(makeDecision({ options: "### Option 1: A\n- **Pros:** a\n- **Cons:** b\n\n### Option 2: A\n- **Pros:** a\n- **Cons:** b\n" }), /repeats the name/);
	bad(makeDecision({ options: "### Option 1: A\n- **Pros:** a\n\n### Option 2: B\n- **Pros:** a\n- **Cons:** b\n" }), /missing the "- \*\*Cons:\*\*" field/);
	bad(makeDecision({ options: "### Option 1: A\n- **Pros:** a\n- **Cons:** _None._\n\n### Option 2: B\n- **Pros:** a\n- **Cons:** b\n" }), /must not be "_None._"/);
});

test("type-specific fields", () => {
	assert.equal(validateDecisionContent(makeDecision({ type: "tooling", extra: TOOLING_EXTRA })).type, "tooling");
	bad(makeDecision({ type: "tooling" }), /missing the "- \*\*Native Alternatives Considered:\*\*" field/);
	bad(makeDecision({ type: "tooling", extra: TOOLING_EXTRA.replace(/- \*\*Context Preservation:.*\n/, "") }), /Context Preservation/);
	bad(makeDecision({ type: "tooling", extra: TOOLING_EXTRA.replace(/Context Preservation:\*\* .*/, "Context Preservation:** _None._") }), /requires "Context Preservation"/);
	assert.equal(validateDecisionContent(makeDecision({ type: "data-model", extra: DATA_MODEL_EXTRA })).type, "data-model");
	bad(makeDecision({ type: "data-model" }), /Migration Plan/);
	const model = validateDecisionContent(makeDecision({ type: "model-adoption", extra: MODEL_EXTRA }));
	assert.equal(model.evaluationReport, "docs/evaluations/2026-10-model-x.md");
	bad(makeDecision({ type: "model-adoption" }), /Evaluation Report/);
	bad(makeDecision({ type: "model-adoption", extra: "- **Evaluation Report:** `../outside.md`\n" }), /workspace-relative/);
});

test("record file names carry a 4-digit number", () => {
	assert.equal(recordNumber("docs/decisions/0007-rbac-via-forge.md"), 7);
	assert.throws(() => recordNumber("docs/decisions/7-rbac.md"), matches(/<NNNN>-<slug>/));
	assert.throws(() => recordNumber("docs/decisions/0007-RBAC.md"), matches(/<NNNN>-<slug>/));
});

const rec = (number, status = "Accepted", supersedes = null) => ({ file: `${String(number).padStart(4, "0")}.md`, number, status, supersedes });

test("numbering must be unique, sequential, and gap-free", () => {
	checkRecordSet([rec(2), rec(1)]);
	checkRecordSet([]);
	assert.throws(() => checkRecordSet([rec(1), rec(1)]), matches(/used by both/));
	assert.throws(() => checkRecordSet([rec(1), rec(3)]), matches(/expected 0002, found 0003/));
	assert.throws(() => checkRecordSet([rec(2)]), matches(/expected 0001, found 0002/));
});

test("supersession must be consistent in both directions", () => {
	checkRecordSet([rec(1, "Superseded"), rec(2, "Accepted", 1)]);
	checkRecordSet([rec(1, "Accepted"), rec(2, "Drafted", 1)]);
	checkRecordSet([rec(1, "Superseded"), rec(2, "Superseded", 1), rec(3, "Accepted", 2)]);
	assert.throws(() => checkRecordSet([rec(1, "Accepted"), rec(2, "Accepted", 1)]), matches(/must have Status Superseded/));
	assert.throws(() => checkRecordSet([rec(1, "Superseded"), rec(2, "Drafted", 1)]), matches(/must still be Accepted/));
	assert.throws(() => checkRecordSet([rec(1, "Superseded")]), matches(/no record lists 0001/));
	assert.throws(() => checkRecordSet([rec(1, "Accepted", 1)]), matches(/supersede itself/));
	assert.throws(() => checkRecordSet([rec(1, "Accepted", 9)]), matches(/does not exist/));
	assert.throws(() => checkRecordSet([rec(1, "Accepted", 2), rec(2, "Superseded")]), matches(/newer than the record/));
	assert.throws(
		() => checkRecordSet([rec(1, "Superseded"), rec(2, "Accepted", 1), rec(3, "Accepted", 1)]),
		matches(/superseded by both/),
	);
});

test("think.md decision record facts", () => {
	assert.deepEqual(parseThinkDecision(THINK_SIGNED), { required: true, record: "docs/decisions/0001-forge-rbac.md", status: "signed", tier: "High" });
	assert.deepEqual(parseThinkDecision(THINK_NO), { required: false, record: null, status: null, tier: "Low" });
	assert.throws(() => parseThinkDecision("# Think\n\n## Blast Radius\n- **Tier:** Low\n"), matches(/no "## Decision Record" section/));
	assert.throws(() => parseThinkDecision(THINK_NO.replace("Required:** no", "Required:** maybe")), matches(/"yes" or "no"/));
	assert.throws(() => parseThinkDecision(THINK_SIGNED.replace("Status:** Signed", "Status:** Approved")), matches(/Drafted/));
	assert.throws(() => parseThinkDecision(THINK_SIGNED.replace("Tier:** High", "Tier:** Huge")), matches(/Tier/));
	assert.throws(() => parseThinkDecision(THINK_SIGNED.replace("docs/decisions", "../docs")), matches(/workspace-relative/));
});

test("think.md and the record must agree on the signature", () => {
	const drafted = validateDecisionContent(makeDecision());
	const accepted = validateDecisionContent(signed());
	const think = parseThinkDecision(THINK_SIGNED);
	crossCheckThink(think, accepted);
	assert.throws(() => crossCheckThink(think, drafted), matches(/calls the decision record Signed/));
	assert.throws(() => crossCheckThink(think, null), matches(/does not exist/));
	crossCheckThink({ ...think, status: "drafted" }, drafted);
	assert.throws(() => crossCheckThink({ ...think, status: "drafted" }, accepted), matches(/already signed/));
	crossCheckThink(parseThinkDecision(THINK_NO), null);
	assert.throws(() => crossCheckThink({ required: false, tier: "Critical" }, null), matches(/Critical blast radius requires/));
});

async function workspace() {
	const root = await mkdtemp(join(tmpdir(), "decisions-"));
	const dir = join(root, "docs", "decisions");
	await mkdir(join(dir, "escalations"), { recursive: true });
	await mkdir(join(root, "specs", "issue-42"), { recursive: true });
	await mkdir(join(root, "docs", "evaluations"), { recursive: true });
	return { root, dir };
}

test("CLI validates files, directories, escalations, and think cross-checks", async () => {
	const { root, dir } = await workspace();
	const record = join(dir, "0001-forge-rbac.md");
	await writeFile(record, signed());
	await writeFile(join(dir, "0002-model-x.md"), makeDecision({ type: "model-adoption", extra: MODEL_EXTRA }));
	await writeFile(join(dir, "README.md"), "# Decisions\n");
	const escalation = join(dir, "escalations", "2026-10-13-billing-schema.md");
	await writeFile(escalation, makeEscalation());
	const think = join(root, "specs", "issue-42", "think.md");
	await writeFile(think, THINK_SIGNED);

	const [log, error, warn] = [console.log, console.error, console.warn];
	console.log = console.error = console.warn = () => {};
	try {
		assert.equal(await runValidator(["--file", record]), 0);
		assert.equal(await runValidator(["--file", escalation]), 0);
		assert.equal(await runValidator(["--dir", dir, "--root", root]), 1, "evaluation report is missing");
		await writeFile(join(root, "docs", "evaluations", "2026-10-model-x.md"), "# Evaluation\n");
		assert.equal(await runValidator(["--dir", dir, "--root", root]), 0);
		assert.equal(await runValidator(["--dir", dir, "--root", root, "--think", think]), 0);
		assert.equal(await runValidator(["--file", record, "--root", root, "--think", think]), 0);
		assert.equal(await runValidator(["--think", think, "--root", root]), 0);
		assert.equal(await runValidator(["--file", join(dir, "0002-model-x.md"), "--root", root, "--think", think]), 1, "file differs from the Record");

		await writeFile(join(dir, "0001-forge-rbac.md"), makeDecision());
		assert.equal(await runValidator(["--think", think, "--root", root]), 1, "think calls an unsigned record Signed");
		await writeFile(join(dir, "0001-forge-rbac.md"), signed());

		await writeFile(join(dir, "0004-gap.md"), makeDecision());
		assert.equal(await runValidator(["--dir", dir, "--root", root]), 1, "numbering gap");
		await writeFile(join(dir, "0004-gap.md"), "# Decision: broken\n");
		assert.equal(await runValidator(["--dir", dir, "--root", root]), 1);
		await writeFile(join(dir, "0004-gap.md"), makeEscalation());
		assert.equal(await runValidator(["--dir", dir, "--root", root]), 1, "escalation in the decisions directory");

		assert.equal(await runValidator(["--file", join(dir, "missing.md")]), 1);
		assert.equal(await runValidator(["--dir", join(root, "nope")]), 1);
		assert.equal(await runValidator(["--think", join(root, "nope.md")]), 1);
		await writeFile(join(dir, "bad name.md"), makeDecision());
		assert.equal(await runValidator(["--file", join(dir, "bad name.md")]), 1);
		await writeFile(join(dir, "escalations", "billing.md"), makeEscalation());
		assert.equal(await runValidator(["--file", join(dir, "escalations", "billing.md")]), 1);
		await writeFile(think, THINK_NO);
		assert.equal(await runValidator(["--think", think]), 0);
		assert.equal(await runValidator([]), 1);
		assert.equal(await runValidator(["--file", record, "--fiel", "x"]), 1, "unknown flag");
		assert.equal(await runValidator(["--dir", dir, "--think"]), 1, "flag without a value");
		assert.equal(await runValidator(["--help"]), 0);
	} finally {
		Object.assign(console, { log, error, warn });
	}
});
