#!/usr/bin/env node

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

export const REQUIRED_H2 = [
	"Backlog Issue",
	"Evidence",
	"System Mapping & Early Risk",
	"Scorecard",
	"Decision",
	"Ambiguities & Open Questions",
];

export const DECISIONS = ["todo", "explore", "later", "no"];
export const EVIDENCE_TYPES = ["transcript-quote", "ticket-cluster", "audit-finding", "incident", "telemetry", "hypothesis-verdict", "field-note"];
export const CONFIDENCE_LEVELS = ["Low", "Medium", "High"];

const NON_ANECDOTAL = new Set(["transcript-quote", "ticket-cluster", "audit-finding", "incident", "telemetry", "hypothesis-verdict"]);
const QUOTE_TYPES = new Set(["transcript-quote", "field-note"]);
const SCORE_FIELDS = ["Customer value", "Business value", "Effort", "Risk", "Confidence"];
const NONE = "_None._";
const PLACEHOLDER = /^(tbd|n\/a|\.\.\.|<[^>]*>)$/i;
const NOT_A_PERSON = /\b(ai|bot|agent|copilot|assistant|claude|gpt|llm|automation|pipeline)\b|\[bot\]/i;
const DECIDED_BY = /^(.+?) \(Product Owner\) on (\d{4}-\d{2}-\d{2})$/;
const BLAST_RADIUS_TIER = /blast[\s-]*radius(?:\s+tier)?\s*(?:[:=\-–]|\bis\b|\bset to\b)?\s*\(?\s*(?:tier\s*[:=]?\s*)?(low|medium|high|critical)\b/i;
const STOPWORDS = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "our", "are", "can", "all"]);

