import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SignalError, buildSignals, hypothesisSignals, incidentSignals, marker, parseFindings, runEmitter, telemetrySignals } from "./emit-learn-issues.mjs";
import { highFinding, mediumFinding, validFindings } from "./signals-fixture.mjs";
import { INCIDENT_NAME, noControlIncident, validIncident } from "./vendor/incident-fixture.mjs";
import { validLedger } from "./vendor/ledger-fixture.mjs";
import { parseLedger } from "./vendor/ledger.mjs";
import { validateIncidentContent } from "./vendor/validate-incident.mjs";

const path = `docs/incidents/${INCIDENT_NAME}`;
const rejects = (inputs, pattern) => assert.throws(() => buildSignals(inputs), (err) => err instanceof SignalError && pattern.test(err.message));
const TRIAGE_EVIDENCE_HEADER = "| ID | Type | Reference | Quote or Count |";

test("an incident yields one issue per control hardening item plus a repair follow-up", () => {
	const signals = incidentSignals(validateIncidentContent(validIncident, path, { stage: "draft" }), path);
	assert.deepEqual(signals.map((s) => s.id), ["2026-10-13-checkout-5xx-control-1", "2026-10-13-checkout-5xx-control-2", "2026-10-13-checkout-5xx-repair"]);
	const [first] = signals;
	assert.equal(first.marker, marker("incident", "2026-10-13-checkout-5xx-control-1"));
	assert.equal(first.marker, "<!-- learn-signal: incident:2026-10-13-checkout-5xx-control-1 -->");
	assert.deepEqual(first.labels, ["needs:triage", "source:learn"]);
	assert.equal(first.title, "Harden controls: gate: require the mutation score bar on the order-total module");
	assert.equal(first.bodyFile, "signal-incident-2026-10-13-checkout-5xx-control-1.md");
	assert.ok(first.body.startsWith(`${first.marker}\n## Problem Statement`));
	for (const heading of ["## Problem Statement", "## Evidence", "## Draft Acceptance Criteria", "## Source"]) assert.ok(first.body.includes(heading));
	assert.ok(first.body.includes(TRIAGE_EVIDENCE_HEADER));
	assert.match(first.body, /\| E1 \| incident \| docs\/incidents\/2026-10-13-checkout-5xx\.md \| Incident 2026-10-13-checkout-5xx: SEV2, tier High, detected 2026-10-13T09:30:00Z, mitigated 2026-10-13T09:42:00Z by flag off, cause: .* \|/);
	assert.match(first.body, /- Given the failure mode of "Checkout returns 5xx after the order-total release"/);
	assert.match(first.body, /Control hardening item 1 of 2/);
	assert.match(first.body, /reviewed 2026-10-15 by Jo Martin \(QA and maintainer\)/);
	assert.match(signals[2].body, /commit e4f5a6b/);
	assert.match(signals[2].title, /Lift the flag off mitigation/);
});

test("no control items and a forward fix emit nothing; no controls with a rollback emits only the follow-up", () => {
	const forward = noControlIncident.replace("- **Mechanism:** flag off", "- **Mechanism:** forward fix");
	assert.deepEqual(incidentSignals(validateIncidentContent(forward, path), path), []);
	const rollback = noControlIncident.replace("- **Mechanism:** flag off", "- **Mechanism:** rollback");
	assert.deepEqual(incidentSignals(validateIncidentContent(rollback, path), path).map((s) => s.id), ["2026-10-13-checkout-5xx-repair"]);
	const draftPending = validIncident.replace("- **Triage Issue:** #57", "- **Triage Issue:** Pending");
	assert.equal(buildSignals({ incidents: [{ path, content: draftPending }] }).length, 3);
});

