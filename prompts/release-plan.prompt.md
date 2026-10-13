---
name: release-plan
description: "Draft the release declaration (release.md) for one change from its think.md, plan.md, and Triage hypothesis, with rollout stages, thresholds, rollback, and the outcome metric, for DevOps to approve."
agent: Release Planner
argument-hint: "issue number or specs directory, e.g. #42 or specs/issue-42"
---

Slash command for the **Release Planner** agent.

## Resolve The Target

Use the first argument as the work item: an issue number (`#42`), or a `specs/issue-<number>` directory. Treat any remaining arguments as extra context, such as the intended version or the observability metric names.

If no argument is given, use the active editor file when it sits inside a `specs/issue-<number>/` directory. If the work item is still unclear, or `think.md` and `plan.md` are missing, ask which change to release. Do not guess, and never combine several issues into one release.

## Run

Hand the resolved work item to Release Planner. Write `release.md` in the work item directory and validate it with the `release-plan` skill, cross-checked against `think.md` and `plan.md`. Report the decisions DevOps must make. Do not deploy, tag, or touch a flag.
