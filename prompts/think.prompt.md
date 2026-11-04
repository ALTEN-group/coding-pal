---
name: think
description: "Explore solution options, bind Forge assets, classify blast radius, and produce a validated think.md record from a prioritized backlog issue or triage record."
agent: Thinker
argument-hint: "issue number, triage path, or specs directory, e.g. #42 or specs/issue-42"
---

Slash command for the **Thinker** agent.

## Resolve The Target

Use the first argument as the work item: an issue number (`42`, `#42`), a `triage.md` path, or a specifications directory (`specs/issue-42`). Resolve it to `specs/issue-<number>/`.

If no argument is given, use the active editor file when it sits in a `specs/issue-<number>/` directory or holds a backlog issue or triage record. If the target is still unclear, ask which issue or need to explore. Do not guess.

## Run

Hand the resolved target to **Thinker**. If `specs/issue-<number>/triage.md` exists, validate it at the `final` stage and proceed only when `Final (PO)` is `todo`; otherwise derive the need from the issue title, number, and body. Explore 2 to 4 options, bind Forge assets when applicable, classify the blast radius, record any required decision under `docs/decisions/`, write `specs/issue-<number>/think.md` without source code, and validate it with `skills/think/scripts/validate-think.mjs`.
