import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MEETING, toJsonl, validEvents } from "./metrics-fixture.mjs";
import { DEFAULT_CYCLE_DAYS, USE_CASES, ValidationError, computeMetrics, mean, median, parseEvents, renderReport, runMetrics } from "./flow-metrics.mjs";

const matches = (pattern) => (err) => err instanceof ValidationError && pattern.test(err.message);
const compute = (events, options) => computeMetrics(parseEvents(toJsonl(events)), options);
const pick = (report, key) => report.metrics.find((m) => m.key === key);
const at = (type, id, t, extra = {}) => ({ t, type, id, ...extra });

test("computes every metric on the fixture log", () => {
	const report = compute(validEvents());
	const expected = {
		lead_time: [60, "warn", 2],
		deployment_frequency: [0.7, "warn", 1],
		change_failure_rate: [50, "warn", 2],
		time_to_restore: [10, "ok", 1],
		hours_to_ranked: [8, "ok", 2],
		first_pass_green: [50, "warn", 2],
		fix_loop_count: [3, "ok", 2],
		control_pass_rate: [50, "warn", 2],
		human_rework_rate: [50, "warn", 2],
		acceptance_rate: [0, "ok", 2],
		rework_rate: [50, "ok", 2],
		validation_turnaround: [7, "ok", 2],
		production_releases: [2, "ok", 2],
		rollbacks: [1, "ok", 2],
		escaped_defect_rate: [33.3, "ok", 3],
		hypothesis_validation_rate: [33.3, "ok", 3],
		feature_deletion_rate: [100, "ok", 1],
		time_to_evidence: [144, "ok", 1],
		"assisted_share.code": [100, "ok", 1],
		"assisted_share.triage": [50, "ok", 1],
		context_hit_rate: [66.7, "ok", 3],
		ai_code_share: [95, "warn", 2],
		cost_per_merged_change: [1, "ok", 2],
	};
	for (const [key, [value, status, n]] of Object.entries(expected)) {
		const m = pick(report, key);
		assert.deepEqual([m.value, m.status, m.n], [value, status, n], key);
	}
	assert.equal(pick(report, "assisted_share.think").status, "unknown");
	assert.equal(report.events, validEvents().length);
	assert.deepEqual(pick(report, "validation_turnaround").breakdown, [
		{ label: "High", value: 12, n: 1 },
		{ label: "Medium", value: 2, n: 1 },
	]);
	assert.deepEqual(pick(report, "cost_per_merged_change").breakdown, [
		{ label: "triage", value: 0.5, n: 1 },
		{ label: "code", value: 1.5, n: 1 },
	]);
	assert.match(pick(report, "feature_deletion_rate").note, /1 invalidated feature\(s\) still inside the 14-day cycle/);
	const rows = Object.fromEntries(report.usecases.map((u) => [u.usecase, [u.n, u.median_minutes, u.mean_iterations, u.mean_usd, u.human_intervention_rate, u.first_pass_rate, u.status]]));
	assert.deepEqual(rows["automated-test-creation"], [2, 30, 2, 1, 50, 50, "ok"]);
	assert.deepEqual(rows["fix-loop"], [1, 9, 4, 0.25, 0, 0, "warn"]);
	assert.equal(rows["time-to-restore"][6], "unknown");
});

test("an empty log yields unknown for every metric", () => {
	const report = computeMetrics(parseEvents(""));
	assert.equal(report.events, 0);
	assert.ok(report.metrics.length > 20);
	assert.ok(report.metrics.every((m) => m.status === "unknown" && m.value === null));
	assert.match(renderReport(report), /\| Meeting-to-Production lead time \(median\) \| - \| < 48 \| unknown \| 0 \|/);
});

