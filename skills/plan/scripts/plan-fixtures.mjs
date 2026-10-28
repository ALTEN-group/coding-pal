const F = "```";

export const validThink = `# Think: Add POST /roles endpoint

## Business Need & Outcome
- **Backlog Issue:** \`specs/issue-42/triage.md\`
- **Problem Statement:** Admins cannot create user roles without database access, which blocks onboarding of new teams.
- **Consumer:** Admin portal and the role-based access control engine.
- **Desired Outcome:** Admins create a role with permissions through the API in one call.

## Options Considered

### Option 1: Compose the Forge RBAC service
- **Approach:** Add a thin route that calls the Forge RBAC service for role creation.
- **Source:** Forge reuse
- **Trade-offs:** Fastest and certified. Couples the endpoint to the Forge service contract.
- **Cost:** Low
- **Risk:** Low

### Option 2: Custom role table and service
- **Approach:** Add a roles table, repository, and service inside this application.
- **Source:** Custom build
- **Trade-offs:** Full control. Duplicates what the Forge already offers.
- **Cost:** High
- **Risk:** Medium

## Chosen Approach
- **Selected:** Option 1
- **Reasoning:** The Forge service is certified, versioned, and already enforces the audit trail, so composing it avoids duplicate logic.
- **Approved By:** Pending

## Forge Asset Bindings
- **forge/rbac-service@2.1:** Called by the route handler to create roles. No local persistence.

## System Flow & Responsibilities
- **Request Tracing:** Express router -> role route -> Forge RBAC service client.
- **Component Responsibilities:**
  - \`src/routes/role.js\`: validate input and delegate.
  - \`src/app.js\`: mount the router behind authentication.
- **Boundaries:** Starts at the HTTP route and ends at the Forge client call. No schema change.

## Constraints & Invariants
- **Decision Records:** \`docs/decisions/0007-rbac-via-forge.md\`
- **Non-Negotiable Rules:** Only admins may create roles. Responses use the \`{ data }\` / \`{ error }\` envelope.
- **Side-Effect Constraints:** Existing routes and the database schema stay untouched.

## Blast Radius
- **Tier:** Medium
- **Affected:** New public endpoint POST /roles. Consumer: admin portal.
- **Rationale:** A new public endpoint with no schema change and no change to existing contracts.
- **Rollback:** _None._

## Decision Record
- **Required:** no
- **Reason:** No public contract changes, schema changes, or boundary shifts. The new endpoint is additive.

## Persistent Context Updates
- **Update:** \`docs/specs/roles.md\` - document the new endpoint and its error cases.

## Ambiguities & Open Questions
_None._
`;

export const validPlan = `# Plan: Add POST /roles endpoint

## File Scope & Boundaries
- **In Scope:** \`src/routes/role.js\`, \`src/app.js\`, \`tests/routes/role.test.js\`, \`docs/specs/roles.md\`
- **Out of Scope:** \`src/routes/user.js\`, \`db/\`
- **Irreversible Changes:** _None._

## Prerequisites & Context
- Reference: \`specs/issue-42/think.md\`.
- The Forge RBAC client package is installed.

## Acceptance Criteria
- **AC-1:** Given an unauthenticated request to POST /roles, then the response is 401 with an empty body.
- **AC-2:** Given a user with the role viewer, when sending POST /roles, then the response is 403.
- **AC-3:** Given an admin and a valid body, when POST /roles, then the response is 201 and exactly one role is created.

## Implementation Checklist

### Step 1: Create the role route
- **Files:** \`src/routes/role.js\`
- **Action:** Add a POST handler that validates the body and calls the Forge RBAC client.
- **New Code:**
  ${F}js
  import { Router } from "express";
  import { createRole } from "@forge/rbac-client";

  export const roleRouter = Router();

  roleRouter.post("/", async (req, res) => {
    const role = await createRole(req.body);
    res.status(201).json({ data: role });
  });
  ${F}
- **Verification:** \`npm test -- tests/routes/role.test.js\`
- **Bootable Check:** \`node -e 'import("./src/routes/role.js")'\`
- **Serves:** AC-3

### Step 2: Mount the router behind authentication
- **Files:** \`src/app.js\`
- **Action:** Mount the role router at /roles after the authentication and admin-only middleware.
- **New Code:**
  ${F}js
  app.use("/roles", authenticate, requireRole("admin"), roleRouter);
  ${F}
- **Verification:** \`npm test -- tests/routes/role.test.js\`
- **Bootable Check:** \`docker compose up -d && curl -f http://localhost:3000/health\`
- **Serves:** AC-1, AC-2

### Step 3: Add route tests
- **Files:** \`tests/routes/role.test.js\`
- **Action:** Add Supertest cases for 401, 403, and 201.
- **New Code:**
  ${F}js
  it("returns 401 without a token", async () => {
    await request(app).post("/roles").expect(401);
  });
  ${F}
- **Verification:** \`npm test -- tests/routes/role.test.js\`
- **Bootable Check:** \`docker compose up -d && curl -f http://localhost:3000/health\`
- **Serves:** AC-1, AC-2, AC-3

### Step 4: Document the endpoint
- **Files:** \`docs/specs/roles.md\`
- **Action:** Document POST /roles, its roles, and its error responses.
- **New Code:** _None._
- **Verification:** \`npx markdownlint docs/specs/roles.md\`
- **Bootable Check:** \`docker compose up -d && curl -f http://localhost:3000/health\`
- **Serves:** AC-3

## Test Plan
| Criterion | Test | Step |
|---|---|---|
| AC-1 | tests/routes/role.test.js: rejects unauthenticated requests | Step 3 |
| AC-2 | tests/routes/role.test.js: rejects viewers | Step 3 |
| AC-3 | tests/routes/role.test.js: creates a role | Step 3 |

## Open Questions & Assumptions
- **Assumption:** The Forge RBAC client accepts the request body without transformation.
- **Question:** Does the admin portal need the role id in the response? **Answer:** Yes, it is returned in \`data.id\`.

## Blast Radius Check
- **Tier from Think:** Medium
- **Still Holds:** Yes
- **Reason:** _None._

## Done When
- Every step is marked complete and its verification passes with exit code 0.
- The application boots and the health check returns healthy.
- No files outside the In Scope list were modified.

## Approval
- **Approved By:** Pending
`;

export const THINK_APPROVAL = "Ada Lovelace (Developer) on 2026-10-02; Grace Hopper (Architect) on 2026-10-02";
export const PLAN_APPROVAL = "Ada Lovelace (Developer) on 2026-10-03";

/** The same documents after the humans approved them. */
export const approvedThink = validThink.replace("- **Approved By:** Pending", `- **Approved By:** ${THINK_APPROVAL}`);
export const approvedPlan = validPlan.replace("- **Approved By:** Pending", `- **Approved By:** ${PLAN_APPROVAL}`);
