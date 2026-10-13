import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ValidationError, parseDuration, runValidator, validateReleaseContent } from "./validate-release.mjs";
import { highRelease, highThink, releaseFor, validPlan, validPlanFor, validRelease, validThink, withProductionStages } from "./release-fixture.mjs";

const edit = (from, to, source = validRelease) => {
	assert.ok(source.includes(from), `fixture does not contain: ${from}`);
	return source.replace(from, to);
};
const rejects = (markdown, pattern, options) =>
	assert.throws(() => validateReleaseContent(markdown, "release.md", options), (err) => err instanceof ValidationError && pattern.test(err.message));
const thresholdRow = (metric, kind, comparator, limit, rollback = "Traffic shift back") => `| ${metric} | ${kind} | ${comparator} | ${limit} | ${rollback} |\n`;
const ERROR_ROW = thresholdRow("error_rate", "health", "<=", 1);
const LATENCY_ROW = thresholdRow("latency_p95_ms", "health", "<=", 300);
const SATURATION_ROW = thresholdRow("cpu_saturation_pct", "health", "<=", 80, "Redeploy previous artifact");
const BUSINESS_ROW = thresholdRow("role_assignment_success_rate", "business", ">=", 95, "Feature flag off");
const stagesOf = (tier, rows) => withProductionStages(releaseFor(tier), rows);

test("accepts a valid release and returns structured data", () => {
	const result = validateReleaseContent(validRelease);
	assert.equal(result.release.issue, "#42");
	assert.equal(result.release.tier, "Medium");
	assert.equal(result.stages.length, 3);
	assert.equal(result.thresholds.length, 4);
	assert.equal(result.outcome.direction, "down");
	assert.match(result.changelog, /Administrators/);
	assert.equal(parseDuration("1h"), 60);
	assert.equal(parseDuration("0m"), null);
});

test("rejects empty, wrong heading, wrong section order, and code blocks", () => {
	rejects("", /empty/);
	rejects(edit("# Release:", "# Deploy:"), /level-one heading/);
	rejects(edit("## Thresholds", "## Limits"), /heading 3/);
	rejects(`${validRelease}\n## Extra\nx\n`, /exactly 7/);
	rejects(edit("## Changelog", "```sh\necho hi\n```\n\n## Changelog"), /code blocks/);
});

test("accepts single or multi-issue releases, rejects malformed or missing issues", () => {
	assert.ok(validateReleaseContent(edit("- **Issue:** #42", "- **Issue:** #42, #43")));
	assert.deepEqual(validateReleaseContent(edit("- **Issue:** #42", "- **Issue:** #42, #43")).release.issues, ["#42", "#43"]);
	rejects(edit("- **Issue:** #42", "- **Issue:** 42"), /one or more issue references/);
	rejects(edit("- **Issue:** #42", "- **Issue:** #42, invalid"), /one or more issue references/);
	rejects(edit("- **Issue:** #42\n", ""), /missing the "- \*\*Issue:\*\*"/);
});

test("rejects bad tier, version, owner, and commitment", () => {
	rejects(edit("- **Tier:** Medium", "- **Tier:** Severe"), /Tier must be one of/);
	rejects(edit("v1.4.0", "v1.4"), /semantic version/);
	assert.equal(validateReleaseContent(edit("- **Version:** v1.4.0", "- **Version:** 1.4.0")).release.versionNumber, "1.4.0");
	rejects(edit("- **Owner:** DevOps", "- **Owner:** Developer"), /Owner must be "DevOps"/);
	rejects(edit("- **Customer Commitment:** yes", "- **Customer Commitment:** maybe"), /"yes" or "no"/);
});

test("rejects mutable, unversioned, mismatched, or credentialed artifacts", () => {
	rejects(edit(":1.4.0", ":latest"), /mutable/);
	rejects(edit("roles-api:1.4.0", "roles-api"), /must contain a version/);
	rejects(edit("roles-api:1.4.0", "roles-api:1.3.9"), /does not contain the release Version/);
	rejects(edit("registry.example.com/acme/roles-api:1.4.0", "https://user:pw@registry.example.com/roles-1.4.0.tgz"), /credentials/);
	rejects(edit("roles-api:1.4.0", "roles api:1.4.0"), /without spaces/);
	const digest = `registry.example.com/acme/roles-api@sha256:${"a".repeat(64)}`;
	assert.equal(validateReleaseContent(edit("registry.example.com/acme/roles-api:1.4.0", digest)).release.artifact, digest);
	rejects(edit("roles-api:1.4.0", "roles-api:11.4.00"), /does not contain the release Version/);
	rejects(edit("roles-api:1.4.0", "roles-api:1.4.0-rc.1"), /does not contain the release Version/);
	rejects(edit("roles-api:1.4.0", "roles-api:21.4.0"), /does not contain the release Version/);
});

