---
name: think
description: 'Structure, author, and validate persistent Think records (think.md) from backlog issues before planning or coding, following the Agentic Software Factory. Use when a Thinker agent or architecture session explores options, binds Forge assets, sets the blast radius, and drafts decision records, or when CI validates think.md on a ready issue.'
license: MIT
---

# Think

Produce a deterministic `think.md` (the Think record) that explores solution options, binds Forge assets, records constraints, classifies the blast radius, and captures the chosen approach before any implementation plan (`plan.md`) or code is written.

## When to Use This Skill

- A backlog issue (e.g. labeled `ready`, `todo`, or `decision:todo`, or with a `triage.md` decision of `todo`) must become a decided approach before planning.
- A GitHub Action or CI workflow must autonomously generate or validate `think.md` on an issue.

## Path Resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/think/` or `.claude/skills/think/`, use that base path.

## Workflow

1. **Read `references/think-contract.md` now.** It is the authoritative source for document structure, required headings, option fields, and validation rules. Scope exploration and architectural choices are owned by the calling `Thinker` agent (`think.agent.md`), active session, or issue trigger.
2. Author `think.md`:
   - Explore 2 to 4 options (including Forge reuse versus custom build; discover with the `forge` skill when installed, or record `Source: Custom build` with `Custom Build Reason` and `- **None:** <reason>` when no Forge catalog or matching asset exists).
   - Choose one approach with reasoning, bind Forge assets as `forge/<id>@<version>` (or `- **None:** <reason>`), trace the real codebase, record constraints, classify the blast radius, draft a decision record when a public API, schema, or boundary changes, and identify Persistent Context updates.
3. Validate with the deterministic script from this skill's directory:

```bash
# Validate think.md directly (draft stage by default: requires Approved By: Pending)
node <skill-dir>/scripts/validate-think.mjs --think /path/to/think.md

# Or validate think.md inside a specs directory
node <skill-dir>/scripts/validate-think.mjs --dir /path/to/specs

# Humans only: validate after Developer and Architect approvals are recorded
node <skill-dir>/scripts/validate-think.mjs --think /path/to/think.md --stage approved
```

Treat a nonzero validator exit as invalid specification output and fix `think.md` rather than ignoring errors. Model compliance alone is advisory; the script is the enforcement gate. After validation, record `Approved By: Automated by <agent identity> on YYYY-MM-DD`. A required decision record can be Accepted with the same automation attribution; validate it with the decision-record skill and set Think's decision Status to `Automated by <identity> on YYYY-MM-DD`. Human sign-off is optional, not mandatory at any risk tier. Never fabricate a person's signature.

4. When running in a GitHub Action or automated CI workflow:
   - Post the validated `think.md` as a non-destructive **Issue Comment** via `gh issue comment` per `references/think-contract.md`.
   - When the pipeline also persists specifications on a branch, commit `think.md` to `specs/issue-<number>/think.md` on branch `specs/issue-<number>`.

## Done When

- `validate-think.mjs` accepts `think.md` with exit code 0.
- All required contract sections and fields are populated without placeholder text.
- Required decisions are recorded and validated, and automated approvals name the automation identity and date rather than claiming human sign-off.
- When invoked in CI for an issue, the validated `think.md` is posted as an issue comment (and committed to the issue branch when branch storage is enabled).
