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
	"Release",
	"Rollout Stages",
	"Thresholds",
	"Rollback",
	"Outcome Metric",
	"Changelog",
	"Ambiguities & Open Questions",
];

export const TIERS = ["Low", "Medium", "High", "Critical"];
export const MECHANISMS = ["Feature flag off", "Traffic shift back", "Redeploy previous artifact", "Forward fix"];
export const AUTOMATIC_MECHANISMS = MECHANISMS.filter((m) => m !== "Forward fix");
export const COMPARATORS = ["<", "<=", ">", ">="];
export const KINDS = ["health", "business"];
export const PROMOTION = "automatic on green window";
export const CANARY_PERCENT = 5;
export const MAX_INTERMEDIATE_PERCENT = 50;
// Production stages by tier; the Critical ladder is the factory ladder 5% / 25% / 50% / 100%.
export const PRODUCTION_STAGE_COUNT = { Low: 1, Medium: 2, High: 3, Critical: 4 };
export const CRITICAL_LADDER = [5, 25, 50, 100];
export const LADDER_SHAPE = {
	Low: "1 production stage: 100%",
	Medium: "2 production stages: canary 5%, then 100%",
	High: "3 production stages: canary 5%, one intermediate step above 5% and at most 50%, then 100%",
	Critical: "4 production stages: 5%, 25%, 50%, 100%",
};

const NONE = "_None._";
const PLACEHOLDER = /^(tbd|n\/a|\.\.\.|<[^>]*>)$/i;
// Matched on whole snake_case words, so "error_rate" is an error rate but "terrors_total" is not.
const HEALTH_REQUIRED = [
	{ label: "error rate", pattern: /(?:^|_)(?:errors?)(?:_|$)/, percentCapped: true },
	{ label: "latency", pattern: /(?:^|_)(?:latency|latencies|response_time|duration)(?:_|$)/, percentCapped: false },
	{ label: "saturation", pattern: /(?:^|_)(?:saturation|cpu|memory|utilization|utilisation|queue|connection_pool|disk)(?:_|$)/, percentCapped: true },
];
// A word like "free" or "success" turns a bad-direction metric into its inverse (error_free_rate), which is a business metric.
const INVERSE_WORDS = /(?:^|_)(?:free|success|successful|ok|healthy|available|availability|headroom|without)(?:_|$)/;
const PERCENT_WORDS = /(?:^|_)(?:pct|percent|percentage|rate)(?:_|$)/;

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
			if (fields.has(current)) fail(`field "${m[1].trim()}" is declared twice; each field must appear once`);
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

export function parseDuration(value) {
	const m = /^([1-9]\d*)([mhd])$/.exec(value);
	if (!m) return null;
	return Number(m[1]) * { m: 1, h: 60, d: 1440 }[m[2]];
}

function leadingNumber(value) {
	const m = /^(-?\d+(?:\.\d+)?)/.exec(value.trim());
	return m ? Number(m[1]) : null;
}

function isSafePath(value) {
	return value.length > 0 && !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..") && !/^[a-z]:/i.test(value);
}

