import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EXIT, evaluateRollout, parseObservation, runEvaluate, withinLimit } from "./evaluate-rollout.mjs";
import { PRODUCTION_STAGE_COUNT, TIERS, ValidationError, parseRelease } from "./validate-release.mjs";
import { passingMetrics, releaseFor, stagingMetrics, validRelease } from "./release-fixture.mjs";

const release = parseRelease(validRelease);
const observe = (overrides = {}, observedMinutes = 30, drop = []) => {
	const metrics = { ...passingMetrics.metrics, ...overrides };
	for (const key of drop) delete metrics[key];
	return { observedMinutes, metrics };
};

test("promotes when every threshold holds for the whole window", () => {
	const result = evaluateRollout(release, "canary-5", observe());
	assert.equal(result.decision, "promote");
	assert.equal(result.rollbackWith, null);
	assert.equal(result.stage, "canary-5");
	assert.equal(EXIT[result.decision], 0);
});

test("a value exactly on the limit is inside the limit", () => {
	assert.equal(evaluateRollout(release, "canary-5", observe({ error_rate: 1, role_assignment_success_rate: 95 })).decision, "promote");
	assert.equal(evaluateRollout(release, "canary-5", observe({ error_rate: 1.01 })).decision, "rollback");
});

test("any breach rolls back with the threshold's mechanism, even before the window ends", () => {
	const result = evaluateRollout(release, "canary-5", observe({ error_rate: 2.4 }, 3));
	assert.equal(result.decision, "rollback");
	assert.equal(result.rollbackWith, "Traffic shift back");
	assert.match(result.reasons[0], /error_rate 2\.4 breaches health threshold \(must be <= 1\)/);

	const business = evaluateRollout(release, "canary-5", observe({ role_assignment_success_rate: 80 }));
	assert.equal(business.rollbackWith, "Feature flag off");
	assert.match(business.reasons[0], /business threshold/);
});

test("a breach beats a missing metric and an open window", () => {
	const result = evaluateRollout(release, "canary-5", observe({ error_rate: 9 }, 1, ["latency_p95_ms"]));
	assert.equal(result.decision, "rollback");
});

test("several breaches pick the broadest mechanism", () => {
	const result = evaluateRollout(release, "canary-5", observe({ error_rate: 5, cpu_saturation_pct: 99, role_assignment_success_rate: 10 }));
	assert.equal(result.rollbackWith, "Redeploy previous artifact");
	assert.equal(result.reasons.length, 3);
	const flagAndTraffic = evaluateRollout(release, "canary-5", observe({ error_rate: 5, role_assignment_success_rate: 10 }));
	assert.equal(flagAndTraffic.rollbackWith, "Traffic shift back");
});

test("a missing or non-numeric metric holds", () => {
	const missing = evaluateRollout(release, "canary-5", observe({}, 30, ["latency_p95_ms"]));
	assert.equal(missing.decision, "hold");
	assert.match(missing.reasons[0], /latency_p95_ms/);
	assert.equal(EXIT[missing.decision], 2);
	const nan = evaluateRollout(release, "canary-5", observe({ error_rate: "0.1" }));
	assert.equal(nan.decision, "hold");
	assert.equal(evaluateRollout(release, "canary-5", observe({ error_rate: null })).decision, "hold");
});

test("an incomplete watch window holds", () => {
	const result = evaluateRollout(release, "canary-5", observe({}, 12));
	assert.equal(result.decision, "hold");
	assert.match(result.reasons[0], /observed 12 of 30 minutes/);
	assert.equal(evaluateRollout(release, "full-100", observe({}, 59)).decision, "hold");
	assert.equal(evaluateRollout(release, "full-100", observe({}, 60)).decision, "promote");
});

