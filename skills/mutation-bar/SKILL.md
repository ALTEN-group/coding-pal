---
name: mutation-bar
description: 'Gate a change on its Mutation Testing Bar: read a Stryker mutation-testing-elements JSON (or a generic killed/survived summary), compute the mutation score, optionally score only the changed files and per-file minimums, list surviving mutants, and fail below the bar (default 80, raise-only). Use when the agent loop or CI (Prove stage) must prove that the tests catch real defects.'
license: MIT
---

# Mutation Bar

Deterministic Mutation Testing Bar gate. It proves the tests themselves: mutants injected into the code must be caught by the test suite. It reads a mutation report and never runs a mutation tool.

## When to Use This Skill

- The agent has written or changed tests and must know whether they actually catch defects.
- CI (Prove) must block a pull request whose mutation score is below the bar, and hand the survivors to auto-remediation.
- A reviewer wants the surviving mutants listed as `file:line mutator`.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/mutation-bar/` or `.claude/skills/mutation-bar/`, use that base path. Run the script from the repository root, where `mutation-bar.json` lives, and write `<skill-dir>` as that install path.

## Workflow

1. **Read `references/mutation-bar-contract.md` now.** It is the authoritative source for statuses, the score formula, thresholds, and exit codes.
2. Run the project's mutation tool so that it writes a Stryker JSON report (for example `reports/mutation/mutation.json`). A generic summary `{ "killed", "survived", "timeout", "noCoverage" }` is accepted for tools such as Mutmut.
3. Run the gate from the repository root:

```bash
# Whole report, using mutation-bar.json when present
node <skill-dir>/scripts/mutation-bar.mjs --report reports/mutation/mutation.json

# Only the files this change touched, with a per-file floor
git diff --name-only origin/main... > changed.txt
node <skill-dir>/scripts/mutation-bar.mjs --report reports/mutation/mutation.json --changed changed.txt --per-file-min 60
```

4. Treat a nonzero exit as a failed gate. Add or strengthen tests to kill each listed survivor. Never lower the bar, exclude mutants, or shrink the mutated scope. The command line can only raise the minimum above `mutation-bar.json` (default 80).
5. Read the `Ignored: N mutants` line and any `Warning: no mutants for <file>: not proven` line. A growing ignored count means a survivor may be hidden by a `Stryker disable` comment; a warned file is not proven by this gate. Neither changes the exit code.

## Done When

- The script exits 0: the score meets the minimum and no scored file is below the per-file minimum.
- Every survivor was killed by a test, not excluded.
- `mutation-bar.json` was not lowered by the agent.