function parseReleaseSection(body, filename) {
	const f = parseBullets(body);
	const issueRaw = requireField(f, "Issue", "Release", filename);
	const issueMatches = issueRaw.split(",").map((s) => s.trim()).filter(Boolean);
	if (!issueMatches.length || issueMatches.some((s) => !/^#\d+$/.test(s))) {
		fail(`${filename} Issue must be one or more issue references like "#42" or "#42, #43" (found "${issueRaw}")`);
	}
	const primaryIssue = issueMatches[0];

	const tier = requireField(f, "Tier", "Release", filename);
	if (!TIERS.includes(tier)) fail(`${filename} Tier must be one of: ${TIERS.join(", ")}`);

	const version = requireField(f, "Version", "Release", filename);
	if (!/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
		fail(`${filename} Version must be a semantic version like "1.2.3" or "v1.2.3" (found "${version}")`);
	}
	const versionNumber = version.replace(/^v/, "");

	const artifact = stripMarks(requireField(f, "Artifact", "Release", filename));
	if (/\s/.test(artifact)) fail(`${filename} Artifact must be a single image or package reference without spaces`);
	if (/:\/\/[^/@\s]+:[^/@\s]+@/.test(artifact)) fail(`${filename} Artifact must not embed credentials`);
	if (/(^|[:@/])latest$/i.test(artifact)) fail(`${filename} Artifact "${artifact}" is mutable; reference an immutable version tag or digest, never "latest"`);
	const hasDigest = /@sha256:[a-f0-9]{64}\b/.test(artifact);
	if (!hasDigest) {
		if (!/\d+\.\d+\.\d+/.test(artifact)) {
			fail(`${filename} Artifact "${artifact}" must contain a version (for example ":${versionNumber}") or an "@sha256:<64 hex>" digest`);
		}
		const versionAtBoundary = new RegExp(`(?<![0-9A-Za-z.])${versionNumber.replace(/[.+]/g, "\\$&")}(?![0-9A-Za-z.+-])`);
		if (!versionAtBoundary.test(artifact)) {
			fail(`${filename} Artifact "${artifact}" does not contain the release Version "${versionNumber}"`);
		}
	}

	const flag = stripMarks(requireField(f, "Flag", "Release", filename));
	if (!/^(?:[a-z][a-z0-9_-]*\.)*enable$/.test(flag)) {
		fail(`${filename} Flag must be the release decision flag, named "enable" or "<feature>.enable" (found "${flag}")`);
	}

	const owner = requireField(f, "Owner", "Release", filename);
	if (owner !== "DevOps") fail(`${filename} Owner must be "DevOps" (found "${owner}")`);

	const commitment = requireField(f, "Customer Commitment", "Release", filename);
	if (!["yes", "no"].includes(commitment)) fail(`${filename} Customer Commitment must be "yes" or "no" (found "${commitment}")`);

	return { issue: primaryIssue, issues: issueMatches, issueRaw, tier, version, versionNumber, artifact, flag, owner, customerCommitment: commitment === "yes" };
}

function parseStages(body, tier, filename) {
	const rows = parseTable(body, ["Stage", "Traffic", "Watch Window", "Promotion"], "Rollout Stages", filename);
	const seen = new Set();
	const stages = rows.map(([rawName, traffic, window, promotion]) => {
		const name = stripMarks(rawName);
		if (!/^[a-z][a-z0-9-]*$/.test(name)) fail(`${filename} stage "${rawName}" must be lowercase kebab-case (for example "canary-5")`);
		if (seen.has(name)) fail(`${filename} stage "${name}" is duplicated`);
		seen.add(name);
		const t = /^(\d{1,3})%$/.exec(traffic);
		if (!t || Number(t[1]) > 100) fail(`${filename} stage "${name}" Traffic must be a percentage from 0% to 100% (found "${traffic}")`);
		const windowMinutes = parseDuration(window);
		if (windowMinutes === null) fail(`${filename} stage "${name}" Watch Window must be a positive duration like 30m, 2h, or 1d (found "${window}")`);
		if (promotion !== PROMOTION) fail(`${filename} stage "${name}" Promotion must be "${PROMOTION}" (found "${promotion}")`);
		return { name, traffic: Number(t[1]), window, windowMinutes, promotion };
	});

	if (stages[0].name !== "staging") fail(`${filename} the first stage must be "staging" (found "${stages[0].name}")`);
	if (stages[0].traffic !== 0) fail(`${filename} stage "staging" must carry 0% production traffic`);

	const production = stages.slice(1);
	const expected = PRODUCTION_STAGE_COUNT[tier];
	if (production.length !== expected) {
		fail(`${filename} a ${tier} change needs exactly ${LADDER_SHAPE[tier]} after staging (found ${production.length})`);
	}
	production.forEach((stage, i) => {
		if (i > 0 && stage.traffic <= production[i - 1].traffic) {
			fail(`${filename} production traffic must strictly increase (${stage.name} ${stage.traffic}% after ${production[i - 1].name} ${production[i - 1].traffic}%)`);
		}
	});
	const traffic = production.map((s) => s.traffic);
	if (production.at(-1).traffic !== 100) fail(`${filename} the last production stage must reach 100% traffic`);
	const shapeError = `${filename} a ${tier} change must roll out as ${LADDER_SHAPE[tier]} (found ${traffic.map((t) => `${t}%`).join(", ")})`;
	if (tier === "Critical") {
		if (traffic.some((t, i) => t !== CRITICAL_LADDER[i])) fail(shapeError);
		production.forEach((stage, i) => {
			if (i > 0 && stage.windowMinutes < production[i - 1].windowMinutes) {
				fail(`${filename} a Critical change needs each production watch window at least as long as the previous one (${stage.name} ${stage.window} after ${production[i - 1].name} ${production[i - 1].window})`);
			}
		});
	} else if (tier === "High") {
		if (traffic[0] !== CANARY_PERCENT || traffic[1] <= CANARY_PERCENT || traffic[1] > MAX_INTERMEDIATE_PERCENT) fail(shapeError);
	} else if (tier === "Medium" && traffic[0] !== CANARY_PERCENT) {
		fail(shapeError);
	}
	return stages;
}

function healthRequirement(metric) {
	if (INVERSE_WORDS.test(metric)) return null;
	return HEALTH_REQUIRED.find((required) => required.pattern.test(metric)) ?? null;
}

const isPercentMetric = (metric) => PERCENT_WORDS.test(metric);

// Returns why a comparator/limit pair on a 0-100 value can never fail or always fails, else null.
function percentVacuity(op, limit) {
	if ((op === ">=" && limit <= 0) || (op === ">" && limit < 0) || (op === "<=" && limit >= 100) || (op === "<" && limit > 100)) {
		return "can never be breached";
	}
	if ((op === "<" && limit <= 0) || (op === "<=" && limit < 0) || (op === ">" && limit >= 100) || (op === ">=" && limit > 100)) {
		return "is breached by every value";
	}
	return null;
}

function checkThresholdSense(metric, kind, op, limit, filename) {
	const required = kind === "health" ? HEALTH_REQUIRED.find((r) => r.pattern.test(metric)) : null;
	if (required) {
		if (INVERSE_WORDS.test(metric)) {
			fail(`${filename} threshold "${metric}" measures the opposite of ${required.label} (a higher value is healthier), so declare it as a business threshold, not health`);
		}
		if (op !== "<" && op !== "<=") {
			fail(`${filename} health threshold "${metric}" must bound ${required.label} from above: use Comparator < or <=, so that a value above the limit is the breach (found "${op}")`);
		}
		if (limit <= 0) fail(`${filename} health threshold "${metric}" Limit must be greater than 0 (found ${limit}); a zero or negative ${required.label} limit is breached by normal operation`);
		if (required.percentCapped && isPercentMetric(metric) && limit > 100) {
			fail(`${filename} health threshold "${metric}" is a percentage, so its Limit must be at most 100 (found ${limit})`);
		}
	}
	if (isPercentMetric(metric)) {
		const vacuity = percentVacuity(op, limit);
		if (vacuity) fail(`${filename} threshold "${metric}" is a rate or percentage, and "${op} ${limit}" ${vacuity}; set a limit that separates healthy from unhealthy values`);
	}
}

function parseThresholds(body, filename) {
	const rows = parseTable(body, ["Metric", "Kind", "Comparator", "Limit", "Rollback"], "Thresholds", filename);
	const seen = new Set();
	return rows.map(([rawMetric, kind, comparator, limit, rollback]) => {
		const metric = stripMarks(rawMetric);
		if (!/^[a-z][a-z0-9_]*$/.test(metric)) fail(`${filename} threshold metric "${rawMetric}" must be a snake_case metric key (for example "error_rate")`);
		if (seen.has(metric)) fail(`${filename} threshold metric "${metric}" is duplicated`);
		seen.add(metric);
		if (!KINDS.includes(kind)) fail(`${filename} threshold "${metric}" Kind must be one of: ${KINDS.join(", ")}`);
		const op = stripMarks(comparator);
		if (!COMPARATORS.includes(op)) fail(`${filename} threshold "${metric}" Comparator must be one of: ${COMPARATORS.join(" ")}`);
		if (!/^-?\d+(?:\.\d+)?$/.test(limit)) fail(`${filename} threshold "${metric}" Limit must be a number (found "${limit}")`);
		if (!AUTOMATIC_MECHANISMS.includes(rollback)) {
			fail(`${filename} threshold "${metric}" Rollback must name an automatic mechanism: ${AUTOMATIC_MECHANISMS.join(", ")} (found "${rollback}")`);
		}
		checkThresholdSense(metric, kind, op, Number(limit), filename);
		return { metric, kind, comparator: op, limit: Number(limit), rollback };
	});
}

function parseRollbackSection(body, filename) {
	const fields = parseBullets(body);
	const mechanisms = [];
	for (const line of body.split("\n")) {
		if (!/^- /.test(line) || /^- \*\*/.test(line)) continue;
		const m = /^- (Feature flag off|Traffic shift back|Redeploy previous artifact|Forward fix)\s*:\s*(.+)$/.exec(line);
		if (!m || isPlaceholder(m[2].trim())) {
			fail(`${filename} "## Rollback" bullet must read "- <mechanism>: <how>" with a mechanism from: ${MECHANISMS.join(", ")} (found "${line.trim()}")`);
		}
		if (mechanisms.some((x) => x.name === m[1])) fail(`${filename} rollback mechanism "${m[1]}" is listed twice`);
		mechanisms.push({ name: m[1], how: m[2].trim() });
	}
	if (!mechanisms.length) fail(`${filename} "## Rollback" must list at least one mechanism (${MECHANISMS.join(", ")})`);

	const primary = requireField(fields, "Primary", "Rollback", filename);
	if (!mechanisms.some((m) => primary.toLowerCase().includes(m.name.toLowerCase()))) {
		fail(`${filename} Rollback Primary must name one of the listed mechanisms`);
	}
	const decidedBy = requireField(fields, "Decided By", "Rollback", filename);
	if (!["DevOps", "QA and maintainer"].includes(decidedBy)) fail(`${filename} Rollback Decided By must be "DevOps" or "QA and maintainer" (found "${decidedBy}")`);
	const dataRaw = fields.get("data-affecting") ?? "no";
	if (!["yes", "no"].includes(dataRaw)) fail(`${filename} Rollback Data-Affecting must be "yes" or "no" (found "${dataRaw}")`);
	return { mechanisms, primary, decidedBy, dataAffecting: dataRaw === "yes" };
}

function parseOutcome(body, filename) {
	const f = parseBullets(body);
	const metric = requireField(f, "Metric", "Outcome Metric", filename, { allowNone: true });
	const baseline = requireField(f, "Baseline", "Outcome Metric", filename, { allowNone: true });
	const target = requireField(f, "Target", "Outcome Metric", filename, { allowNone: true });
	const direction = requireField(f, "Direction", "Outcome Metric", filename, { allowNone: true });
	const days = requireField(f, "Watch Window Days", "Outcome Metric", filename, { allowNone: true });
	const ledger = requireField(f, "Hypothesis Ledger Entry", "Outcome Metric", filename, { allowNone: true });

	if (metric === NONE) {
		for (const [label, value] of [["Baseline", baseline], ["Target", target], ["Direction", direction], ["Watch Window Days", days]]) {
			if (value !== NONE) fail(`${filename} Outcome Metric "${label}" must be "${NONE}" when no outcome metric is named`);
		}
		if (!ledger.startsWith(NONE) || ledger.slice(NONE.length).trim().length < 3) {
			fail(`${filename} Outcome Metric "Hypothesis Ledger Entry" must read "${NONE} <reason>" when no outcome metric is named`);
		}
		return { metric: null };
	}

	if (leadingNumber(baseline) === null) fail(`${filename} Outcome Metric Baseline must start with a number (found "${baseline}")`);
	if (leadingNumber(target) === null) fail(`${filename} Outcome Metric Target must start with a number (found "${target}")`);
	if (!["up", "down"].includes(direction)) fail(`${filename} Outcome Metric Direction must be "up" or "down" (found "${direction}")`);
	const b = leadingNumber(baseline);
	const t = leadingNumber(target);
	if (direction === "up" ? t <= b : t >= b) {
		fail(`${filename} Outcome Metric Target ${t} must be ${direction === "up" ? "above" : "below"} Baseline ${b} for Direction "${direction}"`);
	}
	if (!/^[1-9]\d*$/.test(days)) fail(`${filename} Outcome Metric Watch Window Days must be a positive integer (found "${days}")`);
	const m = /^([^#\s]+)#(\S+)$/.exec(stripMarks(ledger));
	if (!m || !isSafePath(m[1])) {
		fail(`${filename} Outcome Metric Hypothesis Ledger Entry must be a workspace-relative "<path>#<row>" (found "${ledger}")`);
	}
	return { metric, baseline, target, direction, watchWindowDays: Number(days), ledgerEntry: stripMarks(ledger), ledgerRow: m[2] };
}

function parseChangelog(body, customerCommitment, filename) {
	const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
	if (lines.length !== 1) fail(`${filename} "## Changelog" must hold exactly one line`);
	const entry = lines[0].replace(/^- /, "").trim();
	if (customerCommitment) {
		if (entry === NONE || isPlaceholder(entry)) fail(`${filename} Customer Commitment is "yes", so "## Changelog" needs a one-line customer-facing entry`);
		if (entry.length > 200) fail(`${filename} Changelog entry must stay within 200 characters`);
	} else if (entry !== NONE) {
		fail(`${filename} Customer Commitment is "no", so "## Changelog" must be "${NONE}"`);
	}
	return entry === NONE ? null : entry;
}

/**
 * Parses and structurally validates release.md (all rules that need no other file).
 * @param {string} rawMarkdown
 * @param {string} [filename="release.md"]
 * @param {{expectedTier?: string, tierSource?: string}} [options] tier the release must declare (from think.md or plan.md)
 */
export function parseRelease(rawMarkdown, filename = "release.md", options = {}) {
	const markdown = normalizeNewlines(rawMarkdown).trim();
	if (!markdown) fail(`${filename} is empty`);
	const h1 = markdown.match(/^# Release:\s+(.+)$/m);
	if (!h1 || !h1[1].trim() || isPlaceholder(h1[1].trim())) {
		fail(`${filename} must start with a level-one heading: "# Release: <name>"`);
	}
	if (/^```/m.test(markdown)) fail(`${filename} must not contain code blocks`);

	const sections = splitSections(markdown, filename);
	const release = parseReleaseSection(sections.Release, filename);
	if (options.expectedTier && release.tier !== options.expectedTier) {
		fail(`${filename} Tier "${release.tier}" must equal ${options.tierSource} ("${options.expectedTier}")`);
	}
	const stages = parseStages(sections["Rollout Stages"], release.tier, filename);
	const thresholds = parseThresholds(sections.Thresholds, filename);
	const rollback = parseRollbackSection(sections.Rollback, filename);
	const outcome = parseOutcome(sections["Outcome Metric"], filename);
	const changelog = parseChangelog(sections.Changelog, release.customerCommitment, filename);

	const questions = sections["Ambiguities & Open Questions"];
	if (!questions || isPlaceholder(questions)) {
		fail(`${filename} "## Ambiguities & Open Questions" must list questions or contain "${NONE}"`);
	}

	if (outcome.metric && !release.issues.map((i) => i.slice(1)).includes(outcome.ledgerRow)) {
		fail(`${filename} Outcome Metric Hypothesis Ledger Entry must point at this release's own ledger row "<path>#${release.issue.slice(1)}" (found row "${outcome.ledgerRow}")`);
	}

	for (const required of HEALTH_REQUIRED) {
		if (!thresholds.some((t) => t.kind === "health" && healthRequirement(t.metric) === required)) {
			fail(`${filename} Thresholds need a health threshold for ${required.label} (a metric name matching ${required.pattern})`);
		}
	}
	if (outcome.metric && !thresholds.some((t) => t.kind === "business")) {
		fail(`${filename} the Outcome Metric "${outcome.metric}" is named, so Thresholds need at least one business threshold`);
	}
	for (const t of thresholds) {
		if (!rollback.mechanisms.some((m) => m.name === t.rollback)) {
			fail(`${filename} threshold "${t.metric}" names rollback "${t.rollback}", which is not listed in "## Rollback"`);
		}
	}

	// Every threshold needs an automatic mechanism, so Forward fix can never be the only one listed.
	if (rollback.mechanisms.some((m) => m.name === "Forward fix") && !rollback.dataAffecting) {
		fail(`${filename} "Forward fix" is only for data-affecting changes where rollback is unsafe; set "- **Data-Affecting:** yes" or remove it`);
	}

	return { name: h1[1].trim(), release, stages, thresholds, rollback, outcome, changelog, questions };
}

function sectionBody(markdown, heading) {
	const m = new RegExp(`^## ${heading}[ \\t]*$`, "m").exec(markdown);
	if (!m) return null;
	const rest = markdown.slice(m.index + m[0].length);
	const next = rest.search(/^## /m);
	return next === -1 ? rest : rest.slice(0, next);
}

/** Reads the blast radius tier and rollback from think.md. */
export function parseThinkBlastRadius(rawMarkdown, filename = "think.md") {
	const body = sectionBody(normalizeNewlines(rawMarkdown), "Blast Radius");
	if (body === null) fail(`${filename} has no "## Blast Radius" section`);
	const fields = parseBullets(body.trim());
	const tier = fields.get("tier");
	if (!TIERS.includes(tier)) fail(`${filename} Blast Radius Tier must be one of: ${TIERS.join(", ")}`);
	return { tier, rollback: fields.get("rollback") ?? NONE };
}

/** Reads the tier check from plan.md. */
export function parsePlanBlastRadius(rawMarkdown, filename = "plan.md") {
	const body = sectionBody(normalizeNewlines(rawMarkdown), "Blast Radius Check");
	if (body === null) fail(`${filename} has no "## Blast Radius Check" section`);
	const fields = parseBullets(body.trim());
	const tierFromThink = fields.get("tier from think");
	if (!TIERS.includes(tierFromThink)) fail(`${filename} Tier from Think must be one of: ${TIERS.join(", ")}`);
	const holds = fields.get("still holds") ?? "";
	const raised = /^raised to (low|medium|high|critical)$/i.exec(holds);
	if (!raised && holds !== "Yes") fail(`${filename} Still Holds must be "Yes" or "Raised to <tier>" (found "${holds}")`);
	const raisedTier = raised ? TIERS.find((t) => t.toLowerCase() === raised[1].toLowerCase()) : null;
	return { tierFromThink, effectiveTier: raisedTier ?? tierFromThink, raised: Boolean(raisedTier) };
}

function normalizeText(value) {
	return value.toLowerCase().replace(/[`*]/g, "").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}

/**
 * Validates release.md, with optional cross-checks against think.md, plan.md, the tag, and the issue directory.
 * @param {string} rawMarkdown
 * @param {string} [filename="release.md"]
 * @param {{think?: string, plan?: string, tag?: string, issue?: string}} [options] file contents and expected values
 */
export function validateReleaseContent(rawMarkdown, filename = "release.md", options = {}) {
	let expectedTier = null;
	let tierSource = "";
	const think = options.think === undefined ? null : parseThinkBlastRadius(options.think, "think.md");
	const plan = options.plan === undefined ? null : parsePlanBlastRadius(options.plan, "plan.md");
	if (think && plan && think.tier !== plan.tierFromThink) {
		fail(`plan.md Tier from Think "${plan.tierFromThink}" differs from think.md Tier "${think.tier}"`);
	}
	if (plan) {
		expectedTier = plan.effectiveTier;
		tierSource = plan.raised ? "the tier raised by plan.md" : "the tier in plan.md";
	} else if (think) {
		expectedTier = think.tier;
		tierSource = "the tier in think.md";
	}

	// The effective tier is checked before the stages, so the ladder it requires is the one reported.
	const parsed = parseRelease(rawMarkdown, filename, expectedTier ? { expectedTier, tierSource } : {});
	const { release, rollback } = parsed;

	if (options.issue && !release.issues.includes(`#${options.issue}`)) {
		fail(`${filename} Issue ${release.issueRaw} does not match the work item directory issue-${options.issue}`);
	}
	if (options.tag && options.tag.replace(/^v/, "") !== release.versionNumber) {
		fail(`${filename} Version "${release.version}" does not match the release tag "${options.tag}"`);
	}

	if (think && ["High", "Critical"].includes(release.tier)) {
		const thinkRollback = think.rollback.trim();
		if (!thinkRollback || thinkRollback === NONE || isPlaceholder(thinkRollback)) {
			fail(`think.md names no Rollback for a ${release.tier} change; a change with no rollback path is not deployed`);
		}
		if (!normalizeText(rollback.primary).includes(normalizeText(thinkRollback))) {
			fail(`${filename} Rollback Primary must contain the rollback declared in think.md: "${thinkRollback}"`);
		}
	}
	return parsed;
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
	const parsed = { release: null, dir: null, think: null, plan: null, tag: null };
	const valueFlags = { "--release": "release", "--dir": "dir", "--think": "think", "--plan": "plan", "--tag": "tag" };
	for (let i = 0; i < args.length; i++) {
		const key = valueFlags[args[i]];
		if (key) {
			const next = args[++i];
			if (!next || next.startsWith("--")) parsed.error = `${args[i - 1]} needs a value`;
			else parsed[key] = next;
		} else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else parsed.error = `Unknown argument: ${args[i]}`;
	}
	return parsed;
}

export async function runValidator(args = process.argv.slice(2)) {
	const opts = parseArgs(args);
	if (opts.error && !opts.help) {
		console.error(`Error: ${opts.error}`);
		return 1;
	}

	if (opts.help || (!opts.release && !opts.dir)) {
		console.log(`Usage:
  node validate-release.mjs --release <path/to/release.md> [--think <think.md>] [--plan <plan.md>] [--tag <v1.2.3>]
  node validate-release.mjs --dir <specs/issue-N> [--tag <v1.2.3>]
Options:
  --think <file>   Cross-check the tier and, for High/Critical, the rollback against think.md
  --plan <file>    Cross-check the tier against plan.md (honours a raised tier)
  --tag <tag>      Require the release Version to match the git tag
  --dir <dir>      Use release.md in the directory, plus think.md and plan.md when present;
                   the Issue must match the directory name issue-N
`);
		return opts.help ? 0 : 1;
	}

	let target = opts.release;
	let thinkPath = opts.think;
	let planPath = opts.plan;
	let issue;
	if (opts.dir) {
		if (!(await dirExists(opts.dir))) {
			console.error(`Error: Directory not found: ${opts.dir}`);
			return 1;
		}
		target = join(opts.dir, "release.md");
		if (!(await fileExists(target))) {
			console.error(`Error: Directory ${opts.dir} does not contain release.md`);
			return 1;
		}
		if (!thinkPath && (await fileExists(join(opts.dir, "think.md")))) thinkPath = join(opts.dir, "think.md");
		if (!planPath && (await fileExists(join(opts.dir, "plan.md")))) planPath = join(opts.dir, "plan.md");
		issue = /^issue-(\d+)$/.exec(basename(resolve(opts.dir)))?.[1];
	}

	try {
		const content = await readFile(target, "utf-8");
		const options = { tag: opts.tag ?? undefined, issue };
		if (thinkPath) options.think = await readFile(thinkPath, "utf-8");
		if (planPath) options.plan = await readFile(planPath, "utf-8");
		const parsed = validateReleaseContent(content, target, options);
		console.log(
			`✓ [release.md] Validated: "${parsed.name}" (${parsed.release.issue}, ${parsed.release.tier}, ${parsed.stages.length} stage(s), ${parsed.thresholds.length} threshold(s)) (${target})`,
		);
		return 0;
	} catch (err) {
		if (err instanceof ValidationError) {
			console.error(`✗ [release.md] Validation failed: ${err.message}`);
		} else {
			console.error(`✗ [release.md] ${err.message}`);
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
