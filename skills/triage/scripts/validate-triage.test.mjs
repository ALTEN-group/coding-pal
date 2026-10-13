import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	ValidationError,
	checkLedger,
	parseLedger,
	runValidator,
	similarity,
	validateTriageContent,
} from "./validate-triage.mjs";
import { QUOTE, validTriage } from "./triage-fixture.mjs";

const edit = (from, to) => validTriage.replace(from, to);
const rejects = (markdown, pattern, options) =>
	assert.throws(() => validateTriageContent(markdown, "triage.md", options), (err) => err instanceof ValidationError && pattern.test(err.message));

const DECIDED_BY = "- **Decided By:** Sam Lee (Product Owner) on 2026-09-30";

function validTriageFinal() {
	return edit("| Business value | Pending PO |", "| Business value | 4 |").replace("- **Final (PO):** Pending", `- **Final (PO):** todo\n${DECIDED_BY}`);
}

test("accepts a valid proposed triage and returns structured data", () => {
	const result = validateTriageContent(validTriage);
	assert.equal(result.evidence.length, 2);
	assert.equal(result.scores.customerValue, 4);
	assert.equal(result.scores.businessValue, null);
	assert.equal(result.decision.proposed, "todo");
});

test("accepts a valid final triage", () => {
	const result = validateTriageContent(validTriageFinal(), "triage.md", { stage: "final" });
	assert.equal(result.decision.final, "todo");
	assert.equal(result.scores.businessValue, 4);
});

test("rejects empty, wrong heading, and wrong section order", () => {
	rejects("", /empty/);
	rejects(edit("# Triage:", "# Think:"), /level-one heading/);
	rejects(edit("## Scorecard", "## Scores"), /heading 4/);
	rejects(`${validTriage}\n## Extra\nx\n`, /exactly 6/);
});

test("rejects missing or placeholder issue fields", () => {
	rejects(edit("- **Source:** Discovery call with the Operations Director, 2026-09-24\n", ""), /missing the "- \*\*Source:\*\*"/);
	rejects(edit("Reconcile SAP exports with local inventory automatically", "TBD"), /"Title" is empty or a placeholder/);
});

test("rejects evidence problems", () => {
	rejects(edit("| E2 | ticket-cluster | support/2026-09-export.csv | 14 tickets |", "| E1 | ticket-cluster | support/x.csv | 14 tickets |"), /duplicated/);
	rejects(edit("transcript-quote |", "paraphrase |"), /type "paraphrase"/);
	rejects(edit("14 tickets", "1 ticket"), /count of at least 2/);
	rejects(edit(`"${QUOTE}"`, QUOTE), /wrapped in double quotes/);
	rejects(edit(`"${QUOTE}"`, '"Our managers ... lose time every day."'), /ellipsis/);
	rejects(edit("meetings/2026-09-24-acme-discovery/transcript.md#15:14:32", "TBD"), /real reference/);
});

test("rejects evidence that is only anecdotal", () => {
	const onlyNote = edit(/\| E1 .*\n\| E2 .*\n/.exec(validTriage)[0], `| E1 | field-note | notes/visit.md | "A manager mentioned the morning delay." |\n`);
	rejects(onlyNote, /non-anecdotal/);
});

test("accepts evidence emitted by Learn as non-anecdotal", () => {
	for (const type of ["incident", "telemetry", "hypothesis-verdict"]) {
		const learn = edit(/\| E1 .*\n\| E2 .*\n/.exec(validTriage)[0], `| E1 | ${type} | docs/incidents/2026-10-01-checkout-errors.md | SEV2 checkout error rate above threshold |\n`);
		assert.equal(validateTriageContent(learn).evidence[0].type, type);
	}
});

test("verifies quotes verbatim against sources", () => {
	validateTriageContent(validTriage, "triage.md", { sources: [`Intro.\n  ${QUOTE.replace(" 45 ", "\n45 ")}\nOutro`] });
	rejects(validTriage, /not found verbatim/, { sources: ["Operations Director discussed delays in general."] });
});

test("rejects a blast radius tier and code blocks", () => {
	rejects(edit("- **Early Risk:** Depends on SAP data quality.", "- **Early Risk:** Blast radius tier: High."), /blast radius/);
	rejects(`${validTriage.replace("## Ambiguities", "```js\nconst x = 1;\n```\n\n## Ambiguities")}`, /source code/);
	rejects(`${validTriage.replace("## Ambiguities", "```\nplain block\n```\n\n## Ambiguities")}`, /source code/);
});

