---
name: plan
description: 'Structure, author, and validate persistent Plan records (plan.md) derived from a validated think.md before agents write code, following the Agentic Software Factory. Use when a Planner agent or planning session defines file scope, acceptance criteria, and ordered atomic implementation steps with their code, or when CI validates plan readiness on an issue.'
license: MIT
---

# Plan

Produce a deterministic `plan.md` (the Plan record) grounded strictly in a validated `think.md`, defining the file scope, observable acceptance criteria, ordered atomic implementation steps with their code, a test plan, and a blast radius check that AI build agents can execute without ambiguity or error compounding.

## When to Use This Skill

- A validated `think.md` must become a file scope, acceptance criteria, and an atomic implementation checklist with the code for each step (`plan.md`).
- A GitHub Action, CI workflow, or Coding Agent must validate `plan.md` (and cross-check it against `think.md`) before triggering build steps.

## Path Resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/plan/` or `.claude/skills/plan/`, use that base path.

## Workflow

1. **Read `references/plan-contract.md` now.** It is the authoritative source for document structure, required headings, step schemas, cross-check rules, and validation rules. Scope and sequencing choices are owned by the calling `Planner` agent (`plan.agent.md`), active planning session, or issue trigger.
2. Author `plan.md` grounded strictly in the validated `think.md`:
   - Define `In Scope`, `Out of Scope`, and `Irreversible Changes` (`Step <N> reverses Step <M>` when a migration is touched).
   - Reference `think.md` in `## Prerequisites & Context` and add at least one more line (dependencies, environment variables, services, or `- None.`).
   - Write 3 to 8 observable `Given ..., then ...` acceptance criteria (`AC-1`, `AC-2`, ...).
   - Sequence ordered atomic steps (`### Step <N>: <Name>`), each with `Files`, `Action`, `New Code`, `Verification`, `Bootable Check`, and `Serves`.
   - Map every acceptance criterion in the `## Test Plan` table, record open questions/assumptions, verify the blast radius check against `think.md`, and leave `- **Approved By:** Pending` in `## Approval`.
3. Validate with the deterministic script from this skill's directory:

```bash
# Validate plan.md and cross-check against think.md in the same specs directory
node <skill-dir>/scripts/validate-plan.mjs --dir /path/to/specs

# Or validate plan.md directly (optionally passing --think for cross-checking)
node <skill-dir>/scripts/validate-plan.mjs --plan /path/to/plan.md --think /path/to/think.md
node <skill-dir>/scripts/validate-plan.mjs --plan /path/to/plan.md --allow-open-questions   # for a draft with open questions

# Humans / Coding Agent gate: validate after Developer (and Architect) approvals are recorded
node <skill-dir>/scripts/validate-plan.mjs --dir /path/to/specs --stage approved
```

Treat a nonzero validator exit as invalid specification output and fix `plan.md` rather than ignoring errors. Model compliance alone is advisory; the script is the enforcement gate. `plan.md` carries `- **Approved By:** Pending` in the last `## Approval` section until a Developer records their name and date; `--stage approved` checks it (and verifies `think.md` is approved first when cross-checking). The AI never approves.

4. When running in a GitHub Action or automated CI workflow:
   - Post the validated `plan.md` as a non-destructive **Issue Comment** via `gh issue comment` per `references/plan-contract.md`.
   - When the pipeline also persists specifications on a branch, commit `plan.md` to `specs/issue-<number>/plan.md` on branch `specs/issue-<number>` and apply the issue label `specs:ready`. The plan still needs the Developer's approval before Code starts.

## Done When

- `validate-plan.mjs` accepts `plan.md` with exit code 0 (and the cross-check against `think.md` passes).
- All required contract sections and step fields are populated without placeholder text.
- `Approved By` stays `Pending` until a person approves.
- When invoked in CI for an issue, the validated `plan.md` is posted as an issue comment (and committed to the issue branch when branch storage is enabled).
