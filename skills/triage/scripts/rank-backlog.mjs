#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ValidationError, parseTriage, validateTriageContent } from "./validate-triage.mjs";

export const DEFAULT_WEIGHTS = {
	customerValue: 1,
	businessValue: 1,
	effort: 1,
	risk: 1,
	confidence: { Low: 0.5, Medium: 0.75, High: 1 },
};

export function resolveWeights(overrides = {}) {
	if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) throw new ValidationError("weights must be a JSON object");
	const unknown = Object.keys(overrides).filter((key) => !(key in DEFAULT_WEIGHTS));
	if (unknown.length) throw new ValidationError(`unknown weights key(s): ${unknown.join(", ")}`);
	if ("confidence" in overrides && (!overrides.confidence || typeof overrides.confidence !== "object" || Array.isArray(overrides.confidence))) {
		throw new ValidationError("weights.confidence must be an object with Low, Medium, and High");
	}
	const unknownLevels = Object.keys(overrides.confidence ?? {}).filter((level) => !(level in DEFAULT_WEIGHTS.confidence));
	if (unknownLevels.length) throw new ValidationError(`unknown weights.confidence level(s): ${unknownLevels.join(", ")}`);
	for (const key of ["customerValue", "businessValue", "effort", "risk"]) {
		if (key in overrides && !(typeof overrides[key] === "number" && overrides[key] > 0)) {
			throw new ValidationError(`weights.${key} must be a positive number`);
		}
	}
	const confidence = { ...DEFAULT_WEIGHTS.confidence, ...(overrides.confidence ?? {}) };
	for (const [level, value] of Object.entries(confidence)) {
		if (!(typeof value === "number" && value > 0 && value <= 1)) {
			throw new ValidationError(`weights.confidence.${level} must be a number in (0, 1]`);
		}
	}
	return { ...DEFAULT_WEIGHTS, ...overrides, confidence };
}

/** score = (wC*customer + wB*business) / (wE*effort + wR*risk) * confidence */
export function scoreItem(scores, weights) {
	const value = weights.customerValue * scores.customerValue + weights.businessValue * scores.businessValue;
	const cost = weights.effort * scores.effort + weights.risk * scores.risk;
	return Math.round((value / cost) * weights.confidence[scores.confidence] * 1000) / 1000;
}

/**
 * Ranks parsed backlog items.
 * @param {{issue: string, triage: object}[]} items
 */
export function rankItems(items, weights = DEFAULT_WEIGHTS) {
	const ranked = [];
	const awaitingBusinessValue = [];
	const parked = [];
	for (const item of items) {
		const { decision, scores } = item.triage;
		const effective = decision.final === "pending" ? decision.proposed : decision.final;
		if (effective === "later" || effective === "no") {
			parked.push({ ...item, decision: effective });
		} else if (scores.businessValue === null) {
			awaitingBusinessValue.push({ ...item, decision: effective });
		} else {
			ranked.push({ ...item, decision: effective, score: scoreItem(scores, weights) });
		}
	}
	const issueNumber = (id) => Number(id.replace(/\D/g, "")) || 0;
	ranked.sort((a, b) => b.score - a.score || b.triage.scores.customerValue - a.triage.scores.customerValue || issueNumber(a.issue) - issueNumber(b.issue));
	awaitingBusinessValue.sort((a, b) => issueNumber(a.issue) - issueNumber(b.issue));
	parked.sort((a, b) => issueNumber(a.issue) - issueNumber(b.issue));

	const byScore = new Map();
	for (const r of ranked) byScore.set(r.score, [...(byScore.get(r.score) ?? []), r.issue]);
	const ties = [...byScore.values()].filter((group) => group.length > 1);
	return { ranked, awaitingBusinessValue, parked, ties };
}

export function renderRanking({ ranked, awaitingBusinessValue, parked, ties }) {
	const out = ["# Ranked Backlog", ""];
	out.push("| Rank | Issue | Title | Decision | Score | Customer | Business | Effort | Risk | Confidence |");
	out.push("|---|---|---|---|---|---|---|---|---|---|");
	ranked.forEach((r, i) => {
		const s = r.triage.scores;
		out.push(
			`| ${i + 1} | ${r.issue} | ${r.triage.issue.title} | ${r.decision} | ${r.score} | ${s.customerValue} | ${s.businessValue} | ${s.effort} | ${s.risk} | ${s.confidence} |`,
		);
	});
	if (!ranked.length) out.push("| – | – | _None._ | – | – | – | – | – | – | – |");
	out.push("");
	out.push("## Awaiting Business value (Product Owner)", "");
	if (awaitingBusinessValue.length) {
		for (const r of awaitingBusinessValue) out.push(`- ${r.issue}: ${r.triage.issue.title} (proposed ${r.decision})`);
	} else {
		out.push("_None._");
	}
	out.push("", "## Ties for the Product Owner to break", "");
	if (ties.length) {
		for (const group of ties) out.push(`- ${group.join(", ")}`);
	} else {
		out.push("_None._");
	}
	out.push("", "## Parked (later / no)", "");
	if (parked.length) {
		for (const r of parked) out.push(`- ${r.issue}: ${r.triage.issue.title} (${r.decision})`);
	} else {
		out.push("_None._");
	}
	return `${out.join("\n")}\n`;
}

async function loadItems(dir) {
	const items = [];
	const invalid = [];
	const entries = (await readdir(dir)).filter((name) => /^issue-\d+$/.test(name)).sort();
	for (const name of entries) {
		const file = join(dir, name, "triage.md");
		try {
			if (!(await stat(file)).isFile()) continue;
		} catch {
			continue;
		}
		try {
			const content = await readFile(file, "utf-8");
			const stage = parseTriage(content, file).decision.final === "pending" ? "proposed" : "final";
			items.push({ issue: name, triage: validateTriageContent(content, file, { stage }) });
		} catch (err) {
			invalid.push(`${file}: ${err.message}`);
		}
	}
	return { items, invalid };
}

export async function runRanker(args = process.argv.slice(2)) {
	let dir = null;
	let weightsPath = null;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--dir" && args[i + 1]) dir = args[++i];
		else if (args[i] === "--weights" && args[i + 1]) weightsPath = args[++i];
		else if (args[i] === "--help" || args[i] === "-h") {
			console.log("Usage: node rank-backlog.mjs --dir <specs-directory> [--weights <weights.json>]");
			return 0;
		}
	}
	if (!dir) {
		console.error("Usage: node rank-backlog.mjs --dir <specs-directory> [--weights <weights.json>]");
		return 1;
	}

	try {
		const weights = resolveWeights(weightsPath ? JSON.parse(await readFile(weightsPath, "utf-8")) : {});
		const { items, invalid } = await loadItems(dir);
		process.stdout.write(renderRanking(rankItems(items, weights)));
		if (invalid.length) {
			invalid.forEach((message) => console.error(`✗ Excluded invalid triage: ${message}`));
			return 1;
		}
		return 0;
	} catch (err) {
		console.error(`✗ ${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runRanker().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