function stripMarks(value) {
	return value.replace(/`/g, "").trim();
}

function isPlaceholder(value) {
	return !value || PLACEHOLDER.test(value.trim());
}

function splitSections(markdown, filename) {
	const h2Matches = [...markdown.matchAll(/^## (.+)$/gm)];
	const names = h2Matches.map((m) => m[1].trim());
	if (names.length !== REQUIRED_H2.length) {
		fail(
			`${filename} must contain exactly ${REQUIRED_H2.length} level-two headings: ${REQUIRED_H2.map((h) => `## ${h}`).join(", ")}`,
		);
	}
	REQUIRED_H2.forEach((expected, i) => {
		if (names[i] !== expected) {
			fail(`${filename} heading ${i + 1} must be "## ${expected}" (found "## ${names[i]}")`);
		}
	});
	const sections = {};
	h2Matches.forEach((m, i) => {
		const start = m.index + m[0].length;
		const end = i + 1 < h2Matches.length ? h2Matches[i + 1].index : markdown.length;
		sections[names[i]] = markdown.slice(start, end).trim();
	});
	return sections;
}

function parseBullets(body) {
	const fields = new Map();
	let current = null;
	for (const line of body.split("\n")) {
		const m = line.match(/^- \*\*(.+?):\*\*\s*(.*)$/);
		if (m) {
			current = m[1].trim().toLowerCase();
			fields.set(current, m[2].trim());
		} else if (current && /^\s{2,}\S/.test(line)) {
			fields.set(current, `${fields.get(current)} ${line.trim()}`.trim());
		} else {
			current = null;
		}
	}
	return fields;
}

function parseTable(body, expectedColumns, sectionName, filename) {
	const lines = body.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
	if (lines.length < 3) {
		fail(`${filename} "## ${sectionName}" must contain a Markdown table with a header, a separator, and at least one row`);
	}
	const cells = (line) => line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
	const header = cells(lines[0]);
	if (header.length !== expectedColumns.length || header.some((h, i) => h !== expectedColumns[i])) {
		fail(`${filename} "## ${sectionName}" table columns must be exactly: ${expectedColumns.join(" | ")}`);
	}
	if (!cells(lines[1]).every((c) => /^:?-{3,}:?$/.test(c))) {
		fail(`${filename} "## ${sectionName}" table is missing its separator row`);
	}
	return lines.slice(2).map((line) => {
		const row = cells(line);
		if (row.length !== expectedColumns.length) {
			fail(`${filename} "## ${sectionName}" row has ${row.length} cells, expected ${expectedColumns.length}: ${line}`);
		}
		return row;
	});
}

function requireField(fields, label, sectionName, filename, { allowNone = false } = {}) {
	const value = fields.get(label.toLowerCase());
	if (value === undefined) fail(`${filename} "## ${sectionName}" is missing the "- **${label}:**" field`);
	if (value === "" || isPlaceholder(value)) fail(`${filename} "## ${sectionName}" field "${label}" is empty or a placeholder`);
	if (value === NONE && !allowNone) fail(`${filename} "## ${sectionName}" field "${label}" must not be "${NONE}"`);
	return value;
}

function parseEvidence(body, filename) {
	const rows = parseTable(body, ["ID", "Type", "Reference", "Quote or Count"], "Evidence", filename);
	const seen = new Set();
	return rows.map(([id, type, reference, content]) => {
		if (!/^E\d+$/.test(id)) fail(`${filename} evidence ID "${id}" must look like E1, E2, ...`);
		if (seen.has(id)) fail(`${filename} evidence ID "${id}" is duplicated`);
		seen.add(id);
		if (!EVIDENCE_TYPES.includes(type)) {
			fail(`${filename} evidence ${id} type "${type}" must be one of: ${EVIDENCE_TYPES.join(", ")}`);
		}
		if (isPlaceholder(stripMarks(reference))) fail(`${filename} evidence ${id} needs a real reference (link or path)`);
		if (isPlaceholder(content)) fail(`${filename} evidence ${id} needs a quote or count`);
		const entry = { id, type, reference, content };
		if (QUOTE_TYPES.has(type)) {
			const q = content.match(/^["“](.+)["”]$/);
			if (!q || q[1].trim().length < 10) {
				fail(`${filename} evidence ${id} (${type}) must be a verbatim quote of at least 10 characters wrapped in double quotes`);
			}
			if (/\.\.\.|…/.test(q[1])) fail(`${filename} evidence ${id} quote must not contain an ellipsis`);
			entry.quote = q[1].trim();
		} else if (type === "ticket-cluster") {
			const count = content.match(/^(\d+)\b/);
			if (!count || Number(count[1]) < 2) fail(`${filename} evidence ${id} (ticket-cluster) must start with a count of at least 2`);
			entry.count = Number(count[1]);
		}
		return entry;
	});
}

function parseScorecard(body, filename) {
	const rows = parseTable(body, ["Field", "Score", "Rationale"], "Scorecard", filename);
	const scores = {};
	for (const [field, score, rationale] of rows) {
		if (!SCORE_FIELDS.includes(field)) fail(`${filename} scorecard row "${field}" is not one of: ${SCORE_FIELDS.join(", ")}`);
		if (field in scores) fail(`${filename} scorecard row "${field}" is duplicated`);
		if (isPlaceholder(rationale)) fail(`${filename} scorecard row "${field}" needs a rationale`);
		if (field === "Confidence") {
			if (!CONFIDENCE_LEVELS.includes(score)) fail(`${filename} Confidence must be one of: ${CONFIDENCE_LEVELS.join(", ")}`);
			scores[field] = score;
		} else if (field === "Business value" && /^pending po$/i.test(score)) {
			scores[field] = null;
		} else {
			if (!/^[1-5]$/.test(score)) fail(`${filename} ${field} must be an integer from 1 to 5${field === "Business value" ? ' (or "Pending PO" in the proposed stage)' : ""}`);
			scores[field] = Number(score);
		}
	}
	for (const field of SCORE_FIELDS) {
		if (!(field in scores)) fail(`${filename} scorecard is missing the "${field}" row`);
	}
	return {
		customerValue: scores["Customer value"],
		businessValue: scores["Business value"],
		effort: scores.Effort,
		risk: scores.Risk,
		confidence: scores.Confidence,
	};
}

/**
 * Parses the structure of a triage.md file. Stage rules are applied by validateTriageContent.
 * @param {string} rawMarkdown
 * @param {string} [filename="triage.md"]
 */
export function parseTriage(rawMarkdown, filename = "triage.md") {
	const markdown = normalizeNewlines(rawMarkdown).trim();
	if (!markdown) fail(`${filename} is empty`);

	const h1 = markdown.match(/^# Triage:\s+(.+)$/m);
	if (!h1 || !h1[1].trim() || isPlaceholder(h1[1].trim())) {
		fail(`${filename} must start with a level-one heading: "# Triage: <Need in one sentence>"`);
	}
	if (/^[ \t]*(```|~~~)/m.test(markdown)) {
		fail(`${filename} must not contain source code blocks`);
	}

	const sections = splitSections(markdown, filename);

	const issueFields = parseBullets(sections["Backlog Issue"]);
	const issue = {
		title: requireField(issueFields, "Title", "Backlog Issue", filename),
		problem: requireField(issueFields, "Problem Statement", "Backlog Issue", filename),
		source: requireField(issueFields, "Source", "Backlog Issue", filename),
		hypothesis: requireField(issueFields, "Hypothesis", "Backlog Issue", filename, { allowNone: true }),
	};

	const evidence = parseEvidence(sections.Evidence, filename);

	const mapFields = parseBullets(sections["System Mapping & Early Risk"]);
	const mapping = {
		capabilities: requireField(mapFields, "Capabilities & Specs", "System Mapping & Early Risk", filename, { allowNone: true }),
		concepts: requireField(mapFields, "Domain Concepts", "System Mapping & Early Risk", filename, { allowNone: true }),
		affectedSystems: requireField(mapFields, "Affected Systems", "System Mapping & Early Risk", filename),
		earlyRisk: requireField(mapFields, "Early Risk", "System Mapping & Early Risk", filename),
		unknowns: requireField(mapFields, "Unknowns", "System Mapping & Early Risk", filename, { allowNone: true }),
	};
	const outsideEvidence = markdown.replace(sections.Evidence, "").replace(/[*`_]/g, "");
	if (BLAST_RADIUS_TIER.test(outsideEvidence)) {
		fail(`${filename} must not assign a blast radius tier; that is set in the Think phase`);
	}

	const scores = parseScorecard(sections.Scorecard, filename);

	const decFields = parseBullets(sections.Decision);
	const proposed = requireField(decFields, "Proposed", "Decision", filename).toLowerCase();
	if (!DECISIONS.includes(proposed)) fail(`${filename} Proposed decision must be one of: ${DECISIONS.join(", ")}`);
	const finalRaw = requireField(decFields, "Final (PO)", "Decision", filename).toLowerCase();
	if (finalRaw !== "pending" && !DECISIONS.includes(finalRaw)) {
		fail(`${filename} Final (PO) must be "Pending" or one of: ${DECISIONS.join(", ")}`);
	}
	const decision = {
		proposed,
		rationale: requireField(decFields, "Rationale", "Decision", filename),
		gather: requireField(decFields, "Evidence to Gather", "Decision", filename, { allowNone: true }),
		reopens: stripMarks(decFields.get("reopens") ?? NONE),
		final: finalRaw,
		decidedBy: decFields.get("decided by") ?? "Pending",
		overrideRationale: decFields.get("override rationale") ?? "",
	};

	const questions = sections["Ambiguities & Open Questions"];
	if (!questions || isPlaceholder(questions)) {
		fail(`${filename} "## Ambiguities & Open Questions" must list questions or contain "${NONE}"`);
	}

	return { title: h1[1].trim(), issue, evidence, mapping, scores, decision, questions };
}

function validDate(value) {
	return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

function normalizeText(value) {
	return value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

/**
 * Validates a triage.md file for the requested stage.
 * @param {string} rawMarkdown
 * @param {string} [filename="triage.md"]
 * @param {{stage?: "proposed"|"final", sources?: string[]}} [options]
 */
export function validateTriageContent(rawMarkdown, filename = "triage.md", options = {}) {
	const stage = options.stage ?? "proposed";
	if (!["proposed", "final"].includes(stage)) fail(`Unknown stage "${stage}"; use "proposed" or "final"`);
	const triage = parseTriage(rawMarkdown, filename);
	const { evidence, scores, decision } = triage;

	if (!evidence.some((e) => NON_ANECDOTAL.has(e.type))) {
		fail(`${filename} needs at least one non-anecdotal evidence row (${[...NON_ANECDOTAL].join(", ")}); a field-note alone is anecdotal`);
	}

	if (options.sources?.length) {
		const haystack = normalizeText(options.sources.join("\n"));
		for (const e of evidence.filter((row) => row.quote)) {
			if (!haystack.includes(normalizeText(e.quote))) {
				fail(`${filename} evidence ${e.id} quote was not found verbatim in the provided source(s): "${e.quote}"`);
			}
		}
	}

	if (scores.customerValue >= 4 && scores.confidence === "Low" && decision.proposed !== "explore") {
		fail(`${filename} has Customer value ${scores.customerValue} with Low confidence; the proposed decision must be "explore"`);
	}
	const exploring = decision.proposed === "explore" || decision.final === "explore";
	if (exploring && (decision.gather === NONE || isPlaceholder(decision.gather))) {
		fail(`${filename} an "explore" decision requires "Evidence to Gather"`);
	}

	if (stage === "proposed") {
		if (scores.businessValue !== null) fail(`${filename} Business value must be "Pending PO" in the proposed stage; only the Product Owner scores it in the final stage`);
		if (decision.final !== "pending") fail(`${filename} Final (PO) must be "Pending" in the proposed stage; only the Product Owner decides`);
		if (decision.decidedBy.toLowerCase() !== "pending") fail(`${filename} Decided By must be "Pending" (or absent) in the proposed stage; only the Product Owner decides`);
	} else {
		if (scores.businessValue === null) fail(`${filename} Business value must be scored by the Product Owner before the final stage`);
		if (decision.final === "pending") fail(`${filename} Final (PO) must be set by the Product Owner in the final stage`);
		if (scores.customerValue >= 4 && scores.confidence === "Low" && decision.final === "todo" && isPlaceholder(decision.overrideRationale)) {
			fail(`${filename} Customer value ${scores.customerValue} with Low confidence is an "explore" need; Final (PO) "todo" needs an "Override Rationale"`);
		}
		if (decision.final !== decision.proposed && isPlaceholder(decision.overrideRationale)) {
			fail(`${filename} Final (PO) "${decision.final}" differs from Proposed "${decision.proposed}"; add an "Override Rationale"`);
		}
		const by = decision.decidedBy.match(DECIDED_BY);
		if (!by) fail(`${filename} Decided By must name the Product Owner, for example "Sam Lee (Product Owner) on 2026-09-30" (found "${decision.decidedBy}")`);
		if (NOT_A_PERSON.test(by[1])) fail(`${filename} Decided By "${by[1]}" must be a person, never an AI or automation`);
		if (!validDate(by[2])) fail(`${filename} Decided By date ${by[2]} must be a valid date`);
	}

	return triage;
}

function tokens(title) {
	return new Set(
		title
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((t) => t.length > 2 && !STOPWORDS.has(t)),
	);
}

export function similarity(a, b) {
	const ta = tokens(a);
	const tb = tokens(b);
	if (!ta.size || !tb.size) return 0;
	let shared = 0;
	for (const t of ta) if (tb.has(t)) shared++;
	return shared / (ta.size + tb.size - shared);
}

export function parseLedger(rawMarkdown, filename = "ledger.md") {
	const markdown = normalizeNewlines(rawMarkdown);
	const rows = parseTable(markdown, ["Issue", "Title", "Decision", "Date", "Rationale"], "Triage Ledger", filename);
	return rows.map(([issue, title, decision, date, rationale]) => {
		if (!DECISIONS.includes(decision.toLowerCase())) fail(`${filename} ledger row ${issue} has invalid decision "${decision}"`);
		if (!/^issue-\d+$/.test(issue)) fail(`${filename} ledger row "${issue}" must name an issue as issue-<number>`);
		if (isPlaceholder(title)) fail(`${filename} ledger row ${issue} needs a title`);
		if (!validDate(date)) fail(`${filename} ledger row ${issue} needs a valid date (YYYY-MM-DD), found "${date}"`);
		if (isPlaceholder(rationale)) fail(`${filename} ledger row ${issue} needs a rationale; a "no" is recorded with its rationale`);
		return { issue, title, decision: decision.toLowerCase(), date, rationale };
	});
}

/**
 * Compares a triage against prior decisions.
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkLedger(triage, ledgerRows, issueId = null, threshold = 0.6) {
	const errors = [];
	const warnings = [];
	const reopens = triage.decision.reopens.toLowerCase();
	for (const row of ledgerRows) {
		if (issueId && row.issue === issueId) continue;
		const exact = normalizeText(row.title).toLowerCase() === normalizeText(triage.issue.title).toLowerCase();
		const score = exact ? 1 : similarity(row.title, triage.issue.title);
		if (score < threshold) continue;
		const reopened = reopens === row.issue.toLowerCase();
		if ((exact || row.decision === "no") && !reopened) {
			errors.push(
				`matches ledger ${row.issue} ("${row.title}", decided "${row.decision}": ${row.rationale}); link it or set "- **Reopens:** ${row.issue}" with a reason`,
			);
		} else if (!reopened) {
			warnings.push(`similar to ledger ${row.issue} ("${row.title}", decided "${row.decision}")`);
		}
	}
	return { errors, warnings };
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

function parseArgs(args) {
	const parsed = { triage: null, dir: null, stage: "proposed", sources: [], ledger: null, issue: null, unknown: [] };
	for (let i = 0; i < args.length; i++) {
		const next = args[i + 1];
		if (args[i] === "--triage" && next) parsed.triage = args[++i];
		else if (args[i] === "--dir" && next) parsed.dir = args[++i];
		else if (args[i] === "--stage" && next) parsed.stage = args[++i];
		else if (args[i] === "--source" && next) parsed.sources.push(args[++i]);
		else if (args[i] === "--ledger" && next) parsed.ledger = args[++i];
		else if (args[i] === "--issue" && next) parsed.issue = args[++i];
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

	if (opts.help || (!opts.triage && !opts.dir)) {
		console.log(`Usage:
  node validate-triage.mjs --triage <path/to/triage.md> [--stage proposed|final]
  node validate-triage.mjs --dir <specs/issue-N> [--stage proposed|final]
Options:
  --source <file>   Verify quotes verbatim against a transcript or export (repeatable)
  --ledger <file>   Compare against prior decisions in specs/triage/ledger.md
  --issue <id>      Ledger id of this need (default: issue-N from the directory name)
`);
		return opts.help ? 0 : 1;
	}

	let target = opts.triage;
	if (opts.dir) {
		if (!(await dirExists(opts.dir))) {
			console.error(`Error: Directory not found: ${opts.dir}`);
			return 1;
		}
		target = join(opts.dir, "triage.md");
		if (!(await fileExists(target))) {
			console.error(`Error: Directory ${opts.dir} does not contain triage.md`);
			return 1;
		}
	}

	try {
		const sources = await Promise.all(opts.sources.map((p) => readFile(p, "utf-8")));
		const content = await readFile(target, "utf-8");
		const triage = validateTriageContent(content, target, { stage: opts.stage, sources });

		if (opts.ledger) {
			const dirName = basename(resolve(target, ".."));
			const issueId = opts.issue ?? (/^issue-\d+$/.test(dirName) ? dirName : null);
			const { errors, warnings } = checkLedger(triage, parseLedger(await readFile(opts.ledger, "utf-8"), opts.ledger), issueId);
			warnings.forEach((w) => console.warn(`⚠ [triage.md] ${w}`));
			if (errors.length) fail(errors.join("; "));
		}

		console.log(`✓ [triage.md] Validated (${opts.stage}): "${triage.title}" with ${triage.evidence.length} evidence row(s) (${target})`);
		return 0;
	} catch (err) {
		if (err instanceof ValidationError) {
			console.error(`✗ [triage.md] Validation failed: ${err.message}`);
		} else {
			console.error(`✗ [triage.md] ${err.message}`);
		}
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
