---
name: plan
description: "Turn a validated think.md record into an ordered, atomic implementation checklist with file scopes, acceptance criteria, and test plans in plan.md."
agent: Planner
argument-hint: "issue number, think.md path, or specs directory, e.g. 42 or specs/issue-42"
---

Slash command for the **Planner** agent.

## Resolve The Target

Use the first argument as the work item: an issue number (`42`, `#42`), a `think.md` path, or a specifications directory (`specs/issue-42`). Resolve it to `specs/issue-<number>/` and require `think.md` there.

If no argument is given, use the active editor file when it sits in a `specs/issue-<number>/` directory. If the target is still unclear, or `think.md` is missing or not validated, ask which work item to plan. Do not guess.

## Run

Hand the resolved work item to **Planner**. Ground strictly in the validated `think.md`, define the file scope (`In Scope`, `Out of Scope`, `Irreversible Changes`), formulate observable acceptance criteria (`AC-<n>`), break the work into ordered atomic steps (`Files`, `Action`, `Verification`, `Bootable Check`, `Serves`) without source code, map the test plan, write `specs/issue-<number>/plan.md`, and validate it with `skills/plan/scripts/validate-plan.mjs`.
