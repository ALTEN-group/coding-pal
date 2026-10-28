---
name: prove
description: 'Author and validate the Prove verification record (prove.md): deterministic control verdicts, per-criterion implementation and test evidence, semantic review of Client Intent, Behavioral Experience, and Safety & Blast Radius against think.md and plan.md, actionable findings, and final PASS/FAIL verdict. Use when the Prove Validator agent checks and validates a pull request in CI or interactively.'
license: MIT
---

# Prove Verification Record (`prove.md`)

Turn pull request validation into a deterministic, auditable record (`specs/issue-<n>/prove.md`): prove that every deterministic control passed, every acceptance criterion (`AC-<n>`) is genuinely implemented and tested in the diff, and the three Prove dimensions (`Client Intent`, `Behavioral Experience`, `Safety & Blast Radius`) hold against `think.md` and `plan.md`.

## When to Use This Skill

- A `Prove Validator` agent is checking a pull request opened by the `Code Agent`.
- CI needs a single machine-validated Prove report (`prove.md`) that either approves/merges the pull request (`--stage pass`) or feeds actionable findings into the remediation loop (`Gate Fixer`).

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), such as `.agents/skills/prove/` or `.claude/skills/prove/`. Run the scripts from the repository root.

## Workflow

1. **Read `references/prove-contract.md` now.** It defines the exact sections, tables, fields, cross-checks against `think.md` and `plan.md`, and consistency rules.
2. Run or inspect the deterministic controls on the pull request diff (`validate-think`, `validate-plan`, `branch-guard`, `code-loop`, `control-guard`, `secret-guard`, `dependency-guard`, `scope-guard`, `task-gate`, `criteria-verify`, `test-probe`, `preview-smoke`, `validate-pr`).
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
