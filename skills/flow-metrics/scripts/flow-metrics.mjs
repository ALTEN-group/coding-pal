#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { STAGES, ValidationError, validateEvent } from "./emit-event.mjs";

export { ValidationError };

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_CYCLE_DAYS = 14;
export const REWORK_DAYS = 14;

export const NOT_MEASURED = ["Lines of code", "Story points velocity", "Editor suggestion acceptance"];

// Interpretation of the factory's "multiple daily deployments": at least 2 a day on average.
export const DEPLOYS_PER_DAY = 2;
const DEPLOYS_PER_WEEK = DEPLOYS_PER_DAY * 7;
// Interpretation of "a rate close to 100% is a warning": 95% or more, with enough hypotheses to mean something.
export const VALIDATION_WARN_RATE = 95;
export const VALIDATION_WARN_MIN = 5;

/**
 * The use cases named on the factory's metrics page, with the targets that page states for them.
 * `measure` is the one measure the target applies to. Other use cases have no target and never warn.
 */
export const USE_CASES = {
	"automated-test-creation": { measure: "median_minutes", max: 30, target: "median <= 30 minutes" },
	"fix-loop": { measure: "mean_iterations", max: 3, target: "mean iterations <= 3" },
	"backlog-issue-creation": { measure: "median_minutes", max: 480, target: "median <= 8 hours" },
	"controls-first-run": { measure: "first_pass_rate", min: 80, target: "first-pass rate >= 80%" },
	"time-to-restore": { measure: "median_minutes", maxExclusive: 15, target: "median < 15 minutes" },
};

function fail(message) {
	throw new ValidationError(message);
}