test("rejects a blast radius tier written in any section or phrasing", () => {
	rejects(edit("- **Unknowns:** _None._", "- **Unknowns:** _None._\n- **Blast Radius:** High"), /blast radius/);
	rejects(edit("High customer value, corroborated by tickets.", "The blast radius is critical here."), /blast radius/);
	rejects(edit("costing 45 minutes per day each.", "costing 45 minutes per day each (blast radius: Low)."), /blast radius/);
	assert.equal(validateTriageContent(edit("Depends on SAP data quality.", "Depends on SAP data quality; Think sets the blast radius.")).decision.proposed, "todo");
});

test("rejects bad scorecards", () => {
	rejects(edit("| Effort | 3 |", "| Effort | 7 |"), /Effort must be an integer from 1 to 5/);
	rejects(edit("| Confidence | High |", "| Confidence | Certain |"), /Confidence must be one of/);
	rejects(edit("| Risk | 2 | No auth boundary involved. |\n", ""), /missing the "Risk" row/);
	rejects(edit("| Effort | 3 | One service and one connector. |", "| Effort | 3 | |"), /needs a rationale/);
	rejects(edit("| Effort | 3 |", "| Velocity | 3 |"), /not one of/);
});

test("forces explore for high value with low confidence", () => {
	const low = edit("| Confidence | High |", "| Confidence | Low |");
	rejects(low, /must be "explore"/);
	const explored = low.replace("- **Proposed:** todo", "- **Proposed:** explore").replace("- **Evidence to Gather:** _None._", "- **Evidence to Gather:** Interview two more regional managers.");
	assert.equal(validateTriageContent(explored).decision.proposed, "explore");
});

test("requires evidence to gather when exploring", () => {
	rejects(edit("- **Proposed:** todo", "- **Proposed:** explore"), /requires "Evidence to Gather"/);
});

test("proposed stage keeps the final decision with the Product Owner", () => {
	rejects(edit("- **Final (PO):** Pending", "- **Final (PO):** todo"), /must be "Pending"/);
});

test("final stage requires PO score, decision, and override rationale", () => {
	rejects(edit("- **Final (PO):** Pending", "- **Final (PO):** todo"), /business value|Business value/i, { stage: "final" });
	rejects(validTriageFinal().replace("- **Final (PO):** todo", "- **Final (PO):** Pending"), /must be set by the Product Owner/, { stage: "final" });
	rejects(edit("- **Final (PO):** Pending", `- **Final (PO):** Pending\n${DECIDED_BY}`), /Decided By must be "Pending"/);
	rejects(validTriageFinal().replace(`\n${DECIDED_BY}`, ""), /Decided By must name the Product Owner/, { stage: "final" });
	rejects(validTriageFinal().replace(DECIDED_BY, "- **Decided By:** Pending"), /Decided By must name the Product Owner/, { stage: "final" });
	rejects(validTriageFinal().replace("Sam Lee (Product Owner)", "Sam Lee (Developer)"), /Decided By must name the Product Owner/, { stage: "final" });
	rejects(validTriageFinal().replace("Sam Lee (Product Owner)", "Copilot Agent (Product Owner)"), /never an AI/, { stage: "final" });
	rejects(validTriageFinal().replace("2026-09-30", "2026-13-40"), /valid date/, { stage: "final" });
	const overridden = validTriageFinal().replace("- **Final (PO):** todo", "- **Final (PO):** later");
	rejects(overridden, /Override Rationale/, { stage: "final" });
	const ok = overridden.replace("- **Final (PO):** later", "- **Final (PO):** later\n- **Override Rationale:** Strategic freeze this quarter.");
	assert.equal(validateTriageContent(ok, "triage.md", { stage: "final" }).decision.final, "later");
	rejects(validTriage, /Unknown stage/, { stage: "draft" });
});

test("proposed stage requires Business value to stay Pending PO", () => {
	rejects(edit("| Business value | Pending PO |", "| Business value | 4 |"), /must be "Pending PO" in the proposed stage/);
	assert.equal(validateTriageContent(edit("| Business value | Pending PO |", "| Business value | pending po |")).scores.businessValue, null);
	assert.equal(validateTriageContent(validTriageFinal(), "triage.md", { stage: "final" }).scores.businessValue, 4);
});

