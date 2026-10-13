import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deploys, falling, givenBaseline, highAnomaly, isoAt, makeSeries, mediumAnomaly, rising, stable, wideBaseline } from "./telemetry-fixture.mjs";
import {
	InputError,
	fitLine,
	parseBaselines,
	parseDeploys,
	parseSeries,
	parseThresholds,
	renderReport,
	resolveBaseline,
	runScan,
	scan,
	scanMetric,
	zScores,
} from "./telemetry-scan.mjs";

const seriesOf = (values, name = "error_rate") => parseSeries({ [name]: makeSeries(values) });
const run = (values, options) => scan(seriesOf(values), options);
const invalid = (fn, pattern) => assert.throws(fn, (err) => err instanceof InputError && pattern.test(err.message));

test("a stable series has no findings", () => {
	const result = run(stable, { thresholds: { error_rate: { max: 1 } } });
	assert.deepEqual(result.findings, []);
	assert.equal(result.metrics[0].baseline.mean, 0.3);
	assert.equal(result.metrics[0].baseline.std, 0.02);
	assert.match(renderReport(result, false), /_None\._/);
});

test("flags an anomaly when the last three points all have |z| >= 3", () => {
	const [finding] = run(highAnomaly).findings;
	assert.equal(finding.kind, "anomaly");
	assert.equal(finding.severity, "high");
	assert.deepEqual(finding.evidence.lastZ, [5, 6, 7]);
	assert.equal(finding.evidence.runLength, 3);
	assert.equal(finding.onset, isoAt(17));
	assert.equal(finding.id, "error_rate-anomaly-2026-10-13");
	assert.equal(run(mediumAnomaly).findings[0].severity, "medium");

	const twoOfThree = [...stable.slice(0, 17), 0.4, 0.3, 0.44];
	assert.deepEqual(run(twoOfThree).findings, []);
	const dropped = [...stable.slice(0, 17), 0.2, 0.18, 0.15];
	const [low] = run(dropped).findings;
	assert.equal(low.kind, "anomaly");
	assert.match(low.summary, /below its baseline/);
});

test("anomaly run start extends over earlier consecutive anomalous points", () => {
	const longer = [...stable.slice(0, 15), 0.4, 0.41, 0.42, 0.43, 0.44];
	assert.equal(run(longer).findings[0].onset, isoAt(15));
	assert.equal(run(longer).findings[0].evidence.runLength, 5);
});

test("flags a breach and records when it began", () => {
	const values = [...stable.slice(0, 17), 0.9, 1.1, 1.2];
	const result = run(values, { thresholds: { error_rate: { max: 1 } }, baselines: wideBaseline });
	const [breach] = result.findings;
	assert.equal(breach.kind, "breach");
	assert.equal(breach.severity, "high");
	assert.equal(breach.evidence.bound, "max");
	assert.equal(breach.evidence.runLength, 2);
	assert.equal(breach.onset, isoAt(18));
	const below = run([...rising.map((v) => v + 0.2), 0.05], { thresholds: { error_rate: { min: 0.1 } }, baselines: wideBaseline });
	assert.equal(below.findings[0].evidence.bound, "min");
	const exactly = run(stable, { thresholds: { error_rate: { max: 0.3, min: 0.3 - 0.05 } }, baselines: givenBaseline });
	assert.equal(exactly.findings.some((f) => f.kind === "breach"), false);
});

test("flags a trend toward a threshold with an ETA inside the horizon", () => {
	const medium = run(rising, { baselines: wideBaseline, thresholds: { error_rate: { max: 0.8 } } });
	assert.equal(medium.findings.length, 1);
	const [trend] = medium.findings;
	assert.equal(trend.kind, "trend");
	assert.equal(trend.severity, "medium");
	assert.equal(trend.evidence.slopePerHour, 0.24);
	assert.equal(trend.evidence.r2, 1);
	assert.equal(trend.evidence.etaMinutes, 70);
	assert.equal(trend.evidence.window, 10);
	assert.equal(trend.onset, isoAt(2));

	const high = run(rising, { baselines: wideBaseline, thresholds: { error_rate: { max: 0.7 } } });
	assert.equal(high.findings[0].severity, "high");
	assert.equal(high.findings[0].evidence.etaMinutes, 45);

	assert.deepEqual(run(rising, { baselines: wideBaseline, thresholds: { error_rate: { max: 0.8 } }, horizonMinutes: 60 }).findings, []);
	assert.equal(run(rising, { baselines: wideBaseline, thresholds: { error_rate: { max: 0.8 } }, horizonMinutes: 70 }).findings.length, 1);
	assert.deepEqual(run(rising, { baselines: wideBaseline, thresholds: { error_rate: { min: 0.1 } } }).findings, []);

	const down = run(falling, { baselines: { error_rate: { mean: 0.8, std: 0.5 } }, thresholds: { error_rate: { min: 0.5 } } });
	assert.equal(down.findings[0].kind, "trend");
	assert.equal(down.findings[0].evidence.bound, "min");
	assert.equal(down.findings[0].evidence.etaMinutes, 45);
});