test("staging requires smoke and QA results instead of thresholds", () => {
	assert.equal(evaluateRollout(release, "staging", stagingMetrics).decision, "promote");
	const failing = evaluateRollout(release, "staging", { observedMinutes: 15, metrics: { smoke_failures: 2, qa_failures: 0 } });
	assert.equal(failing.decision, "rollback");
	assert.equal(failing.rollbackWith, null);
	assert.match(failing.reasons.join(" "), /smoke_failures is 2/);
	const pending = evaluateRollout(release, "staging", { observedMinutes: 15, metrics: { smoke_failures: 0 } });
	assert.equal(pending.decision, "hold");
	assert.match(pending.reasons[0], /qa_failures/);
	assert.equal(evaluateRollout(release, "staging", { ...stagingMetrics, observedMinutes: 5 }).decision, "hold");
	const negative = evaluateRollout(release, "staging", { observedMinutes: 15, metrics: { smoke_failures: -1, qa_failures: 0 } });
	assert.equal(negative.decision, "hold");
	assert.match(negative.reasons[0], /smoke_failures/);
});

test("decides every production stage of every tier's ladder from the stage table", () => {
	for (const tier of TIERS) {
		const tiered = parseRelease(releaseFor(tier));
		const production = tiered.stages.filter((s) => s.name !== "staging");
		assert.equal(production.length, PRODUCTION_STAGE_COUNT[tier]);
		for (const stage of production) {
			assert.equal(evaluateRollout(tiered, stage.name, observe({}, stage.windowMinutes)).decision, "promote", `${tier} ${stage.name}`);
			assert.equal(evaluateRollout(tiered, stage.name, observe({}, stage.windowMinutes - 1)).decision, "hold", `${tier} ${stage.name}`);
			assert.equal(evaluateRollout(tiered, stage.name, observe({ error_rate: 5 }, stage.windowMinutes)).decision, "rollback", `${tier} ${stage.name}`);
		}
		assert.equal(evaluateRollout(tiered, "staging", stagingMetrics).decision, "promote");
	}
	const critical = parseRelease(releaseFor("Critical"));
	assert.throws(() => evaluateRollout(parseRelease(releaseFor("Low")), "canary-5", observe()), /not declared in the release \(declared: staging, full-100\)/);
	assert.equal(evaluateRollout(critical, "progressive-50", observe({}, 30)).stage, "progressive-50");
});

test("is deterministic", () => {
	const input = observe({ error_rate: 2.4 });
	assert.deepEqual(evaluateRollout(release, "canary-5", input), evaluateRollout(release, "canary-5", input));
});

test("withinLimit covers every comparator and rejects unknown ones", () => {
	assert.equal(withinLimit(1, "<", 2), true);
	assert.equal(withinLimit(2, "<", 2), false);
	assert.equal(withinLimit(2, "<=", 2), true);
	assert.equal(withinLimit(3, ">", 2), true);
	assert.equal(withinLimit(2, ">", 2), false);
	assert.equal(withinLimit(2, ">=", 2), true);
	assert.throws(() => withinLimit(1, "==", 1), ValidationError);
});

test("rejects unknown stages and malformed observations", () => {
	assert.throws(() => evaluateRollout(release, "canary-50", observe()), /not declared in the release/);
	assert.throws(() => parseObservation("{not json", "canary-5"), /not valid JSON/);
	assert.throws(() => parseObservation("[]", "canary-5"), /must be a JSON object/);
	assert.throws(() => parseObservation("null", "canary-5"), /must be a JSON object/);
	assert.throws(() => parseObservation({ stage: "staging", observedMinutes: 1, metrics: {} }, "canary-5"), /is for stage "staging"/);
	assert.throws(() => parseObservation({ observedMinutes: 1, metrics: {} }, "canary-5"), /must name its stage/);
	assert.throws(() => parseObservation({ stage: "canary-5", metrics: {} }, "canary-5"), /observedMinutes/);
	assert.throws(() => parseObservation({ stage: "canary-5", observedMinutes: -1, metrics: {} }, "canary-5"), /observedMinutes/);
	assert.throws(() => parseObservation({ stage: "canary-5", observedMinutes: 1 }, "canary-5"), /"metrics" object/);
	assert.deepEqual(parseObservation({ stage: "canary-5", observedMinutes: 1, metrics: { a: 1 } }, "canary-5"), { observedMinutes: 1, metrics: { a: 1 } });
});

