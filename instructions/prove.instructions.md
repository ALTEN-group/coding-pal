---
description: "Normative standards for the Prove validation record (prove.md) that checks and validates a pull request against its think.md, plan.md, and deterministic controls. Applies when authoring or reviewing prove.md."
applyTo: "**/prove.md"
---

# Prove Validation Standards

When authoring or validating a Prove record (`prove.md`), follow the installed `prove` skill (read its `references/prove-contract.md`) and `prove-controls` instruction.

## Phase Separation

- **Independent verification**: Prove runs in a separate session from Code so the agent that wrote the implementation does not grade its own work in the same context.
- **Deterministic controls + semantic review**: Prove combines every deterministic control with an evidence-backed semantic inspection of the pull request diff against `think.md` and `plan.md`.
- **No line-by-line syntax commentary**: Never claim or perform a line-by-line syntax review. Evaluate **Client Intent**, **Behavioral Experience**, and **Safety & Blast Radius**, plus acceptance-criteria fulfillment and control integrity.

## `prove.md` Standards

- **Header & Links**: Start with `# Prove: <Title>` and metadata fields (`Issue`, `PR`, `Think`, `Plan`, `Branch`, `Base`).
- **Deterministic Controls (`## Deterministic Controls`)**: Markdown table (`| Control | Status | Evidence |`) recording the exact exit status (`PASS`, `FAIL`, or `N/A (<reason>)`) and output summary for `validate-think`, `validate-plan`, `branch-guard`, `code-loop`, `control-guard`, `secret-guard`, `dependency-guard`, `scope-guard`, `task-gate`, `criteria-verify`, `test-probe`, `preview-smoke`, and `validate-pr`.
- **Criteria Verification (`## Criteria Verification`)**: Markdown table (`| Criterion | Implementation Evidence | Test Evidence | Status |`) covering every `AC-<n>` in `plan.md`. Cite real `file:line` implementation evidence and passing test names.
- **Semantic Review (`## Semantic Review`)**: Evaluate the three Prove dimensions against `think.md` and `plan.md`:
  - `Client Intent`: `PASS — <evidence>` or `FAIL — <evidence>` (no stubs, hardcoded shortcuts, or unfulfilled requirements).
  - `Behavioral Experience`: `PASS — <evidence>` or `FAIL — <evidence>` (user-facing flow and failure modes match `think.md`).
  - `Safety & Blast Radius`: `PASS — <evidence>` or `FAIL — <evidence>` (scope boundaries, invariants, and rollback respected).
- **Findings (`## Findings`)**: `_None._` when every check passes, or numbered `- **FINDING-<n>:** [<control or dimension>] <file>:<line> — <exact fault and required fix>` bullets when any check fails.
- **Verdict (`## Verdict`)**:
  - `- **Status:** PASS` (only when zero controls, criteria, or semantic dimensions failed and `## Findings` is `_None._`) or `- **Status:** FAIL`.
  - `- **Summary:** <concise rationale>`.
