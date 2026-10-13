import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LogError, buildEntry, normalizeTopic, parseLog, proposeArtifacts, renderProposals, runCorrections } from "./context-corrections.mjs";

const entry = (topic, source, artifact = null, at = "2026-10-01T09:00:00Z") => JSON.stringify({ at, topic, source, artifact });

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

test("normalises topics to lowercase with collapsed whitespace", () => {
	assert.equal(normalizeTopic("  Use   Named\tExports \n"), "use named exports");
	assert.equal(normalizeTopic(undefined), "");
});

test("builds entries and rejects bad input", () => {
	assert.deepEqual(buildEntry({ topic: " Use  Named Exports ", source: "PR #12", artifact: "instructions/exports.instructions.md" }, "2026-10-13T09:00:00Z"), {
		at: "2026-10-13T09:00:00Z",
		topic: "use named exports",
		source: "PR #12",
		artifact: "instructions/exports.instructions.md",
	});
	assert.equal(buildEntry({ topic: "x", source: "#1" }).artifact, null);
	assert.match(buildEntry({ topic: "x", source: "#1" }).at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
	assert.throws(() => buildEntry({ topic: "  ", source: "#1" }), LogError);
	assert.throws(() => buildEntry({ topic: "x", source: " " }), /--source is required/);
	assert.throws(() => buildEntry({ topic: "x", source: "#1", artifact: "../x.md" }), /workspace-relative/);
	assert.throws(() => buildEntry({ topic: "x", source: "#1", artifact: "/etc/x" }), /workspace-relative/);
	assert.throws(() => buildEntry({ topic: "x\u0001y", source: "#1" }), /control characters/);
});

test("parses the log and names the offending line", () => {
	const entries = parseLog(`${entry("A  Topic", "#1")}\n\n${entry("a topic", "#2", "instructions/a.instructions.md")}\n`);
	assert.deepEqual(entries.map((e) => [e.topic, e.artifact]), [["a topic", null], ["a topic", "instructions/a.instructions.md"]]);
	assert.throws(() => parseLog(`${entry("a", "#1")}\n{broken\n`), /log line 2 is not valid JSON/);
	assert.throws(() => parseLog('{"source":"#1"}'), /line 1 needs a non-empty "topic"/);
	assert.throws(() => parseLog('{"topic":"a"}'), /line 1 needs a non-empty "source"/);
	assert.throws(() => parseLog('{"topic":"a","source":"#1","artifact":5}'), /"artifact" must be a path or null/);
	assert.throws(() => parseLog("null"), /needs a non-empty "topic"/);
	assert.deepEqual(parseLog(""), []);
});

test("proposes topics seen at least twice without an artifact", () => {
	const entries = parseLog(
		[
			entry("Use named exports", "PR #1"),
			entry("use  named exports", "PR #2"),
			entry("Prefer early returns", "PR #3"),
			entry("Never log tokens", "PR #4"),
			entry("never log tokens", "PR #5", "instructions/logging.instructions.md"),
			entry("Pin base images", "issue #6"),
			entry("pin base images", "issue #7"),
			entry("PIN BASE IMAGES", "issue #8"),
		].join("\n"),
	);
	const proposals = proposeArtifacts(entries);
	assert.deepEqual(proposals.map((p) => [p.topic, p.count]), [["pin base images", 3], ["use named exports", 2]]);
	assert.deepEqual(proposals[1].sources, ["PR #1", "PR #2"]);
	assert.deepEqual(proposeArtifacts(entries, 3).map((p) => p.topic), ["pin base images"]);
	assert.deepEqual(proposeArtifacts(entries, 1).map((p) => p.topic), ["pin base images", "use named exports", "prefer early returns"]);
	assert.deepEqual(proposeArtifacts([]), []);
	assert.match(renderProposals(proposals, 2), /- "pin base images": 3 times \(issue #6, issue #7, issue #8\)/);
	assert.match(renderProposals([], 2), /_None\._/);
});

test("propose counts distinct sources: the same source logged twice is one occurrence", () => {
	const entries = parseLog(
		[
			entry("use named exports", "PR #1"),
			entry("use named exports", "PR #1"),
			entry("pin base images", "PR #1"),
			entry("pin base images", "PR #2"),
			entry("pin base images", "PR #2"),
		].join("\n"),
	);
	const proposals = proposeArtifacts(entries);
	assert.deepEqual(proposals.map((p) => [p.topic, p.count, p.sources]), [["pin base images", 2, ["PR #1", "PR #2"]]]);
	assert.deepEqual(proposeArtifacts(entries, 3), []);
	assert.deepEqual(proposeArtifacts(entries, 1).map((p) => [p.topic, p.count]), [["pin base images", 2], ["use named exports", 1]]);
});

test("CLI appends to an append-only log and proposes", async () => {
	const dir = await mkdtemp(join(tmpdir(), "corrections-"));
	const log = join(dir, "nested", "corrections.jsonl");

	let result = await capture(() => runCorrections(["add", "--log", log, "--topic", "Use Named Exports", "--source", "PR #1"]));
	assert.equal(result.code, 0);
	assert.match(result.text, /Logged "use named exports" from PR #1/);
	await capture(() => runCorrections(["add", "--log", log, "--topic", "use named exports", "--source", "PR #2"]));
	await capture(() => runCorrections(["add", "--log", log, "--topic", "Pin base images", "--source", "PR #3", "--artifact", "instructions/docker.instructions.md"]));
	await capture(() => runCorrections(["add", "--log", log, "--topic", "pin base images", "--source", "PR #4"]));

	const lines = (await readFile(log, "utf-8")).trim().split("\n");
	assert.equal(lines.length, 4);
	assert.equal(JSON.parse(lines[0]).topic, "use named exports");

	result = await capture(() => runCorrections(["propose", "--log", log]));
	assert.equal(result.code, 0);
	assert.match(result.text, /- "use named exports": 2 times \(PR #1, PR #2\)/);
	assert.doesNotMatch(result.text, /pin base images/);
	result = await capture(() => runCorrections(["propose", "--log", log, "--min", "3"]));
	assert.match(result.text, /_None\._/);

	await writeFile(join(dir, "no-newline.jsonl"), entry("a", "#1"));
	assert.equal((await capture(() => runCorrections(["add", "--log", join(dir, "no-newline.jsonl"), "--topic", "b", "--source", "#2"]))).code, 0);
	assert.equal((await readFile(join(dir, "no-newline.jsonl"), "utf-8")).trim().split("\n").length, 2);

	await writeFile(join(dir, "broken.jsonl"), "{nope\n");
	assert.equal((await capture(() => runCorrections(["add", "--log", join(dir, "broken.jsonl"), "--topic", "b", "--source", "#2"]))).code, 1);
	assert.equal(await readFile(join(dir, "broken.jsonl"), "utf-8"), "{nope\n");
	assert.equal((await capture(() => runCorrections(["propose", "--log", join(dir, "broken.jsonl")]))).code, 1);
	assert.equal((await capture(() => runCorrections(["propose", "--log", join(dir, "missing.jsonl")]))).code, 1);
	assert.equal((await capture(() => runCorrections(["propose", "--log", log, "--min", "0"]))).code, 1);
	assert.equal((await capture(() => runCorrections(["add", "--log", log, "--topic", "x"]))).code, 1);
	assert.equal((await capture(() => runCorrections(["add", "--topic", "x", "--source", "#1"]))).code, 1);
	assert.equal((await capture(() => runCorrections(["frobnicate", "--log", log]))).code, 1);
	assert.equal((await capture(() => runCorrections(["add", "stray"]))).code, 1);
	assert.equal((await capture(() => runCorrections(["add", "--log", log, "--topic", "x", "--source", "#1", "--artefact", "a.md"]))).code, 1);
	assert.equal((await capture(() => runCorrections([]))).code, 1);
	assert.equal((await capture(() => runCorrections(["--help"]))).code, 0);
});
