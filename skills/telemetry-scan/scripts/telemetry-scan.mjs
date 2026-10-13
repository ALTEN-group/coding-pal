#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export class InputError extends Error {}

function fail(message) {
	throw new InputError(message);
}

export const Z_THRESHOLD = 3;
export const ANOMALY_POINTS = 3;
export const BASELINE_FRACTION = 0.6;
export const TREND_POINTS = 10;
export const MIN_R2 = 0.6;
export const DEPLOY_WINDOW_MINUTES = 60;
export const DEFAULT_HORIZON_MINUTES = 120;
export const HIGH_Z = 5;
export const MIN_POINTS_WITH_BASELINE = 5;
export const MIN_POINTS_COMPUTED_BASELINE = 10;
export const HIGH_SEVERITY_EXIT_CODE = 3;

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const KIND_ORDER = { breach: 0, anomaly: 1, trend: 2 };
const SEVERITY_ORDER = { high: 0, medium: 1 };

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

function parseTimestamp(value, where) {
	if (typeof value !== "string" || !TIMESTAMP.test(value)) fail(`${where}: "t" must be an ISO 8601 UTC timestamp like 2026-10-13T09:30:00Z`);
	const ms = Date.parse(value);
	if (Number.isNaN(ms) || new Date(ms).toISOString().replace(".000", "") !== value) fail(`${where}: "t" is not a real date and time (${value})`);
	return ms;
}

function isObject(value) {
	return value && typeof value === "object" && !Array.isArray(value);
}

/** Validates series.json and returns a Map of metric to points sorted as given (strictly ascending). */
export function parseSeries(data) {
	if (!isObject(data) || !Object.keys(data).length) fail("series must be an object mapping each metric name to an array of { t, v } points");
	const series = new Map();
	for (const [metric, points] of Object.entries(data)) {
		if (!Array.isArray(points)) fail(`series.${metric} must be an array of { t, v } points`);
		const parsed = points.map((point, i) => {
			const where = `series.${metric}[${i}]`;
			if (!isObject(point)) fail(`${where} must be an object with "t" and "v"`);
			if (typeof point.v !== "number" || !Number.isFinite(point.v)) fail(`${where}: "v" must be a finite number`);
			return { ms: parseTimestamp(point.t, where), t: point.t, v: point.v };
		});
		for (let i = 1; i < parsed.length; i++) {
			if (parsed[i].ms <= parsed[i - 1].ms) fail(`series.${metric}[${i}]: timestamps must be strictly ascending`);
		}
		if (parsed.length < MIN_POINTS_WITH_BASELINE) fail(`series.${metric} needs at least ${MIN_POINTS_WITH_BASELINE} points (found ${parsed.length})`);
		series.set(metric, parsed);
	}
	return series;
}

function parseKeyed(data, label, series, check) {
	if (data === undefined || data === null) return {};
	if (!isObject(data)) fail(`${label} must be an object keyed by metric name`);
	for (const [metric, value] of Object.entries(data)) {
		if (!series.has(metric)) fail(`${label}.${metric} does not match any metric in the series`);
		if (!isObject(value)) fail(`${label}.${metric} must be an object`);
		check(metric, value);
	}
	return data;
}

export function parseBaselines(data, series) {
	return parseKeyed(data, "baseline", series, (metric, value) => {
		if (typeof value.mean !== "number" || !Number.isFinite(value.mean)) fail(`baseline.${metric}.mean must be a finite number`);
		if (typeof value.std !== "number" || !Number.isFinite(value.std) || value.std < 0) fail(`baseline.${metric}.std must be a number of at least 0`);
	});
}

export function parseThresholds(data, series) {
	return parseKeyed(data, "thresholds", series, (metric, value) => {
		const { min, max } = value;
		if (min === undefined && max === undefined) fail(`thresholds.${metric} needs "min" or "max"`);
		for (const [name, bound] of [["min", min], ["max", max]]) {
			if (bound !== undefined && (typeof bound !== "number" || !Number.isFinite(bound))) fail(`thresholds.${metric}.${name} must be a finite number`);
		}
		if (min !== undefined && max !== undefined && min >= max) fail(`thresholds.${metric}.min must be below max`);
	});
}

export function parseDeploys(data) {
	if (data === undefined || data === null) return [];
	if (!Array.isArray(data)) fail("deploys must be an array of { t, version, diff }");
	return data.map((deploy, i) => {
		const where = `deploys[${i}]`;
		if (!isObject(deploy)) fail(`${where} must be an object`);
		for (const key of ["version", "diff"]) {
			if (typeof deploy[key] !== "string" || !deploy[key].trim()) fail(`${where}: "${key}" must be a non-empty string`);
		}
		return { ms: parseTimestamp(deploy.t, where), t: deploy.t, version: deploy.version, diff: deploy.diff };
	}).sort((a, b) => a.ms - b.ms);
}

function meanStd(values) {
	const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
	const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
	return { mean, std: Math.sqrt(variance) };
}

