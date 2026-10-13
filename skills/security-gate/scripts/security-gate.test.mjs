import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	GateError,
	evaluate,
	licenseAcceptable,
	parseArgs,
	parseConftest,
	parseLicenseExpression,
	parseSarif,
	parseSbom,
	runSecurityGate,
	validateWaivers,
} from "./security-gate.mjs";
import { ALLOW, cleanSarif, cleanSbom, conftestFail, conftestPass, sarif, sarifResult, sbom, waiver } from "./security-gate-fixture.mjs";

async function workspace(files) {
	const dir = await mkdtemp(join(tmpdir(), "security-gate-"));
	const paths = {};
	for (const [name, content] of Object.entries(files)) {
		paths[name] = join(dir, name);
		await writeFile(paths[name], typeof content === "string" ? content : JSON.stringify(content));
	}
	return paths;
}

async function run(args) {
	const log = console.log;
	const err = console.error;
	const out = [];
	console.log = (...a) => out.push(a.join(" "));
	console.error = (...a) => out.push(a.join(" "));
	try {
		const code = await runSecurityGate(args);
		return { code, out: out.join("\n") };
	} finally {
		console.log = log;
		console.error = err;
	}
}

test("SARIF: error level fails, warning and note pass at the default bar", () => {
	const findings = parseSarif(sarif([
		sarifResult({ ruleId: "a", level: "error" }),
		sarifResult({ ruleId: "b", level: "warning" }),
		sarifResult({ ruleId: "c", level: "note" }),
	]));
	const result = evaluate(findings);
	assert.deepEqual(result.failing.map((f) => f.id), ["a"]);
	assert.equal(result.belowBar.length, 2);
});

test("SARIF: --min-severity warning also fails warnings, never notes", () => {
	const findings = parseSarif(sarif([sarifResult({ ruleId: "b", level: "warning" }), sarifResult({ ruleId: "c", level: "note" })]));
	assert.deepEqual(evaluate(findings, { minSeverity: "warning" }).failing.map((f) => f.id), ["b"]);
});

test("SARIF: security-severity >= 7.0 is an error, from the result or the rule", () => {
	const findings = parseSarif(sarif(
		[
			sarifResult({ ruleId: "cve-1", level: "warning", properties: { "security-severity": "9.8" } }),
			sarifResult({ ruleId: "cve-2", level: "warning" }),
			sarifResult({ ruleId: "cve-3", level: "warning", properties: { "security-severity": 6.9 } }),
		],
		[{ id: "cve-2", properties: { "security-severity": "7.0" } }],
	));
	assert.deepEqual(evaluate(findings).failing.map((f) => f.id), ["cve-1", "cve-2"]);
});

test("SARIF: a missing level falls back to the rule default, then to warning", () => {
	const findings = parseSarif(sarif(
		[sarifResult({ ruleId: "r1" }), sarifResult({ ruleId: "r2" })],
		[{ id: "r1", defaultConfiguration: { level: "error" } }],
	));
	assert.equal(findings[0].level, "error");
	assert.equal(findings[1].level, "warning");
});

test("SARIF: location and message are reported; invalid documents are rejected", () => {
	const [finding] = parseSarif(sarif([sarifResult({ level: "error", path: "src/a.js", line: 7 })]));
	assert.equal(finding.path, "src/a.js");
	assert.equal(finding.line, 7);
	assert.throws(() => parseSarif({ version: "2.1.0" }, "x.sarif"), GateError);
	assert.throws(() => parseSarif(null), GateError);
});

test("Conftest: any failure fails, warnings count only at the warning bar", () => {
	const findings = parseConftest(conftestFail);
	assert.deepEqual(evaluate(findings).failing.map((f) => f.id), ["containers must not run as root"]);
	assert.equal(evaluate(findings, { minSeverity: "warning" }).failing.length, 2);
	assert.equal(evaluate(parseConftest(conftestPass)).failing.length, 0);
});

