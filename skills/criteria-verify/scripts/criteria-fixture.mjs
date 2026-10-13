const F = "```";

export const validPlan = `# Plan: Add POST /roles endpoint

## File Scope & Boundaries
- **In Scope:** \`src/routes/role.js\`, \`tests/routes/role.test.js\`
- **Out of Scope:** \`db/\`
- **Irreversible Changes:** _None._

## Acceptance Criteria
- **AC-1:** Given an unauthenticated request to POST /roles, then the response is 401 with an empty body.
- **AC-2:** Given a user with the role viewer, when sending POST /roles, then the response is 403.
- **AC-3:** Given an admin and a valid body, when POST /roles, then the response is 201 and exactly one role is created.

## Implementation Checklist

### Step 1: Add route tests
- **Files:** \`tests/routes/role.test.js\`
- **Action:** Add Supertest cases.
- **New Code:**
  ${F}js
  it("AC-1 rejects unauthenticated requests", () => {});
  ## Test Plan
  ${F}
- **Verification:** \`npm test\`
- **Bootable Check:** \`npm start\`
- **Serves:** AC-1, AC-2, AC-3

## Test Plan
| Criterion | Test | Step |
|---|---|---|
| AC-1 | tests/routes/role.test.js: AC-1 rejects unauthenticated requests | Step 1 |
| AC-2 | tests/routes/role.test.js: AC-2 rejects viewers | Step 1 |
| AC-3 | \`tests/routes/role.test.js\`: AC-3 creates a role | Step 1 |

## Done When
- Every step is complete.
`;

export const junitPass = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="role routes" tests="4" file="tests/routes/role.test.js">
    <testcase classname="role routes" name="AC-1 rejects unauthenticated requests" time="0.01"/>
    <testcase classname="role routes" name="AC-2 rejects viewers &amp; guests" time="0.01"/>
    <testcase classname="role routes" name="AC-3 creates a role" time="0.02">
      <system-out><![CDATA[</testcase> noise]]></system-out>
    </testcase>
    <testcase classname="role routes" name="health check responds" time="0.01"/>
  </testsuite>
</testsuites>
`;

export function jestJson(assertions, file = "/work/repo/tests/routes/role.test.js") {
	return JSON.stringify({
		numTotalTests: assertions.length,
		testResults: [
			{
				name: file,
				status: assertions.some((a) => a[1] === "failed") ? "failed" : "passed",
				assertionResults: assertions.map(([title, status]) => ({
					ancestorTitles: ["role routes"],
					title,
					fullName: `role routes ${title}`,
					status,
				})),
			},
		],
	});
}

export const jestPass = jestJson([
	["AC-1 rejects unauthenticated requests", "passed"],
	["AC-2 rejects viewers", "passed"],
	["AC-3 creates a role", "passed"],
]);
