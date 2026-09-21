import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ValidationError,
	validatePlanContent,
	validateThinkContent,
} from "./validate-specs.mjs";

const validThink = `# Think: Add POST /roles endpoint

## Business Need & Outcome
- **Problem Statement:** Clients need to create new user roles dynamically without database access.
- **Consumer:** Admin portal and role-based access control engine.
- **Desired Outcome:** POST /roles accepts a role name and permissions, returning 201 Created with the role entity.

## System Flow & Responsibilities
- Request flows from Express router -> role controller -> role service -> PostgreSQL role entity.
- Router mounts at /roles with authorization middleware.
- Service performs existence validation and delegates persistence.

## Invariants & Guardrails
- Roles cannot have duplicate names.
- Database soft-delete and timestamp audit triggers must remain active.
- Existing /routes endpoints must not be modified or refactored.

## Minimal Change Scope
- **Files to Add:** \`src/routes/role.js\`, \`src/services/role.js\`.
- **Files to Modify:** \`src/app.js\` (mount router).
- **Excluded:** No modifications to existing route handlers or database migrations.

## Ambiguities & Open Questions
_None._
`;

const validPlan = `# Plan: Add POST /roles endpoint

## Prerequisites & Context
- Reference: \`specs/roles/think.md\`.
- PostgreSQL container is running on port 5432.
- Environment variables loaded from \`.env\`.

## Implementation Checklist

### Step 1: Create role service
- **Files:** \`src/services/role.js\`
- **Action:** Implement createRole method with existence validation.
- **Verification:** \`npm test -- tests/services/role.test.js\`
- **Bootable Check:** \`node -e 'import("./src/services/role.js")'\`

### Step 2: Create role router and mount in app
- **Files:** \`src/routes/role.js\`, \`src/app.js\`
- **Action:** Add POST / handler and mount router in src/app.js with send204 middleware.
- **Verification:** \`npm test -- tests/routes/role.test.js\`
- **Bootable Check:** \`node -e 'import("./src/app.js")'\`

## Done When
- All checklist steps are executed and verified.
- \`npm test\` passes with exit code 0.
- Application starts cleanly without errors.
`;

test("validates compliant think.md content", () => {
	const result = validateThinkContent(validThink, "think.md");
	assert.equal(result.title, "Add POST /roles endpoint");
});

test("rejects think.md missing required H2 headings", () => {
	const invalid = validThink.replace("## Invariants & Guardrails\n", "");
	assert.throws(
		() => validateThinkContent(invalid, "think.md"),
		(err) => err instanceof ValidationError && /must contain exactly 5 level-two headings/.test(err.message),
	);
});

test("rejects think.md with empty sections", () => {
	const emptySection = validThink.replace(
		"## Invariants & Guardrails\n- Roles cannot have duplicate names.\n- Database soft-delete and timestamp audit triggers must remain active.\n- Existing /routes endpoints must not be modified or refactored.",
		"## Invariants & Guardrails",
	);
	assert.throws(
		() => validateThinkContent(emptySection, "think.md"),
		(err) => err instanceof ValidationError && /empty section for "## Invariants & Guardrails"/.test(err.message),
	);
});

test("validates compliant plan.md content", () => {
	const result = validatePlanContent(validPlan, "plan.md");
	assert.equal(result.title, "Add POST /roles endpoint");
	assert.equal(result.steps.length, 2);
	assert.equal(result.steps[0].name, "Create role service");
	assert.equal(result.steps[1].name, "Create role router and mount in app");
});

test("rejects plan.md with non-sequential step numbering", () => {
	const invalidSteps = validPlan.replace("### Step 2:", "### Step 3:");
	assert.throws(
		() => validatePlanContent(invalidSteps, "plan.md"),
		(err) => err instanceof ValidationError && /step numbers must be sequential/.test(err.message),
	);
});

test("rejects plan.md step missing Bootable Check field", () => {
	const missingField = validPlan.replace(
		"- **Bootable Check:** `node -e 'import(\"./src/services/role.js\")'`\n",
		"",
	);
	assert.throws(
		() => validatePlanContent(missingField, "plan.md"),
		(err) => err instanceof ValidationError && /missing or empty required field "- \*\*Bootable Check:\*\*"/.test(err.message),
	);
});

test("rejects plan.md if Prerequisites & Context does not reference think.md", () => {
	const missingPrereqRef = validPlan.replace(
		"- Reference: `specs/roles/think.md`.\n",
		"",
	);
	assert.throws(
		() => validatePlanContent(missingPrereqRef, "plan.md"),
		(err) => err instanceof ValidationError && /must reference the think\.md specification it is derived from/.test(err.message),
	);
});