test("Conftest: malformed output is rejected", () => {
	assert.throws(() => parseConftest({}), GateError);
	assert.throws(() => parseConftest([null]), GateError);
	assert.throws(() => parseConftest([{ failures: [{}] }]), GateError);
});

test("SPDX expressions: OR needs one acceptable side, AND needs all", () => {
	const lists = { allow: new Set(["mit", "apache-2.0"]), deny: new Set(["gpl-3.0-only"]) };
	assert.equal(licenseAcceptable("MIT OR GPL-3.0-only", lists), true);
	assert.equal(licenseAcceptable("MIT AND GPL-3.0-only", lists), false);
	assert.equal(licenseAcceptable("(MIT OR ISC) AND Apache-2.0", lists), true);
	assert.equal(licenseAcceptable("(ISC OR BSD-2-Clause) AND Apache-2.0", lists), false);
	assert.equal(licenseAcceptable("GPL-3.0-only WITH Classpath-exception-2.0", lists), false);
	assert.deepEqual(parseLicenseExpression("MIT").id, "MIT");
	assert.throws(() => parseLicenseExpression("MIT OR"), GateError);
	assert.throws(() => parseLicenseExpression("(MIT"), GateError);
});

test("SBOM: allowed licenses pass; id, name and expression forms are understood", () => {
	assert.deepEqual(parseSbom(cleanSbom, { allow: ALLOW.split(",") }), []);
});

test("SBOM: disallowed, denied and unknown licenses are errors", () => {
	const doc = sbom([
		{ name: "gpl-lib", version: "1.0.0", licenses: [{ license: { id: "GPL-3.0-only" } }] },
		{ name: "odd-lib", version: "2.0.0", licenses: [{ license: { name: "Custom EULA" } }] },
		{ name: "silent-lib", version: "3.0.0" },
		{ name: "parent", version: "1.0.0", licenses: [{ license: { id: "MIT" } }], components: [{ name: "nested-gpl", version: "1.0.0", licenses: [{ license: { id: "AGPL-3.0-only" } }] }] },
	]);
	const findings = parseSbom(doc, { allow: ["MIT"], deny: ["GPL-3.0-only"] });
	assert.deepEqual(findings.map((f) => f.path), ["gpl-lib@1.0.0", "odd-lib@2.0.0", "silent-lib@3.0.0", "nested-gpl@1.0.0"]);
	assert.match(findings[0].message, /denied/);
	assert.match(findings[1].message, /not in the allow list/);
	assert.equal(findings[2].id, "unknown-license");
});

test("SBOM: a deny list alone is enough, and a missing components array is rejected", () => {
	assert.equal(parseSbom(sbom([{ name: "x", licenses: [{ license: { id: "AGPL-3.0-only" } }] }]), { deny: ["AGPL-3.0-only"] }).length, 1);
	assert.equal(parseSbom(sbom([{ name: "x", licenses: [{ license: { id: "MIT" } }] }]), { deny: ["AGPL-3.0-only"] }).length, 0);
	assert.throws(() => parseSbom({}, { allow: ["MIT"] }), GateError);
});

test("waivers: complete waivers are valid, expiry day itself still counts", () => {
	const { waivers, errors } = validateWaivers([waiver(), waiver({ expires: "2026-10-13" })], "2026-10-13");
	assert.equal(errors.length, 0);
	assert.equal(waivers.length, 2);
});

test("waivers: missing reason, approver or expiry makes the waiver invalid", () => {
	for (const key of ["id", "reason", "approvedBy", "expires"]) {
		const { waivers, errors } = validateWaivers([waiver({ [key]: undefined })], "2026-10-13");
		assert.equal(waivers.length, 0, key);
		assert.match(errors[0], new RegExp(`missing ${key}`));
	}
	assert.match(validateWaivers([waiver({ reason: "  " })], "2026-10-13").errors[0], /missing reason/);
});

