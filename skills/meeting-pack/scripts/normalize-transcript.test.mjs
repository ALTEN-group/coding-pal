import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parsePlainText, renderTranscript, runNormalizer, toTimestamp } from "./normalize-transcript.mjs";
import { sha256, validateTranscriptContent } from "./validate-meeting.mjs";

const roster = {
	"Dana Moreau": { role: "Operations Director", side: "client" },
	"Sam Lee": { role: "Product Owner", side: "internal" },
};
const meta = { title: "Acme call", date: "2026-09-24", tool: "Sanctioned tool", sourceFile: "call.txt", consent: "Yes - announced at the start" };

test("normalizes timestamps", () => {
	assert.equal(toTimestamp("5:07").text, "00:05:07");
	assert.equal(toTimestamp("1:02:03").seconds, 3723);
	assert.throws(() => toTimestamp("1:75"), /invalid timestamp/);
});

test("parses bracketed, leading, trailing, and header-style lines", () => {
	const text = [
		"[00:05] Sam Lee: Thanks for joining.",
		"00:20 Dana Moreau: Our managers lose time every morning.",
		"Sam Lee (00:40): Why is that?",
		"Dana Moreau [01:05] Because the exports do not match.",
		"",
		"Sam Lee 1:30",
		"Understood.",
		"Please go on.",
		"",
	].join("\n");
	const u = parsePlainText(text);
	assert.deepEqual(u.map((x) => [x.ts, x.speaker]), [
		["00:05", "Sam Lee"],
		["00:20", "Dana Moreau"],
		["00:40", "Sam Lee"],
		["01:05", "Dana Moreau"],
		["1:30", "Sam Lee"],
	]);
	assert.equal(u[4].text, "Understood. Please go on.");
});

test("joins wrapped lines and rejects unattributed text", () => {
	const u = parsePlainText("[00:05] Sam Lee: First part\nsecond part wrapped");
	assert.equal(u[0].text, "First part second part wrapped");
	assert.throws(() => parsePlainText("no speaker here"), /no timestamp or speaker/);
	assert.throws(() => parsePlainText("   \n"), /no transcript lines/);
	assert.throws(() => parsePlainText("Sam Lee 0:05\n\n"), /has no text/);
});

test("renders a canonical transcript that passes the validator", () => {
	const md = renderTranscript(meta, roster, parsePlainText("[00:05] Sam Lee: Hello there.\n[00:20] dana moreau: We lose time every morning."));
	const t = validateTranscriptContent(md);
	assert.equal(t.duration, 20);
	assert.deepEqual([...t.speakers.keys()], ["Sam Lee", "Dana Moreau"]);
	assert.match(md, /\[00:00:20\] Dana Moreau: We lose time every morning\./);
	assert.match(renderTranscript({ ...meta, duration: "00:30:00" }, roster, parsePlainText("[00:05] Dana Moreau: Hi there.")), /\*\*Duration:\*\* 00:30:00/);
});

test("rejects unknown speakers, bad rosters, and backwards time", () => {
	assert.throws(() => renderTranscript(meta, roster, parsePlainText("[00:05] Stranger: Hello there.")), /not in the roster: Stranger/);
	assert.throws(() => renderTranscript(meta, { Dana: { role: "Director", side: "partner" } }, parsePlainText("[00:05] Dana: Hi.")), /needs a role and a side/);
	assert.throws(() => renderTranscript(meta, roster, parsePlainText("[00:20] Sam Lee: One.\n[00:05] Dana Moreau: Two.")), /goes backwards/);
});

