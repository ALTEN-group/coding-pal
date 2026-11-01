---
name: control-guard
description: 'Fail a change that weakens a deterministic control (deleted or skipped tests, lowered thresholds, disabled workflow steps, edited control files, added suppressions, removed assertions, production credentials in agent workflows). Use in the Code loop, after every agent fix, and in CI on the pull request diff.'
license: MIT
---

# Control Guard

Deterministic control-integrity guard. It reads a unified diff and fails when the change weakens the checks that judge it. Agents run it, they never change it.

## When to Use This Skill

- An agent finished a change or a gate fix and must prove it did not weaken a control to get a pass.
- CI scans the pull request diff before any other control result is trusted.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`). If the skill was installed under `.agents/skills/control-guard/` or `.claude/skills/control-guard/`, use that base path.

## Workflow

1. **Read `references/control-guard-contract.md`** for the eight rules (R1 to R8) and the configuration.
2. Scan the change. Commit or stage new files first: untracked files are not scanned.

```bash
# Working tree and commits since the merge base with main
node scripts/control-guard.mjs --git origin/main

# A saved diff, or JSON output for an agent
node scripts/control-guard.mjs --diff change.diff --json
```

3. Each finding is printed as `RULE file:line message`. Treat a nonzero exit as a failure: remove the weakening (restore the test, the threshold, the step) and fix the real fault instead. Do not edit `control-guard.json`, workflows, or installed skills. Only the Architect passes `--allow-path` for a control change.
4. When a change fixes a defect or modifies existing tracked source files alongside tests, prove the new check fails without the fix with the `test-probe` skill (`test-probe.mjs`).

## Done When

- `scripts/control-guard.mjs` exits with code 0 on the final diff.
- No `--allow-path` was used by an agent, and no protected file was edited.
