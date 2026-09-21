---
name: think-plan
description: 'Structure, author, and validate persistent specification artifacts (think.md and plan.md) from business needs before agents write code. Use when a Think Planner agent or planning session creates architectural analysis or phased implementation checklists, or when CI validates specification readiness on issue creation.'
license: MIT
---

# Think & Plan

Produce deterministic `think.md` and `plan.md` specification artifacts that AI build agents can consume without ambiguity, error compounding, or token waste.

## When to Use This Skill

- A business need, user story, issue, or RFC must be transformed into an architectural analysis (`think.md`) before implementation (Phase 1: Think).
- An existing, validated architectural specification (`think.md`) must be translated into an atomic, phased implementation checklist (`plan.md`) with explicit verification commands and bootability checks (Phase 2: Plan).
- A GitHub Action or CI workflow triggered on issue creation must autonomously generate or validate specifications before triggering build agents.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/think-plan/` or `.claude/skills/think-plan/`, use that base path.

## Workflow

1. **Read `references/think-plan-contract.md` now** — it is the authoritative source for document structure, required headings, step schemas, and verification invariants. Scope exploration and architectural choices are owned by the calling `Think Planner` agent, active planning session, or issue trigger.
2. Execute the appropriate phase:
   - **Phase 1 (Think)**: Analyze business needs and inspect the codebase to author `think.md` (capturing business outcome, system request flow, component responsibilities, invariants, and minimal change scope). Validate with `node scripts/validate-specs.mjs --think <path/to/think.md>`.
   - **Phase 2 (Plan)**: Ground strictly in the validated `think.md`. Translate its minimal change scope and invariants into an ordered sequence of atomic steps in `plan.md` with explicit files, surgical actions, narrowest verification commands, and bootability checks. Validate with `node scripts/validate-specs.mjs --plan <path/to/plan.md>`.
3. Validate specifications using the deterministic script from this skill's directory:

```bash
# Validate both think.md and plan.md in a specifications directory
node scripts/validate-specs.mjs --dir /path/to/specs

# Or validate individual specification artifacts directly
node scripts/validate-specs.mjs --think /path/to/think.md
node scripts/validate-specs.mjs --plan /path/to/plan.md
```

Treat a nonzero validator exit as invalid specification output and remediate the file formatting rather than ignoring errors. Model compliance alone is advisory; the deterministic script is the enforcement gate. Note that `plan.md` requires a reference to `think.md` in its `## Prerequisites & Context`.
4. When running in a GitHub Action or automated CI workflow:
   - Commit validated files to `specs/issue-<number>/` on branch `specs/issue-<number>`.
   - Post the specifications as an **Issue Comment** via `gh issue comment` with collapsible `<details>` tags per `references/think-plan-contract.md`.
   - Apply the issue label `specs:ready`.

## Done When

- The validator script accepts `think.md` and/or `plan.md` with exit code 0.
- All required contract sections and fields are populated without placeholder text or omitted sections.
- When invoked in CI for an issue, specifications are committed to the issue branch and posted as an issue comment.
