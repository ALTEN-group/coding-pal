#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export class MutationError extends Error {
	constructor(message) {
		super(message);
		this.name = "MutationError";
	}
}

export const DEFAULT_MIN_SCORE = 80;
export const DEFAULT_CONFIG = "mutation-bar.json";

const KILLED = new Set(["Killed", "Timeout"]);
const MISSED = new Set(["Survived", "NoCoverage"]);
const EXCLUDED = new Set(["CompileError", "RuntimeError", "Ignored"]);

const emptyCounts = () => ({ killed: 0, survived: 0, timeout: 0, noCoverage: 0 });

export function normalizePath(path) {
	return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Score = (killed + timeout) / (killed + timeout + survived + noCoverage) * 100, or null when nothing is scorable. */
export function scoreOf(counts) {
	const detected = counts.killed + counts.timeout;
	const total = detected + counts.survived + counts.noCoverage;
	return total === 0 ? null : (detected * 100) / total;
}

/**
 * Parses a Stryker mutation-testing-elements report or a generic summary JSON.
 * @returns {{kind: "stryker"|"summary", files: Map<string, {counts: object, survivors: object[]}>|null, counts: object}}
 */
export function parseReport(text) {
	let data;
	try {
		data = JSON.parse(text);
	} catch (err) {
		throw new MutationError(`report is not valid JSON: ${err.message}`);
	}
	if (data && typeof data === "object" && data.files && typeof data.files === "object") return parseStryker(data);
	if (data && typeof data === "object" && "killed" in data && "survived" in data) return parseSummary(data);
	throw new MutationError('report is neither a Stryker JSON ("files") nor a summary JSON ({ "killed", "survived", ... })');
}

function parseStryker(data) {
	const files = new Map();
	const counts = emptyCounts();
	let ignored = 0;
	for (const [rawPath, entry] of Object.entries(data.files)) {
		if (!Array.isArray(entry?.mutants)) throw new MutationError(`Stryker report file "${rawPath}" has no "mutants" array`);
		const file = { counts: emptyCounts(), ignored: 0, survivors: [] };
		for (const mutant of entry.mutants) {
			const status = mutant.status;
			if (status === "Ignored") file.ignored++;
			if (EXCLUDED.has(status)) continue;
			if (status === "Killed") file.counts.killed++;
			else if (status === "Timeout") file.counts.timeout++;
			else if (status === "Survived") file.counts.survived++;
			else if (status === "NoCoverage") file.counts.noCoverage++;
			else throw new MutationError(`mutant ${mutant.id ?? "?"} in "${rawPath}" has unsupported status "${status}" (finish the mutation run before gating)`);
			if (MISSED.has(status)) {
				file.survivors.push({ file: normalizePath(rawPath), line: mutant.location?.start?.line ?? 0, mutator: mutant.mutatorName ?? "unknown", status });
			}
		}
		for (const key of Object.keys(counts)) counts[key] += file.counts[key];
		ignored += file.ignored;
		files.set(normalizePath(rawPath), file);
	}
	return { kind: "stryker", files, counts, ignored };
}

function parseSummary(data) {
	const counts = {
		killed: data.killed,
		survived: data.survived,
		timeout: data.timeout ?? 0,
		noCoverage: data.noCoverage ?? data.no_coverage ?? 0,
	};
	for (const [key, value] of Object.entries(counts)) {
		if (!Number.isInteger(value) || value < 0) throw new MutationError(`summary "${key}" must be a non-negative integer`);
	}
	let ignored = null;
	if ("ignored" in data) {
		if (!Number.isInteger(data.ignored) || data.ignored < 0) throw new MutationError('summary "ignored" must be a non-negative integer');
		ignored = data.ignored;
	}
	return { kind: "summary", files: null, counts, ignored };
}

function percent(value, label) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) throw new MutationError(`${label} must be a number between 0 and 100`);
	return value;
}

