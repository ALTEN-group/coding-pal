#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export class ValidationError extends Error {}

function fail(message) {
	throw new ValidationError(message);
}

function normalizeNewlines(value) {
	return value.replace(/\r\n?/g, "\n");
}

export const SIDES = ["client", "internal"];
export const TERM_STATUSES = ["known", "new", "correction"];
export const MAX_SUMMARY_WORDS = 350;

const NONE = "_None._";
const PLACEHOLDER = /^(tbd|n\/a|\.\.\.|<[^>]*>)$/i;
const NOT_A_PERSON = /\b(ai|bot|agent|copilot|assistant|claude|gpt|llm|automation|pipeline|notetaker|note-taker)\b|\[bot\]/i;
const TRANSCRIPT_H2 = ["Speakers", "Transcript"];
const PACK_H2 = [
	"Meeting",
	"Executive Summary",
	"Domain Concepts & Terminology",
	"Candidate Business Needs",
	"Confirmation",
	"Ambiguities & Open Questions",
];
const LINE = /^\[(\d{2}):([0-5]\d):([0-5]\d)\] ([^:\n]+): (\S.*)$/;
const TIMESTAMP = /^\d{2}:[0-5]\d:[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DIR_NAME = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONFIRMATIONS = {
	"Speaker Verification": /^Verified by (.+) on (\d{4}-\d{2}-\d{2})$/,
	"Client Read-Back": /^Done by (.+) on (\d{4}-\d{2}-\d{2})$/,
	"Written Summary Sent": /^Sent to (.+) on (\d{4}-\d{2}-\d{2})$/,
	"Client Confirmation": /^(?:Confirmed|Corrected) by (.+) on (\d{4}-\d{2}-\d{2})$/,
};

export function sha256(text) {
	return createHash("sha256").update(text).digest("hex");
}

function isPlaceholder(value) {
	return !value || PLACEHOLDER.test(value.trim());
}

function validDate(value) {
	return DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

function toSeconds(h, m, s) {
	return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

export function normalizeText(value) {
	return value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

function splitSections(markdown, required, filename) {
	const matches = [...markdown.matchAll(/^## (.+)$/gm)];
	const names = matches.map((m) => m[1].trim());
	if (names.length !== required.length) {
		fail(`${filename} must contain exactly ${required.length} level-two headings: ${required.map((h) => `## ${h}`).join(", ")}`);
	}
	const sections = {};
	matches.forEach((m, i) => {
		if (names[i] !== required[i]) fail(`${filename} heading #${i + 1} is "## ${names[i]}", expected "## ${required[i]}"`);
		const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
		const body = markdown.slice(m.index + m[0].length, end).trim();
		if (!body) fail(`${filename} has empty section for "## ${names[i]}"`);
		sections[names[i]] = body;
	});
	return { sections, preamble: markdown.slice(0, matches[0].index) };
}

function parseFields(body, where, filename) {
	const entries = [];
	for (const line of body.split("\n")) {
		const m = line.match(/^- \*\*(.+?):\*\*\s*(.*)$/);
		if (m) {
			const label = m[1].trim();
			if (entries.some(([existing]) => existing.toLowerCase() === label.toLowerCase())) {
				fail(`${filename} "${where}" has the "- **${label}:**" field more than once`);
			}
			entries.push([label, m[2]]);
		} else if (entries.length) entries[entries.length - 1][1] += `\n${line}`;
	}
	return new Map(entries.map(([label, value]) => [label.toLowerCase(), value.trim()]));
}

function need(map, label, where, filename, { allowNone = true } = {}) {
	const value = map.get(label.toLowerCase());
	if (value === undefined) fail(`${filename} "${where}" is missing the "- **${label}:**" field`);
	if (!value || (!value.includes("\n") && isPlaceholder(value))) fail(`${filename} "${where}" field "${label}" is empty or a placeholder`);
	if (!allowNone && value === NONE) fail(`${filename} "${where}" field "${label}" must not be "${NONE}"`);
	return value;
}

function parseTable(body, columns, where, filename) {
	const lines = body.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
	if (lines.length < 3) fail(`${filename} "${where}" must contain a Markdown table with a header, a separator, and at least one row`);
	const cells = (line) => line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
	const header = cells(lines[0]);
	if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
		fail(`${filename} "${where}" table columns must be exactly: ${columns.join(" | ")}`);
	}
	return lines.slice(2).map((line) => {
		const row = cells(line);
		if (row.length !== columns.length) fail(`${filename} "${where}" row has ${row.length} cells, expected ${columns.length}: ${line}`);
		return row;
	});
}

function parseRoster(body, where, filename) {
	const roster = new Map();
	for (const [name, role, side] of parseTable(body, ["Name", "Role", "Side"], where, filename)) {
		if (isPlaceholder(name) || isPlaceholder(role)) fail(`${filename} "${where}" rows need a name and a role`);
		if (name.includes(":")) fail(`${filename} speaker name "${name}" must not contain a colon`);
		if (!SIDES.includes(side)) fail(`${filename} "${where}" side "${side}" for ${name} must be one of: ${SIDES.join(", ")}`);
		if (roster.has(name)) fail(`${filename} "${where}" lists ${name} twice`);
		roster.set(name, { role, side });
	}
	if (![...roster.values()].some((p) => p.side === "client")) fail(`${filename} "${where}" must include at least one client-side person`);
	return roster;
}

/**
 * Validates a transcript.md file and returns its structured content.
 * @param {string} rawMarkdown
 * @param {string} [filename="transcript.md"]
 * @param {{sanctioned?: string[]}} [options] sanctioned: tools allowed for company or client data
 */
export function validateTranscriptContent(rawMarkdown, filename = "transcript.md", options = {}) {
	const markdown = normalizeNewlines(rawMarkdown).trim();
	if (!markdown) fail(`${filename} is empty`);
	const h1 = markdown.match(/^# Transcript:\s+(.+)$/m);
	if (!h1 || !h1[1].trim()) fail(`${filename} must start with a level-one heading: "# Transcript: <Meeting title>"`);

	const { sections, preamble } = splitSections(markdown, TRANSCRIPT_H2, filename);
	const header = parseFields(preamble, "header", filename);
	const date = need(header, "Date", "header", filename, { allowNone: false });
	if (!validDate(date)) fail(`${filename} Date must be a valid ISO date (YYYY-MM-DD), found "${date}"`);
	const tool = need(header, "Tool", "header", filename, { allowNone: false });
	if (options.sanctioned && !options.sanctioned.some((t) => t.toLowerCase() === tool.toLowerCase())) {
		fail(`${filename} meeting tool is not on the sanctioned list: "${tool}"`);
	}
	need(header, "Source File", "header", filename, { allowNone: false });
	const consent = need(header, "Recording Consent", "header", filename, { allowNone: false });
	if (!/^yes\b/i.test(consent)) fail(`${filename} Recording Consent must start with "Yes" and say how consent was given`);
	const durationRaw = need(header, "Duration", "header", filename, { allowNone: false });
	const dm = durationRaw.match(/^(\d{2}):([0-5]\d):([0-5]\d)$/);
	if (!dm) fail(`${filename} Duration must be formatted HH:MM:SS, found "${durationRaw}"`);
	const duration = toSeconds(...dm.slice(1));

	const speakers = parseRoster(sections.Speakers, "## Speakers", filename);

	const lines = [];
	let previous = -1;
	for (const raw of sections.Transcript.split("\n")) {
		if (!raw.trim()) continue;
		const m = raw.match(LINE);
		if (!m) fail(`${filename} transcript line must be formatted "[HH:MM:SS] Speaker: text" (found: "${raw.slice(0, 80)}")`);
		const seconds = toSeconds(m[1], m[2], m[3]);
		const speaker = m[4].trim();
		if (!speakers.has(speaker)) fail(`${filename} line [${m[1]}:${m[2]}:${m[3]}] has speaker "${speaker}" who is not in the Speakers table`);
		if (seconds < previous) fail(`${filename} timestamp [${m[1]}:${m[2]}:${m[3]}] goes backwards`);
		if (seconds > duration) fail(`${filename} timestamp [${m[1]}:${m[2]}:${m[3]}] is after the declared Duration ${durationRaw}`);
		previous = seconds;
		lines.push({ ts: `${m[1]}:${m[2]}:${m[3]}`, seconds, speaker, text: m[5].trim() });
	}
	if (!lines.length) fail(`${filename} has no transcript lines`);
	return { title: h1[1].trim(), date, tool, consent, duration, speakers, lines };
}

function parseQuote(cell, where, filename) {
	const q = cell.match(/^["“](.+)["”]$/);
	if (!q || q[1].trim().length < 10) fail(`${filename} ${where} must be a verbatim quote of at least 10 characters wrapped in double quotes`);
	if (/\.\.\.|…/.test(q[1])) fail(`${filename} ${where} quote must not contain an ellipsis`);
	return q[1].trim();
}

function parseSpeakerRef(cell, where, filename) {
	const m = cell.match(/^(.+) \((.+)\)$/);
	if (!m) fail(`${filename} ${where} speaker must be formatted "Name (Role)" (found "${cell}")`);
	return { name: m[1].trim(), role: m[2].trim() };
}

/**
 * Parses and validates the structure of a pack.md file.
 * @param {string} rawMarkdown
 * @param {string} [filename="pack.md"]
 */
export function parsePack(rawMarkdown, filename = "pack.md") {
	const markdown = normalizeNewlines(rawMarkdown).trim();
	if (!markdown) fail(`${filename} is empty`);
	const h1 = markdown.match(/^# Meeting Pack:\s+(.+)$/m);
	if (!h1 || !h1[1].trim()) fail(`${filename} must start with a level-one heading: "# Meeting Pack: <Meeting title>"`);
	const { sections } = splitSections(markdown, PACK_H2, filename);

	const meeting = parseFields(sections.Meeting, "## Meeting", filename);
	const date = need(meeting, "Date", "## Meeting", filename, { allowNone: false });
	if (!validDate(date)) fail(`${filename} Date must be a valid ISO date (YYYY-MM-DD), found "${date}"`);
	const transcriptRef = need(meeting, "Transcript", "## Meeting", filename, { allowNone: false }).match(/`([^`]+)`/);
	if (!transcriptRef || basename(transcriptRef[1]) !== "transcript.md") fail(`${filename} Transcript must name the transcript.md path in backticks`);
	const hash = need(meeting, "SHA-256", "## Meeting", filename, { allowNone: false }).replace(/`/g, "").toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(hash)) fail(`${filename} SHA-256 must be the 64-character hex digest of transcript.md`);
	const participants = parseRoster(need(meeting, "Participants", "## Meeting", filename, { allowNone: false }), "Participants", filename);

	const summary = parseFields(sections["Executive Summary"], "## Executive Summary", filename);
	let words = 0;
	for (const label of ["Business Drivers", "Urgency", "Core Challenges"]) {
		words += need(summary, label, "## Executive Summary", filename, { allowNone: false }).split(/\s+/).length;
	}
	if (words > MAX_SUMMARY_WORDS) fail(`${filename} Executive Summary is ${words} words; keep it to one page (${MAX_SUMMARY_WORDS} words)`);

	const terms = parseTerms(sections["Domain Concepts & Terminology"], filename);
	const needs = parseNeeds(sections["Candidate Business Needs"], filename);

	const confirmation = parseFields(sections.Confirmation, "## Confirmation", filename);
	const confirmations = {};
	for (const label of Object.keys(CONFIRMATIONS)) confirmations[label] = need(confirmation, label, "## Confirmation", filename, { allowNone: false });

	if (isPlaceholder(sections["Ambiguities & Open Questions"])) {
		fail(`${filename} "## Ambiguities & Open Questions" must list questions or contain "${NONE}"`);
	}
	return { title: h1[1].trim(), date, transcriptPath: transcriptRef[1], hash, participants, terms, needs, confirmations };
}

function parseTerms(body, filename) {
	if (body === NONE) return [];
	const rows = parseTable(body, ["Term", "Heard As", "Definition", "Status", "Timestamp"], "## Domain Concepts & Terminology", filename);
	const seen = new Set();
	return rows.map(([term, heardAs, definition, status, ts]) => {
		const key = `${term.toLowerCase()}|${heardAs.toLowerCase()}`;
		if (isPlaceholder(term) || isPlaceholder(heardAs) || isPlaceholder(definition)) fail(`${filename} terminology row "${term}" needs a term, how it was heard, and a definition`);
		if (!TERM_STATUSES.includes(status)) fail(`${filename} term "${term}" status must be one of: ${TERM_STATUSES.join(", ")}`);
		if (!TIMESTAMP.test(ts)) fail(`${filename} term "${term}" needs a timestamp formatted HH:MM:SS`);
		const same = term.toLowerCase() === heardAs.toLowerCase();
		if (status === "correction" && same) fail(`${filename} term "${term}" is a correction, so "Heard As" must differ from the canonical term`);
		if (status !== "correction" && !same) fail(`${filename} term "${term}" is ${status}, so "Heard As" must equal the term (use "correction" otherwise)`);
		if (seen.has(key)) fail(`${filename} terminology row "${term}" (heard as "${heardAs}") is listed twice`);
		seen.add(key);
		return { term, heardAs, definition, status, ts };
	});
}

function parseNeeds(body, filename) {
	if (body === NONE) return [];
	const heads = [...body.matchAll(/^### (N(\d+)):\s+(.+)$/gm)];
	if (!heads.length) fail(`${filename} "## Candidate Business Needs" must be "${NONE}" or contain needs formatted "### N<k>: <Need in one sentence>"`);
	return heads.map((m, i) => {
		if (Number(m[2]) !== i + 1) fail(`${filename} need IDs must be sequential. Expected N${i + 1}, found ${m[1]}`);
		const id = m[1];
		const where = `need ${id}`;
		const fields = parseFields(body.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : body.length), where, filename);
		const problem = need(fields, "Problem Statement", where, filename, { allowNone: false });
		const rows = parseTable(need(fields, "Evidence", where, filename, { allowNone: false }), ["ID", "Timestamp", "Speaker", "Quote"], `${where} Evidence`, filename);
		const seen = new Set();
		const evidence = rows.map(([eid, ts, speaker, quote]) => {
			if (!/^E\d+$/.test(eid)) fail(`${filename} ${where} evidence ID "${eid}" must look like E1, E2, ...`);
			if (seen.has(eid)) fail(`${filename} ${where} evidence ID "${eid}" is duplicated`);
			seen.add(eid);
			if (!TIMESTAMP.test(ts)) fail(`${filename} ${where} evidence ${eid} needs a timestamp formatted HH:MM:SS`);
			return { id: eid, ts, speaker: parseSpeakerRef(speaker, `${where} evidence ${eid}`, filename), quote: parseQuote(quote, `${where} evidence ${eid}`, filename) };
		});
		const criteriaRaw = need(fields, "Draft Acceptance Criteria", where, filename);
		const criteria = criteriaRaw === NONE ? [] : criteriaRaw.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/^-\s+/, ""));
		if (criteria.length > 8) fail(`${filename} ${where} has ${criteria.length} draft acceptance criteria; keep at most 8`);
		for (const c of criteria) {
			if (!/^given\b/i.test(c) || !/\bthen\b/i.test(c)) fail(`${filename} ${where} draft acceptance criterion must be "Given ..., then ..." (found "${c}")`);
			const outcome = c.slice(c.search(/\bthen\b/i) + 4).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
			if (outcome.length < 3) fail(`${filename} ${where} draft acceptance criterion needs a real outcome of at least 3 words after "then" (found "${c}")`);
		}
		const conceptsRaw = need(fields, "Concepts", where, filename);
		const concepts = conceptsRaw === NONE ? [] : conceptsRaw.split(",").map((c) => c.trim()).filter(Boolean);
		return { id, title: m[3].trim(), problem, evidence, criteria, concepts };
	});
}

/**
 * Validates a pack.md file for the requested stage, optionally against its transcript and the glossary.
 * @param {string} rawMarkdown
 * @param {string} [filename="pack.md"]
 * @param {{stage?: "draft"|"confirmed", transcript?: ReturnType<typeof validateTranscriptContent>, transcriptRaw?: string, glossary?: ReturnType<typeof validateGlossaryContent>}} [options]
 */
export function validatePackContent(rawMarkdown, filename = "pack.md", options = {}) {
	const stage = options.stage ?? "draft";
	if (!["draft", "confirmed"].includes(stage)) fail(`Unknown stage "${stage}"; use "draft" or "confirmed"`);
	const pack = parsePack(rawMarkdown, filename);
	const { transcript, glossary } = options;

	if (options.transcriptRaw !== undefined && sha256(options.transcriptRaw) !== pack.hash) {
		fail(`${filename} SHA-256 does not match transcript.md; the transcript is immutable and the pack must record its digest`);
	}

	const termNames = new Set(pack.terms.map((t) => t.term.toLowerCase()));
	for (const n of pack.needs) {
		for (const c of n.concepts) {
			const inGlossary = glossary?.lookup(c);
			if (!termNames.has(c.toLowerCase()) && !inGlossary && glossary) fail(`${filename} need ${n.id} concept "${c}" is neither in the terminology table nor the glossary`);
		}
	}

	if (transcript) {
		if (pack.date !== transcript.date) fail(`${filename} Date ${pack.date} differs from transcript.md Date ${transcript.date}`);
		for (const [name, info] of transcript.speakers) {
			const p = pack.participants.get(name);
			if (!p || p.role !== info.role || p.side !== info.side) fail(`${filename} Participants must include ${name} (${info.role}, ${info.side}) exactly as in the transcript`);
		}
		const at = (ts) => transcript.lines.filter((l) => l.ts === ts);
		for (const n of pack.needs) {
			let clientQuote = false;
			for (const e of n.evidence) {
				const info = transcript.speakers.get(e.speaker.name);
				if (!info || info.role !== e.speaker.role) fail(`${filename} need ${n.id} evidence ${e.id} speaker "${e.speaker.name} (${e.speaker.role})" does not match the transcript Speakers table`);
				const lines = at(e.ts).filter((l) => l.speaker === e.speaker.name);
				if (!lines.length) fail(`${filename} need ${n.id} evidence ${e.id}: no line by ${e.speaker.name} at [${e.ts}] in the transcript`);
				if (!lines.some((l) => normalizeText(l.text).includes(normalizeText(e.quote)))) {
					fail(`${filename} need ${n.id} evidence ${e.id} quote was not found verbatim in the transcript at [${e.ts}]: "${e.quote}"`);
				}
				if (info.side === "client") clientQuote = true;
			}
			if (!clientQuote) fail(`${filename} need ${n.id} needs at least one verbatim quote from a client-side speaker`);
		}
		for (const t of pack.terms) {
			const lines = at(t.ts);
			if (!lines.length) fail(`${filename} term "${t.term}" has no transcript line at [${t.ts}]`);
			if (!lines.some((l) => l.text.toLowerCase().includes(t.heardAs.toLowerCase()))) fail(`${filename} term "${t.term}": "${t.heardAs}" was not found in the transcript at [${t.ts}]`);
		}
	}

	if (glossary) {
		for (const t of pack.terms) {
			const known = glossary.lookup(t.term);
			if (t.status === "new" && known) fail(`${filename} term "${t.term}" is marked new but already exists in the glossary`);
			if ((t.status === "known" || t.status === "correction") && !known) fail(`${filename} term "${t.term}" is marked ${t.status} but is not in the glossary`);
		}
	}

	const c = pack.confirmations;
	if (stage === "draft") {
		for (const [label, value] of Object.entries(c)) {
			if (value.toLowerCase() !== "pending") fail(`${filename} ${label} must be "Pending" in the draft stage; only people confirm`);
		}
	} else {
		const parsed = {};
		for (const [label, pattern] of Object.entries(CONFIRMATIONS)) {
			const m = c[label].match(pattern);
			if (!m) fail(`${filename} ${label} must be completed by a named person, for example "${CONFIRMATION_EXAMPLES[label]}" (found "${c[label]}")`);
			if (!validDate(m[2]) || m[2] < pack.date) fail(`${filename} ${label} date ${m[2]} must be a valid date on or after the meeting date ${pack.date}`);
			parsed[label] = m[1].trim();
		}
		const person = (name) => pack.participants.get(name);
		for (const [label, name] of Object.entries(parsed)) {
			if (NOT_A_PERSON.test(name)) fail(`${filename} ${label} "${name}" must be a person, never an AI or automation`);
		}
		if (!person(parsed["Speaker Verification"])) fail(`${filename} Speaker Verification must be by a meeting participant`);
		const reader = person(parsed["Client Read-Back"]);
		if (!reader || !/product owner/i.test(reader.role)) fail(`${filename} Client Read-Back must be done by the Product Owner`);
		const recipient = person(parsed["Written Summary Sent"]);
		if (!recipient || recipient.side !== "client") fail(`${filename} Written Summary Sent must name a client-side participant as the recipient`);
		const client = person(parsed["Client Confirmation"]);
		if (!client || client.side !== "client") fail(`${filename} Client Confirmation must come from a client-side participant`);
	}

	const warnings = [];
	const roles = [...pack.participants.values()].map((p) => p.role.toLowerCase());
	if (!roles.some((r) => r.includes("product owner"))) warnings.push("no Product Owner among the participants");
	if (!roles.some((r) => r.includes("developer"))) warnings.push("no Developer among the participants (Cadence rule 3)");
	return { ...pack, warnings };
}

const CONFIRMATION_EXAMPLES = {
	"Speaker Verification": "Verified by Sam Lee on 2026-09-25",
	"Client Read-Back": "Done by Sam Lee on 2026-09-24",
	"Written Summary Sent": "Sent to Dana Moreau on 2026-09-25",
	"Client Confirmation": "Confirmed by Dana Moreau on 2026-09-26",
};

/**
 * Validates docs/glossary.md and returns a lookup over its terms and aliases.
 * @param {string} rawMarkdown
 * @param {string} [filename="glossary.md"]
 */
export function validateGlossaryContent(rawMarkdown, filename = "glossary.md") {
	const markdown = normalizeNewlines(rawMarkdown).trim();
	if (!/^# Glossary\s*$/m.test(markdown)) fail(`${filename} must start with a level-one heading: "# Glossary"`);
	const rows = parseTable(markdown, ["Term", "Definition", "Aliases", "Source"], "Glossary", filename);
	const names = new Map();
	const entries = rows.map(([term, definition, aliasesRaw, source]) => {
		if (isPlaceholder(term) || isPlaceholder(definition) || isPlaceholder(source)) fail(`${filename} glossary row "${term}" needs a definition and a source`);
		const aliases = aliasesRaw === NONE ? [] : aliasesRaw.split(",").map((a) => a.trim()).filter(Boolean);
		for (const name of [term, ...aliases]) {
			const key = name.toLowerCase();
			if (names.has(key)) fail(`${filename} "${name}" is defined more than once (also under "${names.get(key)}")`);
			names.set(key, term);
		}
		return { term, definition, aliases, source };
	});
	return { entries, lookup: (name) => names.get(name.toLowerCase()) ?? null };
}

async function fileExists(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

async function dirExists(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Parses a sanctioned-tools file: a Markdown bullet list, or one tool per line when there are no bullets.
 * Blank lines and `#` comments or headings are ignored, so prose around a bullet list is allowed.
 * @param {string} rawText
 * @param {string} [filename="sanctioned-tools.md"]
 */
export function parseSanctionedTools(rawText, filename = "sanctioned-tools.md") {
	const lines = normalizeNewlines(rawText)
		.split("\n")
		.map((line) => line.replace(/\s+#.*$/, "").trim())
		.filter((line) => line && !line.startsWith("#"));
	const bullets = lines.filter((line) => /^[-*+]\s+\S/.test(line));
	const tools = (bullets.length ? bullets : lines).map((line) => line.replace(/^[-*+]\s+/, "").trim());
	if (!tools.length) fail(`${filename} lists no sanctioned tools`);
	return tools;
}

function parseArgs(args) {
	const parsed = { dir: null, transcript: null, pack: null, glossary: null, sanctioned: null, stage: "draft", unknown: [] };
	for (let i = 0; i < args.length; i++) {
		const next = args[i + 1];
		if (args[i] === "--dir" && next) parsed.dir = args[++i];
		else if (args[i] === "--transcript" && next) parsed.transcript = args[++i];
		else if (args[i] === "--pack" && next) parsed.pack = args[++i];
		else if (args[i] === "--glossary" && next) parsed.glossary = args[++i];
		else if (args[i] === "--sanctioned" && next) parsed.sanctioned = args[++i];
		else if (args[i] === "--stage" && next) parsed.stage = args[++i];
		else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else parsed.unknown.push(args[i]);
	}
	return parsed;
}

export async function runValidator(args = process.argv.slice(2)) {
	const opts = parseArgs(args);
	if (!opts.help && opts.unknown.length) {
		console.error(`✗ Unknown or incomplete argument(s): ${opts.unknown.join(" ")}. Run with --help for usage.`);
		return 1;
	}
	if (!["draft", "confirmed"].includes(opts.stage)) {
		console.error(`✗ Unknown stage "${opts.stage}"; use "draft" or "confirmed"`);
		return 1;
	}
	if (opts.help || (!opts.dir && !opts.transcript && !opts.pack && !opts.glossary)) {
		console.log(`Usage:
  node validate-meeting.mjs --dir <meetings/YYYY-MM-DD-slug> [--stage draft|confirmed] [--glossary docs/glossary.md] [--sanctioned docs/governance/sanctioned-tools.md]
  node validate-meeting.mjs --transcript <transcript.md> [--pack <pack.md>] [--stage draft|confirmed] [--glossary docs/glossary.md] [--sanctioned <file>]
  node validate-meeting.mjs --glossary <docs/glossary.md>
`);
		return opts.help ? 0 : 1;
	}

	let transcriptPath = opts.transcript;
	let packPath = opts.pack;
	if (opts.dir) {
		if (!(await dirExists(opts.dir))) {
			console.error(`Error: Directory not found: ${opts.dir}`);
			return 1;
		}
		transcriptPath = join(opts.dir, "transcript.md");
		packPath = join(opts.dir, "pack.md");
		if (!(await fileExists(transcriptPath))) {
			console.error(`Error: Directory ${opts.dir} does not contain transcript.md`);
			return 1;
		}
		if (!(await fileExists(packPath))) {
			console.error(`Error: Directory ${opts.dir} does not contain pack.md (use --transcript to validate a transcript alone)`);
			return 1;
		}
	}

	try {
		let glossary = null;
		if (opts.stage === "confirmed" && !packPath) fail("--stage confirmed needs a pack to confirm (use --dir or --pack)");
		if (opts.glossary) {
			glossary = validateGlossaryContent(await readFile(opts.glossary, "utf-8"), opts.glossary);
			console.log(`✓ [glossary.md] Validated: ${glossary.entries.length} term(s) (${opts.glossary})`);
		}
		let transcript = null;
		let transcriptRaw;
		let sanctioned;
		if (opts.sanctioned) {
			if (!transcriptPath) fail("--sanctioned needs a transcript to check (use --dir or --transcript)");
			if (!(await fileExists(opts.sanctioned))) fail(`Sanctioned tools file not found: ${opts.sanctioned}`);
			sanctioned = parseSanctionedTools(await readFile(opts.sanctioned, "utf-8"), opts.sanctioned);
		}
		if (transcriptPath) {
			transcriptRaw = await readFile(transcriptPath, "utf-8");
			transcript = validateTranscriptContent(transcriptRaw, transcriptPath, { sanctioned });
			if (opts.dir) {
				const m = basename(resolve(opts.dir)).match(DIR_NAME);
				if (!m) fail(`${opts.dir} must be named "<YYYY-MM-DD>-<slug>" (lowercase kebab-case)`);
				if (m[1] !== transcript.date) fail(`${opts.dir} date prefix ${m[1]} differs from the transcript Date ${transcript.date}`);
			}
			console.log(`✓ [transcript.md] Validated: "${transcript.title}" with ${transcript.lines.length} line(s) from ${transcript.speakers.size} speaker(s) (${transcriptPath})`);
		}
		if (packPath) {
			const result = validatePackContent(await readFile(packPath, "utf-8"), packPath, { stage: opts.stage, transcript, transcriptRaw, glossary });
			result.warnings.forEach((w) => console.warn(`⚠ [pack.md] ${w}`));
			if (!glossary) console.warn("⚠ [pack.md] no --glossary given; terminology was not checked against the glossary");
			console.log(`✓ [pack.md] Validated (${opts.stage}): "${result.title}" with ${result.needs.length} candidate need(s) and ${result.terms.length} term(s) (${packPath})`);
		}
		return 0;
	} catch (err) {
		console.error(`✗ Validation failed: ${err instanceof ValidationError || err.code ? err.message : err.stack}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runValidator().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
