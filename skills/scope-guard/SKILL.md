---
name: scope-guard
description: 'Assert that code modifications stay strictly within authorized path bounds and diff churn limits, preventing accidental file contamination and unbounded refactorings. Use when an agent completes a surgical code edit, before committing code, or during CI PR gating.'
license: MIT
---

# Scope Guard

Deterministically enforce blast-radius bounds, forbidden path rules, and diff churn limits before committing changes or concluding an agent task.

## When to Use This Skill

- An AI coding agent has completed a surgical change (e.g. `audit-fix`, `unit-test`) and must verify no out-of-scope files or lockfiles were contaminated.
- A workflow or harness hook needs to mechanically assert that git modifications remain bounded within a defined subfolder or module.
- CI/CD pipelines need a fast, deterministic check to reject PRs that exceed churn thresholds or touch protected files.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder containing this `SKILL.md`). In APM consumer projects, this typically resolves to `.agents/skills/scope-guard/` or `.claude/skills/scope-guard/`.

## Workflow

1. **Read `references/guard-contract.md`** for invariant definitions, forbidden file defaults, and exit codes.
2. After making code changes, run the deterministic validator:

```bash
# Check current git repository against authorized scopes
node scripts/scope-guard.mjs --git --scope "src/auth/**" --scope "tests/auth/**"

# Enforce churn thresholds (max lines added / deleted)
node scripts/scope-guard.mjs --git --scope "src/**" --max-additions 80 --max-deletions 40

# Check explicit files or inspect JSON diagnostics
node scripts/scope-guard.mjs --file "src/auth/service.js" --scope "src/auth/**" --json
```

3. Treat a nonzero exit code as a scope violation. If forbidden files were touched or scope was breached:
   - Revert unauthorized files: `git checkout -- <unauthorized-file>`.
   - Remove newly created untracked files: `rm <unauthorized-file>`.
   - Re-run the validator until it exits with code 0.

## Done When

- `scripts/scope-guard.mjs` exits with code 0.
- All touched files reside strictly within the permitted `scope` patterns.
- No forbidden files (`*.lock`, `*-lock.json`, `.env*`) have been modified or created.