test("final stage needs an override rationale when the PO answers a low-confidence high-value need with todo", () => {
	const lowFinal = (final, extra = "") =>
		validTriageFinal()
			.replace("| Confidence | High |", "| Confidence | Low |")
			.replace("- **Proposed:** todo", "- **Proposed:** explore")
			.replace("- **Evidence to Gather:** _None._", "- **Evidence to Gather:** Interview two more regional managers.")
			.replace("- **Final (PO):** todo", `- **Final (PO):** ${final}${extra}`);
	rejects(lowFinal("todo"), /"explore" need; Final \(PO\) "todo" needs an "Override Rationale"/, { stage: "final" });
	rejects(lowFinal("todo", "\n- **Override Rationale:** TBD"), /Override Rationale/, { stage: "final" });
	assert.equal(validateTriageContent(lowFinal("todo", "\n- **Override Rationale:** The Operations Director confirmed the need in writing."), "triage.md", { stage: "final" }).decision.final, "todo");
	assert.equal(validateTriageContent(lowFinal("explore"), "triage.md", { stage: "final" }).decision.final, "explore");
	assert.equal(validateTriageContent(lowFinal("later", "\n- **Override Rationale:** Strategic freeze this quarter."), "triage.md", { stage: "final" }).decision.final, "later");
});

const ledgerText = `# Triage Ledger

| Issue | Title | Decision | Date | Rationale |
|---|---|---|---|---|
| issue-7 | Reconcile SAP exports with local inventory | no | 2026-08-02 | Covered by the SAP connector roadmap. |
| issue-9 | Dashboard for dispatch times | later | 2026-08-10 | Not this quarter. |
`;

test("parses the ledger and rejects invalid decisions", () => {
	assert.equal(parseLedger(ledgerText).length, 2);
	assert.throws(() => parseLedger(ledgerText.replace("| no |", "| maybe |")), /invalid decision/);
	assert.throws(() => parseLedger(ledgerText.replace("Covered by the SAP connector roadmap.", "")), /needs a rationale/);
	assert.throws(() => parseLedger(ledgerText.replace("2026-08-02", "2026-13-02")), /valid date/);
	assert.throws(() => parseLedger(ledgerText.replace("| issue-7 |", "| 7 |")), /issue-<number>/);
});

test("ledger blocks re-proposing a rejected need unless reopened", () => {
	const triage = validateTriageContent(validTriage);
	const rows = parseLedger(ledgerText);
	assert.match(checkLedger(triage, rows, "issue-42").errors[0], /issue-7/);
	const reopened = validateTriageContent(edit("- **Final (PO):** Pending", "- **Reopens:** issue-7\n- **Final (PO):** Pending"));
	assert.deepEqual(checkLedger(reopened, rows, "issue-42").errors, []);
	assert.deepEqual(checkLedger(triage, rows, "issue-7").errors, []);
});

test("ledger warns on similar non-rejected needs and exact duplicates are errors", () => {
	const similar = validateTriageContent(edit("Reconcile SAP exports with local inventory automatically", "Dashboard showing dispatch times by region"));
	const { errors, warnings } = checkLedger(similar, parseLedger(ledgerText), "issue-42");
	assert.deepEqual(errors, []);
	assert.match(warnings[0], /issue-9/);
	const exact = validateTriageContent(edit("Reconcile SAP exports with local inventory automatically", "Dashboard for dispatch times"));
	assert.match(checkLedger(exact, parseLedger(ledgerText), "issue-42").errors[0], /issue-9/);
	assert.ok(similarity("a b", "") === 0);
});

test("CLI validates a directory, sources, ledger, and stages", async () => {
	const root = await mkdtemp(join(tmpdir(), "triage-"));
	const issueDir = join(root, "issue-42");
	await mkdir(issueDir);
	await writeFile(join(issueDir, "triage.md"), validTriage);
	await writeFile(join(root, "transcript.md"), `Speaker: ${QUOTE}`);
	await writeFile(join(root, "ledger.md"), ledgerText.replace("issue-7 | Reconcile SAP exports with local inventory", "issue-7 | Something unrelated about billing"));

	const quiet = (fn) => {
		const log = console.log;
		const error = console.error;
		const warn = console.warn;
		console.log = console.error = console.warn = () => {};
		return fn().finally(() => Object.assign(console, { log, error, warn }));
	};

	assert.equal(await quiet(() => runValidator(["--dir", issueDir, "--source", join(root, "transcript.md"), "--ledger", join(root, "ledger.md")])), 0);
	assert.equal(await quiet(() => runValidator(["--dir", issueDir, "--stage", "final"])), 1);
	assert.equal(await quiet(() => runValidator(["--dir", join(root, "missing")])), 1);
	assert.equal(await quiet(() => runValidator([])), 1);
	assert.equal(await quiet(() => runValidator(["--help"])), 0);
	assert.equal(await quiet(() => runValidator(["--dir", issueDir, "--stage=final"])), 1, "a mistyped flag must not silently fall back to the proposed stage");
	assert.equal(await quiet(() => runValidator(["--dir", issueDir, "--stage"])), 1);
});
