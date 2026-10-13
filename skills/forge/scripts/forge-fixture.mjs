const F = "```";

export const TODAY = "2026-10-13";

/** A fresh, valid two-asset catalog. Tests mutate their own copy. */
export function validCatalog() {
	return JSON.parse(
		JSON.stringify({
			version: 1,
			assets: [
				{
					id: "rbac-service",
					name: "RBAC Service",
					kind: "shared-service",
					summary: "Role-based access control service with an audit trail.",
					capabilities: ["Create and assign roles", "Check permissions per route"],
					keywords: ["rbac", "role", "permission", "authorization"],
					owner: "Platform team",
					version: "2.1.0",
					maturity: "stable",
					status: "active",
					releasedAt: "2026-08-01",
					interface: {
						type: "REST",
						docs: "https://forge.example.com/rbac",
						integrationGuide: "https://forge.example.com/rbac/integration",
						contract: "OpenAPI in the repository",
					},
					artifacts: [{ type: "docker-image", ref: "ghcr.io/example/rbac-service" }],
					docs: "https://forge.example.com/rbac",
					repository: "https://github.com/example/rbac-service",
					license: "MIT",
					tests: { ci: "https://github.com/example/rbac-service/actions/workflows/test.yml", coverage: "badge published by CI" },
					composesWith: ["notify-lib"],
					replacement: null,
					removalDate: null,
				},
				{
					id: "notify-lib",
					name: "Notify Library",
					kind: "library",
					summary: "Client library that dispatches email and SMS notifications.",
					capabilities: ["Send email", "Send SMS", "Template rendering"],
					keywords: ["notification", "email", "sms", "template"],
					owner: "Messaging team",
					version: "0.9.0",
					maturity: "beta",
					status: "active",
					releasedAt: "2026-09-15",
					interface: {
						type: "library API",
						docs: "https://forge.example.com/notify",
						integrationGuide: "https://forge.example.com/notify/integration",
						contract: "Typed exports of the npm package",
					},
					artifacts: [{ type: "npm-package", ref: "@example/notify" }],
					docs: "https://forge.example.com/notify",
					repository: "https://github.com/example/notify-lib",
					license: "MIT",
					tests: { ci: "https://github.com/example/notify-lib/actions/workflows/test.yml" },
					composesWith: [],
					replacement: null,
					removalDate: null,
				},
			],
		}),
	);
}

/**
 * A Think record. `bindings` replaces the whole `## Forge Asset Bindings` body.
 * `source` and `extra` shape the chosen option, `reasoning` and `reason` the Chosen Approach.
 */
export function makeThink({
	bindings = "- **forge/rbac-service@2.1.0:** Called by the route handler to create roles. No local persistence.",
	source = "Forge reuse",
	reasoning = "The Forge service is certified and versioned, so composing it avoids duplicate logic.",
	reason = null,
	approach = "Add a thin route that calls the role service for role creation.",
	problem = "Admins cannot create user roles without database access, which blocks onboarding of new teams.",
} = {}) {
	return `# Think: Add POST /roles endpoint

## Business Need & Outcome
- **Backlog Issue:** \`specs/issue-42/triage.md\`
- **Problem Statement:** ${problem}
- **Consumer:** Admin portal.
- **Desired Outcome:** Admins create a role through the API in one call.

## Options Considered

### Option 1: Selected option
- **Approach:** ${approach}
- **Source:** ${source}
- **Trade-offs:** Fastest. Couples the endpoint to the service contract.
- **Cost:** Low
- **Risk:** Low

### Option 2: Alternative
- **Approach:** Add a roles table, repository, and service inside this application.
- **Source:** Custom build
- **Trade-offs:** Full control.
- **Cost:** High
- **Risk:** Medium

## Chosen Approach
- **Selected:** Option 1
- **Reasoning:** ${reasoning}${reason === null ? "" : `\n- **Custom Build Reason:** ${reason}`}

## Forge Asset Bindings
${bindings}

## Blast Radius
- **Tier:** Medium
- **Rollback:** _None._
`;
}

export const validThink = makeThink();

export const validPlan = `# Plan: Add POST /roles endpoint

## Implementation Checklist

### Step 1: Create the role route
- **Files:** \`src/routes/role.js\`
- **Action:** Add a POST handler that validates the body and delegates to the RBAC Service client.
- **New Code:**
  ${F}js
  import { createRole } from "@example/rbac-client";
  ### Step 99: this text sits in a fence and is not a step
  ${F}
- **Verification:** \`npm test\`
- **Bootable Check:** \`node -e 'import("./src/routes/role.js")'\`
- **Serves:** AC-1

### Step 2: Mount the router
- **Files:** \`src/app.js\`
- **Action:** Mount the role router at /roles.
- **New Code:**
  ${F}js
  app.use("/roles", roleRouter);
  ${F}
- **Verification:** \`npm test\`
- **Bootable Check:** \`curl -f http://localhost:3000/health\`
- **Serves:** AC-1

## Test Plan
| Criterion | Test | Step |
|---|---|---|
| AC-1 | rbac-service is never called by tests | 1 |
`;
