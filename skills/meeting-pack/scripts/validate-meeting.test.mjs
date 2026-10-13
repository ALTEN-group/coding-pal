import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CONFIRMED, QUOTE_1, makePack, validGlossary, validTranscript } from "./meeting-fixtures.mjs";
import {
	ValidationError,
	runValidator,
	sha256,
	validateGlossaryContent,
	validatePackContent,
	validateTranscriptContent,
	parseSanctionedTools,
} from "./validate-meeting.mjs";

const matches = (pattern) => (err) => err instanceof ValidationError && pattern.test(err.message);
const transcript = (from, to) => validTranscript.replace(from, to);
const badTranscript = (md, pattern) => assert.throws(() => validateTranscriptContent(md), matches(pattern));
const parsed = validateTranscriptContent(validTranscript);
const glossary = validateGlossaryContent(validGlossary);
const ctx = { transcript: parsed, transcriptRaw: validTranscript, glossary };
const pack = (from, to, confirmation) => makePack(undefined, confirmation).replace(from, to);
const badPack = (md, pattern, options = ctx) => assert.throws(() => validatePackContent(md, "pack.md", options), matches(pattern));

test("accepts a valid transcript and returns structured data", () => {
	assert.equal(parsed.lines.length, 6);
	assert.equal(parsed.speakers.get("Dana Moreau").side, "client");
	assert.equal(parsed.duration, 2530);
});

test("rejects transcript header problems", () => {
	badTranscript("", /empty/);
	badTranscript(transcript("# Transcript:", "# Notes:"), /level-one heading/);
	badTranscript(transcript("2026-09-24", "2026-13-45"), /valid ISO date/);
	badTranscript(transcript("Yes - announced", "No - announced"), /Recording Consent must start with "Yes"/);
	badTranscript(transcript("00:42:10", "42 minutes"), /HH:MM:SS/);
	badTranscript(transcript("- **Tool:** Sanctioned meeting tool\n", ""), /missing the "- \*\*Tool:\*\*"/);
});

