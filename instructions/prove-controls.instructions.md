---
description: "Normative standards for the deterministic controls of the Prove stage: workflows, control and waiver configuration. Applies when editing or reviewing .github/workflows, control-guard.json, mutation-bar.json, waivers.json, or rails.json."
applyTo: "**/.github/workflows/**,**/control-guard.json,**/mutation-bar.json,**/waivers.json,**/rails.json"
---

# Prove Controls Standards

Follow the installed `control-guard`, `security-gate`, `verification-pipeline`, and `preview-smoke` skills (read their `references/` contracts).

## Controls Are Fixed

- Controls are fixed. Agents **run** them, they do not change them. Workflows, installed skills, and the control configuration files (`control-guard.json`, `mutation-bar.json`, `waivers.json`, `rails.json`) are changed only by the Architect, through a pull request.
- Never weaken a control to get a pass: no skipped or deleted tests, no lowered thresholds, no new suppressions, no removed assertions, no loosened routes or contracts.
- Never pass `--allow-path` to `control-guard` as an agent.

## Workflows

- No `continue-on-error: true`, no `|| true`, no `--no-verify`, no `if: false`, and no deleted jobs. A step that fails must fail the job.
- Run the controls from the base branch copy of `.agents/skills`, and keep workflows under CODEOWNERS.
- Agent and remediation workflows (`remediate`, `agent` in the file name) never get production credentials: no `secrets.PROD*` and no `environment: production`. Keep `permissions` minimal.

## Waivers

- A waiver's fields, matching, and expiry are defined by the `security-gate` contract. An expired or incomplete waiver fails the gate. Remove a waiver when its finding is gone.
- An agent never adds, edits, or extends a waiver. A waiver is a human risk decision, approved by a named person.

## The Bug Rule

- Every production defect results in a new automated check, committed before the fix. Commit the failing check on its own, then the fix. A commit that mixes both fails `bug-rule.mjs`.
- Prove the new check fails without the fix with the `test-probe` skill.

## Fix-Loop

- At the fix-loop limit (5) the Developer steps in. The limit is per work item and cannot be reset or raised by an agent.