export function parseConfig(text, label = DEFAULT_CONFIG) {
	let data;
	try {
		data = JSON.parse(text);
	} catch (err) {
		throw new MutationError(`${label} is not valid JSON: ${err.message}`);
	}
	if (!data || typeof data !== "object" || Array.isArray(data)) throw new MutationError(`${label} must be a JSON object`);
	const config = {};
	if ("minScore" in data) config.minScore = percent(data.minScore, `${label} minScore`);
	if ("perFileMin" in data) config.perFileMin = percent(data.perFileMin, `${label} perFileMin`);
	return config;
}

/** The CLI may only raise the thresholds fixed by the config (or the default). */
export function effectiveThresholds(config = {}, cli = {}) {
	const base = config.minScore ?? DEFAULT_MIN_SCORE;
	let minScore = base;
	if (cli.minScore !== undefined) {
		percent(cli.minScore, "--min-score");
		if (cli.minScore < base) throw new MutationError(`a control cannot be weakened: --min-score ${cli.minScore} is below the minimum ${base}`);
		minScore = cli.minScore;
	}
	let perFileMin = config.perFileMin ?? null;
	if (cli.perFileMin !== undefined) {
		percent(cli.perFileMin, "--per-file-min");
		if (perFileMin !== null && cli.perFileMin < perFileMin) {
			throw new MutationError(`a control cannot be weakened: --per-file-min ${cli.perFileMin} is below the configured ${perFileMin}`);
		}
		perFileMin = cli.perFileMin;
	}
	return { minScore, perFileMin };
}

export function parseChangedList(text) {
	const paths = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"))
		.map(normalizePath);
	if (!paths.length) throw new MutationError("the --changed file lists no paths");
	return [...new Set(paths)];
}

function matchesChanged(reportPath, changed) {
	return changed.some((c) => reportPath === c || reportPath.endsWith(`/${c}`) || c.endsWith(`/${reportPath}`));
}

/**
 * @param {ReturnType<typeof parseReport>} report
 * @param {{minScore: number, perFileMin: number|null}} thresholds
 * @param {{changed?: string[]|null}} [options]
 */
export function evaluate(report, thresholds, { changed = null } = {}) {
	if (report.kind === "summary" && (changed || thresholds.perFileMin !== null)) {
		throw new MutationError("a summary report has no per-file data; use a Stryker JSON report with --changed or a per-file minimum");
	}

	let files = null;
	let counts = report.counts;
	let ignored = report.ignored;
	const unprovenChanged = [];
	if (report.files) {
		const selected = changed ? [...report.files].filter(([path]) => matchesChanged(path, changed)) : [...report.files];
		if (changed) {
			for (const c of changed) {
				if (![...report.files.keys()].some((path) => matchesChanged(path, [c]))) unprovenChanged.push(c);
			}
		}
		files = selected.map(([path, file]) => ({ path, counts: file.counts, ignored: file.ignored, score: scoreOf(file.counts), survivors: file.survivors }));
		counts = emptyCounts();
		ignored = 0;
		for (const f of files) {
			for (const key of Object.keys(counts)) counts[key] += f.counts[key];
			ignored += f.ignored;
		}
	}

	const score = scoreOf(counts);
	const failures = [];
	if (score === null) {
		failures.push(changed ? "no scorable mutants in the changed files: the change was not mutation tested" : "the report has no scorable mutants");
	} else if (score < thresholds.minScore) {
		failures.push(`mutation score ${format(score)} is below the minimum ${thresholds.minScore}`);
	}
	if (files && thresholds.perFileMin !== null) {
		for (const f of files) {
			if (f.score !== null && f.score < thresholds.perFileMin) failures.push(`${f.path} scores ${format(f.score)}, below the per-file minimum ${thresholds.perFileMin}`);
		}
	}

	const survivors = files ? files.flatMap((f) => f.survivors).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.mutator.localeCompare(b.mutator)) : [];
	return { pass: failures.length === 0, score, thresholds, counts, ignored, files, survivors, unprovenChanged, failures };
}

const format = (n) => (Math.round(n * 100) / 100).toFixed(2);