test("ignores noisy slopes with a poor fit and metrics without thresholds", () => {
	const noisy = [0.3, 0.6, 0.2, 0.7, 0.3, 0.65, 0.25, 0.6, 0.3, 0.55, 0.3, 0.6];
	assert.deepEqual(run(noisy, { baselines: wideBaseline, thresholds: { error_rate: { max: 0.9 } } }).findings, []);
	assert.deepEqual(run(rising, { baselines: wideBaseline }).findings, []);
});

test("correlates deploys within 60 minutes before the first anomalous point", () => {
	const result = run(highAnomaly, { deploys: parseDeploys(deploys) });
	assert.deepEqual(result.findings[0].deploys.map((d) => d.version), ["v2.0.0", "v2.0.1"]);
	assert.equal(run(highAnomaly).findings[0].deploys.length, 0);
	const text = renderReport(result, true);
	assert.match(text, /deploy within 60 min before 2026-10-13T09:25:00Z: v2\.0\.0 at 2026-10-13T09:10:00Z: new order-total calculation/);
	assert.match(renderReport(run(highAnomaly, { deploys: [] }), true), /no deploy within 60 min/);
});

test("orders findings by severity, metric, and kind deterministically", () => {
	const series = parseSeries({ b_rate: makeSeries(highAnomaly), a_rate: makeSeries(mediumAnomaly) });
	const result = scan(series, { thresholds: { b_rate: { max: 0.35 } } });
	assert.deepEqual(result.findings.map((f) => `${f.metric}:${f.kind}:${f.severity}`), ["b_rate:breach:high", "b_rate:anomaly:high", "a_rate:anomaly:medium"]);
	assert.deepEqual(scan(series, { thresholds: { b_rate: { max: 0.35 } } }), result);
});

test("severity uses the unrounded z-score and metric names that shadow Object.prototype are scanned", () => {
	const given = { baselines: { m: { mean: 10, std: 1 } } };
	const near = [10, 10, 10, 10, 10, 10, 10, 14.996, 14.996, 14.996];
	assert.equal(scan(seriesOf(near, "m"), given).findings[0].severity, "medium");
	assert.equal(scan(seriesOf([10, 10, 10, 10, 10, 10, 10, 15, 15, 15], "m"), given).findings[0].severity, "high");
	const flatJump = [1, 1, 1, 1, 1, 1, 1, 9, 9, 9];
	assert.equal(scan(seriesOf(flatJump, "constructor")).findings[0].severity, "high");
	assert.equal(scan(seriesOf(flatJump, "toString"), { baselines: {}, thresholds: {} }).findings.length, 1);
});

test("maths helpers: baseline, z-scores, and line fit", () => {
	const points = seriesOf(highAnomaly).get("error_rate");
	const baseline = resolveBaseline("error_rate", points);
	assert.equal(baseline.mean.toFixed(2), "0.30");
	assert.deepEqual(zScores(points.slice(-1), { mean: 0.3, std: 0.02 }).map((z) => Math.round(z)), [7]);
	assert.ok(Number.isFinite(zScores(points.slice(-1), { mean: 0.3, std: 0 })[0]));
	const { slope, r2 } = fitLine(seriesOf(rising).get("error_rate"));
	assert.equal(Math.round(slope * 1e6) / 1e6, 0.004);
	assert.equal(Math.round(r2 * 1e6) / 1e6, 1);
	assert.deepEqual(fitLine(makeSeries([1, 1, 1, 1, 1]).map((p) => ({ ...p, ms: Date.parse(p.t) }))), { slope: 0, r2: 0 });
	assert.deepEqual(scanMetric("m", seriesOf([1, 1, 1, 1, 1], "m").get("m"), { mean: 1, std: 0 }), []);
});

