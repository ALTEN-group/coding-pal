---
name: plan-fast-path
description: "Build plan.md deterministically (no AI Planner) for audit issues with Low effort, the same way Plan already synthesizes think.md for audit issues."
---

# Plan fast path

`synthesize-plan.mjs` turns an audit issue's own sections (`## Affected Files`, `## Suggested Fix`, `## Acceptance Criteria`) into a `plan.md`. `pipeline-plan.yml` runs it before the AI Planner; on success Plan skips the Planner and goes straight on to validation, the issue comment and Code.

## When it applies

Exactly two conditions: the issue has an `audit:*` label, and its effort (board Effort field, passed as `ISSUE_AI_EFFORT`) is `low`. An unset Effort field counts as medium, so it uses the AI Planner.

## Safety net

The synthesized plan is validated with the regular `validate-plan.mjs` (plus `think.md` cross-check). If it does not pass, for example because the issue has fewer than 3 or more than 8 acceptance criteria, the plan is discarded and the AI Planner runs as before. There are no other eligibility rules.

## Shape of the plan

- Step 1 applies the suggested fix to the affected files. If a test file is listed by the issue or exactly one test file matches the source file's base name, tests are covered too (an extra Step 2 when the test file was not listed).
- Each acceptance criterion is rewritten as `Given the change for issue #N is applied, then <criterion>` (the validator requires that form); AC ids are kept so the Code stage's criteria check still maps tests to criteria.
- Verification is `npm test -- <test file>` (or `npm test`); the bootable check is `npm run build` (or `npm test` without a build script).