function validDate(value) {
	return DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

/**
 * Parses a JSON Lines event log strictly: every non-blank line must be a valid event.
 * @param {string} text
 * @param {string} [filename="events.jsonl"]
 */
export function parseEvents(text, filename = "events.jsonl") {
	const events = [];
	text.replace(/\r\n?/g, "\n").split("\n").forEach((raw, i) => {
		if (!raw.trim()) return;
		let json;
		try {
			json = JSON.parse(raw);
		} catch {
			fail(`${filename} line ${i + 1} is not valid JSON`);
		}
		try {
			const event = validateEvent(json);
			events.push({ ...event, ms: Date.parse(event.t), line: i + 1 });
		} catch (err) {
			if (err instanceof ValidationError) fail(`${filename} line ${i + 1}: ${err.message}`);
			throw err;
		}
	});
	return events.sort((a, b) => a.ms - b.ms || a.line - b.line);
}

const round = (value) => Math.round(value * 10) / 10;

export function median(values) {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values) {
	return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

const pct = (part, whole) => (whole ? (part / whole) * 100 : null);

/**
 * Computes every factory metric from validated events. An outcome event decides whether a work item
 * falls in the period; the events it is measured against may come from earlier in the log.
 * @param {ReturnType<typeof parseEvents>} events
 * @param {{since?: string|null, until?: string|null, cycleDays?: number}} [options]
 */
export function computeMetrics(events, options = {}) {
	const { since = null, until = null, cycleDays = DEFAULT_CYCLE_DAYS } = options;
	if (since && !validDate(since)) fail(`--since must be a valid ISO date (YYYY-MM-DD), found "${since}"`);
	if (until && !validDate(until)) fail(`--until must be a valid ISO date (YYYY-MM-DD), found "${until}"`);
	if (since && until && since > until) fail(`--since ${since} is after --until ${until}`);
	if (!Number.isInteger(cycleDays) || cycleDays < 1) fail("--cycle-days must be a positive integer");

	const from = since ? Date.parse(`${since}T00:00:00Z`) : -Infinity;
	const to = until ? Date.parse(`${until}T00:00:00Z`) + DAY_MS : Infinity;
	const inWindow = (e) => e.ms >= from && e.ms < to;
	const lastMs = events.length ? events[events.length - 1].ms : null;
	const horizon = until ? to : lastMs;

	const ofType = (type) => events.filter((e) => e.type === type);
	const inWin = (type) => ofType(type).filter(inWindow);
	const earliest = (list) => {
		const map = new Map();
		for (const e of list) if (!map.has(e.id)) map.set(e.id, e);
		return map;
	};
	const latest = (list) => new Map(list.map((e) => [e.id, e]));
	// The first (or latest) event per work item is chosen from the whole log, then kept only when it falls in the period.
	const firstIn = (type, keep = () => true) => new Map([...earliest(ofType(type).filter(keep))].filter(([, e]) => inWindow(e)));
	const firstOf = (type, id) => ofType(type).find((e) => e.id === id);
	const meetingOf = (id) => {
		const link = [...ofType("issue.created"), ...ofType("issue.ranked")].find((e) => e.id === id && e.meeting);
		return link ? link.meeting : id;
	};
	const hoursBetween = (a, b) => (b - a) / HOUR_MS;

	const metrics = [];
	const add = (key, name, section, unit, target, value, n, status, extra = {}) => {
		const known = value !== null && n > 0;
		metrics.push({
			key,
			name,
			section,
			unit,
			target,
			value: known ? round(value) : null,
			n,
			status: known ? status : "unknown",
			...extra,
		});
	};
	// Statuses use the value as displayed (one decimal), so 79.96 displays as 80.0 and passes an 80 floor.
	const limit = (value, max, inclusive = false) => {
		const shown = round(value);
		return (inclusive ? shown <= max : shown < max) ? "ok" : "warn";
	};
	const floor = (value, min) => (round(value) >= min ? "ok" : "warn");

	// Flow
	const released = [...firstIn("release.production", (e) => e.percent === 100).values()];
	const leadTimes = [];
	for (const e of released) {
		const start = firstOf("meeting.transcribed", meetingOf(e.id));
		if (start && e.ms >= start.ms) leadTimes.push(hoursBetween(start.ms, e.ms));
	}
	add("lead_time", "Meeting-to-Production lead time (median)", "flow", "hours", "< 48", median(leadTimes), leadTimes.length, limit(median(leadTimes), 48));

	const deployments = inWin("release.production").filter((e) => e.percent === 100);
	const spanStart = since ?? events[0]?.t.slice(0, 10);
	const spanEnd = until ?? events[events.length - 1]?.t.slice(0, 10);
	const days = events.length ? (Date.parse(`${spanEnd}T00:00:00Z`) - Date.parse(`${spanStart}T00:00:00Z`)) / DAY_MS + 1 : 0;
	const perWeek = deployments.length / Math.max(days / 7, 1);
	add("deployment_frequency", "Deployment frequency", "flow", "per week", `>= ${DEPLOYS_PER_WEEK} (multiple daily)`, perWeek, events.length ? 1 : 0, floor(perWeek, DEPLOYS_PER_WEEK), { count: deployments.length });

	const releaseIds = [...new Set(inWin("release.production").map((e) => e.id))];
	const failed = releaseIds.filter((id) => {
		const first = firstOf("release.production", id);
		return ofType("release.rollback").some((e) => e.id === id && e.ms >= first.ms) ||
			ofType("incident.opened").some((e) => (e.change ?? e.id) === id && e.ms >= first.ms);
	});
	const failureRate = pct(failed.length, releaseIds.length);
	add("change_failure_rate", "Change failure rate", "flow", "%", "< 1%", failureRate, releaseIds.length, limit(failureRate, 1));

	const restores = [];
	for (const [id, mitigated] of firstIn("incident.mitigated")) {
		const opened = firstOf("incident.opened", id);
		if (opened && mitigated.ms >= opened.ms) restores.push((mitigated.ms - opened.ms) / MINUTE_MS);
	}
	add("time_to_restore", "Time to restore (median)", "flow", "minutes", "< 15", median(restores), restores.length, limit(median(restores), 15));

	// Meet & Triage
	const ranked = [];
	for (const [id, e] of firstIn("issue.ranked")) {
		const ended = firstOf("meeting.ended", meetingOf(id));
		if (ended && e.ms >= ended.ms) ranked.push(hoursBetween(ended.ms, e.ms));
	}
	add("hours_to_ranked", "Hours from meeting end to ranked backlog issue (median)", "triage", "hours", "<= 8", median(ranked), ranked.length, limit(median(ranked), 8, true));

	// Code
	const firstRuns = [...firstIn("code.first_run").values()];
	const firstRate = pct(firstRuns.filter((e) => e.green).length, firstRuns.length);
	add("first_pass_green", "First-pass green rate in Code", "code", "%", ">= 80%", firstRate, firstRuns.length, floor(firstRate, 80));

	const loops = [...latest(ofType("code.fix_loop")).values()].filter(inWindow).map((e) => e.count);
	add("fix_loop_count", "Fix-loop count (mean per work item)", "code", "loops", "<= 3", mean(loops), loops.length, limit(mean(loops), 3, true));

	// Prove
	const ciRuns = [...firstIn("ci.first_run").values()];
	const ciRate = pct(ciRuns.filter((e) => e.green).length, ciRuns.length);
	add("control_pass_rate", "Deterministic control pass rate on first CI run", "prove", "%", ">= 80%", ciRate, ciRuns.length, floor(ciRate, 80));

	const merged = [...firstIn("pr.merged").values()];
	const edited = new Set(ofType("pr.human_edit").map((e) => e.id));
	const humanRate = pct(merged.filter((e) => edited.has(e.id)).length, merged.length);
	add("human_rework_rate", "Human rework rate", "prove", "%", "0%", humanRate, merged.length, round(humanRate) === 0 ? "ok" : "warn");

	const reworked = (e) => ofType("pr.reworked").some((r) => r.id === e.id && r.ms >= e.ms && r.ms <= e.ms + REWORK_DAYS * DAY_MS);
	const settled = merged.filter((e) => reworked(e) || edited.has(e.id) || (horizon !== null && e.ms + REWORK_DAYS * DAY_MS <= horizon));
	const accepted = settled.filter((e) => !reworked(e) && !edited.has(e.id));
	const reworkPending = merged.length - settled.length;
	const reworkNote = reworkPending ? `${reworkPending} merged change(s) still inside the ${REWORK_DAYS}-day window are excluded` : undefined;
	add("acceptance_rate", "Acceptance rate", "prove", "%", "trend", pct(accepted.length, settled.length), settled.length, "ok", { note: reworkNote });
	add("rework_rate", `Rework rate (${REWORK_DAYS} days)`, "prove", "%", "trend", pct(settled.filter(reworked).length, settled.length), settled.length, "ok", { note: reworkNote });

	const turnarounds = [];
	const byTier = new Map();
	for (const [id, v] of firstIn("pr.validated")) {
		const green = v.ci_green_at ? Date.parse(v.ci_green_at) : ofType("ci.first_run").find((e) => e.id === id && e.green && e.ms <= v.ms)?.ms;
		if (green === undefined || v.ms < green) continue;
		const hours = hoursBetween(green, v.ms);
		turnarounds.push(hours);
		byTier.set(v.tier, [...(byTier.get(v.tier) ?? []), hours]);
	}
	add("validation_turnaround", "Minimum human validation turnaround (median)", "prove", "hours", "trend", median(turnarounds), turnarounds.length, "ok", {
		breakdown: [...byTier].sort(([a], [b]) => a.localeCompare(b)).map(([label, list]) => ({ label, value: round(median(list)), n: list.length })),
	});

	// Release
	add("production_releases", "Work items released to production", "release", "count", "trend", releaseIds.length, releaseIds.length, "ok");
	const rollbacks = inWin("release.rollback").length;
	add("rollbacks", "Rollbacks", "release", "count", "trend", rollbacks, releaseIds.length || rollbacks, "ok");

	// Learn
	const defects = inWin("defect.production");
	add("escaped_defect_rate", "Escaped defect rate", "learn", "%", "trend", pct(defects.filter((e) => e.escaped).length, defects.length), defects.length, "ok");

	const closed = inWin("hypothesis.closed");
	const validated = pct(closed.filter((e) => e.verdict === "validated").length, closed.length);
	add("hypothesis_validation_rate", "Hypothesis validation rate", "learn", "%", `< ${VALIDATION_WARN_RATE}% (near 100% means untested bets)`, validated, closed.length, closed.length >= VALIDATION_WARN_MIN && round(validated) >= VALIDATION_WARN_RATE ? "warn" : "ok");

	const invalidated = closed.filter((e) => e.verdict === "invalidated");
	const deleted = (e) => ofType("feature.deleted").some((d) => d.id === e.id && d.ms >= e.ms && d.ms <= e.ms + cycleDays * DAY_MS);
	const cycleDone = invalidated.filter((e) => deleted(e) || (horizon !== null && e.ms + cycleDays * DAY_MS <= horizon));
	const deletionRate = pct(cycleDone.filter(deleted).length, cycleDone.length);
	const deletionPending = invalidated.length - cycleDone.length;
	add("feature_deletion_rate", `Feature deletion rate (within ${cycleDays} days)`, "learn", "%", "100%", deletionRate, cycleDone.length, floor(deletionRate, 100), {
		note: deletionPending ? `${deletionPending} invalidated feature(s) still inside the ${cycleDays}-day cycle are excluded` : undefined,
	});

	const evidence = [];
	for (const [id, signal] of firstIn("evidence.first_signal")) {
		const created = firstOf("issue.created", id);
		if (created && signal.ms >= created.ms) evidence.push(hoursBetween(created.ms, signal.ms));
	}
	add("time_to_evidence", "Time to evidence (median)", "learn", "hours", "trend", median(evidence), evidence.length, "ok");

	// AI autonomy & leverage
	const assisted = inWin("stage.assisted");
	const stageMeans = Object.fromEntries(STAGES.map((s) => [s, mean(assisted.filter((e) => e.stage === s).map((e) => e.share))]));
	const codeOnly = (stageMeans.code ?? 0) > 0 && STAGES.every((s) => s === "code" || !(stageMeans[s] > 0));
	for (const stage of STAGES) {
		const count = assisted.filter((e) => e.stage === stage).length;
		const share = stageMeans[stage] === null ? null : stageMeans[stage] * 100;
		const concentrated = stage === "code" && codeOnly;
		add(`assisted_share.${stage}`, `Assisted share: ${stage}`, "ai", "%", "trend", share, count, concentrated ? "warn" : "ok", {
			note: concentrated ? "AI output is concentrated in Code only" : undefined,
		});
	}

	const authorship = inWin("pr.authorship");
	const aiLines = authorship.reduce((sum, e) => sum + e.ai_lines, 0);
	const totalLines = aiLines + authorship.reduce((sum, e) => sum + e.human_lines, 0);
	add("ai_code_share", "AI code generation share", "ai", "%", "100% (zero human syntax typing)", pct(aiLines, totalLines), authorship.length, floor(pct(aiLines, totalLines), 100));

	const sessions = inWin("context.session");
	add("context_hit_rate", "Context hit rate", "ai", "%", "trend", pct(sessions.filter((e) => e.hit).length, sessions.length), sessions.length, "ok");

	const costs = inWin("ai.cost");
	const costByStage = STAGES.map((stage) => {
		const list = costs.filter((e) => e.stage === stage);
		return { label: stage, value: round(list.reduce((sum, e) => sum + e.usd, 0)), n: list.length };
	}).filter((row) => row.n);
	const totalUsd = costs.reduce((sum, e) => sum + e.usd, 0);
	add("cost_per_merged_change", "Cost per merged change", "ai", "USD", "trend", merged.length ? totalUsd / merged.length : null, merged.length, "ok", {
		breakdown: costByStage,
		totalUsd: round(totalUsd),
	});

	const usecaseRuns = inWin("usecase.run");
	const names = [...new Set([...Object.keys(USE_CASES), ...usecaseRuns.map((e) => e.usecase)])].sort();
	const usecases = names.map((usecase) => {
		const runs = usecaseRuns.filter((e) => e.usecase === usecase);
		const rule = USE_CASES[usecase];
		const row = {
			usecase,
			n: runs.length,
			median_minutes: runs.length ? round(median(runs.map((e) => e.minutes))) : null,
			mean_iterations: runs.length ? round(mean(runs.map((e) => e.iterations))) : null,
			mean_usd: runs.length ? Math.round(mean(runs.map((e) => e.usd)) * 100) / 100 : null,
			human_intervention_rate: runs.length ? round(pct(runs.filter((e) => e.human_intervention).length, runs.length)) : null,
			first_pass_rate: runs.length ? round(pct(runs.filter((e) => e.first_pass).length, runs.length)) : null,
			target: rule?.target ?? "trend",
		};
		const value = rule ? row[rule.measure] : null;
		const breached = rule && value !== null && (rule.max !== undefined ? value > rule.max : rule.maxExclusive !== undefined ? value >= rule.maxExclusive : value < rule.min);
		return { ...row, status: runs.length ? (breached ? "warn" : "ok") : "unknown" };
	});

	return { period: { since, until }, events: events.length, inWindow: events.filter(inWindow).length, metrics, usecases };
}

export const SECTIONS = [
	["flow", "Flow"],
	["triage", "Meet & Triage"],
	["code", "Code"],
	["prove", "Prove"],
	["release", "Release"],
	["learn", "Learn"],
	["ai", "AI autonomy & leverage"],
];

const formatValue = (m) => {
	if (m.value === null) return "-";
	if (m.unit === "%") return `${m.value}%`;
	return m.unit === "count" ? `${m.value}` : `${m.value} ${m.unit}`;
};

/** Renders the Markdown report. */
export function renderReport(report) {
	const { since, until } = report.period;
	const lines = [
		"# Flow Metrics",
		"",
		`- **Period:** ${since ?? "start of log"} to ${until ?? "end of log"}`,
		`- **Events:** ${report.inWindow} in period (${report.events} in log)`,
		"- **Status:** `ok` meets the target or has none to breach, `warn` misses it, `unknown` has no events",
		"",
	];
	for (const [section, title] of SECTIONS) {
		const rows = report.metrics.filter((m) => m.section === section);
		lines.push(`## ${title}`, "", "| Metric | Value | Target | Status | n |", "|---|---|---|---|---|");
		for (const m of rows) lines.push(`| ${m.name} | ${formatValue(m)} | ${m.target} | ${m.status} | ${m.n} |`);
		lines.push("");
		for (const m of rows) {
			if (m.note && m.value !== null) lines.push(`> ${m.name}: ${m.note}.`, "");
			if (m.breakdown?.length) {
				lines.push(`### ${m.name}: breakdown`, "", "| Group | Value | n |", "|---|---|---|");
				for (const b of m.breakdown) lines.push(`| ${b.label} | ${b.value} | ${b.n} |`);
				lines.push("");
			}
		}
	}
	lines.push(
		"## Per Use Case",
		"",
		"| Use case | Runs | Median minutes | Mean iterations | Mean USD | Human intervention | First-pass success | Target | Status |",
		"|---|---|---|---|---|---|---|---|---|",
	);
	for (const u of report.usecases) {
		const cell = (value, suffix = "") => (value === null ? "-" : `${value}${suffix}`);
		lines.push(
			`| ${u.usecase} | ${u.n} | ${cell(u.median_minutes)} | ${cell(u.mean_iterations)} | ${cell(u.mean_usd)} | ${cell(u.human_intervention_rate, "%")} | ${cell(u.first_pass_rate, "%")} | ${u.target} | ${u.status} |`,
		);
	}
	lines.push("");
	lines.push("## Not Measured", "", `Deliberately not computed: ${NOT_MEASURED.join(", ")}.`, "");
	return lines.join("\n");
}

function parseArgs(args) {
	const parsed = { events: null, since: null, until: null, json: false, cycleDays: DEFAULT_CYCLE_DAYS, problems: [] };
	for (let i = 0; i < args.length; i++) {
		const flag = args[i];
		if (flag === "--json") parsed.json = true;
		else if (flag === "--help" || flag === "-h") parsed.help = true;
		else if (!["--events", "--since", "--until", "--cycle-days"].includes(flag)) parsed.problems.push(`Unknown argument: ${flag}`);
		else if (args[i + 1] === undefined || args[i + 1] === "") parsed.problems.push(`${flag} needs a value`);
		else if (flag === "--events") parsed.events = args[++i];
		else if (flag === "--since") parsed.since = args[++i];
		else if (flag === "--until") parsed.until = args[++i];
		else parsed.cycleDays = Number(args[++i]);
	}
	return parsed;
}

export async function runMetrics(args = process.argv.slice(2)) {
	const opts = parseArgs(args);
	if (!opts.help && opts.problems.length) {
		console.error(`✗ Metrics failed: ${opts.problems[0]}`);
		return 1;
	}
	if (opts.help || !opts.events) {
		console.log(`Usage:
  node flow-metrics.mjs --events metrics/events.jsonl [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--cycle-days ${DEFAULT_CYCLE_DAYS}] [--json]
Prints a Markdown report of the factory metrics (or JSON with --json). Every line of the log must be a valid event.
`);
		return opts.help ? 0 : 1;
	}
	try {
		let text;
		try {
			text = await readFile(opts.events, "utf-8");
		} catch (err) {
			if (err.code === "ENOENT") fail(`Event log not found: ${opts.events}`);
			throw err;
		}
		const report = computeMetrics(parseEvents(text, opts.events), opts);
		console.log(opts.json ? JSON.stringify(report, null, 2) : renderReport(report));
		return 0;
	} catch (err) {
		console.error(`✗ Metrics failed: ${err instanceof ValidationError ? err.message : err.stack}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runMetrics().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
