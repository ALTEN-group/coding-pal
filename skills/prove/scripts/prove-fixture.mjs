import { REQUIRED_CONTROLS } from "./validate-prove.mjs";

export function plan({ criteria = ["AC-1", "AC-2", "AC-3"] } = {}) {
	const acLines = criteria
		.map((ac, i) => `- **${ac}:** Criterion ${i + 1} is satisfied with observable behavior.`)
		.join("\n");
	return `# Plan: Add role endpoint

- **Issue:** #42
- **Think:** \`specs/issue-42/think.md\`

## Summary
Add the role endpoint and tests.

## Acceptance Criteria
${acLines}
`;
}

export function think() {
	return `# Think: Add role endpoint

- **Issue:** #42

## Problem
Users need a role endpoint.
`;
}

export function prove({
	title = "Add role endpoint",
	issue = "#42",
	pr = "#19",
	thinkLink = "`specs/issue-42/think.md`",
	planLink = "`specs/issue-42/plan.md`",
	branch = "`feature/issue-42-add-role`",
	base = "`main`",
	controlOverrides = {},
	extraControls = [],
	omitControls = [],
	criteria = [
		["AC-1", "`src/routes/role.js` handles unauthenticated requests", "`tests/role.test.js` verifies 401 response", "PASS"],
		["AC-2", "`src/routes/role.js` updates role in store", "`tests/role.test.js` verifies 200 and updated role", "PASS"],
		["AC-3", "`src/routes/role.js` rejects unknown roles", "`tests/role.test.js` verifies 400 validation error", "PASS"],
	],
	semantic = {
		"Client Intent": "PASS — The endpoint solves the problem framed in think.md without scope drift.",
		"Behavioral Experience": "PASS — Authenticated, unauthenticated, and invalid role inputs return clear responses.",
		"Safety & Blast Radius": "PASS — Scoped strictly to role route and tests; Medium blast radius holds.",
	},
	findings = "_None._",
	verdictStatus = "PASS",
	verdictSummary = "All 13 deterministic controls, 3 acceptance criteria, and all semantic review dimensions passed.",
} = {}) {
	const controlRows = REQUIRED_CONTROLS.filter((c) => !omitControls.includes(c)).map((c) => {
		const override = controlOverrides[c];
		const status = override?.status ?? "PASS";
		const evidence = override?.evidence ?? `${c} verified cleanly on the branch.`;
		return `| \`${c}\` | ${status} | ${evidence} |`;
	});
	for (const [c, status, evidence] of extraControls) {
		controlRows.push(`| \`${c}\` | ${status} | ${evidence} |`);
	}

	const criteriaRows = criteria.map(([ac, impl, testEv, status]) => `| ${ac} | ${impl} | ${testEv} | ${status} |`);
	const semanticLines = Object.entries(semantic).map(([k, v]) => `- **${k}:** ${v}`);

	return `# Prove: ${title}

- **Issue:** ${issue}
- **PR:** ${pr}
- **Think:** ${thinkLink}
- **Plan:** ${planLink}
- **Branch:** ${branch}
- **Base:** ${base}

## Deterministic Controls
| Control | Status | Evidence |
|---|---|---|
${controlRows.join("\n")}

## Criteria Verification
| Criterion | Implementation Evidence | Test Evidence | Status |
|---|---|---|---|
${criteriaRows.join("\n")}

## Semantic Review
${semanticLines.join("\n")}

## Findings
${findings}

## Verdict
- **Status:** ${verdictStatus}
- **Summary:** ${verdictSummary}
`;
}

export function context(overrides = {}) {
	return {
		stage: "draft",
		planText: plan(),
		thinkText: think(),
		issue: "42",
		linkExists: () => true,
		linkIsWorkItemFile: (rel, file) => rel === `specs/issue-42/${file}`,
		...overrides,
	};
}