test("waivers: bad dates, agent approvers, expired waivers and bad shapes are errors", () => {
	assert.match(validateWaivers([waiver({ expires: "31/12/2026" })], "2026-10-13").errors[0], /valid YYYY-MM-DD/);
	assert.match(validateWaivers([waiver({ expires: "2026-02-30" })], "2026-10-13").errors[0], /valid YYYY-MM-DD/);
	assert.match(validateWaivers([waiver({ approvedBy: "Copilot (Developer)" })], "2026-10-13").errors[0], /not a named person/);
	assert.match(validateWaivers([waiver({ approvedBy: "dependabot[bot] (DevOps)" })], "2026-10-13").errors[0], /not a named person/);
	assert.match(validateWaivers([waiver({ expires: "2026-10-12" })], "2026-10-13").errors[0], /expired/);
	assert.match(validateWaivers([waiver({ path: 5 })], "2026-10-13").errors[0], /path must be a string/);
	assert.match(validateWaivers([null], "2026-10-13").errors[0], /not an object/);
	assert.match(validateWaivers({}, "2026-10-13").errors[0], /JSON array/);
});

test("waivers: approvedBy must be '<name> (<role>)' with a factory role and a named person", () => {
	const problem = (approvedBy) => validateWaivers([waiver({ approvedBy })], "2026-10-13").errors[0];
	for (const role of ["Product Owner", "Developer", "Architect", "DevOps", "QA and maintainer"]) {
		assert.equal(validateWaivers([waiver({ approvedBy: `Dana Reed (${role})` })], "2026-10-13").errors.length, 0, role);
	}
	assert.match(problem("Dana Reed"), /must be formatted "<name> \(<role>\)"/);
	assert.match(problem("Dana Architect"), /must be formatted/);
	assert.match(problem("Dana Reed (Wizard)"), /role "Wizard" must be one of/);
	for (const name of ["Copilot", "Claude", "GPT-4", "gemini", "ChatGPT", "OpenAI", "Anthropic", "Release Bot", "my agent", "dependabot", "renovate", "github-actions", "GitHub Actions", "AI", "llm", "dependabot[bot]"]) {
		assert.match(problem(`${name} (Architect)`), /not a named person \(it looks like an AI\)/, name);
	}
	for (const name of ["x", "X", "tbd", "TBD", "<name>", "N/A", "...", "Architect", "the team"]) {
		assert.match(problem(`${name} (Architect)`), /not a named person/, name);
	}
});

test("SBOM: an SPDX + suffix matches deny entries for -or-later and the base id", () => {
	const gpl = (id) => sbom([{ name: "x", version: "1.0.0", licenses: [{ license: { id } }] }]);
	for (const deny of ["GPL-3.0-or-later", "GPL-3.0", "GPL-3.0+", "gpl-3.0-or-later"]) {
		const findings = parseSbom(gpl("GPL-3.0+"), { deny: [deny] });
		assert.equal(findings.length, 1, deny);
		assert.match(findings[0].message, /denied/);
	}
	assert.equal(parseSbom(gpl("GPL-3.0-or-later"), { deny: ["GPL-3.0+"] }).length, 1);
	assert.equal(parseSbom(gpl("GPL-3.0+"), { deny: ["AGPL-3.0-or-later"] }).length, 0);
	assert.equal(parseSbom(gpl("LGPL-3.0+"), { deny: ["GPL-3.0"] }).length, 0);
	const lists = { allow: new Set(), deny: new Set(["gpl-3.0-or-later"]) };
	assert.equal(licenseAcceptable("MIT OR GPL-3.0+", lists), true);
	assert.equal(licenseAcceptable("MIT AND GPL-3.0+", lists), false);
	// an allow-list entry written as -or-later also admits the + spelling
	assert.equal(parseSbom(gpl("GPL-3.0+"), { allow: ["GPL-3.0-or-later"] }).length, 0);
});

