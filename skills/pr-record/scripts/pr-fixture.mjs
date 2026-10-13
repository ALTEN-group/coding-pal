import { createHash } from "node:crypto";

const F = "```";

export const ROLLBACK = "Revert the merge commit and redeploy the previous image tag; no data change to undo.";
export const RECORD_DATE = "2026-10-13";

export function think({ tier = "Medium", rollback = "_None._" } = {}) {
	return `# Think: Add POST /roles endpoint

## Business Need & Outcome
- **Backlog Issue:** \`specs/issue-42/triage.md\`
- **Problem Statement:** Admins cannot create user roles without database access.

## Blast Radius
- **Tier:** ${tier}
- **Affected:** New public endpoint POST /roles.
- **Rationale:** A new public endpoint with no schema change.
- **Rollback:** ${rollback}

## Ambiguities & Open Questions
_None._
`;
}

export const PLAN_APPROVAL = "Ada Lovelace (Developer) on 2026-10-03";

export function plan({ tierFromThink = "Medium", stillHolds = "Yes", reason = "_None._", extra = "", approval = PLAN_APPROVAL } = {}) {
	return `# Plan: Add POST /roles endpoint

## File Scope & Boundaries
- **In Scope:** \`src/routes/role.js\`, \`tests/routes/role.test.js\`
- **Out of Scope:** \`db/\`
- **Irreversible Changes:** _None._

## Prerequisites & Context
- Reference: \`specs/issue-42/think.md\`.
${extra}
## Acceptance Criteria
- **AC-1:** Given an unauthenticated request to POST /roles, then the response is 401 with an empty body.
- **AC-2:** Given a user with the role viewer, when sending POST /roles, then the response is 403.
- **AC-3:** Given an admin and a valid body, when POST /roles, then the response is 201 and exactly one role is created.

## Implementation Checklist

### Step 1: Create the role route
- **Files:** \`src/routes/role.js\`
- **Action:** Add a POST handler.
- **New Code:**
  ${F}md
  ### Step 7: fence content is not a step
  ${F}
- **Verification:** \`npm test -- tests/routes/role.test.js\`
- **Bootable Check:** \`curl -f http://localhost:3000/health\`
- **Serves:** AC-3

### Step 2: Add route tests
- **Files:** \`tests/routes/role.test.js\`
- **Action:** Add Supertest cases.
- **New Code:** _None._
- **Verification:** \`npm test -- tests/routes/role.test.js\`
- **Bootable Check:** \`curl -f http://localhost:3000/health\`
- **Serves:** AC-1, AC-2, AC-3

## Test Plan
| Criterion | Test | Step |
|---|---|---|
| AC-1 | tests/routes/role.test.js: AC-1 rejects unauthenticated requests | Step 2 |
| AC-2 | tests/routes/role.test.js: AC-2 rejects viewers | Step 2 |
| AC-3 | tests/routes/role.test.js: AC-3 creates a role | Step 2 |

## Open Questions & Assumptions
_None._

## Blast Radius Check
- **Tier from Think:** ${tierFromThink}
- **Still Holds:** ${stillHolds}
- **Reason:** ${reason}

## Done When
- Every step is complete.

## Approval
- **Approved By:** ${approval}
`;
}

export function progress(planMd, { attempts = 0, limit = 5, verifiedAt = `${RECORD_DATE}T09:30:00Z`, status = "done" } = {}) {
	const entry = (n) => ({ status, attempts: n === 1 ? attempts : 0, verifiedAt: status === "done" ? verifiedAt : null });
	return {
		issue: "42",
		planSha256: createHash("sha256").update(planMd.replace(/\r\n?/g, "\n")).digest("hex"),
		steps: { 1: entry(1), 2: entry(2) },
		fixLoop: { attempts, limit },
	};
}

export const CONFIRMED = {
	"Client Intent": "Confirmed by Ada Lovelace (Developer) on 2026-10-14",
	"Behavioral Experience": "Confirmed by Ada Lovelace (Developer) on 2026-10-14",
	"Safety & Blast Radius": "Confirmed by Ada Lovelace (Developer) on 2026-10-14",
};

export const ROLLBACK_VALIDATED = `${ROLLBACK} by Dana Ops (DevOps) on 2026-10-14; Alan Turing (Product Owner) on 2026-10-14`;

export const HIGH_CONFIRMED = {
	...CONFIRMED,
	"Safety & Blast Radius": "Confirmed by Grace Hopper (Architect) on 2026-10-14",
	"Rollback Validated": ROLLBACK_VALIDATED,
};

export const CRITICAL_CONFIRMED = {
	...HIGH_CONFIRMED,
	"Joint Sign-off": "Confirmed by Grace Hopper (Architect) and Alan Turing (Product Owner) on 2026-10-15",
	"Staged Rollout": "`docs/rollouts/roles-staged.md`: 5% of tenants, then 50%, then all",
};

export function pending(tier) {
	const fields = { "Client Intent": "Pending", "Behavioral Experience": "Pending", "Safety & Blast Radius": "Pending" };
	if (tier === "High" || tier === "Critical") fields["Rollback Validated"] = "Pending";
	if (tier === "Critical") Object.assign(fields, { "Joint Sign-off": "Pending", "Staged Rollout": "Pending" });
	return fields;
}

export function pr({ tier = "Medium", rollback = "_None._", dependencies = "_None._", human = pending(tier), closes = "#42", status = "Passing" } = {}) {
	return `## Links
- **Closes:** ${closes}
- **Plan:** \`specs/issue-42/plan.md\`
- **Think:** \`specs/issue-42/think.md\`

## Acceptance Criteria Traceability
| Criterion | Test | Status |
|---|---|---|
| AC-1 | tests/routes/role.test.js: AC-1 rejects unauthenticated requests | ${status} |
| AC-2 | tests/routes/role.test.js: AC-2 rejects viewers | Passing |
| AC-3 | tests/routes/role.test.js: AC-3 creates a role | Passing |

## Dependencies
${dependencies}

## Blast Radius
- **Tier:** ${tier}
- **Rollback:** ${rollback}

## Human Validation
${Object.entries(human).map(([label, value]) => `- **${label}:** ${value}`).join("\n")}
`;
}

/** A work item context for validatePrContent. */
export function context(overrides = {}) {
	const tier = overrides.tier ?? "Medium";
	const rollback = tier === "High" || tier === "Critical" ? ROLLBACK : "_None._";
	const planText = overrides.planText ?? plan({ tierFromThink: tier });
	return {
		stage: "code",
		planText,
		thinkText: think({ tier, rollback }),
		progress: progress(planText),
		addedDeps: [],
		prDate: null,
		issue: "42",
		maxFixLoop: 5,
		linkExists: (path) => ["specs/issue-42/plan.md", "specs/issue-42/think.md"].includes(path),
		linkIsWorkItemFile: (path, file) => path === `specs/issue-42/${file}`,
		...overrides,
	};
}