test("CLI writes the transcript once and refuses to overwrite", async () => {
	const root = await mkdtemp(join(tmpdir(), "normalize-"));
	await writeFile(join(root, "call.txt"), "[00:05] Sam Lee: Thanks for joining.\n[00:20] Dana Moreau: We lose time every morning.\n");
	await writeFile(join(root, "roster.json"), JSON.stringify(roster));
	const out = join(root, "meeting");
	await mkdir(out);
	const base = ["--input", join(root, "call.txt"), "--roster", join(root, "roster.json"), "--title", "Acme call", "--date", "2026-09-24", "--tool", "Sanctioned tool", "--consent", "Yes - announced", "--output", join(out, "transcript.md")];

	const [log, error] = [console.log, console.error];
	const logged = [];
	console.log = (...a) => logged.push(a.join(" "));
	console.error = () => {};
	try {
		assert.equal(await runNormalizer(base), 0);
		const written = await readFile(join(out, "transcript.md"), "utf-8");
		assert.ok(logged.some((l) => l.includes(sha256(written))));
		assert.equal(await runNormalizer(base), 1);
		assert.equal(await runNormalizer([...base, "--force"]), 0);
		await writeFile(join(root, "roster.json"), JSON.stringify({ "Sam Lee": roster["Sam Lee"] }));
		assert.equal(await runNormalizer([...base, "--force"]), 1);
		assert.equal(await runNormalizer([]), 1);
		assert.equal(await runNormalizer(["--help"]), 0);
	} finally {
		Object.assign(console, { log, error });
	}
});

test("--force is refused once a sibling pack.md records the transcript digest", async () => {
	const root = await mkdtemp(join(tmpdir(), "normalize-pack-"));
	await writeFile(join(root, "call.txt"), "[00:05] Sam Lee: Thanks for joining.\n[00:20] Dana Moreau: We lose time every morning.\n");
	await writeFile(join(root, "roster.json"), JSON.stringify(roster));
	const out = join(root, "meeting");
	await mkdir(out);
	const base = ["--input", join(root, "call.txt"), "--roster", join(root, "roster.json"), "--title", "Acme call", "--date", "2026-09-24", "--tool", "Sanctioned tool", "--consent", "Yes - announced", "--output", join(out, "transcript.md")];

	const [log, error] = [console.log, console.error];
	const errors = [];
	console.log = () => {};
	console.error = (...a) => errors.push(a.join(" "));
	try {
		assert.equal(await runNormalizer(base), 0);
		const before = await readFile(join(out, "transcript.md"), "utf-8");
		await writeFile(join(out, "pack.md"), "# Meeting Pack: Acme call\n");
		assert.equal(await runNormalizer([...base, "--force"]), 1);
		assert.match(errors.at(-1), /pack\.md exists and records the digest of this transcript; the transcript is immutable once a pack exists/);
		assert.equal(await readFile(join(out, "transcript.md"), "utf-8"), before);
	} finally {
		Object.assign(console, { log, error });
	}
});

test("CLI creates the output directory and reports an invalid roster without a stack trace", async () => {
	const root = await mkdtemp(join(tmpdir(), "normalize-new-"));
	await writeFile(join(root, "call.txt"), "[00:05] Sam Lee: Thanks for joining.\n[00:20] Dana Moreau: We lose time every morning.\n");
	await writeFile(join(root, "roster.json"), JSON.stringify(roster));
	const out = join(root, "meetings", "2026-09-24-acme", "transcript.md");
	const base = ["--input", join(root, "call.txt"), "--roster", join(root, "roster.json"), "--title", "Acme call", "--date", "2026-09-24", "--tool", "Sanctioned tool", "--consent", "Yes - announced", "--output", out];

	const [log, error] = [console.log, console.error];
	const errors = [];
	console.log = () => {};
	console.error = (...a) => errors.push(a.join(" "));
	try {
		assert.equal(await runNormalizer(base), 0);
		assert.match(await readFile(out, "utf-8"), /^# Transcript: Acme call/);
		await writeFile(join(root, "roster.json"), "{ not json");
		assert.equal(await runNormalizer([...base, "--force"]), 1);
		assert.match(errors.at(-1), /roster\.json is not valid JSON/);
		assert.equal(await runNormalizer([...base.slice(0, 1), join(root, "nope.txt"), ...base.slice(2), "--force"]), 1);
		assert.doesNotMatch(errors.at(-1), /\n\s+at /);
	} finally {
		Object.assign(console, { log, error });
	}
});