/** The baseline is the first 60% of the series unless one is supplied. Population standard deviation. */
export function resolveBaseline(metric, points, given) {
	if (given) return { mean: given.mean, std: given.std, source: "baseline file" };
	if (points.length < MIN_POINTS_COMPUTED_BASELINE) {
		fail(`series.${metric} needs at least ${MIN_POINTS_COMPUTED_BASELINE} points to compute a baseline from its first ${BASELINE_FRACTION * 100}%, or supply --baseline`);
	}
	const { mean, std } = meanStd(points.slice(0, Math.floor(points.length * BASELINE_FRACTION)).map((p) => p.v));
	return { mean, std, source: `first ${BASELINE_FRACTION * 100}% of the series` };
}

export function zScores(points, baseline) {
	const std = Math.max(baseline.std, Math.abs(baseline.mean) * 1e-6, 1e-9);
	return points.map((p) => (p.v - baseline.mean) / std);
}

/** Least-squares line over points; x is minutes from the first point. */
export function fitLine(points) {
	const x0 = points[0].ms;
	const xs = points.map((p) => (p.ms - x0) / 60_000);
	const ys = points.map((p) => p.v);
	const n = points.length;
	const mx = xs.reduce((a, b) => a + b, 0) / n;
	const my = ys.reduce((a, b) => a + b, 0) / n;
	const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
	const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
	const syy = ys.reduce((a, y) => a + (y - my) ** 2, 0);
	const slope = sxx === 0 ? 0 : sxy / sxx;
	const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
	return { slope, r2 };
}

function makeFinding(metric, kind, severity, onsetPoint, evidence, summary) {
	const safe = metric.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "metric";
	return { id: `${safe}-${kind}-${onsetPoint.t.slice(0, 10)}`, metric, kind, severity, onset: onsetPoint.t, evidence, summary, deploys: [] };
}

export function scanMetric(metric, points, baseline, threshold = {}, horizonMinutes = DEFAULT_HORIZON_MINUTES) {
	const findings = [];
	const last = points[points.length - 1];

	const z = zScores(points, baseline);
	if (z.slice(-ANOMALY_POINTS).every((value) => Math.abs(value) >= Z_THRESHOLD)) {
		let start = points.length - ANOMALY_POINTS;
		while (start > 0 && Math.abs(z[start - 1]) >= Z_THRESHOLD) start--;
		const lastZ = z.slice(-ANOMALY_POINTS).map((value) => round(value, 2));
		const severity = Math.min(...z.slice(-ANOMALY_POINTS).map(Math.abs)) >= HIGH_Z ? "high" : "medium";
		findings.push(makeFinding(metric, "anomaly", severity, points[start], {
			current: last.v,
			baselineMean: round(baseline.mean),
			baselineStd: round(baseline.std),
			lastZ,
			runLength: points.length - start,
		}, `${metric} is ${lastZ[ANOMALY_POINTS - 1] > 0 ? "above" : "below"} its baseline: the last ${ANOMALY_POINTS} points have |z| >= ${Z_THRESHOLD} (z = ${lastZ.join(", ")}) since ${points[start].t}`));
	}

	const { min, max } = threshold;
	const beyond = (v) => (max !== undefined && v > max) || (min !== undefined && v < min);
	if (beyond(last.v)) {
		const bound = max !== undefined && last.v > max ? "max" : "min";
		let start = points.length - 1;
		while (start > 0 && beyond(points[start - 1].v)) start--;
		findings.push(makeFinding(metric, "breach", "high", points[start], {
			current: last.v,
			bound,
			threshold: bound === "max" ? max : min,
			runLength: points.length - start,
		}, `${metric} is ${last.v}, ${bound === "max" ? "above max" : "below min"} ${bound === "max" ? max : min}, since ${points[start].t}`));
	} else if (min !== undefined || max !== undefined) {
		const window = points.slice(-TREND_POINTS);
		const { slope, r2 } = fitLine(window);
		const candidates = [];
		if (slope > 0 && max !== undefined) candidates.push({ bound: "max", threshold: max, eta: (max - last.v) / slope });
		if (slope < 0 && min !== undefined) candidates.push({ bound: "min", threshold: min, eta: (min - last.v) / slope });
		for (const candidate of candidates) {
			if (r2 >= MIN_R2 && candidate.eta <= horizonMinutes) {
				findings.push(makeFinding(metric, "trend", candidate.eta <= horizonMinutes / 2 ? "high" : "medium", window[0], {
					current: last.v,
					slopePerHour: round(slope * 60),
					r2: round(r2),
					window: window.length,
					bound: candidate.bound,
					threshold: candidate.threshold,
					etaMinutes: round(candidate.eta, 1),
				}, `${metric} is heading toward ${candidate.bound} ${candidate.threshold} at ${round(slope * 60)} per hour (r2 ${round(r2)}): breach in about ${round(candidate.eta, 1)} minutes`));
			}
		}
	}
	return findings;
}

export function attachDeploys(findings, deploys) {
	for (const finding of findings) {
		const onset = Date.parse(finding.onset);
		finding.deploys = deploys
			.filter((d) => d.ms <= onset && d.ms >= onset - DEPLOY_WINDOW_MINUTES * 60_000)
			.map((d) => ({ t: d.t, version: d.version, diff: d.diff }));
	}
	return findings;
}