test("rejects invalid series, baselines, thresholds, and deploys", () => {
	invalid(() => parseSeries([]), /object mapping/);
	invalid(() => parseSeries({}), /object mapping/);
	invalid(() => parseSeries({ e: "x" }), /array of \{ t, v \}/);
	invalid(() => parseSeries({ e: [1, 2, 3, 4, 5] }), /must be an object/);
	invalid(() => parseSeries({ e: makeSeries([1, 2, 3, 4]) }), /at least 5 points/);
	invalid(() => parseSeries({ e: makeSeries([1, 2, 3, 4, "x"]) }), /"v" must be a finite number/);
	invalid(() => parseSeries({ e: [...makeSeries([1, 2, 3, 4]), { t: "2026-10-13 08:20", v: 1 }] }), /ISO 8601 UTC/);
	invalid(() => parseSeries({ e: [...makeSeries([1, 2, 3, 4]), { t: "2026-02-30T08:20:00Z", v: 1 }] }), /not a real date/);
	invalid(() => parseSeries({ e: [...makeSeries([1, 2, 3, 4, 5]).reverse()] }), /strictly ascending/);
	invalid(() => scan(seriesOf(stable.slice(0, 8))), /at least 10 points to compute a baseline/);
	assert.doesNotThrow(() => scan(seriesOf(stable.slice(0, 8)), { baselines: givenBaseline }));

	const series = seriesOf(stable);
	invalid(() => parseBaselines([], series), /must be an object keyed/);
	invalid(() => parseBaselines({ other: { mean: 1, std: 1 } }, series), /does not match any metric/);
	invalid(() => parseBaselines({ error_rate: "x" }, series), /must be an object/);
	invalid(() => parseBaselines({ error_rate: { mean: "a", std: 1 } }, series), /mean must be/);
	invalid(() => parseBaselines({ error_rate: { mean: 1, std: -1 } }, series), /std must be/);
	invalid(() => parseThresholds({ error_rate: {} }, series), /needs "min" or "max"/);
	invalid(() => parseThresholds({ error_rate: { max: "1" } }, series), /max must be a finite number/);
	invalid(() => parseThresholds({ error_rate: { min: 2, max: 1 } }, series), /min must be below max/);
	invalid(() => parseDeploys({}), /array of/);
	invalid(() => parseDeploys([1]), /must be an object/);
	invalid(() => parseDeploys([{ t: "2026-10-13T09:10:00Z", version: "", diff: "x" }]), /"version" must be a non-empty string/);
	invalid(() => parseDeploys([{ t: "yesterday", version: "v1", diff: "x" }]), /ISO 8601 UTC/);
	assert.deepEqual(parseBaselines(undefined, series), {});
	assert.deepEqual(parseDeploys(undefined), []);
});

async function capture(fn) {
	const writes = [];
	const out = process.stdout.write.bind(process.stdout);
	const [log, error] = [console.log, console.error];
	process.stdout.write = (chunk) => (writes.push(String(chunk)), true);
	console.log = (...parts) => writes.push(`${parts.join(" ")}\n`);
	console.error = (...parts) => writes.push(`ERR ${parts.join(" ")}\n`);
	try {
		return { code: await fn(), text: writes.join("") };
	} finally {
		process.stdout.write = out;
		Object.assign(console, { log, error });
	}
}

test("CLI exits 0 when quiet, 3 on a high finding, and 1 on invalid input", async () => {
	const dir = await mkdtemp(join(tmpdir(), "telemetry-"));
	const write = async (name, data) => {
		const path = join(dir, name);
		await writeFile(path, typeof data === "string" ? data : JSON.stringify(data));
		return path;
	};
	const quiet = await write("quiet.json", { error_rate: makeSeries(stable) });
	const bad = await write("bad.json", { error_rate: makeSeries(highAnomaly) });
	const thresholds = await write("thresholds.json", { error_rate: { max: 1.0 } });
	const baseline = await write("baseline.json", givenBaseline);
	const deployFile = await write("deploys.json", deploys);

	let result = await capture(() => runScan(["--series", quiet, "--thresholds", thresholds]));
	assert.equal(result.code, 0);
	assert.match(result.text, /error_rate: 20 points/);

	result = await capture(() => runScan(["--series", bad, "--deploys", deployFile, "--baseline", baseline]));
	assert.equal(result.code, 3);
	assert.match(result.text, /\[high\] error_rate anomaly/);
	assert.match(result.text, /v2\.0\.0/);
	assert.match(result.text, /exit code 3/);

	result = await capture(() => runScan(["--series", bad, "--json"]));
	assert.equal(result.code, 3);
	const json = JSON.parse(result.text);
	assert.equal(json.findings[0].id, "error_rate-anomaly-2026-10-13");
	assert.equal(json.horizonMinutes, 120);
	assert.ok(Array.isArray(json.metrics));

	const mediumFile = await write("medium.json", { error_rate: makeSeries(mediumAnomaly) });
	assert.equal((await capture(() => runScan(["--series", mediumFile]))).code, 0);

	const trendFile = await write("trend.json", { error_rate: makeSeries(rising) });
	const wide = await write("wide.json", wideBaseline);
	const maxFile = await write("max.json", { error_rate: { max: 0.8 } });
	assert.equal((await capture(() => runScan(["--series", trendFile, "--baseline", wide, "--thresholds", maxFile, "--horizon-minutes", "30"]))).code, 0);
	result = await capture(() => runScan(["--series", trendFile, "--baseline", wide, "--thresholds", maxFile, "--horizon-minutes", "90"]));
	assert.equal(result.code, 0);
	assert.match(result.text, /\[medium\] error_rate trend/);

	const broken = await write("broken.json", "{not json");
	const unknownMetric = await write("t2.json", { nope: { max: 1 } });
	assert.equal((await capture(() => runScan(["--series", join(dir, "missing.json")]))).code, 1);
	assert.equal((await capture(() => runScan(["--series", broken]))).code, 1);
	assert.equal((await capture(() => runScan(["--series", quiet, "--horizon-minutes", "0"]))).code, 1);
	assert.equal((await capture(() => runScan(["--series", quiet, "--thresholds", unknownMetric]))).code, 1);
	assert.equal((await capture(() => runScan(["--series", quiet, "--surprise"]))).code, 1);
	assert.equal((await capture(() => runScan([]))).code, 1);
	assert.equal((await capture(() => runScan(["--help"]))).code, 0);
});
