---
name: spec-from-code
description: 'Extract technical specifications from existing code as Markdown files under a specs directory and validate them before treating the task as done. Use when a spec-from-code agent, documentation agent, or CI step must emit structured docs/specs (or equivalent) with purpose, inputs, outputs, side effects, and tests.'
license: MIT
---

# Spec from Code

Produce specification Markdown that a script can validate.

## When to Use This Skill

- An agent must extract specifications from source into files.
- A workflow must reject malformed spec Markdown before merge or publication.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/spec-from-code/` or `.claude/skills/spec-from-code/`, use that base path.

## Workflow

1. **Read `references/spec-contract.md` now** — it is the only source for paths, headings, fields, and limits. Do not skip this step. What to read in the codebase is owned by the calling agent.
2. Write Markdown files that follow that contract. Do not treat them as complete until the validator below has accepted them (or command execution is unavailable).
3. When command execution is available, validate from this skill's directory. Pass the specs directory as `--dir` (consumer default `docs/specs`):

```bash
node scripts/spec-docs.mjs --dir /path/to/docs/specs
```

Treat a nonzero validator exit as invalid output and fix the files rather than ignoring the errors. Prompt compliance is advisory; the validator is the enforcement boundary.

## Done When

- The validator script accepts the spec directory without errors.