test("a valid waiver suppresses the matching finding only; others still fail", () => {
	const findings = parseSarif(sarif([
		sarifResult({ ruleId: "js.sql-injection", level: "error", path: "src/db.js" }),
		sarifResult({ ruleId: "js.sql-injection", level: "error", path: "src/other.js" }),
		sarifResult({ ruleId: "js.xss", level: "error", path: "src/db.js" }),
	]));
	const result = evaluate(findings, { waivers: [waiver()] });
	assert.equal(result.waived.length, 1);
	assert.deepEqual(result.failing.map((f) => `${f.id} ${f.path}`), ["js.sql-injection src/other.js", "js.xss src/db.js"]);
});

test("waivers match by license, component name, policy message and path glob", () => {
	const licenseFindings = parseSbom(sbom([{ name: "gpl-lib", version: "1.0.0", licenses: [{ license: { id: "GPL-3.0-only" } }] }]), { allow: ["MIT"] });
	assert.equal(evaluate(licenseFindings, { waivers: [waiver({ id: "GPL-3.0-only", path: undefined })] }).waived.length, 1);
	assert.equal(evaluate(licenseFindings, { waivers: [waiver({ id: "gpl-lib", path: "gpl-*" })] }).waived.length, 1);
	const policy = parseConftest(conftestFail);
	assert.equal(evaluate(policy, { waivers: [waiver({ id: "containers must not run as root", path: "deploy/**" })] }).failing.length, 0);
});

test("a waiver below the severity bar is reported as unused", () => {
	const result = evaluate(parseSarif(sarif([sarifResult({ level: "note" })])), { waivers: [waiver()] });
	assert.equal(result.unusedWaivers.length, 1);
});

test("parseArgs validates options", () => {
	assert.throws(() => parseArgs([]), /nothing to check/);
	assert.throws(() => parseArgs(["--sarif"]), /needs a value/);
	assert.throws(() => parseArgs(["--sarif", "a", "--bogus"]), /unknown argument/);
	assert.throws(() => parseArgs(["--sarif", "a", "--min-severity", "note"]), /error or warning/);
	assert.throws(() => parseArgs(["--sarif", "a", "--today", "yesterday"]), /--today/);
	assert.throws(() => parseArgs(["--sbom", "a"]), /--allow-licenses or --deny-licenses/);
	const opts = parseArgs(["--sbom", "a", "--allow-licenses", "MIT, ISC", "--deny-licenses", "GPL-3.0-only"]);
	assert.deepEqual(opts.allow, ["MIT", "ISC"]);
	assert.deepEqual(opts.deny, ["GPL-3.0-only"]);
});

test("CLI: clean inputs pass with exit 0", async () => {
	const f = await workspace({ "a.sarif": cleanSarif, "c.json": conftestPass, "s.json": cleanSbom });
	const { code, out } = await run(["--sarif", f["a.sarif"], "--conftest", f["c.json"], "--sbom", f["s.json"], "--allow-licenses", ALLOW]);
	assert.equal(code, 0);
	assert.match(out, /^PASS: 0 failing/m);
});

test("CLI: findings fail with one line each", async () => {
	const f = await workspace({ "a.sarif": sarif([sarifResult({ level: "error", path: "src/db.js", line: 12 })]), "c.json": conftestFail });
	const { code, out } = await run(["--sarif", f["a.sarif"], "--conftest", f["c.json"]]);
	assert.equal(code, 1);
	assert.match(out, /FAIL sarif js\.sql-injection src\/db\.js:12 - Possible SQL injection/);
	assert.match(out, /FAIL conftest containers must not run as root deploy\/k8s\.yaml/);
});

