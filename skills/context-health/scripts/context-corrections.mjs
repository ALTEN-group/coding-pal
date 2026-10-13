#!/usr/bin/env node

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export class LogError extends Error {}

function fail(message) {
	throw new LogError(message);
}

export const DEFAULT_MIN = 2;

export function normalizeTopic(topic) {
	return String(topic ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Parses the JSONL log. Blank lines are ignored; a malformed line is an error that names its line number. */
export function parseLog(text, label = "log") {
	const entries = [];
	text.split(/\r?\n/).forEach((line, i) => {
		if (!line.trim()) return;
		let entry;
		try {
			entry = JSON.parse(line);
		} catch {
			fail(`${label} line ${i + 1} is not valid JSON`);
		}
		if (!entry || typeof entry !== "object" || typeof entry.topic !== "string" || !normalizeTopic(entry.topic)) fail(`${label} line ${i + 1} needs a non-empty "topic"`);
		if (typeof entry.source !== "string" || !entry.source.trim()) fail(`${label} line ${i + 1} needs a non-empty "source"`);
		if (entry.artifact !== null && entry.artifact !== undefined && (typeof entry.artifact !== "string" || !entry.artifact.trim())) fail(`${label} line ${i + 1}: "artifact" must be a path or null`);
		entries.push({ at: entry.at ?? null, topic: normalizeTopic(entry.topic), source: entry.source.trim(), artifact: entry.artifact?.trim() || null });
	});
	return entries;
}

export function buildEntry({ topic, source, artifact }, at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")) {
	const normalized = normalizeTopic(topic);
	if (!normalized) fail("--topic is required and cannot be empty");
	if (!source || !String(source).trim()) fail("--source is required: the pull request or issue where it was corrected or re-explained");
	if (/[\u0000-\u001f]/.test(normalized)) fail("--topic cannot contain control characters");
	if (artifact !== undefined && (!String(artifact).trim() || String(artifact).split("/").includes("..") || String(artifact).startsWith("/"))) fail("--artifact must be a workspace-relative path without '..'");
	return { at, topic: normalized, source: String(source).trim(), artifact: artifact === undefined ? null : String(artifact).trim() };
}

/** Topics corrected from at least `min` distinct sources with no artifact recorded against them. */
export function proposeArtifacts(entries, min = DEFAULT_MIN) {
	const topics = new Map();
	for (const entry of entries) {
		const topic = topics.get(entry.topic) ?? { topic: entry.topic, count: 0, sources: [], covered: false, first: entry.at, last: entry.at };
		// One correction logged twice from the same source is one occurrence.
		if (!topic.sources.includes(entry.source)) {
			topic.sources.push(entry.source);
			topic.count++;
		}
		if (entry.artifact) topic.covered = true;
		if (entry.at && (!topic.first || entry.at < topic.first)) topic.first = entry.at;
		if (entry.at && (!topic.last || entry.at > topic.last)) topic.last = entry.at;
		topics.set(entry.topic, topic);
	}
	return [...topics.values()].filter((t) => t.count >= min && !t.covered).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

export function renderProposals(proposals, min) {
	const out = [`# Proposed Persistent Context artifacts (topics seen at least ${min} times without an artifact)`, ""];
	if (!proposals.length) out.push("_None._");
	for (const p of proposals) out.push(`- "${p.topic}": ${p.count} times (${p.sources.join(", ")})`);
	out.push("", "These are proposals. The Architect decides, and the artifact arrives by pull request.");
	return `${out.join("\n")}\n`;
}

const USAGE = `Usage:
  node context-corrections.mjs add --log <file.jsonl> --topic "<text>" --source "<pr or issue>" [--artifact <path>]
  node context-corrections.mjs propose --log <file.jsonl> [--min 2]
The log is append-only JSON Lines. A topic corrected or re-explained twice, with no artifact, becomes a proposal.`;

const KNOWN_FLAGS = ["log", "topic", "source", "artifact", "min"];

function parseArgs(args) {
	const [command, ...rest] = args;
	const parsed = { command, flags: {}, help: command === "--help" || command === "-h" };
	for (let i = 0; i < rest.length; i++) {
		if (rest[i] === "--help" || rest[i] === "-h") parsed.help = true;
		else if (rest[i].startsWith("--") && rest[i + 1] !== undefined) {
			if (!KNOWN_FLAGS.includes(rest[i].slice(2))) fail(`unknown flag "${rest[i]}"`);
			parsed.flags[rest[i].slice(2)] = rest[++i];
		} else fail(`unexpected argument "${rest[i]}"`);
	}
	return parsed;
}

export async function runCorrections(args = process.argv.slice(2)) {
	try {
		const { command, flags, help } = parseArgs(args);
		if (help || !command) {
			console.log(USAGE);
			return help ? 0 : 1;
		}
		if (!["add", "propose"].includes(command)) fail(`unknown command "${command}"`);
		if (!flags.log) fail("--log is required");

		if (command === "add") {
			const entry = buildEntry({ topic: flags.topic, source: flags.source, artifact: flags.artifact });
			let existing = "";
			try {
				existing = await readFile(flags.log, "utf-8");
			} catch (err) {
				if (err.code !== "ENOENT") throw err;
			}
			parseLog(existing, flags.log);
			await mkdir(dirname(flags.log), { recursive: true });
			await appendFile(flags.log, `${existing && !existing.endsWith("\n") ? "\n" : ""}${JSON.stringify(entry)}\n`);
			console.log(`✓ Logged "${entry.topic}" from ${entry.source}`);
			return 0;
		}

		const min = flags.min === undefined ? DEFAULT_MIN : Number(flags.min);
		if (!Number.isInteger(min) || min < 1) fail("--min must be a positive integer");
		let text;
		try {
			text = await readFile(flags.log, "utf-8");
		} catch (err) {
			fail(`cannot read log ${flags.log}: ${err.code ?? err.message}`);
		}
		process.stdout.write(renderProposals(proposeArtifacts(parseLog(text, flags.log), min), min));
		return 0;
	} catch (err) {
		console.error(`✗ [context-corrections] ${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runCorrections().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
