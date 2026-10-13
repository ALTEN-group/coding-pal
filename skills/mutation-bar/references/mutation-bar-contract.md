# Mutation Bar Contract

The Mutation Testing Bar proves **the tests themselves**. A mutation tool injects small defects (mutants) into the code and re-runs the tests. A mutant the tests catch is *killed*. One they miss *survived*. This gate reads the tool's report and fails when too many mutants survive.

The gate is deterministic and consumes a report file. It never runs Stryker, Mutmut, or any other tool, and it never reads source code.

---

## 1. Inputs

| Input | Flag | Content |
|---|---|---|
| Mutation report | `--report <file>` | Stryker `mutation-testing-elements` JSON, or a generic summary JSON |
| Config | `--config <file>` | Optional. Defaults to `mutation-bar.json` in the working directory when that file exists |
| Minimum score | `--min-score <N>` | Optional. May only raise the effective minimum |
| Per-file minimum | `--per-file-min <N>` | Optional. May only raise the configured per-file minimum. Needs a Stryker report |
| Changed files | `--changed <file>` | Optional. Text file with one workspace-relative path per line (blank lines and `#` comments ignored). Only those files are scored. Needs a Stryker report |

### Stryker JSON

`files{ <path>: { mutants: [ { id, mutatorName, status, location: { start: { line } } } ] } }`

| Status | Counted as |
|---|---|
| `Killed`, `Timeout` | detected |
| `Survived` | missed |
| `NoCoverage` | missed |
| `CompileError`, `RuntimeError`, `Ignored` | excluded from the score |
| anything else (for example `Pending`) | error: the mutation run did not finish |

### Summary JSON

`{ "killed": 70, "survived": 10, "timeout": 10, "noCoverage": 10 }` (`timeout` and `noCoverage` default to 0). Values are non-negative integers. A summary has no per-file data, so `--changed` and a per-file minimum are errors with it.

---

## 2. Score

```
score = (killed + timeout) / (killed + timeout + survived + noCoverage) * 100
```

- The score is computed on the selected scope: the whole report, or only the `--changed` files.
- A scope with no scorable mutants fails ("no scorable mutants"). A change that was not mutation tested cannot pass. For changes without source files (documentation only), skip the gate in CI instead.
- A file with no scorable mutants is shown as `n/a` and is not held to the per-file minimum.
- `--changed` paths are matched to report paths by exact match or by a `/`-separated suffix, so absolute report paths still match. A changed file absent from the report prints `Warning: no mutants for <file>: not proven` (for example `README.md`). The warning does not change the exit code; a scope with nothing scorable still fails.
- `Ignored` mutants stay out of the score, but their number is always printed (`Ignored: N mutants excluded from the score`), per selected scope, so a survivor hidden with a `Stryker disable` comment is visible. A generic summary may carry an optional `ignored` integer. The count does not change the exit code.

---

## 3. Thresholds: A Control Cannot Be Weakened

| Setting | Default | Where it is set |
|---|---|---|
| Minimum score | `80` | `mutation-bar.json` `minScore`, raised by `--min-score` |
| Per-file minimum | none | `mutation-bar.json` `perFileMin`, raised by `--per-file-min` |

```json
{ "minScore": 85, "perFileMin": 60 }
```

- The config values are numbers from 0 to 100.
- The command line can only **raise** the effective minimum above the config (or the default `80`). A lower value is an error: `a control cannot be weakened`.
- `mutation-bar.json` is a control file. Change it in a pull request that a human reviews (for example through CODEOWNERS). The agent never lowers it to get a pass.

---

## 4. Output and Exit Codes

Markdown on stdout: a per-file table (Stryker only), the total counts, the score with its thresholds, the number of `Ignored` mutants, the **survivors**, and a warning for each changed file with no mutants in the report.

```
Survivors:
- src/routes/role.js:40 ConditionalExpression (Survived)
- src/routes/role.js:55 BlockStatement (NoCoverage)
```

Each survivor is `<file>:<line> <mutator> (<status>)`. The one-line verdict goes to stderr.

| Exit code | Meaning |
|---|---|
| 0 | Score and per-file scores meet the minimums |
| 1 | Below the bar, nothing scorable, weakened threshold, or malformed or missing input |

Unknown arguments are errors.

---

## 5. Where It Runs

- **Agent loop (Code):** with `--changed` on the files of the current step, to kill survivors while the context is fresh.
- **CI (Prove):** on the whole report or the pull request's changed files. A failure triggers auto-remediation: the agent adds or strengthens tests to kill the listed survivors. It never excludes mutants, narrows `mutate` globs, or lowers the bar to get a pass.

---

## 6. Anti-Patterns & Prohibitions

1. **No excluding survivors.** Do not add `// Stryker disable` comments or `Ignored` mutants to hide a survivor without a recorded reason.
2. **No shrinking the mutated scope** to reach the bar.
3. **No lowering the bar** in config or on the command line.
4. **No assertion-free tests.** A test that only calls the code kills no mutant.