test("rejects bad speakers and transcript lines", () => {
	badTranscript(transcript("| Dana Moreau | Operations Director | client |", "| Dana Moreau | Operations Director | partner |"), /side "partner"/);
	badTranscript(transcript("| Dana Moreau | Operations Director | client |\n", ""), /Dana Moreau" who is not in the Speakers table|at least one client-side person/);
	badTranscript(transcript("[00:16:10] Sam Lee:", "[00:16:10] Sam Lee"), /"\[HH:MM:SS\] Speaker: text"/);
	badTranscript(transcript("[00:16:10] Sam Lee:", "[00:16:10] Stranger:"), /"Stranger" who is not in the Speakers table/);
	badTranscript(transcript("[00:16:10] Sam Lee", "[00:01:10] Sam Lee"), /goes backwards/);
	badTranscript(transcript("[00:30:55]", "[01:30:55]"), /after the declared Duration/);
	assert.equal(validateTranscriptContent(transcript("## Transcript\n", "## Transcript\n\n")).lines.length, 6);
});

test("accepts a valid glossary and resolves aliases", () => {
	assert.equal(glossary.lookup("cross-check"), "Reconciliation");
	assert.equal(glossary.lookup("Dispatch Window"), "Dispatch window");
	assert.equal(glossary.lookup("unknown"), null);
	assert.throws(() => validateGlossaryContent(validGlossary.replace("cross-check, tally", "Dispatch window")), /defined more than once/);
	assert.throws(() => validateGlossaryContent(validGlossary.replace("# Glossary", "# Terms")), /# Glossary/);
	assert.throws(() => validateGlossaryContent(validGlossary.replace("docs/specs/dispatch.md", "TBD")), /definition and a source/);
});

test("accepts a valid draft pack and warns on missing attendance", () => {
	const result = validatePackContent(makePack(), "pack.md", ctx);
	assert.equal(result.needs.length, 1);
	assert.equal(result.terms.length, 3);
	assert.deepEqual(result.warnings, []);
	const noDev = validatePackContent(pack("| Alex Kim | Developer | internal |\n  ", ""), "pack.md", { ...ctx, transcript: undefined, glossary: undefined });
	assert.match(noDev.warnings[0], /Developer/);
});

test("rejects pack structure problems", () => {
	badPack("", /empty/);
	badPack(pack("# Meeting Pack:", "# Pack:"), /level-one heading/);
	badPack(pack("## Confirmation", "## Sign-off"), /heading #5/);
	badPack(pack("SHA-256:** ", "SHA-256:** zz"), /64-character hex/);
	badPack(pack("`meetings/2026-09-24-acme-discovery/transcript.md`", "`meetings/x/notes.md`"), /transcript\.md path/);
	badPack(pack("| Dana Moreau | Operations Director | client |\n  | Priya Nair | Regional Manager | client |", "| Dana Moreau | Operations Director | internal |"), /at least one client-side/);
});

test("the pack must match the immutable transcript", () => {
	badPack(makePack("0".repeat(64)), /does not match transcript\.md/);
	badPack(pack("- **Date:** 2026-09-24\n- **Transcript", "- **Date:** 2026-09-23\n- **Transcript"), /differs from transcript\.md Date/);
	badPack(pack("  | Alex Kim | Developer | internal |\n", ""), /Participants must include Alex Kim/);
});

test("the executive summary stays within one page", () => {
	const long = `${"word ".repeat(360)}end`;
	badPack(pack("Two disconnected data sources, manual cross-referencing, and no single view of mismatches.", long), /one page/);
	badPack(pack("- **Urgency:** Trucks cannot leave until the reconciliation is done, so it delays every delivery day.\n", ""), /missing the "- \*\*Urgency:\*\*"/);
});

test("terminology rules against transcript and glossary", () => {
	badPack(pack("| SOH dump | SOH dump | The stock-on-hand export from SAP. | new | 00:30:55 |", "| SOH dump | SOH dump | The stock-on-hand export from SAP. | maybe | 00:30:55 |"), /status must be one of/);
	badPack(pack("| Dispatch window | dispatch slot |", "| Dispatch window | dispatch window |"), /is a correction, so "Heard As" must differ/);
	badPack(pack("| Dispatch window | dispatch window |", "| Dispatch window | other |"), /is known, so "Heard As" must equal the term/);
	badPack(pack("| SOH dump | SOH dump | The stock-on-hand export from SAP. | new | 00:30:55 |", "| SOH dump | SOH dump | The stock-on-hand export from SAP. | new | 00:30:00 |"), /no transcript line at \[00:30:00\]/);
	badPack(pack("| SOH dump | SOH dump | The stock-on-hand export from SAP. | new | 00:30:55 |", "| SOH dump | SOH dump | The stock-on-hand export from SAP. | new | 00:16:10 |"), /was not found in the transcript/);
	badPack(pack("| Dispatch window | dispatch window | The time slot when trucks may leave. | known |", "| Dispatch window | dispatch window | The time slot when trucks may leave. | new |"), /marked new but already exists/);
	badPack(pack("| SOH dump | SOH dump | The stock-on-hand export from SAP. | new |", "| SOH dump | SOH dump | The stock-on-hand export from SAP. | known |"), /marked known but is not in the glossary/);
	badPack(pack("**Concepts:** Dispatch window, SOH dump", "**Concepts:** Dispatch window, Lorry"), /neither in the terminology table nor the glossary/);
});

test("candidate needs need verbatim client evidence", () => {
	badPack(pack(`"${QUOTE_1}"`, "\"Our managers lose about forty-five minutes each morning.\""), /not found verbatim/);
	badPack(pack(`"${QUOTE_1}"`, '"Our managers ... lose time."'), /ellipsis/);
	badPack(pack(`"${QUOTE_1}"`, QUOTE_1), /wrapped in double quotes/);
	badPack(pack("Dana Moreau (Operations Director) | \"Our regional", "Dana Moreau (Ops) | \"Our regional"), /does not match the transcript Speakers table/);
	badPack(pack("Dana Moreau (Operations Director) | \"Our regional", "Dana Moreau | \"Our regional"), /formatted "Name \(Role\)"/);
	badPack(pack("| E1 | 00:15:32 | Dana", "| E1 | 00:15:33 | Dana"), /no line by Dana Moreau at \[00:15:33\]/);
	badPack(pack("**Concepts:** Dispatch window, SOH dump", "**Concepts:** Dispatch window, SOH dump").replace(/\| E1 \| 00:15:32 \| Dana Moreau \(Operations Director\)/, "| E1 | 00:00:05 | Sam Lee (Product Owner)"), /not found verbatim/);
	badPack(pack("### N1:", "### N2:"), /sequential/);
	badPack(pack("then every mismatch is listed in one place", "everything is fine"), /"Given \.\.\., then \.\.\."/);
	badPack(pack("then every mismatch is listed in one place", "then ok"), /at least 3 words after "then"/);
	badPack(pack("then every mismatch is listed in one place", "then ..."), /at least 3 words after "then"/);
	assert.equal(validatePackContent(pack("then every mismatch is listed in one place", "then all mismatches appear"), "pack.md", ctx).needs[0].criteria.length, 1);
});

test("rejects duplicate fields instead of taking the last value", () => {
	badTranscript(transcript("- **Tool:** Sanctioned meeting tool\n", "- **Tool:** Sanctioned meeting tool\n- **Tool:** Another tool\n"), /"header" has the "- \*\*Tool:\*\*" field more than once/);
	badTranscript(transcript("- **Date:** 2026-09-24\n", "- **Date:** 2026-09-24\n- **date:** 2026-09-25\n"), /more than once/);
	badPack(pack("- **Date:** 2026-09-24\n", "- **Date:** 2026-09-24\n- **Date:** 2026-09-24\n"), /"## Meeting" has the "- \*\*Date:\*\*" field more than once/);
	badPack(pack("- **Urgency:**", "- **Urgency:** Duplicate.\n- **Urgency:**"), /"## Executive Summary" has the "- \*\*Urgency:\*\*" field more than once/);
	badPack(pack("- **Client Confirmation:** Pending", "- **Client Confirmation:** Pending\n- **Client Confirmation:** Pending"), /"## Confirmation" has the "- \*\*Client Confirmation:\*\*" field more than once/);
	badPack(pack("- **Concepts:** Dispatch window, SOH dump", "- **Concepts:** Dispatch window\n- **Concepts:** SOH dump"), /"need N1" has the "- \*\*Concepts:\*\*" field more than once/);
});

test("a need quoted only by internal staff is rejected", () => {
	const internalOnly = makePack()
		.replace(/\| E1 \|.*\n/, '| E1 | 00:00:05 | Sam Lee (Product Owner) | "Let\'s start with your morning dispatch process." |\n')
		.replace(/  \| E2 \|.*\n/, "");
	badPack(internalOnly, /client-side speaker/);
});

test("candidate needs may be absent", () => {
	const none = makePack().replace(/## Candidate Business Needs[\s\S]*?## Confirmation/, "## Candidate Business Needs\n_None._\n\n## Confirmation");
	assert.equal(validatePackContent(none, "pack.md", ctx).needs.length, 0);
});

test("draft stage keeps confirmations with people", () => {
	badPack(pack("**Client Confirmation:** Pending", "**Client Confirmation:** Confirmed by Dana Moreau on 2026-09-26"), /must be "Pending" in the draft stage/);
});

test("confirmed stage requires named human confirmations", () => {
	const confirmed = (overrides = {}) => makePack(undefined, { ...CONFIRMED, ...overrides });
	assert.equal(validatePackContent(confirmed(), "pack.md", { ...ctx, stage: "confirmed" }).needs.length, 1);
	const run = (md, pattern) => assert.throws(() => validatePackContent(md, "pack.md", { ...ctx, stage: "confirmed" }), matches(pattern));
	run(makePack(), /Speaker Verification must be completed by a named person/);
	run(confirmed({ speaker: "Verified by Someone Else on 2026-09-25" }), /Speaker Verification must be by a meeting participant/);
	run(confirmed({ readBack: "Done by Alex Kim on 2026-09-24" }), /Read-Back must be done by the Product Owner/);
	run(confirmed({ client: "Confirmed by Sam Lee on 2026-09-26" }), /client-side participant/);
	run(confirmed({ sent: "Sent to Dana Moreau on 2026-09-20" }), /on or after the meeting date/);
	run(confirmed({ client: "Corrected by Dana Moreau on 2026-13-40" }), /valid date/);
	assert.equal(validatePackContent(confirmed({ client: "Corrected by Dana Moreau on 2026-09-26" }), "pack.md", { ...ctx, stage: "confirmed" }).needs.length, 1);
	assert.throws(() => validatePackContent(makePack(), "pack.md", { stage: "published" }), /Unknown stage/);
});

test("CLI validates a meeting directory, stages, and the glossary", async () => {
	const root = await mkdtemp(join(tmpdir(), "meetings-"));
	const dir = join(root, "2026-09-24-acme-discovery");
	await mkdir(dir);
	await writeFile(join(dir, "transcript.md"), validTranscript);
	await writeFile(join(dir, "pack.md"), makePack());
	await writeFile(join(root, "glossary.md"), validGlossary);
	const bad = join(root, "2026-09-25-wrong-date");
	await mkdir(bad);
	await writeFile(join(bad, "transcript.md"), validTranscript);
	const unnamed = join(root, "Acme Call");
	await mkdir(unnamed);
	await writeFile(join(unnamed, "transcript.md"), validTranscript);

	const [log, error, warn] = [console.log, console.error, console.warn];
	console.log = console.error = console.warn = () => {};
	try {
		assert.equal(await runValidator(["--dir", dir, "--glossary", join(root, "glossary.md")]), 0);
		assert.equal(await runValidator(["--dir", dir]), 0);
		assert.equal(await runValidator(["--dir", dir, "--stage", "confirmed"]), 1);
		assert.equal(await runValidator(["--dir", bad]), 1);
		assert.equal(await runValidator(["--dir", unnamed]), 1);
		assert.equal(await runValidator(["--dir", join(root, "missing")]), 1);
		assert.equal(await runValidator(["--glossary", join(root, "glossary.md")]), 0);
		assert.equal(await runValidator(["--transcript", join(dir, "transcript.md")]), 0);
		await writeFile(join(dir, "transcript.md"), `${validTranscript}[00:31:00] Sam Lee: Edited afterwards.\n`);
		assert.equal(await runValidator(["--dir", dir]), 1);
		assert.equal(sha256("a").length, 64);
		assert.equal(await runValidator([]), 1);
		assert.equal(await runValidator(["--help"]), 0);
	} finally {
		Object.assign(console, { log, error, warn });
	}
});

test("sanctioned tools list: bullets, plain lines, and comments", () => {
	assert.deepEqual(parseSanctionedTools("# Sanctioned tools\n\n- Sanctioned meeting tool  # enterprise tenant\n* Other Tool\n"), ["Sanctioned meeting tool", "Other Tool"]);
	assert.deepEqual(parseSanctionedTools("# Sanctioned tools\nProse around the list is ignored.\n\n- Only Tool\n"), ["Only Tool"]);
	assert.deepEqual(parseSanctionedTools("# Tools\nPlain Tool\nSecond Tool\n"), ["Plain Tool", "Second Tool"]);
	assert.throws(() => parseSanctionedTools("# nothing here\n\n"), matches(/lists no sanctioned tools/));
});

test("the transcript Tool must be on the sanctioned list when one is given", () => {
	assert.equal(validateTranscriptContent(validTranscript, "transcript.md", { sanctioned: ["sanctioned MEETING tool"] }).tool, "Sanctioned meeting tool");
	assert.throws(
		() => validateTranscriptContent(validTranscript, "transcript.md", { sanctioned: ["Other tool", "Sanctioned meeting"] }),
		matches(/meeting tool is not on the sanctioned list/),
	);
});

test("CLI checks --sanctioned against the transcript Tool", async () => {
	const root = await mkdtemp(join(tmpdir(), "sanctioned-"));
	const dir = join(root, "2026-09-24-acme-discovery");
	await mkdir(dir);
	await writeFile(join(dir, "transcript.md"), validTranscript);
	await writeFile(join(dir, "pack.md"), makePack());
	await writeFile(join(root, "ok.md"), "# Sanctioned tools\n\n- Sanctioned meeting tool\n- Another tool\n");
	await writeFile(join(root, "other.md"), "- Another tool\n");
	await writeFile(join(root, "empty.md"), "# Sanctioned tools\n");

	const [log, error, warn] = [console.log, console.error, console.warn];
	console.log = console.error = console.warn = () => {};
	try {
		assert.equal(await runValidator(["--dir", dir, "--sanctioned", join(root, "ok.md")]), 0);
		assert.equal(await runValidator(["--transcript", join(dir, "transcript.md"), "--sanctioned", join(root, "ok.md")]), 0);
		assert.equal(await runValidator(["--dir", dir, "--sanctioned", join(root, "other.md")]), 1);
		assert.equal(await runValidator(["--dir", dir, "--sanctioned", join(root, "empty.md")]), 1);
		assert.equal(await runValidator(["--dir", dir, "--sanctioned", join(root, "missing.md")]), 1);
		assert.equal(await runValidator(["--glossary", join(root, "ok.md"), "--sanctioned", join(root, "ok.md")]), 1);
		assert.equal(await runValidator(["--dir", dir]), 0, "the list is optional");
	} finally {
		Object.assign(console, { log, error, warn });
	}
});

test("each term and heard-as pair is listed once", () => {
	badPack(
		pack("| SOH dump | SOH dump | The stock-on-hand export from SAP. | new | 00:30:55 |", "| SOH dump | SOH dump | The stock-on-hand export from SAP. | new | 00:30:55 |\n| soh dump | SOH Dump | Again. | new | 00:30:55 |"),
		/is listed twice/,
	);
});

test("confirmed stage rejects AI names and a non-client summary recipient", () => {
	const run = (overrides, pattern) =>
		assert.throws(
			() => validatePackContent(makePack(undefined, { ...CONFIRMED, ...overrides }), "pack.md", { stage: "confirmed" }),
			matches(pattern),
		);
	const withBot = (md) => md.replace("| Priya Nair | Regional Manager | client |", "| Priya Nair | Regional Manager | client |\n  | Fireflies Notetaker Bot | Meeting Bot | internal |");
	assert.throws(
		() => validatePackContent(withBot(makePack(undefined, { ...CONFIRMED, speaker: "Verified by Fireflies Notetaker Bot on 2026-09-25" })), "pack.md", { stage: "confirmed" }),
		matches(/never an AI or automation/),
	);
	run({ sent: "Sent to Sam Lee on 2026-09-25" }, /client-side participant as the recipient/);
	run({ sent: "Sent to Nobody Known on 2026-09-25" }, /client-side participant as the recipient/);
});

test("transcript timestamps must be real clock values", () => {
	badTranscript(transcript("[00:16:10] Sam Lee:", "[00:99:10] Sam Lee:"), /"\[HH:MM:SS\] Speaker: text"/);
	badTranscript(transcript("[00:16:10] Sam Lee:", "[00:16:75] Sam Lee:"), /"\[HH:MM:SS\] Speaker: text"/);
});

test("a quote may come from any line by that speaker at a shared timestamp", () => {
	const shared = validTranscript.replace("[00:15:32] Dana Moreau:", "[00:15:32] Dana Moreau: First thing said.\n[00:15:32] Dana Moreau:");
	const result = validatePackContent(makePack(sha256(shared)), "pack.md", {
		transcript: validateTranscriptContent(shared),
		transcriptRaw: shared,
		glossary,
	});
	assert.equal(result.needs.length, 1);
});

test("CLI refuses a directory without pack.md, a mistyped flag, and an unknown stage", async () => {
	const root = await mkdtemp(join(tmpdir(), "meetings-gate-"));
	const dir = join(root, "2026-09-24-acme-discovery");
	await mkdir(dir);
	await writeFile(join(dir, "transcript.md"), validTranscript);

	const [log, error, warn] = [console.log, console.error, console.warn];
	console.log = console.error = console.warn = () => {};
	try {
		assert.equal(await runValidator(["--dir", dir]), 1, "no pack.md must not pass");
		assert.equal(await runValidator(["--dir", dir, "--stage", "confirmed"]), 1);
		assert.equal(await runValidator(["--transcript", join(dir, "transcript.md"), "--stage", "confirmed"]), 1);
		assert.equal(await runValidator(["--transcript", join(dir, "transcript.md"), "--stage", "bogus"]), 1);
		await writeFile(join(dir, "pack.md"), makePack());
		assert.equal(await runValidator(["--dir", dir, "--stage=confirmed"]), 1, "a mistyped flag must not fall back to the draft stage");
		assert.equal(await runValidator(["--dir", dir, "--glossary", join(root, "missing.md")]), 1);
		assert.equal(await runValidator(["--dir", dir]), 0);
	} finally {
		Object.assign(console, { log, error, warn });
	}
});
