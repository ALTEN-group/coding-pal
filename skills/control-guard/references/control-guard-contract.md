# Control Guard Contract

`control-guard.mjs` fails a change that **weakens a control**. `bug-rule.mjs` enforces **the bug rule**. Both are deterministic: the same diff or history always gives the same verdict.

The principle: an agent may write tests and fix code, but the checks that judge it are fixed. Controls are run by agents and changed only by the Architect.

---

## 1. Control Guard

### Usage

```text
node control-guard.mjs (--git <base> | --diff <file|->) [--config control-guard.json] [--allow-path <glob>]... [--json]
```

- `--git <base>` scans the working tree against the merge base of `<base>` and `HEAD`: the whole pull request, including uncommitted edits. Untracked files are not scanned (a note is printed). Stage or commit them first.
- `--diff <file>` scans a saved unified diff (git or plain). `-` reads stdin. A non-empty input with no file headers is an error (exit 1), not a pass.
- Exactly one of `--git` and `--diff`.
- Output: one `RULE file:line message` line per finding, then `PASS` or `FAIL: <n> finding(s)`. Exit 0 = pass, 1 = fail. `--json` prints `{ ok, findings: [{ rule, file, line, message }] }`.

### Rules

| Rule | Fails when | Applies to |
|---|---|---|
| **R1** | A test file is deleted, or moved out of the test paths | Test files |
| **R2** | A skip or only marker is added: `.skip(`, `xit(`, `xdescribe(`, `xtest(`, `it.todo(`, `test.todo(`, `fit(`, `fdescribe(`, `.only(`, `@skip`, `pytest.mark.skip`, `@Disabled` | Test files |
| **R3** | A numeric threshold is lowered inside a hunk, for the keys `branches`, `functions`, `lines`, `statements`, `break`, `minScore`, `min-score`, `threshold`, `coverageThreshold`, `fail_under`, `--min-score` | Non-test, non-doc files |
| **R4** | A workflow is weakened: added `continue-on-error: true` (also quoted or as `${{ true }}`), `\|\| true`, `--no-verify`, `if: false`, `allow_failure`; a workflow file is deleted; a job under `jobs:` is deleted | Pipeline files (see below) |
| **R5** | A protected path is modified, added, deleted, or renamed | All files |
| **R6** | A suppression is added: `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, `# noqa`, `biome-ignore`, `NOSONAR` | Non-doc files |
| **R7** | An agent workflow exposes production credentials: an added `secrets.PROD...` or `environment: production` line (also `environment: { name: production }` and a `name: production` line) | Workflow files whose file name contains `remediate` or `agent` |
| **R8** | Assertions are removed: in a modified test file the removed count of `expect(` and `assert...` / `Assert.` calls exceeds the added count by more than `assertionTolerance` (default 0). Comment lines are not counted | Modified test files |

Notes on the rules:

- **Test files** are the paths matching `tests/**`, `test/**`, `**/tests/**`, `**/test/**`, `**/__tests__/**`, `**/e2e/**`, `**/*.test.*`, `**/*.spec.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.java`, `**/*Tests.cs`.
- **Pipeline files** are `.github/workflows/**`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `.circleci/config.yml`, `Jenkinsfile`, `package.json`, `Makefile`, `*.sh`, `.husky/**`, `.pre-commit-config.yaml`. Comment lines are ignored.
- **Docs** (`*.md`, `*.mdx`, `*.txt`, `*.rst`) are exempt from R2, R3, R4, and R6.
- **R3** compares removed and added values of the same key within one hunk. A threshold that is only deleted is not flagged.
- **R4 deleted job** is a heuristic: a removed `  <job>:` line followed by removed `runs-on`, `steps`, or `uses` lines, and not re-added in the same file.
- **R5 protected paths** by default: `.agents/skills/**`, `.claude/skills/**`, `.cursor/skills/**`, `.github/workflows/**`, `control-guard.json`, `mutation-bar.json`, `waivers.json`, and `rails.json` (also in subdirectories). `--allow-path <glob>` (repeatable) exempts a path from R5. It is for Architect-owned control changes and is never used by an agent.
- **R7**: production credentials never belong in a workflow that an agent runs.

### Configuration: `control-guard.json`

Optional, at the project root (or `--config`). All keys are optional.

```json
{
  "protectedPaths": ["infra/**"],
  "testGlobs": ["checks/**"],
  "pipelineGlobs": ["deploy/*.yml"],
  "assertionTolerance": 0
}
```

- `protectedPaths`, `testGlobs`, and `pipelineGlobs` **add** to the defaults. A control cannot be weakened from its own configuration.
- `assertionTolerance` is a non-negative integer.
- Unknown keys are an error. `control-guard.json` is itself protected by R5.

---

## 2. The Bug Rule

Every production defect results in a new automated check, committed **before** the fix. The agent then fixes the code to satisfy it, so the bug cannot quietly return.

### Usage

```text
node bug-rule.mjs --git <base>..<head> [--tests "<glob,glob>"] [--defect "<ref>"] [--json]
```

- Walks the commits of the range in topological order, oldest first (merge commits are skipped).
- A commit is `tests` (only test files), `code` (no test files), `mixed` (both), or `empty`. A rename counts as deleting the old path and adding the new one.
- **Pass:** the first commit that changes non-test files is preceded by an earlier `tests` commit that adds or changes tests. A commit that only deletes tests does not count.
- **Fail:** the first non-test change comes first, or comes in one commit together with the tests (`mixed`). An empty range fails. A range with no non-test change has nothing to order and passes.
- Default test globs: the same test paths as Control Guard rule R1 (see the Test files note above). `--tests` replaces them.
- `--defect` only labels the report (for example `#123`).
- Output: the commit order, then `PASS` or `FAIL` with the reason. Exit 0 or 1.

```text
Bug rule for origin/main..HEAD (defect: #123)
1 3f9a1c2 tests test: total ignores cancelled orders
2 b81e07d code  fix: skip cancelled orders in total
PASS: the failing check is committed first (3f9a1c2) and the fix follows (b81e07d)
Next: prove the check fails without the fix with the test-probe skill.
```

### Pair it with `test-probe`

The bug rule proves the **order** of the commits. The `test-probe` skill proves the new check **fails without the fix**. Run both: order first, then the probe.

---

## 3. Anti-Patterns

1. **No weakening to get green.** Fix the fault. Do not delete, skip, or loosen the check.
2. **No agent-owned controls.** Agents never edit workflows, installed skills, or the control configuration files, and never pass `--allow-path`.
3. **No fix without a check.** A defect fixed in the same commit as its test is not provable.
4. **No production credentials for agents.** Agent and remediation workflows run with their own minimal credentials only.
