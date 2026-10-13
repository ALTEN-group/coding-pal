export const validRelease = `# Release: Role management endpoint

## Release
- **Issue:** #42
- **Tier:** Medium
- **Version:** v1.4.0
- **Artifact:** registry.example.com/acme/roles-api:1.4.0
- **Flag:** roles.enable
- **Owner:** DevOps
- **Customer Commitment:** yes

## Rollout Stages
| Stage | Traffic | Watch Window | Promotion |
|---|---|---|---|
| staging | 0% | 15m | automatic on green window |
| canary-5 | 5% | 30m | automatic on green window |
| full-100 | 100% | 1h | automatic on green window |

## Thresholds
| Metric | Kind | Comparator | Limit | Rollback |
|---|---|---|---|---|
| error_rate | health | <= | 1 | Traffic shift back |
| latency_p95_ms | health | <= | 300 | Traffic shift back |
| cpu_saturation_pct | health | <= | 80 | Redeploy previous artifact |
| role_assignment_success_rate | business | >= | 95 | Feature flag off |

## Rollback
- Feature flag off: set \`roles.enable\` to false in the flag service.
- Traffic shift back: route 100% of traffic to the previous version.
- Redeploy previous artifact: redeploy \`registry.example.com/acme/roles-api:1.3.2\`.
- **Primary:** Feature flag off
- **Decided By:** DevOps

## Outcome Metric
- **Metric:** Minutes an administrator spends assigning a role
- **Baseline:** 45
- **Target:** 5
- **Direction:** down
- **Watch Window Days:** 14
- **Hypothesis Ledger Entry:** specs/learn/hypotheses.md#42

## Changelog
Administrators can now assign roles through the new roles endpoint.

## Ambiguities & Open Questions
_None._
`;

export const validThink = `# Think: Role management endpoint

## Blast Radius
- **Tier:** Medium
- **Affected:** New public endpoint POST /roles.
- **Rationale:** A new public endpoint with no schema change.
- **Rollback:** _None._

## Ambiguities & Open Questions
_None._
`;

export const validPlan = `# Plan: Role management endpoint

## Blast Radius Check
- **Tier from Think:** Medium
- **Still Holds:** Yes
- **Reason:** _None._

## Done When
- Every step is complete.
`;

const PRODUCTION_ROWS = /(\| staging .*\n)(?:\|.*\n)+/;

/** Rewrites the production stages of a release.md fixture from [name, traffic, window] rows. */
export function withProductionStages(source, rows) {
	const table = rows.map(([name, traffic, window = "30m"]) => `| ${name} | ${traffic} | ${window} | automatic on green window |`).join("\n");
	return source.replace(PRODUCTION_ROWS, (_, staging) => `${staging}${table}\n`);
}

/** The ladder each tier requires, in the shape the validator accepts. */
export const TIER_STAGES = {
	Low: [["full-100", "100%", "1h"]],
	Medium: [["canary-5", "5%"], ["full-100", "100%", "1h"]],
	High: [["canary-5", "5%"], ["progressive-25", "25%"], ["full-100", "100%", "1h"]],
	Critical: [["canary-5", "5%"], ["progressive-25", "25%"], ["progressive-50", "50%"], ["full-100", "100%", "1h"]],
};

/** validRelease re-declared at another tier, with the production ladder that tier requires. */
export function releaseFor(tier) {
	return withProductionStages(validRelease.replace("- **Tier:** Medium", `- **Tier:** ${tier}`), TIER_STAGES[tier]);
}

export function highRelease() {
	return releaseFor("High").replace("- **Primary:** Feature flag off", "- **Primary:** Feature flag off, then Traffic shift back");
}

export function highThink(rollback = "Feature flag off") {
	return validThink.replace("- **Tier:** Medium", "- **Tier:** High").replace("- **Rollback:** _None._", `- **Rollback:** ${rollback}`);
}

export function validPlanFor(tierFromThink, stillHolds = "Yes") {
	return validPlan.replace("- **Tier from Think:** Medium", `- **Tier from Think:** ${tierFromThink}`).replace("- **Still Holds:** Yes", `- **Still Holds:** ${stillHolds}`);
}

export const passingMetrics = {
	stage: "canary-5",
	observedMinutes: 30,
	metrics: { error_rate: 0.4, latency_p95_ms: 220, cpu_saturation_pct: 55, role_assignment_success_rate: 98 },
};

export const stagingMetrics = {
	stage: "staging",
	observedMinutes: 15,
	metrics: { smoke_failures: 0, qa_failures: 0 },
};
