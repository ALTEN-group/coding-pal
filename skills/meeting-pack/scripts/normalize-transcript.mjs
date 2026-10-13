#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ValidationError, sha256, validateTranscriptContent } from "./validate-meeting.mjs";

function fail(message) {
	throw new ValidationError(message);
}

const TS = "\\d{1,2}(?::\\d{2}){1,2}";
const FORMATS = [
	{ name: "bracket", re: new RegExp(`^\\[(${TS})\\]\\s*(.+?):\\s+(\\S.*)$`), pick: (m) => [m[1], m[2], m[3]] },
	{ name: "leading", re: new RegExp(`^(${TS})\\s+(.+?):\\s+(\\S.*)$`), pick: (m) => [m[1], m[2], m[3]] },
	{ name: "trailing", re: new RegExp(`^(.+?)\\s*[\\[(](${TS})[\\])]:?\\s+(\\S.*)$`), pick: (m) => [m[2], m[1], m[3]] },
];
const HEADER = new RegExp(`^(.+?)\\s+[\\[(]?(${TS})[\\])]?$`);

export function toTimestamp(raw) {
	const parts = raw.split(":").map(Number);
	const [h, m, s] = parts.length === 2 ? [0, parts[0], parts[1]] : parts;
	if (m > 59 || s > 59) fail(`invalid timestamp "${raw}"`);
	const pad = (n) => String(n).padStart(2, "0");
	return { text: `${pad(h)}:${pad(m)}:${pad(s)}`, seconds: h * 3600 + m * 60 + s };
}

/**
 * Parses a plain-text transcript export into timestamped, speaker-attributed utterances.
 * Supported line shapes: "[MM:SS] Name: text", "MM:SS Name: text", "Name (MM:SS): text",
 * and a "Name MM:SS" header line followed by the spoken text.
 */
export function parsePlainText(raw) {
	const utterances = [];
	let header = null;
	const flushHeader = () => {
		if (header) {
			if (!header.text.length) fail(`speaker header "${header.speaker} ${header.ts}" has no text`);
			utterances.push({ ...header, text: header.text.join(" ") });
			header = null;
		}
	};
	for (const line of raw.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim())) {
		if (!line) {
			flushHeader();
			continue;
		}
		let matched = null;
		for (const f of FORMATS) {
			const m = line.match(f.re);
			if (m) {
				matched = f.pick(m);
				break;
			}
		}
		if (matched) {
			flushHeader();
			utterances.push({ ts: matched[0], speaker: matched[1].trim(), text: matched[2].trim() });
			continue;
		}
		const h = line.match(HEADER);
		if (h && !header) {
			header = { ts: h[2], speaker: h[1].trim(), text: [] };
			continue;
		}
		if (header) {
			header.text.push(line);
			continue;
		}
		const last = utterances[utterances.length - 1];
		if (!last) fail(`line "${line.slice(0, 60)}" has no timestamp or speaker and no previous line to continue`);
		last.text += ` ${line}`;
	}
	flushHeader();
	if (!utterances.length) fail("no transcript lines were found");
	return utterances;
}

function resolveRoster(rosterJson) {
	const roster = new Map();
	for (const [name, info] of Object.entries(rosterJson)) {
		if (!info || !info.role || !["client", "internal"].includes(info.side)) {
			fail(`roster entry "${name}" needs a role and a side ("client" or "internal")`);
		}
		roster.set(name.toLowerCase(), { name, role: info.role, side: info.side });
	}
	return roster;
}

/**
 * Builds the canonical transcript.md from plain-text utterances and a roster of {role, side} by name.
 */
