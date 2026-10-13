import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runEmitter, buildEmission, marker, markerPath, repoRoot } from "./emit-candidates.mjs";
import { CONFIRMED, PACK_DIR, QUOTE_1, makePack, validGlossary, validTranscript } from "./meeting-fixtures.mjs";
import { validatePackContent } from "./validate-meeting.mjs";

const confirmedPack = () => validatePackContent(makePack(undefined, CONFIRMED), "pack.md", { stage: "confirmed" });

test("renders a candidate issue body whose evidence table matches the Triage contract", () => {
	const pack = confirmedPack();
	const { issues } = buildEmission(pack, PACK_DIR);
	assert.equal(issues.length, 1);
	const [issue] = issues;
	assert.equal(issue.marker, marker(PACK_DIR, "N1"));
	assert.deepEqual(issue.labels, ["needs:triage", "source:meeting"]);
	assert.match(issue.body, /^<!-- meeting-candidate: meetings\/2026-09-24-acme-discovery#N1 -->/);
	assert.match(issue.body, /\| ID \| Type \| Reference \| Quote or Count \|/);
	assert.match(issue.body, new RegExp(`\\| E1 \\| transcript-quote \\| ${PACK_DIR}/transcript.md#00:15:32 \\(Dana Moreau, Operations Director\\) \\| "${QUOTE_1.slice(0, 20)}`));
	assert.match(issue.body, /- Given SAP exports and local sheets/);
	assert.match(issue.body, /Client confirmation: Confirmed by Dana Moreau on 2026-09-26/);
});

test("stages new terms and aliases for the glossary", () => {
	const { glossary } = buildEmission(confirmedPack(), PACK_DIR);
	assert.match(glossary, /\| SOH dump \| The stock-on-hand export from SAP\. \| _None\._ \| meetings\/2026-09-24-acme-discovery\/pack\.md#00:30:55 \|/);
	assert.match(glossary, /\| Dispatch window \| dispatch slot \|/);
	const none = buildEmission({ ...confirmedPack(), terms: [] }, PACK_DIR).glossary;
	assert.equal(none.match(/_None\._/g).length, 2);
});

test("CLI records repository-relative markers and deletes stale candidate files", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "emit-git-")));
	const repo = join(root, "repo");
	const dir = join(repo, "meetings", "2026-09-24-acme-discovery");
	await mkdir(dir, { recursive: true });
	await mkdir(join(repo, "sub"));
	execFileSync("git", ["init", "--quiet"], { cwd: repo });
	await writeFile(join(dir, "transcript.md"), validTranscript);
	await writeFile(join(dir, "pack.md"), makePack(undefined, CONFIRMED));
	const out = join(root, "out");
	await mkdir(out);
	await writeFile(join(out, "candidate-N7.md"), "stale");
	await writeFile(join(out, "candidate-N1-old.md"), "stale");
	await writeFile(join(out, "notes.md"), "keep");

	const [log, error, cwd] = [console.log, console.error, process.cwd()];
	console.log = console.error = () => {};
	try {
		process.chdir(join(repo, "sub"));
		assert.equal(await runEmitter(["--dir", "../meetings/2026-09-24-acme-discovery", "--out", out]), 0);
		assert.equal(JSON.parse(await readFile(join(out, "candidates.json"), "utf-8"))[0].marker, `<!-- meeting-candidate: meetings/2026-09-24-acme-discovery#N1 -->`);
		assert.match(await readFile(join(out, "candidate-N1.md"), "utf-8"), /^<!-- meeting-candidate: meetings\/2026-09-24-acme-discovery#N1 -->/);
		assert.deepEqual((await readdir(out)).sort(), ["candidate-N1.md", "candidates.json", "glossary-additions.md", "notes.md"]);

		await writeFile(join(dir, "pack.md"), makePack(undefined, CONFIRMED).replace("00:16:25", "00:99:99"));
		await writeFile(join(out, "candidate-N9.md"), "kept after a failed run");
		assert.equal(await runEmitter(["--dir", "../meetings/2026-09-24-acme-discovery", "--out", out]), 1);
		assert.equal(await readFile(join(out, "candidate-N9.md"), "utf-8"), "kept after a failed run");
	} finally {
		process.chdir(cwd);
		Object.assign(console, { log, error });
	}
});

test("falls back to the current directory outside a git repository", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "emit-nogit-")));
	const dir = join(root, "2026-09-24-acme-discovery");
	await mkdir(dir);
	assert.equal(markerPath(dir, root), "2026-09-24-acme-discovery");
	assert.equal(repoRoot(root), root);
	const repo = join(root, "repo");
	await mkdir(join(repo, "m"), { recursive: true });
	execFileSync("git", ["init", "--quiet"], { cwd: repo });
	assert.equal(markerPath(join(repo, "m"), join(repo, "m")), "m");
	assert.equal(repoRoot(join(repo, "m")), repo);
});

test("CLI emits files for a confirmed pack and refuses unconfirmed ones", async () => {
	const root = await mkdtemp(join(tmpdir(), "emit-"));
	const dir = join(root, "2026-09-24-acme-discovery");
	await mkdir(dir);
	await writeFile(join(dir, "transcript.md"), validTranscript);
	await writeFile(join(root, "glossary.md"), validGlossary);
	const out = join(root, "out");

	const [log, error] = [console.log, console.error];
	console.log = console.error = () => {};
	try {
		await writeFile(join(dir, "pack.md"), makePack());
		assert.equal(await runEmitter(["--dir", dir, "--out", out]), 1);
		assert.equal(await runEmitter(["--dir", dir, "--out", out, "--allow-draft"]), 0);

		await writeFile(join(dir, "pack.md"), makePack(undefined, CONFIRMED));
		assert.equal(await runEmitter(["--dir", dir, "--out", out, "--glossary", join(root, "glossary.md")]), 0);
		const index = JSON.parse(await readFile(join(out, "candidates.json"), "utf-8"));
		assert.equal(index[0].title, "Reconcile SAP exports with local inventory automatically");
		assert.equal(index[0].bodyFile, "candidate-N1.md");
		assert.equal("body" in index[0], false);
		assert.match(await readFile(join(out, "candidate-N1.md"), "utf-8"), /## Problem Statement/);
		assert.match(await readFile(join(out, "glossary-additions.md"), "utf-8"), /## New Terms/);

		await writeFile(join(dir, "transcript.md"), `${validTranscript}[00:31:00] Sam Lee: Edited afterwards.\n`);
		assert.equal(await runEmitter(["--dir", dir, "--out", out]), 1);
		assert.equal(await runEmitter([]), 1);
		assert.equal(await runEmitter(["--help"]), 0);
	} finally {
		Object.assign(console, { log, error });
	}
});