async function capture(fn) {
	const lines = [];
	const log = console.log;
	const error = console.error;
	console.log = (line) => lines.push(String(line));
	console.error = () => {};
	try {
		return { code: await fn(), out: lines.join("\n") };
	} finally {
		Object.assign(console, { log, error });
	}
}

test("CLI maps decisions to exit codes 0, 2, and 1", async () => {
	const root = await mkdtemp(join(tmpdir(), "rollout-"));
	const releasePath = join(root, "release.md");
	await writeFile(releasePath, validRelease);
	const metricsFile = async (name, data) => {
		const path = join(root, name);
		await writeFile(path, typeof data === "string" ? data : JSON.stringify(data));
		return path;
	};
	const run = async (stage, metrics) => capture(() => runEvaluate(["--release", releasePath, "--stage", stage, "--metrics", metrics]));

	const promote = await run("canary-5", await metricsFile("ok.json", passingMetrics));
	assert.equal(promote.code, 0);
	assert.equal(JSON.parse(promote.out).decision, "promote");

	const hold = await run("canary-5", await metricsFile("hold.json", { ...passingMetrics, observedMinutes: 10 }));
	assert.equal(hold.code, 2);
	assert.equal(JSON.parse(hold.out).decision, "hold");

	const rollback = await run("canary-5", await metricsFile("bad.json", { ...passingMetrics, metrics: { ...passingMetrics.metrics, latency_p95_ms: 900 } }));
	assert.equal(rollback.code, 1);
	assert.deepEqual(JSON.parse(rollback.out).rollbackWith, "Traffic shift back");

	assert.equal((await run("canary-5", await metricsFile("broken.json", "{oops"))).code, 1);
	assert.equal((await run("nope", await metricsFile("ok2.json", passingMetrics))).code, 1);
	assert.equal((await run("canary-5", join(root, "missing.json"))).code, 1);
	assert.equal((await capture(() => runEvaluate(["--release", join(root, "missing.md"), "--stage", "canary-5", "--metrics", join(root, "ok.json")]))).code, 1);

	await writeFile(join(root, "bad-release.md"), "# Release: broken");
	assert.equal((await capture(() => runEvaluate(["--release", join(root, "bad-release.md"), "--stage", "canary-5", "--metrics", join(root, "ok.json")]))).code, 1);
});

test("CLI lists production stages, prints usage, and rejects missing arguments", async () => {
	const root = await mkdtemp(join(tmpdir(), "rollout-"));
	const releasePath = join(root, "release.md");
	await writeFile(releasePath, validRelease);
	const listed = await capture(() => runEvaluate(["--release", releasePath, "--list-stages"]));
	assert.equal(listed.code, 0);
	assert.equal(listed.out, "canary-5\nfull-100");
	const expectedStages = {
		Low: "full-100",
		Medium: "canary-5\nfull-100",
		High: "canary-5\nprogressive-25\nfull-100",
		Critical: "canary-5\nprogressive-25\nprogressive-50\nfull-100",
	};
	for (const tier of TIERS) {
		await writeFile(releasePath, releaseFor(tier));
		const tierList = await capture(() => runEvaluate(["--release", releasePath, "--list-stages"]));
		assert.equal(tierList.code, 0);
		assert.equal(tierList.out, expectedStages[tier]);
	}
	await writeFile(releasePath, validRelease);
	assert.equal((await capture(() => runEvaluate(["--help"]))).code, 0);
	assert.equal((await capture(() => runEvaluate([]))).code, 1);
	assert.equal((await capture(() => runEvaluate(["--release", releasePath, "--stage", "canary-5"]))).code, 1);
	assert.equal((await capture(() => runEvaluate(["--release", releasePath, "--stage", "canary-5", "--metrics"]))).code, 1);
	assert.equal((await capture(() => runEvaluate(["--release", releasePath, "--list-stages", "--oops"]))).code, 1);
});