export function renderResult(result) {
	const out = [];
	if (result.files) {
		out.push("| File | Killed | Timeout | Survived | No coverage | Score |", "|---|---|---|---|---|---|");
		for (const f of result.files) {
			out.push(`| ${f.path} | ${f.counts.killed} | ${f.counts.timeout} | ${f.counts.survived} | ${f.counts.noCoverage} | ${f.score === null ? "n/a" : format(f.score)} |`);
		}
		out.push("");
	}
	const c = result.counts;
	out.push(`Total: killed ${c.killed}, timeout ${c.timeout}, survived ${c.survived}, no coverage ${c.noCoverage}`);
	if (result.ignored !== null) out.push(`Ignored: ${result.ignored} mutant${result.ignored === 1 ? "" : "s"} excluded from the score (check any \`Stryker disable\` comment)`);
	out.push(`Score: ${result.score === null ? "n/a" : format(result.score)} (minimum ${result.thresholds.minScore}${result.thresholds.perFileMin === null ? "" : `, per file ${result.thresholds.perFileMin}`})`);
	if (result.survivors.length) {
		out.push("", "Survivors:");
		for (const s of result.survivors) out.push(`- ${s.file}:${s.line} ${s.mutator} (${s.status})`);
	}
	if (result.unprovenChanged.length) {
		out.push("");
		for (const p of result.unprovenChanged) out.push(`Warning: no mutants for ${p}: not proven`);
	}
	return `${out.join("\n")}\n`;
}

const USAGE = "Usage: node mutation-bar.mjs --report <file> [--config mutation-bar.json] [--min-score N] [--per-file-min N] [--changed <file-with-paths>]";

function number(value, flag) {
	const n = Number(value);
	if (value.trim() === "" || Number.isNaN(n)) throw new MutationError(`${flag} needs a number, got "${value}"`);
	return n;
}

function parseArgs(args) {
	const parsed = { report: null, config: null, changed: null, cli: {} };
	for (let i = 0; i < args.length; i++) {
		const next = args[i + 1];
		if (args[i] === "--report" && next) parsed.report = args[++i];
		else if (args[i] === "--config" && next) parsed.config = args[++i];
		else if (args[i] === "--changed" && next) parsed.changed = args[++i];
		else if (args[i] === "--min-score" && next) parsed.cli.minScore = number(args[++i], "--min-score");
		else if (args[i] === "--per-file-min" && next) parsed.cli.perFileMin = number(args[++i], "--per-file-min");
		else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else throw new MutationError(`unknown or incomplete argument "${args[i]}"`);
	}
	return parsed;
}

async function isFile(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

export async function runMutationBar(args = process.argv.slice(2)) {
	try {
		const opts = parseArgs(args);
		if (opts.help) {
			console.log(`${USAGE}\nThe CLI can only raise the minimum fixed by ${DEFAULT_CONFIG} (default ${DEFAULT_MIN_SCORE}), never lower it.`);
			return 0;
		}
		if (!opts.report) {
			console.error(USAGE);
			return 1;
		}
		let config = {};
		if (opts.config) {
			if (!(await isFile(opts.config))) throw new MutationError(`config not found: ${opts.config}`);
			config = parseConfig(await readFile(opts.config, "utf-8"), opts.config);
		} else if (await isFile(DEFAULT_CONFIG)) {
			config = parseConfig(await readFile(DEFAULT_CONFIG, "utf-8"));
		}
		const thresholds = effectiveThresholds(config, opts.cli);
		const report = parseReport(await readFile(opts.report, "utf-8"));
		const changed = opts.changed ? parseChangedList(await readFile(opts.changed, "utf-8")) : null;
		const result = evaluate(report, thresholds, { changed });
		process.stdout.write(renderResult(result));
		if (!result.pass) {
			console.error(`✗ [mutation-bar] ${result.failures.join("; ")}`);
			return 1;
		}
		console.error(`✓ [mutation-bar] Mutation score ${format(result.score)} meets the minimum ${thresholds.minScore} (${opts.report})`);
		return 0;
	} catch (err) {
		console.error(`✗ [mutation-bar] ${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runMutationBar().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
