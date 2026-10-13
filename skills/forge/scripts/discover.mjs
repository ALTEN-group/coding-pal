#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { ForgeError, effectiveStatus, isIsoDate, loadCatalog, parseArgs, resolveCatalogPath, todayUtc } from "./catalog-lib.mjs";
import { KINDS } from "./validate-forge.mjs";

export const FIELD_WEIGHTS = { name: 4, keywords: 3, capabilities: 2, summary: 1 };
const K1 = 1.2;
const B = 0.75;

const STOPWORDS = new Set(
	"a an and are as at be but by can for from has have in into is it its of on or our that the their then there these this to us we which will with without via per not no all any each also should must need needs needed want wants using use used".split(" "),
);

/** Lowercase tokens, stopwords removed, with a light plural stem so "sessions" matches "session". */
export function tokenize(text) {
	const tokens = [];
	for (const raw of String(text ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
		if (raw.length < 2 || STOPWORDS.has(raw)) continue;
		let token = raw;
		if (token.length > 4 && token.endsWith("ies")) token = `${token.slice(0, -3)}y`;
		else if (token.length > 3 && token.endsWith("s") && !/(ss|us|is)$/.test(token)) token = token.slice(0, -1);
		tokens.push(token);
	}
	return tokens;
}

function fieldTokens(asset) {
	return {
		name: tokenize(asset.name),
		keywords: tokenize((asset.keywords ?? []).join(" ")),
		capabilities: tokenize((asset.capabilities ?? []).join(" ")),
		summary: tokenize(asset.summary),
	};
}

const round = (value) => Math.round(value * 1000) / 1000;

/**
 * Ranks catalog assets for a need with a field-weighted BM25. Removed assets are never candidates.
 * @returns {{terms: string[], searched: number, candidates: object[]}}
 */
export function discover(catalog, need, { kind = null, limit = 5, today = todayUtc() } = {}) {
	const terms = [...new Set(tokenize(need))];
	const pool = catalog.assets.filter((asset) => effectiveStatus(asset, today) !== "removed" && (!kind || asset.kind === kind));
	if (!terms.length || !pool.length) return { terms, searched: pool.length, candidates: [] };

	const docs = pool.map((asset) => {
		const tf = new Map();
		const matchedFields = new Map();
		let length = 0;
		for (const [field, tokens] of Object.entries(fieldTokens(asset))) {
			length += tokens.length * FIELD_WEIGHTS[field];
			for (const token of tokens) {
				tf.set(token, (tf.get(token) ?? 0) + FIELD_WEIGHTS[field]);
				if (!matchedFields.has(token)) matchedFields.set(token, new Set());
				matchedFields.get(token).add(field);
			}
		}
		return { asset, tf, length, matchedFields };
	});
	const averageLength = docs.reduce((sum, d) => sum + d.length, 0) / docs.length || 1;

	const scored = docs.map((doc) => {
		let score = 0;
		const matched = [];
		for (const term of terms) {
			const tf = doc.tf.get(term) ?? 0;
			if (!tf) continue;
			const n = docs.filter((d) => d.tf.has(term)).length;
			const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
			score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * doc.length) / averageLength)));
			matched.push(term);
		}
		return { doc, score, matched };
	});

	const candidates = scored
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score || (a.doc.asset.id < b.doc.asset.id ? -1 : 1))
		.slice(0, limit)
		.map(({ doc, score, matched }) => {
			const asset = doc.asset;
			const status = effectiveStatus(asset, today);
			return {
				id: asset.id,
				name: asset.name,
				kind: asset.kind,
				score: round(score),
				matchedTerms: matched,
				matchedFields: [...new Set(matched.flatMap((t) => [...doc.matchedFields.get(t)]))].sort((a, b) => FIELD_WEIGHTS[b] - FIELD_WEIGHTS[a]),
				status,
				version: asset.version,
				maturity: asset.maturity,
				summary: asset.summary,
				interface: asset.interface ?? null,
				composesWith: asset.composesWith ?? [],
				...(status === "deprecated" ? { deprecated: true, replacement: asset.replacement ?? null, removalDate: asset.removalDate ?? null } : {}),
			};
		});
	return { terms, searched: pool.length, candidates };
}

export function renderDiscovery(need, result, catalogPath) {
	const out = [`Forge discovery for: ${JSON.stringify(need)}`, `Catalog: ${catalogPath} (${result.searched} asset(s) searched)`, `Terms: ${result.terms.join(", ") || "none"}`, ""];
	if (!result.candidates.length) {
		out.push("No Forge asset matches this need. Record what was searched before choosing a custom build.");
	}
	result.candidates.forEach((c, i) => {
		out.push(`${i + 1}. ${c.id} (${c.name}) score ${c.score} [${c.kind}, ${c.status}, ${c.version}, ${c.maturity}]`);
		out.push(`   matched: ${c.matchedTerms.join(", ")} (in ${c.matchedFields.join(", ")})`);
		if (c.deprecated) out.push(`   DEPRECATED: use ${c.replacement ?? "the replacement"}, removal ${c.removalDate ?? "unscheduled"}`);
		if (c.interface) {
			const guide = c.interface.integrationGuide ? ` (integration: ${c.interface.integrationGuide})` : "";
			out.push(`   interface: ${c.interface.type ?? "?"} ${c.interface.docs ?? ""}${guide}`.trimEnd());
		}
		out.push(`   composes with: ${c.composesWith.join(", ") || "none"}`);
	});
	return `${out.join("\n")}\n`;
}

const USAGE = `Usage: node discover.mjs --need "<text>" [--catalog <catalog.json>] [--kind ${KINDS.join("|")}] [--json] [--limit 5]`;

export async function runDiscover(args = process.argv.slice(2), env = process.env) {
	const opts = parseArgs(args, { values: ["--need", "--catalog", "--kind", "--limit", "--today"], booleans: ["--json"] });
	if (opts.help) {
		console.log(USAGE);
		return 0;
	}
	const problem =
		opts.problems[0] ??
		(!opts.need?.trim() ? "--need is required" : null) ??
		(opts.kind !== undefined && !KINDS.includes(opts.kind) ? `--kind must be one of ${KINDS.join(", ")}` : null) ??
		(opts.limit !== undefined && !/^[1-9]\d*$/.test(opts.limit) ? "--limit must be a positive integer" : null) ??
		(opts.today !== undefined && !isIsoDate(opts.today) ? "--today must be an ISO date (YYYY-MM-DD)" : null) ??
		(!tokenize(opts.need).length ? "--need has no searchable words after stopword removal" : null);
	if (problem) {
		console.error(`✗ ${problem}\n${USAGE}`);
		return 1;
	}

	try {
		const path = resolveCatalogPath(opts.catalog, env);
		const catalog = await loadCatalog(path);
		const result = discover(catalog, opts.need, { kind: opts.kind ?? null, limit: opts.limit ? Number(opts.limit) : 5, today: opts.today });
		if (opts.json) console.log(JSON.stringify({ need: opts.need, catalog: path, ...result }, null, 2));
		else process.stdout.write(renderDiscovery(opts.need, result, path));
		return 0;
	} catch (err) {
		if (err instanceof ForgeError) {
			console.error(`✗ ${err.message}`);
			return 1;
		}
		throw err;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runDiscover().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