/** Scans every metric. series is the parsed Map; the other arguments are the parsed objects. */
export function scan(series, { baselines = {}, thresholds = {}, deploys = null, horizonMinutes = DEFAULT_HORIZON_MINUTES } = {}) {
	const findings = [];
	const metrics = [];
	for (const [metric, points] of series) {
		const baseline = resolveBaseline(metric, points, Object.hasOwn(baselines, metric) ? baselines[metric] : undefined);
		metrics.push({ metric, points: points.length, from: points[0].t, to: points[points.length - 1].t, current: points[points.length - 1].v, baseline: { mean: round(baseline.mean), std: round(baseline.std), source: baseline.source } });
		findings.push(...scanMetric(metric, points, baseline, Object.hasOwn(thresholds, metric) ? thresholds[metric] : undefined, horizonMinutes));
	}
	if (deploys) attachDeploys(findings, deploys);
	findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.metric.localeCompare(b.metric) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
	return { horizonMinutes, metrics, findings };
}

export function renderReport(result, withDeploys) {
	const out = ["# Telemetry Scan", ""];
	for (const m of result.metrics) out.push(`- ${m.metric}: ${m.points} points ${m.from} to ${m.to}, current ${m.current}, baseline mean ${m.baseline.mean} std ${m.baseline.std} (${m.baseline.source})`);
	out.push("", `## Findings (horizon ${result.horizonMinutes} min)`);
	if (!result.findings.length) out.push("_None._");
	for (const f of result.findings) {
		out.push(`- [${f.severity}] ${f.metric} ${f.kind}: ${f.summary}`);
		out.push(`  evidence: ${JSON.stringify(f.evidence)}`);
		if (withDeploys) {
			if (f.deploys.length) for (const d of f.deploys) out.push(`  deploy within ${DEPLOY_WINDOW_MINUTES} min before ${f.onset}: ${d.version} at ${d.t}: ${d.diff}`);
			else out.push(`  no deploy within ${DEPLOY_WINDOW_MINUTES} min before ${f.onset}`);
		}
	}
	out.push("", "Monitoring informs and humans act: nothing was mitigated or changed.");
	if (result.findings.some((f) => f.severity === "high")) out.push(`High severity finding present: exit code ${HIGH_SEVERITY_EXIT_CODE}.`);
	return `${out.join("\n")}\n`;
}

const USAGE = `Usage:
  node telemetry-scan.mjs --series <series.json> [--baseline baseline.json] [--thresholds thresholds.json] [--horizon-minutes 120] [--deploys deploys.json] [--json]
Exit codes: 0 scanned (monitoring informs, humans act), 1 invalid input, ${HIGH_SEVERITY_EXIT_CODE} at least one high severity finding (so CI can alert).`;

function parseArgs(args) {
	const parsed = { horizon: DEFAULT_HORIZON_MINUTES, json: false };
	for (let i = 0; i < args.length; i++) {
		const next = args[i + 1];
		if (args[i] === "--series" && next) parsed.series = args[++i];
		else if (args[i] === "--baseline" && next) parsed.baseline = args[++i];
		else if (args[i] === "--thresholds" && next) parsed.thresholds = args[++i];
		else if (args[i] === "--deploys" && next) parsed.deploys = args[++i];
		else if (args[i] === "--horizon-minutes" && next) parsed.horizon = Number(args[++i]);
		else if (args[i] === "--json") parsed.json = true;
		else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else fail(`unexpected argument "${args[i]}"`);
	}
	return parsed;
}

async function readJson(path, label) {
	let text;
	try {
		text = await readFile(path, "utf-8");
	} catch (err) {
		fail(`cannot read ${label} ${path}: ${err.code ?? err.message}`);
	}
	try {
		return JSON.parse(text);
	} catch {
		fail(`${label} ${path} is not valid JSON`);
	}
}

export async function runScan(args = process.argv.slice(2)) {
	try {
		const opts = parseArgs(args);
		if (opts.help || !opts.series) {
			console.log(USAGE);
			return opts.help ? 0 : 1;
		}
		if (!(Number.isFinite(opts.horizon) && opts.horizon > 0)) fail("--horizon-minutes must be a positive number");
		const series = parseSeries(await readJson(opts.series, "series"));
		const baselines = parseBaselines(opts.baseline ? await readJson(opts.baseline, "baseline") : undefined, series);
		const thresholds = parseThresholds(opts.thresholds ? await readJson(opts.thresholds, "thresholds") : undefined, series);
		const deploys = opts.deploys ? parseDeploys(await readJson(opts.deploys, "deploys")) : null;
		const result = scan(series, { baselines, thresholds, deploys, horizonMinutes: opts.horizon });
		process.stdout.write(opts.json ? `${JSON.stringify(result, null, 2)}\n` : renderReport(result, deploys !== null));
		return result.findings.some((f) => f.severity === "high") ? HIGH_SEVERITY_EXIT_CODE : 0;
	} catch (err) {
		console.error(`✗ [telemetry-scan] ${err instanceof InputError ? `Invalid input: ${err.message}` : err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runScan().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
