---
name: think-plan
description: 'Structure, author, and validate persistent Think and Plan records (think.md and plan.md) from backlog issues before agents write code, following the Agentic Software Factory. Use when a Think Planner agent or planning session explores options, binds Forge assets, sets the blast radius, and sequences atomic implementation steps with their code, or when CI validates specification readiness on an issue.'
license: MIT
---

# Think & Plan

Produce deterministic `think.md` (the Think record) and `plan.md` (the Plan record) that AI build agents can consume without ambiguity, error compounding, or token waste.

## When to Use This Skill

- A backlog issue (ideally with a `triage.md` decision of `todo`) must become a decided approach before planning (Phase 1: Think).
- A validated `think.md` must become a file scope, acceptance criteria, and an atomic implementation checklist with the code for each step (Phase 2: Plan).
- A GitHub Action or CI workflow must autonomously generate or validate specifications before triggering build agents.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/think-plan/` or `.claude/skills/think-plan/`, use that base path.

## Workflow

1. **Read `references/think-plan-contract.md` now.** It is the authoritative source for document structure, required headings, step schemas, and validation rules. Scope exploration and architectural choices are owned by the calling `Think Planner` agent, active planning session, or issue trigger.
2. Execute the appropriate phase:
   - **Phase 1 (Think)**: Explore 2 to 4 options (including Forge reuse versus custom build; discover with the `forge` skill), choose one, bind Forge assets as `forge/<id>@<version>`, trace the real codebase, record constraints, classify the blast radius, draft a decision record when a public API, schema, or boundary changes, and identify Persistent Context updates. Validate with `node scripts/validate-specs.mjs --think <path/to/think.md>`.
   - **Phase 2 (Plan)**: Ground strictly in the validated `think.md`. Define the file scope, acceptance criteria, ordered atomic steps (each with Files, Action, New Code, Verification, Bootable Check, Serves), the test plan, open questions, and the blast radius check. Validate with `node scripts/validate-specs.mjs --plan <path/to/plan.md>`.
3. Validate with the deterministic script from this skill's directory:

```bash
# Validate both records and cross-check them (tier, Persistent Context updates)
node scripts/validate-specs.mjs --dir /path/to/specs

# Or validate individual specification artifacts directly
node scripts/validate-specs.mjs --think /path/to/think.md
node scripts/validate-specs.mjs --plan /path/to/plan.md   # add --allow-open-questions for a draft plan
node scripts/validate-specs.mjs --dir /path/to/specs --stage approved   # humans only: after the named approvals are recorded
```

Treat a nonzero validator exit as invalid specification output and fix the file rather than ignoring errors. Model compliance alone is advisory; the script is the enforcement gate. `plan.md` must reference `think.md` in its `## Prerequisites & Context` and add at least one more line (dependencies, environment variables, services, or `- None.`). A decision record is `Drafted`, or `Signed by <name> (Architect) on YYYY-MM-DD` with a person's name. Both files carry `- **Approved By:** Pending` (`## Chosen Approach` in `think.md`, the last `## Approval` section in `plan.md`) until a Developer and an Architect (Think) or a Developer (Plan) record their name and date; `--stage approved` checks it (see the contract's Approval Stages). The AI never approves.

4. When running in a GitHub Action or automated CI workflow:
   - Commit validated files to `specs/issue-<number>/` on branch `specs/issue-<number>`.
   - Post the specifications as an **Issue Comment** via `gh issue comment` with collapsible `<details>` tags per `references/think-plan-contract.md`.
   - Apply the issue label `specs:ready`. A drafted decision record still needs the Architect's signature, and the plan still needs the Developer's approval.

## Done When

- The validator script accepts `think.md` and/or `plan.md` with exit code 0 (and the cross-check passes when both exist).
- All required contract sections and fields are populated without placeholder text.
- Any decision record is `Drafted`, never signed by the AI, and both `Approved By` fields stay `Pending` until a person approves.
- When invoked in CI for an issue, specifications are committed to the issue branch and posted as an issue comment.
