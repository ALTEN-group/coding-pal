---
description: "Normative standards for the Prove stage, its deterministic controls, and the Prove validation record (prove.md). Applies when authoring or reviewing prove.md, .github/workflows, or control-guard.json."
applyTo: "**/specs/**/prove.md,**/.github/workflows/**,**/control-guard.json"
---

# Prove Stage & Controls Standards

When authoring or validating a Prove record (`prove.md`), or editing workflows and control configuration, follow the installed `prove` skill (read its `references/prove-contract.md` and control contracts in `references/`).

## Phase Separation

- **Independent verification**: Prove runs in a separate session from Code so the agent that wrote the implementation does not grade its own work in the same context.
- **Deterministic controls + semantic review**: Prove combines every deterministic control (`control-guard`, `secret-guard`, `dependency-guard`, `scope-guard`, `task-gate`, `criteria-verify`, `test-probe`, `preview-smoke`) with an evidence-backed semantic inspection of the pull request diff against `think.md` and `plan.md`.
- **No line-by-line syntax commentary**: Never claim or perform a line-by-line syntax review. Evaluate **Client Intent**, **Behavioral Experience**, and **Safety & Blast Radius**, plus acceptance-criteria fulfillment and control integrity.

## Controls Are Fixed

- Controls are fixed. Agents **run** them, they do not change them. Workflows, installed skills, and control configuration files (`control-guard.json`) are changed only by the Architect, through a pull request.
- Never weaken a control to get a pass: no skipped or deleted tests, no lowered thresholds, no new suppressions, no removed assertions, no loosened routes or contracts.
- Never pass `--allow-path` to `control-guard` as an agent.

## Workflows

- No `continue-on-error: true`, no `|| true`, no `--no-verify`, no `if: false`, and no deleted jobs. A step that fails must fail the job.
- Run the controls from the base branch copy of `.agents/skills`, and keep workflows under CODEOWNERS.
- Agent and remediation workflows (`remediate`, `agent` in the file name) never get production credentials: no `secrets.PROD*` and no `environment: production`. Keep `permissions` minimal.

## The Bug Rule & Fix-Loop

- **The Bug Rule**: Every production defect results in a new automated check verified against the base branch with `test-probe.mjs` (`tests` fail when `src/` changes are reverted to the base branch and pass with the fix).
- **Fix-Loop Limit**: At the fix-loop limit (5) the Developer steps in. The limit is per work item and cannot be reset or raised by an agent.

## `prove.md` Standards

- **Header & Links**: Start with `# Prove: <Title>` and metadata fields (`Issue`, `PR`, `Think`, `Plan`, `Branch`, `Base`).
- **Deterministic Controls (`## Deterministic Controls`)**: Markdown table (`| Control | Status | Evidence |`) recording the exact exit status (`PASS`, `FAIL`, or `N/A (<reason>)`) and output summary for `control-guard`, `secret-guard`, `dependency-guard`, `scope-guard`, `task-gate`, `criteria-verify`, `test-probe`, and `preview-smoke`.
- **Criteria Verification (`## Criteria Verification`)**: Markdown table (`| Criterion | Implementation Evidence | Test Evidence | Status |`) covering every `AC-<n>` in `plan.md`. Cite real `file:line` implementation evidence and passing test names.
- **Semantic Review (`## Semantic Review`)**: Evaluate the three Prove dimensions against `think.md` and `plan.md`:
  - `Client Intent`: `PASS — <evidence>` or `FAIL — <evidence>` (no stubs, hardcoded shortcuts, or unfulfilled requirements).
  - `Behavioral Experience`: `PASS — <evidence>` or `FAIL — <evidence>` (user-facing flow and failure modes match `think.md`).
  - `Safety & Blast Radius`: `PASS — <evidence>` or `FAIL — <evidence>` (scope boundaries, invariants, and rollback respected).
- **Findings (`## Findings`)**: `_None._` when every check passes, or numbered `- **FINDING-<n>:** [<control or dimension>] <file>:<line> — <exact fault and required fix>` bullets when any check fails.
- **Verdict (`## Verdict`)**:
  - `- **Status:** PASS` (only when zero controls, criteria, or semantic dimensions failed and `## Findings` is `_None._`) or `- **Status:** FAIL`.
  - `- **Summary:** <concise rationale>`.
