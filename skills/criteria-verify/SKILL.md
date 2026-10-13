---
name: criteria-verify
description: 'Prove that every acceptance criterion (AC-<n>) in a plan.md has at least one passing test and that no test mapped to a criterion failed, by reading JUnit XML or Jest/Vitest JSON reports and printing a criterion-by-criterion verdict table. Use when the agent loop or CI (Prove stage) must gate a change on Criteria Test Verification.'
license: MIT
---

# Criteria Verify

Deterministic Criteria Test Verification gate. The Plan record lists acceptance criteria; this skill proves from the test reports that each one has a passing test. It runs no tests itself.

## When to Use This Skill

- Code has finished a step or the whole plan, and the agent must know which acceptance criteria still lack a passing test.
- CI (Prove) must block a pull request when a criterion has no passing test, a mapped test failed, or the Test Plan's test file was not run.
- Tests must be named after the criteria they verify (`AC-<n>` in the test name).

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/criteria-verify/` or `.claude/skills/criteria-verify/`, use that base path. Run the scripts from the repository root (so `specs/` and `reports/` paths resolve) and write `<skill-dir>` as that install path.

## Workflow

1. **Read `references/criteria-verify-contract.md` now.** It is the authoritative source for the mapping rule, report formats, verdicts, and exit codes.
2. Name each test with the criterion it verifies, for example `it("AC-2 rejects viewers", ...)`, and make the test runner write a report (JUnit XML or Jest/Vitest JSON).
3. Run the gate from the repository root:

```bash
node <skill-dir>/scripts/verify-criteria.mjs --plan specs/issue-42/plan.md \
  --report reports/jest.json --report reports/api-junit.xml --require-test-files
```

4. Treat a nonzero exit as a failed gate. Read the `Unverified criteria` list, then fix the code or the missing test. Never skip a test, edit the Test Plan, or change the script to obtain a pass.
5. In CI, run the same command against the clean-environment reports and let a failure trigger auto-remediation.

## Done When

- The script exits 0: every `AC-<n>` has at least one passing mapped test and no mapped test failed.
- With `--require-test-files`, every Test Plan test file appears in a report.
- No test was skipped, removed, or renamed to hide a criterion.