test("an invalidated hypothesis whose feature is not deleted becomes a deletion issue", () => {
	const signals = hypothesisSignals(parseLedger(validLedger).rows, "specs/learn/hypotheses.md");
	assert.equal(signals.length, 1);
	const [signal] = signals;
	assert.equal(signal.marker, "<!-- learn-signal: hypothesis:15 -->");
	assert.equal(signal.bodyFile, "signal-hypothesis-15.md");
	assert.match(signal.title, /^Delete the invalidated feature from #15: A bulk export button/);
	assert.match(signal.body, /\| E1 \| hypothesis-verdict \| specs\/learn\/hypotheses\.md#15 \| #15 Invalidated: Manual CSV exports per week baseline 120, target 40 \(down\); Observed 131/);
	assert.match(signal.body, /verdict decided by Sam Lee \(Product Owner\) on 2026-10-05/);
	assert.match(signal.body, /removed in one pull request/);
});

test("only high severity telemetry findings become issues", () => {
	const signals = telemetrySignals(parseFindings(validFindings), "out/findings.json");
	assert.equal(signals.length, 1);
	const [signal] = signals;
	assert.equal(signal.marker, "<!-- learn-signal: telemetry:error_rate-anomaly-2026-10-13 -->");
	assert.equal(signal.title, "Investigate high error_rate anomaly from 2026-10-13T09:25:00Z");
	assert.match(signal.body, /\| E1 \| telemetry \| out\/findings\.json#error_rate-anomaly-2026-10-13 \|/);
	assert.match(signal.body, /Deploys within 60 minutes before the onset: v2\.0\.0\./);
	assert.deepEqual(telemetrySignals(parseFindings({ findings: [mediumFinding] }), "f.json"), []);
});

test("rejects malformed findings", () => {
	const bad = (patch, pattern) => assert.throws(() => parseFindings({ findings: [{ ...highFinding, ...patch }] }), (err) => err instanceof SignalError && pattern.test(err.message));
	assert.throws(() => parseFindings(null), /"findings" array/);
	assert.throws(() => parseFindings({ findings: [1] }), /must be an object/);
	assert.throws(() => parseFindings({ findings: [highFinding, highFinding] }), /duplicated/);
	bad({ id: "Bad Id" }, /\.id must match/);
	bad({ metric: "" }, /metric must be/);
	bad({ kind: "spike" }, /kind must be one of/);
	bad({ severity: "critical" }, /severity must be one of/);
	bad({ onset: "later" }, /onset must be/);
	bad({ summary: "" }, /summary must be/);
	bad({ evidence: [] }, /evidence must be an object/);
	bad({ deploys: [{ version: 1 }] }, /deploys must be an array/);
	assert.deepEqual(parseFindings({ findings: [{ ...highFinding, deploys: undefined }] })[0].deploys, []);
});

test("only validated inputs are emitted", () => {
	const content = validIncident.replace("- **Failed Before Fix:** yes", "- **Failed Before Fix:** no");
	rejects({ incidents: [{ path, content }] }, /^incident .*Failed Before Fix/);
	rejects({ incidents: [{ path: "docs/incidents/checkout.md", content: validIncident }] }, /file name must be/);
	rejects({ ledger: { path: "hypotheses.md", content: validLedger.replace("| Remove flag |", "| Maybe |") } }, /^ledger hypotheses\.md: .*Validated verdict needs Action/);
	rejects({ findings: { path: "f.json", data: { findings: "x" } } }, /"findings" array/);
	rejects({ incidents: [{ path, content: validIncident }, { path, content: validIncident }] }, /duplicate signal/);
});

test("CLI writes issue bodies and signals.json, and writes nothing for invalid input", async () => {
	const dir = await mkdtemp(join(tmpdir(), "signals-"));
	await mkdir(join(dir, "incidents"));
	const incident = join(dir, "incidents", INCIDENT_NAME);
	const ledger = join(dir, "hypotheses.md");
	const findings = join(dir, "findings.json");
	await writeFile(incident, validIncident);
	await writeFile(ledger, validLedger);
	await writeFile(findings, JSON.stringify(validFindings));
	const out = join(dir, "out");

	const [log, error] = [console.log, console.error];
	const messages = [];
	console.log = (...parts) => messages.push(parts.join(" "));
	console.error = (...parts) => messages.push(parts.join(" "));
	try {
		assert.equal(await runEmitter(["--out", out, "--incident", incident, "--ledger", ledger, "--findings", findings]), 0);
		const index = JSON.parse(await readFile(join(out, "signals.json"), "utf-8"));
		assert.equal(index.length, 5);
		assert.deepEqual(index.map((s) => s.kind), ["incident", "incident", "incident", "hypothesis", "telemetry"]);
		assert.deepEqual(Object.keys(index[0]).sort(), ["bodyFile", "kind", "labels", "marker", "title"]);
		assert.deepEqual(index[0].labels, ["needs:triage", "source:learn"]);
		for (const s of index) assert.ok((await readFile(join(out, s.bodyFile), "utf-8")).startsWith(s.marker));
		assert.match(messages.join("\n"), /Emitted 5 Learn signal\(s\)/);

		const onlyLedger = join(dir, "only-ledger");
		assert.equal(await runEmitter(["--out", onlyLedger, "--ledger", ledger]), 0);
		assert.equal(JSON.parse(await readFile(join(onlyLedger, "signals.json"), "utf-8")).length, 1);

		const invalidOut = join(dir, "invalid-out");
		await writeFile(incident, validIncident.replace("SEV2", "SEV9"));
		assert.equal(await runEmitter(["--out", invalidOut, "--incident", incident, "--ledger", ledger]), 1);
		assert.equal(existsSync(invalidOut), false);
		assert.match(messages.at(-1), /Severity/);

		await writeFile(findings, "{not json");
		assert.equal(await runEmitter(["--out", invalidOut, "--findings", findings]), 1);
		assert.equal(await runEmitter(["--out", invalidOut, "--findings", join(dir, "missing.json")]), 1);
		assert.equal(await runEmitter(["--out", invalidOut, "--ledger", join(dir, "missing.md")]), 1);
		assert.equal(await runEmitter(["--out", invalidOut]), 1);
		assert.equal(await runEmitter(["--incident", incident]), 1);
		assert.equal(await runEmitter(["--out", invalidOut, "--surprise"]), 1);
		assert.equal(await runEmitter(["--help"]), 0);
	} finally {
		Object.assign(console, { log, error });
	}
});

test("vendored copies stay identical to the owning skills", async (t) => {
	const copies = [
		["../../incident-record/scripts/validate-incident.mjs", "./vendor/validate-incident.mjs"],
		["../../incident-record/scripts/incident-fixture.mjs", "./vendor/incident-fixture.mjs"],
		["../../hypothesis-ledger/scripts/ledger.mjs", "./vendor/ledger.mjs"],
		["../../hypothesis-ledger/scripts/ledger-fixture.mjs", "./vendor/ledger-fixture.mjs"],
	];
	const here = new URL(import.meta.url);
	let compared = 0;
	for (const [original, copy] of copies) {
		const originalUrl = new URL(original, here);
		if (!existsSync(originalUrl)) continue;
		assert.equal(await readFile(new URL(copy, here), "utf-8"), await readFile(originalUrl, "utf-8"), `${copy} drifted from ${original}: copy it again`);
		compared++;
	}
	if (!compared) t.skip("owning skills are not installed next to learn-signals");
});
