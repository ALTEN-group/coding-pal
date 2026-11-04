---
name: prove
description: 'Execute the 8 deterministic Prove controls (control-guard, secret-guard, dependency-guard, scope-guard, task-gate, criteria-verify, test-probe, preview-smoke) and author/validate the Prove verification record (prove.md) with semantic review across Client Intent, Behavioral Experience, and Safety & Blast Radius. Use when checking and validating a pull request in CI or interactively, or when running any Prove control.'
license: MIT
---

# Prove Stage & Controls (`prove`)

Run the 8 deterministic Prove controls and turn pull request validation into a deterministic, auditable record (`specs/issue-<n>/prove.md`): prove that every deterministic control passed, every acceptance criterion (`AC-<n>`) is genuinely implemented and tested in the diff, and the three Prove dimensions (`Client Intent`, `Behavioral Experience`, `Safety & Blast Radius`) hold against `think.md` and `plan.md`.

## When to Use This Skill

- A `Prove Validator` agent is checking a pull request opened by the `Code Agent`.
- A `Code Agent`, `Gate Fixer`, or CI job runs any of the 8 deterministic controls (`control-guard`, `secret-guard`, `dependency-guard`, `scope-guard`, `task-gate`, `criteria-verify`, `test-probe`, `preview-smoke`).
- CI needs a single machine-validated Prove report (`prove.md`) that either approves/merges the pull request (`--stage pass`) or feeds actionable findings into the remediation loop (`Gate Fixer`).

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), such as `.agents/skills/prove/` or `.claude/skills/prove/`. Run the scripts from the repository root and write `<skill-dir>` as that install path.

## Workflow

1. **Read `references/prove-contract.md` now.** It defines the exact sections, tables, fields, cross-checks against `think.md` and `plan.md`, and consistency rules. Read the per-control contracts in `references/` when configuring or diagnosing a specific control:
   - `references/control-guard-contract.md` (`control-guard.mjs`)
   - `references/secret-contract.md` (`secret-guard.mjs`)
   - `references/dependency-contract.md` (`dependency-guard.mjs`)
   - `references/guard-contract.md` (`scope-guard.mjs`)
   - `references/gate-contract.md` (`task-gate.mjs`)
   - `references/criteria-verify-contract.md` (`verify-criteria.mjs`)
   - `references/probe-contract.md` (`test-probe.mjs`)
   - `references/preview-smoke-contract.md` (`preview-smoke.mjs`)
2. Run or inspect the 8 deterministic controls on the pull request diff:

```bash
node <skill-dir>/scripts/control-guard.mjs --git origin/main
node <skill-dir>/scripts/secret-guard.mjs --git --base origin/main
node <skill-dir>/scripts/dependency-guard.mjs --git --base origin/main
node <skill-dir>/scripts/scope-guard.mjs --git --base origin/main --scope "<In Scope globs>"
node <skill-dir>/scripts/task-gate.mjs --stage "lint:npm run lint" --stage "tests:npm test"
node <skill-dir>/scripts/verify-criteria.mjs --plan specs/issue-42/plan.md --report junit.xml --require-test-files
node <skill-dir>/scripts/test-probe.mjs --base origin/main --test-cmd "npm test" --source "<modified src file>"
node <skill-dir>/scripts/preview-smoke.mjs --url http://localhost:3000 --routes smoke-routes.json
```

3. Inspect the pull request diff (`git diff origin/<base>...HEAD`) against `think.md` and `plan.md` for every `AC-<n>` and the three Semantic Review dimensions (`Client Intent`, `Behavioral Experience`, `Safety & Blast Radius`).
4. Write `specs/issue-<n>/prove.md` and validate it:

```bash
# Validate prove.md structure and cross-check against plan.md and think.md (allows PASS or FAIL verdict)
node <skill-dir>/scripts/validate-prove.mjs --dir specs/issue-42

# Assert that the Prove report has Verdict: PASS (exits 1 if Verdict is FAIL)
node <skill-dir>/scripts/validate-prove.mjs --dir specs/issue-42 --stage pass
```

## Done When

- `validate-prove.mjs --dir specs/issue-<n>` exits with code 0.
- Every `AC-<n>` from `plan.md` appears in `## Criteria Verification` with real implementation and test evidence.
- When `Verdict: PASS`, `validate-prove.mjs --dir specs/issue-<n> --stage pass` exits with code 0.
