---
name: prove
description: "Check and validate a pull request against its think.md, plan.md, and deterministic controls, producing a validated specs/issue-<n>/prove.md report."
agent: Prove Validator
argument-hint: "issue number, pull request number, or specs directory, e.g. 42 or specs/issue-42"
---

Slash command for the **Prove Validator** agent.

## Resolve The Target

Use the first argument as the work item or pull request: an issue number (`42`, `#42`), a pull request number, or a specifications directory (`specs/issue-42`). Resolve it to `specs/issue-<number>/` and require `think.md` and `plan.md` there.

If no argument is given, resolve the issue number from the current branch name (`feature|fix|chore/issue-<n>-<slug>`) or active editor file under `specs/issue-<n>/`. If the target is still unclear, ask which work item to validate. Do not guess.

## Run

Hand the resolved work item and pull request context to **Prove Validator**. It runs the deterministic controls, reviews the pull request diff against `think.md` and `plan.md` for Client Intent, Behavioral Experience, and Safety & Blast Radius, writes `specs/issue-<number>/prove.md`, and validates it with `skills/prove/scripts/validate-prove.mjs`.