test("rejects a field declared twice", () => {
	rejects(edit("- **Tier:** Medium", "- **Tier:** Medium\n- **Tier:** Low"), /"Tier" is declared twice/);
	rejects(edit("- **Flag:** roles.enable", "- **Flag:** roles.enable\n- **Flag:** other.enable"), /"Flag" is declared twice/);
});

test("requires the release decision flag", () => {
	assert.equal(validateReleaseContent(validRelease.replace(/roles\.enable/g, "enable")).release.flag, "enable");
	rejects(edit("- **Flag:** roles.enable", "- **Flag:** roles-flag"), /named "enable"/);
	rejects(edit("- **Flag:** roles.enable", "- **Flag:** Roles.Enable"), /named "enable"/);
});

test("enforces the staging-first rollout shape", () => {
	rejects(edit("| staging |", "| preprod |"), /first stage must be "staging"/);
	rejects(edit("| staging | 0% |", "| staging | 5% |"), /0% production traffic/);
	rejects(edit("| canary-5 | 5% |", "| canary-5 | 10% |"), /Medium change must roll out as 2 production stages: canary 5%/);
	rejects(edit("| canary-5 | 5% |", "| canary-5 | 2% |"), /Medium change must roll out as 2 production stages: canary 5%/);
	rejects(edit("| full-100 | 100% |", "| full-100 | 90% |"), /reach 100%/);
	rejects(edit("| canary-5 |", "| staging |"), /duplicated/);
	rejects(edit("| canary-5 |", "| Canary 5 |"), /kebab-case/);
	rejects(edit("| 5% | 30m |", "| 5% | 30 minutes |"), /Watch Window/);
	rejects(edit("| 5% | 30m | automatic on green window |", "| 5% | 30m | manual approval |"), /Promotion must be/);
	rejects(edit("| 5% |", "| 500% |"), /percentage/);
	rejects(edit("| Stage | Traffic | Watch Window | Promotion |", "| Stage | Traffic | Window | Promotion |"), /columns must be exactly/);
});

test("production stages increase with the tier and Critical is the factory ladder", () => {
	const production = (tier) => validateReleaseContent(releaseFor(tier)).stages.slice(1).map((s) => s.traffic);
	assert.deepEqual(production("Low"), [100]);
	assert.deepEqual(production("Medium"), [5, 100]);
	assert.deepEqual(production("High"), [5, 25, 100]);
	assert.deepEqual(production("Critical"), [5, 25, 50, 100]);
	assert.equal(validateReleaseContent(releaseFor("Critical")).stages[0].name, "staging");
});

test("Low needs exactly one production stage at 100%", () => {
	rejects(stagesOf("Low", [["canary-5", "5%"], ["full-100", "100%"]]), /Low change needs exactly 1 production stage: 100%/);
	rejects(stagesOf("Low", [["half-50", "50%"]]), /reach 100%/);
});

test("Medium needs a 5% canary then 100%, no fewer and no other shape", () => {
	rejects(stagesOf("Medium", [["full-100", "100%"]]), /Medium change needs exactly 2 production stages/);
	rejects(stagesOf("Medium", [["canary-5", "5%"], ["progressive-25", "25%"], ["full-100", "100%"]]), /Medium change needs exactly 2 production stages/);
	rejects(stagesOf("Medium", [["canary-10", "10%"], ["full-100", "100%"]]), /Medium change must roll out as 2 production stages/);
});

