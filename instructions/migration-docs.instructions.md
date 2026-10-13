---
description: "Normative standards for infrastructure migration documentation (assessment.md, migration-plan.md, runbook.md). Applies when authoring, reviewing, or executing from files under docs/migration/."
applyTo: "**/docs/migration/**/*.md"
---

# Migration Documentation Standards

When authoring or validating migration records, follow the installed `migration-docs` skill (read its `references/migration-contract.md`).

## Sequence

- **Strict order**: `assessment.md`, then `migration-plan.md`, then `runbook.md`. Never write a record from an unvalidated predecessor, and never re-open an earlier record's decision from a later one.
- **Source and target are neutral**: On-premise to cloud is the common case, not the only one. Name the real source and target.

## Minimal Application Change

- **Infrastructure absorbs the difference first**: network route, DNS, proxy, VPN or private link, wire-compatible managed service, sidecar. Change configuration next, build and packaging after that, and code last.
- **Declare the Change Budget** (`none`, `config-only`, `minimal-code`) in the assessment and stay inside it.
- **Every change is registered** with the reason the infrastructure side could not cover it. An unregistered change is a defect in the plan.
- **Prefer `Rehost` and `Relocate`.** `Replatform` only when it removes operations work without code change. `Refactor` needs a drafted decision record.

## Evidence and Safety

- **Ground in reality**: Every inventory row cites a path, manifest, or `Interview: <role>`. Never hallucinate components, versions, or sizes. Put unknowns in the open-questions section.
- **No secret values**: Record the secret's name and where it lives, never the value.
- **Documents only**: Writing migration records never modifies application code, infrastructure-as-code, or pipelines.

## Plan and Runbook Rules

- **Waves follow dependencies**: A component never moves before a migrated component it depends on.
- **Data is explicit**: Every migrated database or storage component has a method, a sync mode, and an integrity check.
- **Rollback is designed in**: Every wave has a trigger, a rollback action, and a data reconciliation. Name the point of no return, or `None`.
- **Observable validation**: Each wave has checks with a criterion that passes or fails without judgement.
- **Runbook steps are atomic**: One action per step with owner, verification, rollback, and duration. A step without a rollback is allowed only after the declared point of no return.
- **Human gates**: The Architect decides the strategy and the Change Budget. DevOps approves the cutover window and the go/no-go. A drafted decision record stays unsigned.