export function renderTranscript({ title, date, tool, sourceFile, consent, duration }, rosterJson, utterances) {
	const roster = resolveRoster(rosterJson);
	const unknown = new Set();
	let previous = -1;
	const lines = utterances.map((u) => {
		const person = roster.get(u.speaker.toLowerCase());
		if (!person) unknown.add(u.speaker);
		const ts = toTimestamp(u.ts);
		if (ts.seconds < previous) fail(`timestamp ${ts.text} goes backwards; fix the export before importing`);
		previous = ts.seconds;
		return { ts, person, text: u.text };
	});
	if (unknown.size) fail(`speakers not in the roster: ${[...unknown].join(", ")}. Add them with a role and side.`);

	const spoke = [...new Map(lines.map((l) => [l.person.name, l.person])).values()];
	const last = lines[lines.length - 1].ts;
	const finish = duration ? toTimestamp(duration) : last;
	return `${[
		`# Transcript: ${title}`,
		"",
		`- **Date:** ${date}`,
		`- **Tool:** ${tool}`,
		`- **Source File:** ${sourceFile}`,
		`- **Recording Consent:** ${consent}`,
		`- **Duration:** ${finish.text}`,
		"",
		"## Speakers",
		"| Name | Role | Side |",
		"|---|---|---|",
		...spoke.map((p) => `| ${p.name} | ${p.role} | ${p.side} |`),
		"",
		"## Transcript",
		...lines.map((l) => `[${l.ts.text}] ${l.person.name}: ${l.text}`),
	].join("\n")}\n`;
}

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

function parseArgs(args) {
	const keys = ["input", "roster", "title", "date", "tool", "consent", "duration", "output"];
	const parsed = {};
	for (let i = 0; i < args.length; i++) {
		const key = args[i].replace(/^--/, "");
		if (keys.includes(key) && args[i + 1]) parsed[key] = args[++i];
		else if (args[i] === "--force") parsed.force = true;
		else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
	}
	return parsed;
}

export async function runNormalizer(args = process.argv.slice(2)) {
	const opts = parseArgs(args);
	const required = ["input", "roster", "title", "date", "tool", "consent", "output"];
	if (opts.help || required.some((k) => !opts[k])) {
		console.log(`Usage:
  node normalize-transcript.mjs --input <export.txt> --roster <roster.json> --title "<Meeting title>" \\
    --date YYYY-MM-DD --tool "<meeting tool>" --consent "Yes - <how consent was given>" \\
    --output meetings/<YYYY-MM-DD>-<slug>/transcript.md [--duration HH:MM:SS] [--force]
roster.json: { "Dana Moreau": { "role": "Operations Director", "side": "client" } }
An existing transcript is immutable; it is only overwritten with --force.
`);
		return opts.help ? 0 : 1;
	}
	try {
		if ((await exists(opts.output)) && !opts.force) fail(`${opts.output} already exists; transcripts are immutable (use --force only for an unconfirmed meeting)`);
		const pack = join(dirname(opts.output), "pack.md");
		if (opts.force && (await exists(pack))) {
			fail(`${pack} exists and records the digest of this transcript; the transcript is immutable once a pack exists, so --force is refused (start a new meeting directory instead)`);
		}
		const raw = await readFile(opts.input, "utf-8");
		let roster;
		try {
			roster = JSON.parse(await readFile(opts.roster, "utf-8"));
		} catch (err) {
			if (err instanceof SyntaxError) fail(`${opts.roster} is not valid JSON: ${err.message}`);
			throw err;
		}
		const markdown = renderTranscript(
			{ title: opts.title, date: opts.date, tool: opts.tool, sourceFile: basename(opts.input), consent: opts.consent, duration: opts.duration },
			roster,
			parsePlainText(raw),
		);
		const transcript = validateTranscriptContent(markdown, opts.output);
		await mkdir(dirname(opts.output), { recursive: true });
		await writeFile(opts.output, markdown);
		console.log(`✓ Wrote ${opts.output}: ${transcript.lines.length} line(s), ${transcript.speakers.size} speaker(s)`);
		console.log(`SHA-256: ${sha256(markdown)}`);
		return 0;
	} catch (err) {
		console.error(`✗ ${err instanceof ValidationError || err.code ? err.message : err.stack}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runNormalizer().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
