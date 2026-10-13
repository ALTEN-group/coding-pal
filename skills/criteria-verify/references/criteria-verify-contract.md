# Criteria Verification Contract

The Criteria Test Verification gate proves that **every acceptance criterion in the Plan record has at least one passing test, and that no test mapped to a criterion failed**. It consumes test reports that the project's own test runner already produced. It runs no tests and has no opinion about test quality (that is the Mutation Bar's job).

The gate is deterministic: the same `plan.md` and the same reports always produce the same verdict. The agent writes the tests, so the agent cannot change this script or its rules.

---

## 1. Inputs

| Input | Flag | Content |
|---|---|---|
| Plan record | `--plan <plan.md>` | `specs/issue-<n>/plan.md`: the `## Acceptance Criteria` and `## Test Plan` sections |
| Test reports | `--report <file>` (repeatable) | JUnit XML, or Jest/Vitest JSON. Several reports are combined (for example unit and API test reports) |
| File check | `--require-test-files` | Optional. Each Test Plan test file must appear among the reported test files |
| Output | `--json` | Optional. Print the result as JSON instead of a Markdown table |

### Plan record

- Criteria are the lines `- **AC-<n>:** Given ..., then ...` under `## Acceptance Criteria`. Ids must be unique.
- The Test Plan is the table under `## Test Plan` with columns `| Criterion | Test | Step |`. The `Test` cell starts with the test file path (`tests/routes/role.test.js: rejects viewers`), optionally in backticks.
- Headings inside code fences are ignored (a `New Code` block may contain `## Test Plan`).
- A Test Plan row naming a criterion that the plan does not define is an error.

### Test reports

| Format | Detected by | Test identity | Test file |
|---|---|---|---|
| JUnit XML | first character `<` | `<testcase name classname>`; status from child `<failure>`, `<error>` (failed), `<skipped>` | `file` attribute of the testcase or the nearest `<testsuite>`; else a path-like `classname` |
| Jest / Vitest JSON | first character `{` | `testResults[].assertionResults[]` `fullName`, `title`, `ancestorTitles`; `status` | `testResults[].name` |

- Jest/Vitest statuses other than `passed` and `failed` (`pending`, `skipped`, `todo`, `disabled`) count as **skipped**.
- A report with no test results is an error: an empty report cannot prove anything.
- XML comments and CDATA sections are ignored. The parser is regex-based and does not validate the XML.
- jest-junit omits the file path by default. Use Jest/Vitest JSON, or configure `addFileAttribute: true`, when you pass `--require-test-files`.

---

## 2. Mapping Tests to Criteria

A test maps to a criterion when its name, title, full name, or class name contains the token `AC-<n>`:

- Case-insensitive (`ac-2` maps to `AC-2`).
- Word-bounded: `AC-1` does not match `AC-12`, `XAC-1`, `AC-1x`, or `AC_1`.
- One test may name several criteria (`AC-1 and AC-2 share a flow`). It then counts for each.

Tests that map to no known criterion are listed as **unmapped**. This is informational and never an error.

Convention for the agent: name every test with its criterion, for example `it("AC-2 rejects viewers", ...)`.

---

## 3. Verdicts

One verdict per criterion, in this priority order:

| Verdict | Meaning |
|---|---|
| `FAIL` | At least one mapped test failed (or errored). A passing sibling test does not offset it |
| `NOT COVERED` | No reported test names the criterion |
| `NOT PASSING` | Tests are mapped, but every one was skipped. Skipped and pending tests never count |
| `TEST FILE NOT REPORTED` | Only with `--require-test-files`: a test file named in the Test Plan row is missing from the reports, or the row names no file |
| `PASS` | At least one passing mapped test, none failed (and the files check passed) |

The gate passes only when **every** criterion is `PASS`.

---

## 4. Output and Exit Codes

Markdown table on stdout:

```markdown
| Criterion | Tests | Verdict |
|---|---|---|
| AC-1 | role routes AC-1 rejects unauthenticated requests (passed) | PASS |
| AC-2 | role routes AC-2 rejects viewers (failed) | FAIL |
```

followed by an `Unverified criteria:` list with the reason for each non-`PASS` row and the unmapped tests. The one-line status goes to stderr.

| Exit code | Meaning |
|---|---|
| 0 | Every acceptance criterion is verified |
| 1 | At least one criterion is not verified, or an input is missing, malformed, or empty |

Unknown command-line arguments are errors, so a mistyped `--require-test-files` cannot silently weaken the gate.

---

## 5. Where It Runs

- **Agent loop (Code):** after a step's tests pass, to see which criteria are still open.
- **CI (Prove):** on the pull request, against the reports of the clean CI re-run. A failure triggers auto-remediation. The agent fixes code or tests. It never edits this script, skips a test, or removes an `AC-<n>` token to get a pass.

---

## 6. Anti-Patterns & Prohibitions

1. **No skipped tests as evidence.** `it.skip`, `xit`, `@Ignore` do not verify anything.
2. **No criterion left without a test.** Fix the plan with the Developer instead of dropping the criterion from the table.
3. **No weakening the gate.** No editing of the script, the report, or the Test Plan to obtain a pass.
4. **No claim without a report.** A test run that produced no report file is not verification.
