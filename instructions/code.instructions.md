---
description: "Normative standards for the Code stage and the pull request record (pr.md). Applies when implementing a validated plan or authoring/reviewing pull request records and templates."
applyTo: "**/pr.md,**/pull_request_template.md,**/PULL_REQUEST_TEMPLATE.md"
---

# Code Stage Standards

When implementing a validated plan or writing a pull request record, follow the installed `code` skill (read its `references/code-contract.md`).

## Roles

- **AI implements.** Agents generate the code, tests, and documentation from the validated plan.
- **Developers supervise, they do not write manual code.** Hand-crafting code in an IDE bypasses Persistent Context. The Developer steps in only at the fix-loop limit.
- **Prove validates independently.** Code leaves legacy Human Validation fields Pending; Prove records explicitly automated results after its checks pass. Never fabricate human sign-off.

## Plan Execution

- Start from a validated plan with explicit `Automated by <identity> on YYYY-MM-DD` approval, or an actual human approval when requested. No mandatory human gate applies at any risk tier.
- Follow the steps in `plan.md` in dependency order. Apply each step's `Action`, adjusted only to fit the repository, and report any divergence. Write only the step's `Files`.
- Run the checks and controls before completing: build, type check, linter, tests, `task-gate`, `scope-guard`, `secret-guard`, `dependency-guard`, `control-guard`, `test-probe`, `criteria-verify`, and `preview-smoke` when applicable. Never weaken, skip, or edit a control to get green.
- Do not edit `plan.md` after Code starts. A changed plan requires revalidation and renewed approval through a new plan run.

## Green Before PR

- Never open a pull request with a failing build, type error, lint failure, failing test, or failing control.
- The fix-loop limit is 5 attempts per work item. More than 3 attempts means the plan was too big or too vague: tell the Developer. At the limit, stop.
- Tests are generated alongside the code from the plan's acceptance criteria, never retrofitted. Each test name or title carries its `AC-<n>` id.

## Context Is the Steering Wheel

- When an agent misunderstands a pattern or writes code that conflicts with Persistent Context, update the context (instructions, specifications, glossary), not the code. The agent records a context correction suggestion and stops.
- Follow the stack instructions of the files you change.

## Dependencies

- A new dependency must be declared in the plan and in the pull request's `## Dependencies` with its security and licensing evaluation. `dependency-guard` must pass.

## Branches

- Agents use short-lived branches named `feature|fix|chore/issue-<n>-<slug>` created from `main` or `develop`, and never commit to `main`, `develop`, or `release/*`.
- A branch older than 5 days is a long-running branch and is forbidden (`branch-guard.mjs` must pass).

## Pull Request Record

- Fill the pull request body that `code` defines, and validate it with `validate-pr.mjs --stage code` before opening it.
- Every acceptance criterion from the plan has a test and a `Passing` status. The tier and rollback match `think.md`.
- At the Code stage every Human Validation field is `Pending`. Never claim a line-by-line review: it is banned as a gate.
- Never include secrets, credentials, or customer data in the pull request.
