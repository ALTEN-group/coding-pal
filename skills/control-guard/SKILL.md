---
name: control-guard
description: 'Fail a change that weakens a deterministic control (deleted or skipped tests, lowered thresholds, disabled workflow steps, edited control files, added suppressions, removed assertions, production credentials in agent workflows) and enforce the bug rule (the failing check is committed before the fix). Use in the Code loop, after every agent fix, and in CI on the pull request diff.'
license: MIT
---

# Control Guard

Deterministic control-integrity guard. It reads a unified diff and fails when the change weakens the checks that judge it. It also enforces the bug rule on a commit range. Agents run it, they never change it.

## When to Use This Skill

- An agent finished a change or a gate fix and must prove it did not weaken a control to get a pass.
- CI scans the pull request diff before any other control result is trusted.
- A production defect is fixed and the failing check must be committed before the fix.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`). If the skill was installed under `.agents/skills/control-guard/` or `.claude/skills/control-guard/`, use that base path.

## Workflow

1. **Read `references/control-guard-contract.md`** for the eight rules (R1 to R8), the configuration, and the bug rule.
2. Scan the change. Commit or stage new files first: untracked files are not scanned.

```bash
# Working tree and commits since the merge base with main
node scripts/control-guard.mjs --git origin/main

# A saved diff, or JSON output for an agent
node scripts/control-guard.mjs --diff change.diff --json
```

3. Each finding is printed as `RULE file:line message`. Treat a nonzero exit as a failure: remove the weakening (restore the test, the threshold, the step) and fix the real fault instead. Do not edit `control-guard.json`, workflows, or installed skills. Only the Architect passes `--allow-path` for a control change.
4. For a defect fix, check the commit order, then prove the new check fails without the fix with the `test-probe` skill:

```bash
node scripts/bug-rule.mjs --git origin/main..HEAD --defect "#123"
```

## Done When

- `scripts/control-guard.mjs` exits with code 0 on the final diff.
- For a defect fix, `scripts/bug-rule.mjs` exits with code 0: a tests-only commit precedes the first commit that changes non-test files.
- No `--allow-path` was used by an agent, and no protected file was edited.