test("CLI: a valid waiver passes and is listed; an expired one fails", async () => {
	const f = await workspace({
		"a.sarif": sarif([sarifResult({ level: "error" })]),
		"w.json": [waiver()],
		"expired.json": [waiver({ expires: "2026-01-01" })],
	});
	const ok = await run(["--sarif", f["a.sarif"], "--waivers", f["w.json"], "--today", "2026-10-13"]);
	assert.equal(ok.code, 0);
	assert.match(ok.out, /WAIVED sarif js\.sql-injection .* approved by Dana Reed \(Architect\), expires 2026-12-31/);
	const bad = await run(["--sarif", f["a.sarif"], "--waivers", f["expired.json"], "--today", "2026-10-13"]);
	assert.equal(bad.code, 1);
	assert.match(bad.out, /WAIVER-ERROR expired waiver #1/);
	assert.match(bad.out, /FAIL sarif js\.sql-injection/);
});

test("CLI: an invalid waiver fails even when nothing else does", async () => {
	const f = await workspace({ "a.sarif": cleanSarif, "w.json": [waiver({ approvedBy: "" })] });
	const { code, out } = await run(["--sarif", f["a.sarif"], "--waivers", f["w.json"]]);
	assert.equal(code, 1);
	assert.match(out, /missing approvedBy/);
});

test("CLI: --json emits a machine-readable verdict", async () => {
	const f = await workspace({ "a.sarif": sarif([sarifResult({ level: "error" })]) });
	const { code, out } = await run(["--sarif", f["a.sarif"], "--json"]);
	assert.equal(code, 1);
	const parsed = JSON.parse(out);
	assert.equal(parsed.ok, false);
	assert.equal(parsed.failing.length, 1);
});

test("SARIF: an unknown or upper-case level cannot silently pass, an empty or failed run is rejected", () => {
	const [upper, unknown] = parseSarif(sarif([sarifResult({ ruleId: "u", level: "ERROR" }), sarifResult({ ruleId: "v", level: "critical" })]));
	assert.equal(upper.level, "error");
	assert.equal(unknown.severity, "error");
	assert.throws(() => parseSarif({ version: "2.1.0", runs: [] }, "empty.sarif"), /no runs/);
	const crashed = sarif();
	crashed.runs[0].invocations = [{ executionSuccessful: false }];
	assert.throws(() => parseSarif(crashed, "crashed.sarif"), /did not complete/);
});

test("waivers: a ? in a path glob is literal and never breaks the matcher", () => {
	const findings = [{ id: "r", path: "src/a?b.js", severity: "error" }, { id: "r", path: "src/ab.js", severity: "error" }];
	const result = evaluate(findings, { waivers: [{ id: "r", path: "src/a?b.js" }] });
	assert.deepEqual(result.waived.map((f) => f.path), ["src/a?b.js"]);
	assert.doesNotThrow(() => evaluate(findings, { waivers: [{ id: "r", path: "?src" }] }));
});

test("CLI: structurally broken scanner output exits 1 with one line, not a stack trace", async () => {
	const f = await workspace({
		"nullrun.sarif": { runs: [null] },
		"badresults.sarif": { runs: [{ results: { a: 1 } }] },
		"nullresult.sarif": { runs: [{ results: [null] }] },
		"badcomponents.json": { components: [null, { name: "x", licenses: 5 }] },
	});
	for (const args of [["--sarif", f["nullrun.sarif"]], ["--sarif", f["badresults.sarif"]], ["--sarif", f["nullresult.sarif"]], ["--sbom", f["badcomponents.json"], "--allow-licenses", "MIT"]]) {
		const { code, out } = await run(args);
		assert.equal(code, 1, args.join(" "));
		assert.match(out, /^security-gate: /);
		assert.equal(out.split("\n").length, 1);
	}
});

test("CLI: usage, unreadable and malformed inputs exit 1 with one line", async () => {
	const f = await workspace({ "bad.json": "{not json", "plain.json": { hello: "world" } });
	for (const args of [[], ["--sarif", join(tmpdir(), "does-not-exist.sarif")], ["--sarif", f["bad.json"]], ["--sarif", f["plain.json"]], ["--conftest", f["plain.json"]], ["--sarif", f["plain.json"], "--waivers", f["bad.json"]]]) {
		const { code, out } = await run(args);
		assert.equal(code, 1, args.join(" "));
		assert.match(out, /^security-gate: /);
		assert.equal(out.split("\n").length, 1);
	}
});
