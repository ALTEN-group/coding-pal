---
name: code
description: "Implement a validated plan in step order until all checks and controls are green, then open the pull request with its record."
agent: Code Agent
argument-hint: "issue number or specs directory, optional step number, e.g. 42 or specs/issue-42 3"
---

Slash command for the **Code Agent**.

## Resolve The Target

Use the first argument as the work item: an issue number (`42`, `#42`) or a specifications directory (`specs/issue-42`). Resolve it to `specs/issue-<number>/` and require `think.md` and `plan.md` there. Treat an optional second argument as a specific step number to run.

If no argument is given, use the active editor file when it sits in a `specs/issue-<number>/` directory. If the target is still unclear, or the plan is missing, not validated, or not approved, ask which work item to code. Do not guess.

## Run

Hand the resolved work item to Code Agent. It implements the planned steps in dependency order, runs the checks and controls until green, commits on a short-lived branch, and opens the pull request with the `code` skill's PR record body once every step is done. With a step number, run only that step and stop. It never sets Human Validation. At the fix-loop limit it stops and reports for the Developer.
