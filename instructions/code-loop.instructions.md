---
description: "Normative standards for the Code stage: loop progress (progress.json) and the pull request record. Applies when authoring, reviewing, or consuming progress.json files and pull request templates."
applyTo: "**/specs/**/progress.json,**/pull_request_template.md,**/PULL_REQUEST_TEMPLATE.md"
---

# Code Stage Standards

When driving Code or writing a pull request, follow the installed `code-loop` skill (read its `references/code-loop-contract.md`) and the `pr-record` skill (read its `references/pr-record-contract.md`).

## Roles

- **AI implements.** Agents generate the code, tests, and documentation from the validated plan.
- **Developers supervise, they do not write manual code.** Hand-crafting code in an IDE bypasses Persistent Context. The Developer steps in only at the fix-loop limit.
- **People validate in Prove.** An agent never sets a Human Validation field.

## The Loop

- Work one plan step per turn, in plan order, through `code-loop` (`next`, `start`, `pass`, `fail`). Record completion in `progress.json`, never in `plan.md`. Never attempt to implement multiple steps (e.g. logic, tests, and documentation simultaneously) in a single turn.
- Apply the step's `New Code`, adjusted only to fit the repository, and report any divergence. Write only the step's `Files`.
- Run the checks and controls after every step: build, type check, linter, tests, `scope-guard`, `secret-guard`, `dependency-guard`, and any installed control. Never weaken, skip, or edit a control to get green.
- Do not edit `plan.md` after approval. A changed plan stops the loop until the Developer re-approves it.
- `progress.json` is written only by `code-loop.mjs`. Never edit, delete, or reset it by hand; `check-history` in CI compares it with the base branch and its history.
- Start only from a plan approved by a named Developer: `code-loop` refuses otherwise (see the contract).

## Green Before PR

- Never open a pull request with a failing build, type error, lint failure, failing test, or failing control.
- The fix-loop limit is 5 attempts per work item and cannot be reset by the agent. More than 3 attempts means the plan was too big or too vague: tell the Developer. At the limit, stop.
- Tests are generated alongside the code from the plan's acceptance criteria, never retrofitted. Each test name or title carries its `AC-<n>` id.

## Context Is the Steering Wheel

- When an agent misunderstands a pattern or writes code that conflicts with Persistent Context, update the context (instructions, specifications, glossary), not the code. The agent records a context correction suggestion and stops.
- Follow the stack instructions of the files you change.

## Dependencies

- A new dependency must be declared in the plan and in the pull request's `## Dependencies` with its security and licensing evaluation. `dependency-guard` must pass.

## Branches

- Agents use short-lived branches named `feature|fix|chore/issue-<n>-<slug>` created from `main` or `develop`, and never commit to `main`, `develop`, or `release/*`.
- A branch older than 5 days is a long-running branch and is forbidden. Check with `branch-guard`.

## Pull Request Record

- Fill the pull request body that `pr-record` defines, and validate it with `--stage code` before opening it.
- Every acceptance criterion from the plan has a test and a `Passing` status. The tier and rollback match `think.md`.
- At the Code stage every Human Validation field is `Pending`. Never claim a line-by-line review: it is banned as a gate.
- Never include secrets, credentials, or customer data in the pull request.