test("High needs a 5% canary, one step above 5% and at most 50%, then 100%", () => {
	for (const middle of ["6%", "25%", "50%"]) {
		assert.ok(validateReleaseContent(stagesOf("High", [["canary-5", "5%"], ["progressive", middle], ["full-100", "100%"]])));
	}
	rejects(stagesOf("High", [["canary-5", "5%"], ["full-100", "100%"]]), /High change needs exactly 3 production stages/);
	rejects(stagesOf("High", [["canary-5", "5%"], ["progressive-25", "25%"], ["progressive-50", "50%"], ["full-100", "100%"]]), /High change needs exactly 3 production stages/);
	rejects(stagesOf("High", [["canary-5", "5%"], ["progressive", "51%"], ["full-100", "100%"]]), /High change must roll out as 3 production stages/);
	rejects(stagesOf("High", [["canary-5", "5%"], ["progressive", "5%"], ["full-100", "100%"]]), /strictly increase/);
	rejects(stagesOf("High", [["canary-3", "3%"], ["progressive-25", "25%"], ["full-100", "100%"]]), /High change must roll out as 3 production stages/);
	rejects(stagesOf("High", [["canary-5", "5%"], ["progressive-50", "50%"], ["progressive-25", "25%"]]), /strictly increase/);
});

test("Critical needs exactly 5%, 25%, 50%, 100%", () => {
	const critical = releaseFor("Critical");
	assert.ok(validateReleaseContent(critical));
	rejects(edit("| progressive-50 | 50% |", "| progressive-50 | 25% |", critical), /strictly increase/);
	rejects(stagesOf("Critical", [["canary-5", "5%"], ["progressive-25", "25%"], ["full-100", "100%"]]), /Critical change needs exactly 4 production stages: 5%, 25%, 50%, 100%/);
	rejects(
		stagesOf("Critical", [["canary-5", "5%"], ["progressive-10", "10%"], ["progressive-25", "25%"], ["progressive-50", "50%"], ["full-100", "100%"]]),
		/Critical change needs exactly 4 production stages/,
	);
	rejects(stagesOf("Critical", [["canary-5", "5%"], ["progressive-30", "30%"], ["progressive-50", "50%"], ["full-100", "100%"]]), /Critical change must roll out as 4 production stages: 5%, 25%, 50%, 100%/);
	rejects(stagesOf("Critical", [["canary-5", "5%"], ["progressive-25", "25%"], ["progressive-75", "75%"], ["full-100", "100%"]]), /must roll out as 4 production stages/);
	rejects(stagesOf("Critical", [["canary-1", "1%"], ["progressive-25", "25%"], ["progressive-50", "50%"], ["full-100", "100%"]]), /must roll out as 4 production stages/);
});

test("Critical watch windows never shrink from one production stage to the next", () => {
	const windows = (...w) => stagesOf("Critical", [["canary-5", "5%", w[0]], ["progressive-25", "25%", w[1]], ["progressive-50", "50%", w[2]], ["full-100", "100%", w[3]]]);
	assert.ok(validateReleaseContent(windows("30m", "30m", "1h", "2h")));
	assert.ok(validateReleaseContent(windows("90m", "2h", "2h", "1d")));
	rejects(windows("1h", "30m", "1h", "2h"), /at least as long as the previous one \(progressive-25 30m after canary-5 1h\)/);
	rejects(windows("30m", "1h", "1h", "59m"), /full-100 59m after progressive-50 1h/);
	// Lower tiers keep only the per-stage window rule.
	assert.ok(validateReleaseContent(stagesOf("High", [["canary-5", "5%", "2h"], ["progressive-25", "25%", "30m"], ["full-100", "100%", "1h"]])));
});

test("the effective tier from plan.md or think.md decides the ladder", () => {
	const high = releaseFor("High");
	assert.ok(validateReleaseContent(high, "release.md", { plan: validPlanFor("Medium", "Raised to High") }));
	// A release still shaped for the old tier fails the tier check first, not a stage check.
	rejects(validRelease, /must equal the tier raised by plan\.md \("High"\)/, { plan: validPlanFor("Medium", "Raised to High") });
	rejects(releaseFor("Critical"), /must equal the tier raised by plan\.md \("High"\)/, { plan: validPlanFor("Medium", "Raised to High") });
	// A raised tier declared with the old tier's ladder fails the ladder of the raised tier.
	rejects(edit("- **Tier:** Medium", "- **Tier:** High"), /High change needs exactly 3 production stages/, { plan: validPlanFor("Medium", "Raised to High") });
	rejects(edit("- **Tier:** Medium", "- **Tier:** Critical"), /Critical change needs exactly 4 production stages/, { think: validThink.replace("Medium", "Critical") });
});

