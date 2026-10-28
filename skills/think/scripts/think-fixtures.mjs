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

export const THINK_APPROVAL = "Ada Lovelace (Developer) on 2026-10-02; Grace Hopper (Architect) on 2026-10-02";

/** The same document after the humans approved it. */
export const approvedThink = validThink.replace("- **Approved By:** Pending", `- **Approved By:** ${THINK_APPROVAL}`);