test("the report is deterministic and has a section per stage", () => {
	const events = validEvents();
	const a = renderReport(compute(events));
	assert.equal(a, renderReport(compute([...events].reverse())));
	for (const title of ["Flow", "Meet & Triage", "Code", "Prove", "Release", "Learn", "AI autonomy & leverage", "Not Measured"]) {
		assert.match(a, new RegExp(`^## ${title.replace(/[&]/g, "\\$&")}$`, "m"));
	}
	assert.match(a, /\| Time to restore \(median\) \| 10 minutes \| < 15 \| ok \| 1 \|/);
	assert.match(a, /\| Change failure rate \| 50% \| < 1% \| warn \| 2 \|/);
	assert.match(a, /\| Rollbacks \| 1 \| trend \| ok \| 2 \|/);
	assert.match(a, /### Minimum human validation turnaround \(median\): breakdown/);
	assert.match(a, /Lines of code, Story points velocity, Editor suggestion acceptance/);
});

test("lead time and ranking use the meeting link, or the same id as a fallback", () => {
	const events = [
		at("meeting.ended", "issue-7", "2026-10-01T08:00:00Z"),
		at("meeting.transcribed", "issue-7", "2026-10-01T09:00:00Z"),
		at("issue.ranked", "issue-7", "2026-10-01T12:00:00Z"),
		at("release.production", "issue-7", "2026-10-02T09:00:00Z", { percent: 100 }),
		at("meeting.transcribed", MEETING, "2026-10-01T09:00:00Z"),
		at("release.production", "issue-8", "2026-10-03T09:00:00Z", { percent: 100 }),
	];
	const report = compute(events);
	assert.equal(pick(report, "lead_time").value, 24, "issue-8 has no meeting and is skipped");
	assert.equal(pick(report, "lead_time").n, 1);
	assert.equal(pick(report, "hours_to_ranked").value, 4);
});

test("only a 100% release counts as a deployment and as lead-time end", () => {
	const events = [
		at("meeting.transcribed", "issue-7", "2026-10-01T09:00:00Z"),
		at("release.production", "issue-7", "2026-10-01T10:00:00Z", { percent: 10 }),
	];
	const report = compute(events);
	assert.equal(pick(report, "lead_time").status, "unknown");
	assert.equal(pick(report, "deployment_frequency").value, 0);
	assert.equal(pick(report, "deployment_frequency").status, "warn");
	assert.equal(pick(report, "production_releases").value, 1);
});

test("deployment frequency is per week and ok at 2 production deployments a day", () => {
	const deploy = (count) => compute(Array.from({ length: count }, (_, i) => at("release.production", `issue-${i + 1}`, `2026-10-0${(i % 7) + 1}T10:00:00Z`, { percent: 100 })));
	const ok = pick(deploy(14), "deployment_frequency");
	assert.deepEqual([ok.value, ok.status], [14, "ok"]);
	assert.match(ok.target, />= 14/);
	const below = pick(deploy(13), "deployment_frequency");
	assert.deepEqual([below.value, below.status], [13, "warn"], "10 a week used to pass; multiple daily means 2 a day");
});

test("a 28-day period needs 56 deployments, not 14", () => {
	const events = [
		at("meeting.transcribed", "m-0", "2026-09-01T00:00:00Z"),
		...Array.from({ length: 28 }, (_, i) => at("release.production", `issue-${i + 1}`, `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`, { percent: 100 })),
	];
	const m = pick(compute(events, { since: "2026-09-01", until: "2026-09-28" }), "deployment_frequency");
	assert.deepEqual([m.value, m.status], [7, "warn"]);
});

test("a release counts as failed on a rollback or on a linked incident", () => {
	const release = (id) => at("release.production", id, "2026-10-01T10:00:00Z", { percent: 100 });
	const events = [
		release("issue-1"),
		release("issue-2"),
		release("issue-3"),
		release("issue-4"),
		at("release.rollback", "issue-2", "2026-10-01T11:00:00Z"),
		at("incident.opened", "incident-3", "2026-10-01T12:00:00Z", { change: "issue-3" }),
		at("incident.opened", "issue-4", "2026-09-30T12:00:00Z"),
	];
	const report = compute(events);
	assert.equal(pick(report, "change_failure_rate").value, 50, "an incident before the release does not count");
	const clean = compute([release("issue-1")]);
	assert.equal(pick(clean, "change_failure_rate").value, 0);
	assert.equal(pick(clean, "change_failure_rate").status, "ok");
});

test("time to restore pairs incidents by id and ignores unopened ones", () => {
	const events = [
		at("incident.opened", "incident-1", "2026-10-01T10:00:00Z"),
		at("incident.mitigated", "incident-1", "2026-10-01T10:20:00Z"),
		at("incident.mitigated", "incident-2", "2026-10-01T11:00:00Z"),
	];
	const m = pick(compute(events), "time_to_restore");
	assert.deepEqual([m.value, m.status, m.n], [20, "warn", 1]);
});

test("thresholds: code rates, fix loops, and the hypothesis warning", () => {
	const green = (id) => at("code.first_run", id, "2026-10-01T10:00:00Z", { green: true });
	const events = [
		...[1, 2, 3, 4].map((n) => green(`issue-${n}`)),
		at("code.first_run", "issue-5", "2026-10-01T10:00:00Z", { green: false }),
		at("code.fix_loop", "issue-1", "2026-10-01T11:00:00Z", { count: 5 }),
		at("code.fix_loop", "issue-1", "2026-10-01T12:00:00Z", { count: 2 }),
		at("code.fix_loop", "issue-2", "2026-10-01T12:00:00Z", { count: 5 }),
		...[1, 2, 3, 4, 5].map((n) => at("hypothesis.closed", `issue-${n}`, "2026-10-01T10:00:00Z", { verdict: "validated" })),
	];
	const report = compute(events);
	assert.deepEqual([pick(report, "first_pass_green").value, pick(report, "first_pass_green").status], [80, "ok"]);
	assert.deepEqual([pick(report, "fix_loop_count").value, pick(report, "fix_loop_count").status], [3.5, "warn"], "the latest count per work item");
	assert.equal(pick(report, "hypothesis_validation_rate").status, "warn");
	assert.equal(pick(compute(events.slice(0, -2)), "hypothesis_validation_rate").status, "ok", "too few hypotheses to warn");
});

test("a validation rate of 95% or more warns from 5 hypotheses, and 90% does not", () => {
	const closed = (validated, total) =>
		compute(Array.from({ length: total }, (_, i) => at("hypothesis.closed", `issue-${i + 1}`, "2026-10-01T10:00:00Z", { verdict: i < validated ? "validated" : "invalidated" })));
	const warn = pick(closed(19, 20), "hypothesis_validation_rate");
	assert.deepEqual([warn.value, warn.status], [95, "warn"]);
	assert.match(warn.target, /< 95%/);
	assert.equal(pick(closed(5, 5), "hypothesis_validation_rate").status, "warn");
	assert.equal(pick(closed(18, 20), "hypothesis_validation_rate").status, "ok", "90% leaves room for failures");
	assert.equal(pick(closed(4, 4), "hypothesis_validation_rate").status, "ok", "fewer than 5 closed hypotheses never warn");
	assert.equal(pick(closed(0, 0), "hypothesis_validation_rate").status, "unknown");
});

test("AI code generation share is ok only at 100%", () => {
	const authored = (...pairs) => compute(pairs.map(([ai, human], i) => at("pr.authorship", `issue-${i + 1}`, "2026-10-01T10:00:00Z", { ai_lines: ai, human_lines: human })));
	const all = pick(authored([120, 0], [30, 0]), "ai_code_share");
	assert.deepEqual([all.value, all.status, all.n], [100, "ok", 2]);
	const some = pick(authored([90, 10], [100, 0]), "ai_code_share");
	assert.deepEqual([some.value, some.status], [95, "warn"], "lines are summed, not averaged per pull request");
	assert.equal(pick(authored([0, 5]), "ai_code_share").value, 0);
	assert.equal(pick(compute([]), "ai_code_share").status, "unknown");
	const out = renderReport(authored([1, 1]));
	assert.match(out, /\| AI code generation share \| 50% \| 100% \(zero human syntax typing\) \| warn \| 1 \|/);
});

test("per-use-case table: counts, medians, means, rates, and the stated targets", () => {
	const run = (id, usecase, minutes, iterations, usd, human, first, t = "2026-10-01T10:00:00Z") =>
		at("usecase.run", id, t, { usecase, minutes, iterations, usd, human_intervention: human, first_pass: first });
	const report = compute([
		run("issue-1", "automated-test-creation", 20, 1, 0.5, true, true),
		run("issue-2", "automated-test-creation", 40, 3, 1.5, false, false),
		run("issue-3", "automated-test-creation", 60, 2, 1, false, true),
		run("issue-1", "controls-first-run", 5, 1, 0.1, false, false),
		run("issue-1", "time-to-restore", 14, 1, 0, false, true),
		run("issue-2", "time-to-restore", 16, 1, 0, false, true),
		run("issue-1", "custom-docs-update", 999, 9, 9, true, false),
		run("issue-9", "fix-loop", 9, 5, 1, false, false, "2026-12-01T10:00:00Z"),
	], { until: "2026-10-31" });
	const row = (name) => report.usecases.find((u) => u.usecase === name);
	assert.deepEqual(row("automated-test-creation"), {
		usecase: "automated-test-creation",
		n: 3,
		median_minutes: 40,
		mean_iterations: 2,
		mean_usd: 1,
		human_intervention_rate: 33.3,
		first_pass_rate: 66.7,
		target: "median <= 30 minutes",
		status: "warn",
	});
	assert.equal(row("controls-first-run").status, "warn", "first-pass rate 0% is below 80%");
	assert.equal(row("time-to-restore").median_minutes, 15);
	assert.equal(row("time-to-restore").status, "warn", "the target is strictly below 15 minutes");
	assert.deepEqual([row("custom-docs-update").status, row("custom-docs-update").target], ["ok", "trend"], "no target is invented for other use cases");
	assert.equal(row("fix-loop").n, 0, "a run after --until is outside the period");
	for (const name of ["fix-loop", "backlog-issue-creation"]) assert.deepEqual([row(name).status, row(name).median_minutes], ["unknown", null]);
	assert.deepEqual(report.usecases.map((u) => u.usecase), [...report.usecases.map((u) => u.usecase)].sort());
	const md = renderReport(report);
	assert.match(md, /^## Per Use Case$/m);
	assert.match(md, /\| automated-test-creation \| 3 \| 40 \| 2 \| 1 \| 33\.3% \| 66\.7% \| median <= 30 minutes \| warn \|/);
	assert.match(md, /\| backlog-issue-creation \| 0 \| - \| - \| - \| - \| - \| median <= 8 hours \| unknown \|/);
});

test("use-case targets pass when met", () => {
	const run = (usecase, minutes, iterations, first) => at("usecase.run", "issue-1", "2026-10-01T10:00:00Z", { usecase, minutes, iterations, usd: 0, human_intervention: false, first_pass: first });
	const report = compute([run("automated-test-creation", 30, 1, true), run("fix-loop", 9, 3, true), run("controls-first-run", 1, 1, true), run("backlog-issue-creation", 480, 1, true), run("time-to-restore", 14.9, 1, true)]);
	for (const u of report.usecases) assert.equal(u.status, "ok", u.usecase);
});

test("an empty log lists the named use cases as unknown", () => {
	const report = computeMetrics(parseEvents(""));
	assert.deepEqual(report.usecases.map((u) => u.usecase), Object.keys(USE_CASES).sort());
	assert.ok(report.usecases.every((u) => u.status === "unknown" && u.n === 0));
});

test("human validation turnaround starts at the first green CI run", () => {
	const events = [
		at("ci.first_run", "issue-1", "2026-10-01T08:00:00Z", { green: false }),
		at("ci.first_run", "issue-2", "2026-10-01T08:00:00Z", { green: true }),
		at("pr.validated", "issue-1", "2026-10-01T12:00:00Z", { tier: "Low" }),
		at("pr.validated", "issue-2", "2026-10-01T12:00:00Z", { tier: "Low" }),
		at("pr.validated", "issue-3", "2026-10-01T12:00:00Z", { tier: "Low", ci_green_at: "2026-10-01T13:00:00Z" }),
	];
	const m = pick(compute(events), "validation_turnaround");
	assert.deepEqual([m.value, m.n], [4, 1], "no green CI run, or green after validation, is skipped");
});

test("acceptance and rework rates exclude changes still inside the 14-day window", () => {
	const merged = (id, t) => at("pr.merged", id, t);
	const events = [
		merged("issue-1", "2026-09-01T10:00:00Z"),
		merged("issue-2", "2026-09-01T10:00:00Z"),
		at("pr.reworked", "issue-2", "2026-09-05T10:00:00Z"),
		merged("issue-3", "2026-09-01T10:00:00Z"),
		at("pr.reworked", "issue-3", "2026-09-20T10:00:00Z"),
		merged("issue-4", "2026-10-10T10:00:00Z"),
		at("meeting.ended", "meeting-1", "2026-10-12T10:00:00Z"),
	];
	const report = compute(events);
	assert.equal(pick(report, "acceptance_rate").value, 66.7, "issue-3 was reworked after 14 days: accepted");
	assert.equal(pick(report, "rework_rate").value, 33.3);
	assert.equal(pick(report, "rework_rate").n, 3);
	assert.match(pick(report, "rework_rate").note, /1 merged change\(s\)/);
	assert.equal(pick(report, "human_rework_rate").value, 0);
	assert.equal(pick(report, "human_rework_rate").status, "ok");
});

test("a feature must be deleted within the cycle; later deletions do not count", () => {
	const events = [
		at("hypothesis.closed", "issue-1", "2026-08-01T10:00:00Z", { verdict: "invalidated" }),
		at("feature.deleted", "issue-1", "2026-08-10T10:00:00Z"),
		at("hypothesis.closed", "issue-2", "2026-08-01T10:00:00Z", { verdict: "invalidated" }),
		at("feature.deleted", "issue-2", "2026-09-30T10:00:00Z"),
	];
	const report = compute(events);
	assert.deepEqual([pick(report, "feature_deletion_rate").value, pick(report, "feature_deletion_rate").status], [50, "warn"]);
	assert.equal(pick(compute(events, { cycleDays: 90 }), "feature_deletion_rate").value, 100);
});

test("the feature deletion cycle defaults to 14 days", () => {
	assert.equal(DEFAULT_CYCLE_DAYS, 14);
	const events = [
		at("hypothesis.closed", "issue-1", "2026-08-01T10:00:00Z", { verdict: "invalidated" }),
		at("feature.deleted", "issue-1", "2026-08-20T10:00:00Z"),
	];
	const byDefault = pick(compute(events), "feature_deletion_rate");
	assert.deepEqual([byDefault.value, byDefault.status], [0, "warn"]);
	assert.match(byDefault.name, /within 14 days/);
	assert.equal(pick(compute(events, { cycleDays: 28 }), "feature_deletion_rate").value, 100);
});

test("the status uses the value as displayed (one decimal)", () => {
	const runs = (green, total) => Array.from({ length: total }, (_, i) => at("code.first_run", `issue-${i + 1}`, "2026-10-01T10:00:00Z", { green: i < green }));
	// 1999 of 2500 is 79.96%, displayed as 80.0, so it meets the 80 floor
	const rounded = pick(compute(runs(1999, 2500)), "first_pass_green");
	assert.deepEqual([rounded.value, rounded.status], [80, "ok"]);
	// 1998 of 2500 is 79.92%, displayed as 79.9
	const below = pick(compute(runs(1998, 2500)), "first_pass_green");
	assert.deepEqual([below.value, below.status], [79.9, "warn"]);
});

test("assisted share warns when AI output is concentrated in Code", () => {
	const only = [at("stage.assisted", "issue-1", "2026-10-01T10:00:00Z", { stage: "code", share: 0.9 })];
	const m = pick(compute(only), "assisted_share.code");
	assert.deepEqual([m.value, m.status], [90, "warn"]);
	assert.match(renderReport(compute(only)), /AI output is concentrated in Code only/);
	assert.equal(pick(compute(validEvents()), "assisted_share.code").status, "ok");
});

test("a work item re-released later is not counted again in a later period", () => {
	const events = [
		at("meeting.transcribed", "m-1", "2026-09-01T00:00:00Z"),
		at("release.production", "m-1", "2026-09-03T00:00:00Z", { percent: 100 }),
		at("release.production", "m-1", "2026-10-05T00:00:00Z", { percent: 100 }),
		at("code.first_run", "m-1", "2026-09-02T00:00:00Z", { green: false }),
		at("code.first_run", "m-1", "2026-10-04T00:00:00Z", { green: true }),
	];
	const october = compute(events, { since: "2026-10-01", until: "2026-10-31" });
	assert.equal(pick(october, "lead_time").status, "unknown", "the first 100% release was in September");
	assert.equal(pick(october, "first_pass_green").status, "unknown", "the first run was in September");
	assert.equal(pick(october, "deployment_frequency").count, 1, "every 100% release is still a deployment");
	assert.equal(pick(compute(events, { until: "2026-09-30" }), "lead_time").value, 48);
});

test("--since and --until filter by the outcome event, not by the start event", () => {
	const events = validEvents();
	const early = compute(events, { until: "2026-09-26" });
	assert.equal(pick(early, "lead_time").value, 48, "only issue-42 was released by 2026-09-26");
	assert.equal(pick(early, "change_failure_rate").value, 0);
	const late = compute(events, { since: "2026-09-27", until: "2026-09-27" });
	assert.equal(pick(late, "lead_time").value, 72, "the meeting began before the period");
	assert.equal(pick(late, "time_to_restore").value, 10);
	assert.equal(pick(late, "first_pass_green").status, "unknown");
	assert.equal(late.inWindow, 5);
	assert.throws(() => compute(events, { since: "2026-13-01" }), matches(/--since/));
	assert.throws(() => compute(events, { until: "yesterday" }), matches(/--until/));
	assert.throws(() => compute(events, { since: "2026-10-02", until: "2026-10-01" }), matches(/after --until/));
	assert.throws(() => compute(events, { cycleDays: 0 }), matches(/--cycle-days/));
});

test("parses the log strictly, with line numbers", () => {
	assert.throws(() => parseEvents(`${JSON.stringify(validEvents()[0])}\nnot json\n`, "e.jsonl"), matches(/e\.jsonl line 2 is not valid JSON/));
	assert.throws(() => parseEvents('{"t":"2026-10-01T10:00:00Z","type":"pr.opened","id":"Bad"}\n', "e.jsonl"), matches(/line 1: "id"/));
	assert.equal(parseEvents("\n\n").length, 0);
	assert.deepEqual(median([3, 1, 2, 10]), 2.5);
	assert.equal(median([]), null);
	assert.equal(mean([]), null);
});

test("CLI prints Markdown or JSON and fails on a bad or missing log", async () => {
	const dir = await mkdtemp(join(tmpdir(), "metrics-"));
	const log = join(dir, "events.jsonl");
	await writeFile(log, toJsonl(validEvents()));
	const empty = join(dir, "empty.jsonl");
	await writeFile(empty, "");
	const broken = join(dir, "broken.jsonl");
	await writeFile(broken, "{}\n");

	const out = [];
	const [logFn, error, warn] = [console.log, console.error, console.warn];
	console.log = (line) => out.push(String(line));
	console.error = console.warn = () => {};
	try {
		assert.equal(await runMetrics(["--events", log]), 0);
		assert.match(out.at(-1), /^# Flow Metrics/);
		assert.equal(await runMetrics(["--events", log, "--json", "--since", "2026-09-01", "--until", "2026-10-31"]), 0);
		const json = JSON.parse(out.at(-1));
		assert.equal(json.period.since, "2026-09-01");
		assert.equal(json.metrics.find((m) => m.key === "lead_time").value, 60);
		assert.equal(await runMetrics(["--events", empty]), 0);
		assert.equal(await runMetrics(["--events", broken]), 1);
		assert.equal(await runMetrics(["--events", join(dir, "missing.jsonl")]), 1);
		assert.equal(await runMetrics(["--events", log, "--since", "soon"]), 1);
		assert.equal(await runMetrics(["--events", log, "--cycle-days", "x"]), 1);
		assert.equal(await runMetrics(["--events", log, "--sinse", "2026-10-01"]), 1, "a misspelled flag must not widen the period");
		assert.equal(await runMetrics(["--events", log, "--until"]), 1, "a flag without a value");
		assert.equal(await runMetrics([]), 1);
		assert.equal(await runMetrics(["--help"]), 0);
	} finally {
		Object.assign(console, { log: logFn, error, warn });
	}
});
