# Security Gate Contract

The Security Gate turns scanner output into a deterministic pass or fail for the **Security & Policy-as-Code** control of the Prove stage. It consumes files that other tools wrote. It runs no scanner and uses no network, so the same input always gives the same verdict.

---

## 1. Inputs

| Flag | Input | Notes |
|---|---|---|
| `--sarif <file>` | SARIF 2.1.0 (Semgrep, Trivy, CodeQL) | Repeatable |
| `--conftest <file>` | Conftest / OPA JSON | Repeatable |
| `--sbom <file>` | CycloneDX JSON SBOM | Repeatable. Needs `--allow-licenses` or `--deny-licenses` |
| `--allow-licenses "<list>"` | Comma-separated SPDX ids or license names | When set, a license must be in the list |
| `--deny-licenses "<list>"` | Comma-separated SPDX ids or license names | A denied license always fails |
| `--min-severity error\|warning` | Severity bar, default `error` | `warning` also fails warnings |
| `--waivers <file>` | `waivers.json` | See section 4 |
| `--today YYYY-MM-DD` | Override for the current date | For tests and reproducible runs |
| `--json` | Machine-readable output | |

At least one of `--sarif`, `--conftest`, `--sbom` is required. A missing, unreadable, or malformed file is an error (exit 1), never a silent pass.

---

## 2. Severity Rules

### SARIF

- The level of a result is `level`, then the rule's `defaultConfiguration.level`, then `warning` (the SARIF default). The level is read case-insensitively. A value that is not `error`, `warning`, `note`, or `none` counts as `error`.
- `error` fails. `warning` fails only with `--min-severity warning`. `note` and `none` never fail.
- A `properties.security-severity` of **7.0 or more** (on the result or on its rule) is treated as `error`, whatever the level says.
- A document with no `runs`, or a run whose `invocations[].executionSuccessful` is `false`, is an error: no scanner output was produced to check.

### Conftest / OPA

Expected shape: `[{ "filename": "...", "successes": n, "failures": [{ "msg": "..." }], "warnings": [{ "msg": "..." }] }]`.

- Any `failures` entry fails.
- A `warnings` entry fails only with `--min-severity warning`.

### CycloneDX licenses

Every component (including nested ones) is checked. A license is read from `licenses[].license.id`, `licenses[].license.name`, or `licenses[].expression`.

- A component with **no license** is an error (`unknown-license`).
- A license not in `--allow-licenses` (when given) or in `--deny-licenses` is an error.
- SPDX expressions are evaluated: `A OR B` passes when one side is acceptable, `A AND B` needs both, parentheses and `WITH` exceptions are understood.
- Matching is case-insensitive. An SPDX `X+` suffix means `X-or-later`: `GPL-3.0+` matches a deny entry `GPL-3.0-or-later` and the base id `GPL-3.0`.

---

## 3. Output

One line per finding, then a summary. Exit 0 = pass, 1 = fail.

```text
FAIL sarif js.sql-injection src/db.js:12 - Possible SQL injection
FAIL license GPL-3.0-only gpl-lib@1.0.0 - gpl-lib@1.0.0 uses GPL-3.0-only, which is denied
WAIVED sarif js.xss src/view.js:4 - approved by Dana Reed (Architect), expires 2026-12-31: Escaped upstream, see ADR-014
NOTE unused waiver js.old-rule: remove it when the finding is gone
FAIL: 2 failing, 1 waived, 0 below the severity bar, 0 waiver error(s)
```

---

## 4. Waivers: `waivers.json`

```json
[
  {
    "id": "js.sql-injection",
    "path": "src/db.js",
    "reason": "Input is a compile-time constant, see decision record 014",
    "approvedBy": "Dana Reed (Architect)",
    "expires": "2026-12-31"
  }
]
```

- `id` is a SARIF `ruleId`, a license (or component name), or the exact Conftest policy message.
- `path` is optional. When set, it must match the finding's path (`**` and `*` globs). For licenses the path is `name@version`.
- `reason`, `approvedBy`, and `expires` (`YYYY-MM-DD`) are **required**. A waiver without them is invalid and fails the gate.
- An **expired** waiver (`expires` before today) fails the gate. The expiry day itself is still valid.
- `approvedBy` must be `<name> (<role>)`: a named person and one of the factory roles `Product Owner`, `Developer`, `Architect`, `DevOps`, `QA and maintainer` (for example `Dana Reed (Architect)`). AI and bot names (the words `copilot`, `claude`, `gpt`, `chatgpt`, `gemini`, `openai`, `anthropic`, `bot`, `agent`, `dependabot`, `renovate`, `github-actions`, `ai`, `llm`, matched case-insensitively) and placeholders (`x`, `tbd`, `<name>`, a bare role) are rejected: AI proposes, humans decide.
- A valid waiver suppresses only the matching finding, and is always listed in the output as `WAIVED`.
- `waivers.json` is a protected control file. The `control-guard` skill fails any change to it unless the Architect allows it.

---

## 5. Anti-Patterns

1. **No waiving to get green.** A waiver answers a risk decision, not a failing build.
2. **No open-ended waivers.** Every waiver expires, so the decision is revisited.
3. **No editing the gate's arguments in a fix.** The severity bar and license lists belong to the pipeline, which the Architect owns.
4. **No scanner output from the agent's own filtering.** Feed the gate the raw tool output.