test("rejects bad thresholds", () => {
	rejects(edit(ERROR_ROW, ""), /health threshold for error rate/);
	rejects(edit("| latency_p95_ms | health |", "| latency_p95_ms | business |"), /health threshold for latency/);
	rejects(edit(SATURATION_ROW, ""), /health threshold for saturation/);
	rejects(edit(BUSINESS_ROW, ""), /at least one business threshold/);
	rejects(edit("| error_rate | health |", "| error_rate | vibes |"), /Kind must be one of/);
	rejects(edit("| <= | 1 |", "| == | 1 |"), /Comparator must be one of/);
	rejects(edit("| <= | 1 |", "| <= | one |"), /Limit must be a number/);
	rejects(edit("| 1 | Traffic shift back |", "| 1 | Forward fix |"), /automatic mechanism/);
	rejects(edit("| 1 | Traffic shift back |", "| 1 | |"), /automatic mechanism/);
	rejects(edit("| latency_p95_ms |", "| error_rate |"), /duplicated/);
	rejects(edit("| latency_p95_ms |", "| Latency P95 |"), /snake_case/);
	rejects(edit("- Traffic shift back: route 100% of traffic to the previous version.\n", ""), /not listed in "## Rollback"/);
});

test("rejects vacuous health thresholds: wrong comparator", () => {
	rejects(edit(ERROR_ROW, thresholdRow("error_rate", "health", ">=", 0)), /must bound error rate from above/);
	rejects(edit(ERROR_ROW, thresholdRow("error_rate", "health", ">", 1)), /must bound error rate from above/);
	rejects(edit(LATENCY_ROW, thresholdRow("latency_p95_ms", "health", ">=", 300)), /must bound latency from above/);
	rejects(edit(SATURATION_ROW, thresholdRow("cpu_saturation_pct", "health", ">", 80, "Redeploy previous artifact")), /must bound saturation from above/);
	assert.ok(validateReleaseContent(edit(ERROR_ROW, thresholdRow("error_rate", "health", "<", 1))));
});

test("rejects vacuous health thresholds: limit must be greater than 0", () => {
	rejects(edit(ERROR_ROW, thresholdRow("error_rate", "health", "<=", 0)), /Limit must be greater than 0/);
	rejects(edit(ERROR_ROW, thresholdRow("error_rate", "health", "<=", -1)), /Limit must be greater than 0/);
	rejects(edit(LATENCY_ROW, thresholdRow("latency_p95_ms", "health", "<", 0)), /Limit must be greater than 0/);
	rejects(edit(SATURATION_ROW, thresholdRow("cpu_saturation_pct", "health", "<=", 0, "Redeploy previous artifact")), /Limit must be greater than 0/);
	assert.ok(validateReleaseContent(edit(ERROR_ROW, thresholdRow("error_rate", "health", "<=", 0.01))));
});

test("rejects error rate and saturation limits above 100 percent, but not latency or non-percentage metrics", () => {
	rejects(edit(ERROR_ROW, thresholdRow("error_rate", "health", "<=", 150)), /percentage, so its Limit must be at most 100/);
	rejects(edit(ERROR_ROW, thresholdRow("error_rate_pct", "health", "<", 101)), /at most 100/);
	rejects(edit(SATURATION_ROW, thresholdRow("cpu_saturation_pct", "health", "<=", 120, "Redeploy previous artifact")), /at most 100/);
	rejects(edit(ERROR_ROW, thresholdRow("error_rate", "health", "<=", 100)), /rate or percentage, and "<= 100" can never be breached/);
	assert.ok(validateReleaseContent(edit(ERROR_ROW, thresholdRow("error_rate", "health", "<", 100))));
	assert.ok(validateReleaseContent(edit(LATENCY_ROW, thresholdRow("latency_p95_ms", "health", "<=", 5000))));
	assert.ok(validateReleaseContent(edit(SATURATION_ROW, thresholdRow("queue_depth", "health", "<=", 500, "Redeploy previous artifact"))));
	assert.ok(validateReleaseContent(edit(ERROR_ROW, thresholdRow("http_errors_total", "health", "<=", 500))));
});

