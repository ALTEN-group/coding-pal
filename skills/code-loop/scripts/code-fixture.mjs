const F = "```";

export const APPROVAL = "Ada Lovelace (Developer) on 2026-10-03";

/** A plan approved by a Developer, whose Step 1 New Code holds step-like text, to prove step parsing is fence-aware. */
export const validPlan = `# Plan: Add POST /roles endpoint

## File Scope & Boundaries
- **In Scope:** \`src/routes/role.js\`, \`src/app.js\`, \`tests/routes/role.test.js\`
- **Out of Scope:** \`db/\`
- **Irreversible Changes:** _None._

## Prerequisites & Context
- Reference: \`specs/issue-42/think.md\`.

## Acceptance Criteria
- **AC-1:** Given an unauthenticated request to POST /roles, then the response is 401 with an empty body.
- **AC-2:** Given a user with the role viewer, when sending POST /roles, then the response is 403.
- **AC-3:** Given an admin and a valid body, when POST /roles, then the response is 201 and exactly one role is created.

## Implementation Checklist

### Step 1: Create the role route
- **Files:** \`src/routes/role.js\`
- **Action:** Add a POST handler that validates the body and calls the Forge RBAC client.
- **New Code:**
  ${F}md
  ### Step 9: this heading is code, not a step
  ## Test Plan
  ${F}
- **Verification:** \`npm test -- tests/routes/role.test.js\`
- **Bootable Check:** \`node -e 'import("./src/routes/role.js")'\`
- **Serves:** AC-3

### Step 2: Mount the router behind authentication
- **Files:** \`src/app.js\`
- **Action:** Mount the role router at /roles after the authentication middleware.
- **New Code:** _None._
- **Verification:** \`npm test -- tests/routes/role.test.js\`
- **Bootable Check:** \`docker compose up -d && curl -f http://localhost:3000/health\`
- **Serves:** AC-1, AC-2

### Step 3: Add route tests
- **Files:** \`tests/routes/role.test.js\`
- **Action:** Add Supertest cases for 401, 403, and 201.
- **New Code:** _None._
- **Verification:** \`npm test -- tests/routes/role.test.js\`
- **Bootable Check:** \`docker compose up -d && curl -f http://localhost:3000/health\`
- **Serves:** AC-1, AC-2, AC-3

## Test Plan
| Criterion | Test | Step |
|---|---|---|
| AC-1 | tests/routes/role.test.js: AC-1 rejects unauthenticated requests | Step 3 |
| AC-2 | tests/routes/role.test.js: AC-2 rejects viewers | Step 3 |
| AC-3 | tests/routes/role.test.js: AC-3 creates a role | Step 3 |

## Open Questions & Assumptions
_None._

## Blast Radius Check
- **Tier from Think:** Medium
- **Still Holds:** Yes
- **Reason:** _None._

## Done When
- Every step is marked complete and its verification passes with exit code 0.

## Approval
- **Approved By:** ${APPROVAL}
`;

/** The same plan before a person approved it. */
export const pendingPlan = validPlan.replace(`- **Approved By:** ${APPROVAL}`, "- **Approved By:** Pending");
