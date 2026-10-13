#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { ValidationError, validateGlossaryContent, validatePackContent, validateTranscriptContent } from "./validate-meeting.mjs";

export const CANDIDATE_LABELS = ["needs:triage", "source:meeting"];

export function marker(packDir, id) {
	return `<!-- meeting-candidate: ${packDir}#${id} -->`;
}

/** The git repository root containing `cwd`, or `cwd` itself outside a repository. */
export function repoRoot(cwd = process.cwd()) {
	try {
		return realpathSync(execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim());
	} catch {
		return realpathSync(cwd);
	}
}

/** The meeting directory as a stable, repository-relative path with forward slashes, used in issue markers. */
export function markerPath(dir, cwd = process.cwd()) {
	return relative(repoRoot(cwd), realpathSync(dir)).split(sep).join("/");
}

/** Renders the backlog issue body for one candidate need. The evidence table matches the Triage contract. */
export function renderCandidate(pack, need, packDir) {
	const rows = need.evidence.map((e) => `| ${e.id} | transcript-quote | ${packDir}/transcript.md#${e.ts} (${e.speaker.name}, ${e.speaker.role}) | "${e.quote}" |`);
	return `${[
		marker(packDir, need.id),
		"## Problem Statement",
		need.problem,
		"",
		"## Evidence",
		"| ID | Type | Reference | Quote or Count |",
		"|---|---|---|---|",
		...rows,
		"",
		"## Draft Acceptance Criteria",
		...(need.criteria.length ? need.criteria.map((c) => `- ${c}`) : ["_None._"]),
		"",
		"## Concepts",
		need.concepts.length ? need.concepts.join(", ") : "_None._",
		"",
		"## Source",
		`Meeting Pack \`${packDir}/pack.md\` (${pack.title}, ${pack.date}). Client confirmation: ${pack.confirmations["Client Confirmation"]}.`,
	].join("\n")}\n`;
}

/** Stages new terms and heard-form aliases for a pull request against docs/glossary.md. */
export function renderGlossaryAdditions(pack, packDir) {
	const source = `${packDir}/pack.md`;
	const fresh = pack.terms.filter((t) => t.status === "new");
	const corrections = pack.terms.filter((t) => t.status === "correction");
	return `${[
		"# Glossary Additions",
		"",
		`Staged from \`${source}\`. Review and merge into \`docs/glossary.md\` by pull request.`,
		"",
		"## New Terms",
		...(fresh.length
			? ["| Term | Definition | Aliases | Source |", "|---|---|---|---|", ...fresh.map((t) => `| ${t.term} | ${t.definition} | _None._ | ${source}#${t.ts} |`)]
			: ["_None._"]),
		"",
		"## New Aliases",
		...(corrections.length
			? ["| Term | Alias | Source |", "|---|---|---|", ...corrections.map((t) => `| ${t.term} | ${t.heardAs} | ${source}#${t.ts} |`)]
			: ["_None._"]),
	].join("\n")}\n`;
}

export function buildEmission(pack, packDir) {
	const issues = pack.needs.map((n) => ({
		id: n.id,
		title: n.title,
		labels: CANDIDATE_LABELS,
		marker: marker(packDir, n.id),
		bodyFile: `candidate-${n.id}.md`,
		body: renderCandidate(pack, n, packDir),
	}));
	return { issues, glossary: renderGlossaryAdditions(pack, packDir) };
}

function parseArgs(args) {
	const parsed = { allowDraft: false };
	for (let i = 0; i < args.length; i++) {
		const next = args[i + 1];
		if (args[i] === "--dir" && next) parsed.dir = args[++i];
		else if (args[i] === "--out" && next) parsed.out = args[++i];
		else if (args[i] === "--glossary" && next) parsed.glossary = args[++i];
		else if (args[i] === "--allow-draft") parsed.allowDraft = true;
		else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
	}
	return parsed;
}

export async function runEmitter(args = process.argv.slice(2)) {
	const opts = parseArgs(args);
	if (opts.help || !opts.dir || !opts.out) {
		console.log(`Usage:
  node emit-candidates.mjs --dir meetings/<YYYY-MM-DD>-<slug> --out <output-dir> [--glossary docs/glossary.md] [--allow-draft]
Writes candidate-N<k>.md issue bodies, candidates.json, and glossary-additions.md. Requires a confirmed pack unless --allow-draft.
Stale candidate-N*.md files in the output directory are deleted first. Markers use the --dir path relative to the git repository root (the current directory outside a repository).
`);
		return opts.help ? 0 : 1;
	}
	try {
		const transcriptRaw = await readFile(join(opts.dir, "transcript.md"), "utf-8");
		const transcript = validateTranscriptContent(transcriptRaw, join(opts.dir, "transcript.md"));
		const glossary = opts.glossary ? validateGlossaryContent(await readFile(opts.glossary, "utf-8"), opts.glossary) : null;
		const packPath = join(opts.dir, "pack.md");
		const pack = validatePackContent(await readFile(packPath, "utf-8"), packPath, {
			stage: opts.allowDraft ? "draft" : "confirmed",
			transcript,
			transcriptRaw,
			glossary,
		});
		const packDir = markerPath(opts.dir);
		const { issues, glossary: additions } = buildEmission(pack, packDir);
		await mkdir(opts.out, { recursive: true });
		for (const name of await readdir(opts.out)) {
			if (/^candidate-N.*\.md$/.test(name)) await rm(join(opts.out, name));
		}
		for (const issue of issues) await writeFile(join(opts.out, issue.bodyFile), issue.body);
		await writeFile(join(opts.out, "glossary-additions.md"), additions);
		await writeFile(
			join(opts.out, "candidates.json"),
			`${JSON.stringify(issues.map(({ body, ...rest }) => rest), null, 2)}\n`,
		);
		console.log(`✓ Emitted ${issues.length} candidate need(s) to ${opts.out}`);
		return 0;
	} catch (err) {
		console.error(`✗ ${err instanceof ValidationError || err.code ? err.message : err.stack}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runEmitter().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