test("rejects vacuous business thresholds on a rate or percentage", () => {
	const business = (comparator, limit, metric = "role_assignment_success_rate") => edit(BUSINESS_ROW, thresholdRow(metric, "business", comparator, limit, "Feature flag off"));
	rejects(business(">=", 0), /"role_assignment_success_rate" is a rate or percentage, and ">= 0" can never be breached/);
	rejects(business(">", -1), /can never be breached/);
	rejects(business("<=", 100), /"<= 100" can never be breached/);
	rejects(business("<", 101), /can never be breached/);
	rejects(business(">=", 0, "checkout_conversion_pct"), /can never be breached/);
	rejects(business("<", 0), /is breached by every value/);
	rejects(business(">", 100), /is breached by every value/);
	rejects(business(">=", 101, "checkout_conversion_percent"), /is breached by every value/);
	rejects(business(">=", "ninety"), /Limit must be a number/);
	assert.ok(validateReleaseContent(business(">=", 95)));
	assert.ok(validateReleaseContent(business("<", 5, "checkout_abandon_rate")));
	// Not a rate or percentage: any comparator and any numeric limit is accepted.
	assert.ok(validateReleaseContent(business(">=", 0, "orders_completed")));
	assert.ok(validateReleaseContent(business("<=", 100, "orders_completed")));
});

test("matches the three health metrics on whole words and keeps inverse metrics business", () => {
	const inverse = thresholdRow("error_free_rate", "health", ">=", 99);
	rejects(edit(ERROR_ROW, inverse), /"error_free_rate" measures the opposite of error rate/);
	// As a business metric it is valid, but it does not satisfy the required error rate health threshold.
	const asBusiness = thresholdRow("error_free_rate", "business", ">=", 99, "Feature flag off");
	rejects(edit(ERROR_ROW, asBusiness), /health threshold for error rate/);
	const both = edit(ERROR_ROW, ERROR_ROW + asBusiness);
	const parsed = validateReleaseContent(both);
	assert.equal(parsed.thresholds.find((t) => t.metric === "error_free_rate").kind, "business");
	assert.equal(parsed.thresholds.find((t) => t.metric === "error_rate").kind, "health");
	rejects(edit(ERROR_ROW, thresholdRow("error_success_rate", "health", ">=", 99)), /measures the opposite of error rate/);
	rejects(edit(SATURATION_ROW, thresholdRow("memory_free_pct", "health", ">=", 20, "Redeploy previous artifact")), /measures the opposite of saturation/);
	// Words must be whole: "terror_rate" or "cpuset_pct" are not an error rate or saturation metric.
	rejects(edit(ERROR_ROW, thresholdRow("terror_rate", "health", "<=", 1)), /health threshold for error rate/);
	rejects(edit(SATURATION_ROW, thresholdRow("cpuset_pct", "health", "<=", 80, "Redeploy previous artifact")), /health threshold for saturation/);
	// A health row that matches none of the three needs no limit rules beyond a number.
	assert.ok(validateReleaseContent(edit(BUSINESS_ROW, BUSINESS_ROW + thresholdRow("pod_restarts", "health", ">=", 0, "Redeploy previous artifact"))));
});

test("business thresholds are optional without an outcome metric", () => {
	const noOutcome = validRelease
		.replace("| role_assignment_success_rate | business | >= | 95 | Feature flag off |\n", "")
		.replace(
			/## Outcome Metric[\s\S]*?\n## Changelog/,
			"## Outcome Metric\n- **Metric:** _None._\n- **Baseline:** _None._\n- **Target:** _None._\n- **Direction:** _None._\n- **Watch Window Days:** _None._\n- **Hypothesis Ledger Entry:** _None._ Internal refactor with no measurable outcome.\n\n## Changelog",
		);
	assert.equal(validateReleaseContent(noOutcome).outcome.metric, null);
	rejects(edit("_None._ Internal refactor with no measurable outcome.", "_None._", noOutcome), /<reason>/);
	rejects(edit("- **Baseline:** _None._", "- **Baseline:** 45", noOutcome), /must be "_None\._"/);
});

test("rejects bad rollback sections", () => {
	rejects(edit("- Feature flag off: set `roles.enable` to false in the flag service.", "- Pray: set the flag"), /must read "- <mechanism>: <how>"/);
	rejects(edit("- Feature flag off: set", "- Feature flag off:\n- Feature flag off: set"), /must read/);
	rejects(edit("- Traffic shift back: route", "- Feature flag off: route"), /listed twice/);
	rejects(edit("- **Primary:** Feature flag off", "- **Primary:** Call the on-call"), /must name one of the listed mechanisms/);
	rejects(edit("- **Decided By:** DevOps", "- **Decided By:** Developer"), /Decided By must be/);
	rejects(edit("- **Decided By:** DevOps\n", ""), /missing the "- \*\*Decided By:\*\*"/);
	rejects(edit("- **Decided By:** DevOps", "- **Decided By:** DevOps\n- **Data-Affecting:** maybe"), /Data-Affecting must be/);
	assert.equal(validateReleaseContent(edit("- **Decided By:** DevOps", "- **Decided By:** QA and maintainer")).rollback.decidedBy, "QA and maintainer");
	rejects(validRelease.replace(/- (Feature flag off|Traffic shift back|Redeploy previous artifact): .*\n/g, ""), /at least one mechanism/);
});

test("forward fix needs a data-affecting change", () => {
	const forward = edit("- Redeploy previous artifact:", "- Forward fix: ship a corrective migration.\n- Redeploy previous artifact:");
	rejects(forward, /only for data-affecting changes/);
	const ok = edit("- **Decided By:** DevOps", "- **Decided By:** DevOps\n- **Data-Affecting:** yes", forward);
	assert.equal(validateReleaseContent(ok).rollback.dataAffecting, true);
});

test("rejects bad outcome metrics", () => {
	rejects(edit("- **Direction:** down", "- **Direction:** sideways"), /Direction must be/);
	rejects(edit("- **Direction:** down", "- **Direction:** up"), /must be above Baseline/);
	rejects(edit("- **Target:** 5", "- **Target:** 90"), /must be below Baseline/);
	rejects(edit("- **Baseline:** 45", "- **Baseline:** high"), /Baseline must start with a number/);
	rejects(edit("- **Target:** 5", "- **Target:** low"), /Target must start with a number/);
	rejects(edit("- **Watch Window Days:** 14", "- **Watch Window Days:** 0"), /positive integer/);
	rejects(edit("specs/learn/hypotheses.md#42", "specs/learn/hypotheses.md"), /<path>#<row>/);
	rejects(edit("specs/learn/hypotheses.md#42", "../hypotheses.md#42"), /workspace-relative/);
	rejects(edit("specs/learn/hypotheses.md#42", "/etc/hypotheses.md#42"), /workspace-relative/);
	rejects(edit("specs/learn/hypotheses.md#42", "_None._ not tracked"), /<path>#<row>/);
	rejects(edit("specs/learn/hypotheses.md#42", "specs/learn/hypotheses.md#43"), /own ledger row/);
	rejects(edit("specs/learn/hypotheses.md#42", "specs/learn/hypotheses.md#H-12"), /own ledger row/);
	rejects(edit("- **Metric:** Minutes an administrator spends assigning a role\n", ""), /missing the "- \*\*Metric:\*\*"/);
});

test("enforces the changelog rule", () => {
	const entry = "Administrators can now assign roles through the new roles endpoint.";
	rejects(edit(entry, "_None._"), /needs a one-line customer-facing entry/);
	rejects(edit(entry, "Line one.\nLine two."), /exactly one line/);
	rejects(edit(entry, "x".repeat(201)), /200 characters/);
	const none = edit("- **Customer Commitment:** yes", "- **Customer Commitment:** no");
	rejects(none, /must be "_None\._"/);
	assert.equal(validateReleaseContent(none.replace(entry, "_None._")).changelog, null);
	assert.equal(validateReleaseContent(edit("Administrators", "- Administrators")).changelog.startsWith("Administrators"), true);
});

test("requires the ambiguities section to be filled", () => {
	rejects(edit("## Ambiguities & Open Questions\n_None._", "## Ambiguities & Open Questions\nTBD"), /Ambiguities/);
	assert.ok(validateReleaseContent(edit("## Ambiguities & Open Questions\n_None._", "## Ambiguities & Open Questions\n- Should the canary run longer on Fridays?")));
});

test("cross-checks the tier against think.md and plan.md", () => {
	assert.ok(validateReleaseContent(validRelease, "release.md", { think: validThink, plan: validPlan }));
	rejects(validRelease, /must equal the tier in think\.md \("High"\)/, { think: highThink() });
	rejects(edit("- **Tier:** Medium", "- **Tier:** Low"), /must equal the tier in plan\.md \("Medium"\)/, { plan: validPlan });
	rejects(validRelease, /differs from think\.md/, { think: validThink, plan: validPlanFor("High") });
	rejects(validRelease, /must equal the tier raised by plan\.md \("High"\)/, { plan: validPlanFor("Medium", "Raised to High") });
	assert.ok(validateReleaseContent(highRelease(), "release.md", { think: highThink(), plan: validPlanFor("High") }));
	rejects(validRelease, /Still Holds must be/, { plan: validPlanFor("Medium", "Maybe") });
	rejects(validRelease, /no "## Blast Radius" section/, { think: "# Think: x\n" });
	rejects(validRelease, /no "## Blast Radius Check" section/, { plan: "# Plan: x\n" });
	rejects(validRelease, /Tier must be one of/, { think: validThink.replace("Medium", "Severe") });
	rejects(validRelease, /Tier from Think must be one of/, { plan: validPlan.replace("**Tier from Think:** Medium", "**Tier from Think:** Odd") });
});

test("High and Critical changes must match the rollback declared in think.md", () => {
	assert.ok(validateReleaseContent(highRelease(), "release.md", { think: highThink("Feature flag off.") }));
	rejects(highRelease(), /names no Rollback/, { think: highThink("_None._") });
	rejects(highRelease(), /must contain the rollback declared in think\.md/, { think: highThink("Redeploy previous artifact within 5 minutes") });
	rejects(highRelease().replace("Feature flag off, then Traffic shift back", "Traffic shift back"), /must contain the rollback/, { think: highThink() });
	rejects(releaseFor("High"), /must contain the rollback/, { think: highThink("Redeploy previous artifact") });
	rejects(releaseFor("High"), /names no Rollback/, { think: validThink.replace("Medium", "High") });
	const raised = validateReleaseContent(releaseFor("High"), "release.md", {
		think: highThink("Feature flag off"),
		plan: validPlanFor("High"),
	});
	assert.equal(raised.release.tier, "High");
	rejects(releaseFor("High"), /names no Rollback/, { think: validThink, plan: validPlanFor("Medium", "Raised to High") });
});

test("cross-checks the issue and the git tag", () => {
	assert.ok(validateReleaseContent(validRelease, "release.md", { issue: "42", tag: "v1.4.0" }));
	assert.ok(validateReleaseContent(validRelease, "release.md", { tag: "1.4.0" }));
	rejects(validRelease, /does not match the work item directory issue-7/, { issue: "7" });
	rejects(validRelease, /does not match the release tag/, { tag: "v1.5.0" });
});

function quiet(fn) {
	const log = console.log;
	const error = console.error;
	console.log = console.error = () => {};
	return Promise.resolve(fn()).finally(() => Object.assign(console, { log, error }));
}

test("CLI validates a file, a directory, and the cross-checks", async () => {
	const root = await mkdtemp(join(tmpdir(), "release-"));
	const dir = join(root, "issue-42");
	await mkdir(dir);
	await writeFile(join(dir, "release.md"), validRelease);
	await writeFile(join(dir, "think.md"), validThink);
	await writeFile(join(dir, "plan.md"), validPlan);

	assert.equal(await quiet(() => runValidator(["--release", join(dir, "release.md")])), 0);
	assert.equal(
		await quiet(() => runValidator(["--release", join(dir, "release.md"), "--think", join(dir, "think.md"), "--plan", join(dir, "plan.md"), "--tag", "v1.4.0"])),
		0,
	);
	assert.equal(await quiet(() => runValidator(["--dir", dir, "--tag", "1.4.0"])), 0);
	assert.equal(await quiet(() => runValidator(["--dir", dir, "--tag", "v9.9.9"])), 1);
	assert.equal(await quiet(() => runValidator(["--release", join(dir, "release.md"), "--think", join(root, "missing.md")])), 1);

	await writeFile(join(dir, "think.md"), highThink());
	assert.equal(await quiet(() => runValidator(["--dir", dir])), 1);

	const other = join(root, "issue-7");
	await mkdir(other);
	await writeFile(join(other, "release.md"), validRelease);
	assert.equal(await quiet(() => runValidator(["--dir", other])), 1);

	const empty = join(root, "issue-8");
	await mkdir(empty);
	assert.equal(await quiet(() => runValidator(["--dir", empty])), 1);
	assert.equal(await quiet(() => runValidator(["--dir", join(root, "missing")])), 1);
	assert.equal(await quiet(() => runValidator([])), 1);
	assert.equal(await quiet(() => runValidator(["--help"])), 0);
	assert.equal(await quiet(() => runValidator(["--dir", dir, "--tag"])), 1);
	assert.equal(await quiet(() => runValidator(["--dir", dir, "--tag", ""])), 1);
	assert.equal(await quiet(() => runValidator(["--dir", dir, "--bogus"])), 1);
});
