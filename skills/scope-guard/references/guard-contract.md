# Scope Guard Contract

## 1. Purpose

The Scope Guard contract defines deterministic rules for asserting that changes made by an AI coding agent stay strictly within an authorized blast radius. It prevents unauthorized file contamination, accidental dependency drift, and uncontrolled code churn.

## 2. Invariants & Rules

1. **Allowed Paths (`allowed_paths`)**:
   - Every file modified, added, or deleted in the working tree or diff must match at least one authorized path pattern or prefix.
   - If no allowed paths are specified, all files are permitted unless matching a forbidden path.
2. **Forbidden Paths (`forbidden_paths`)**:
   - No file matching a forbidden path pattern (e.g., package manager lockfiles, environment secrets, master database changelogs) may be modified, added, or deleted under any circumstances.
   - Forbidden path checks take precedence over allowed paths.
3. **Churn Thresholds (`max_additions`, `max_deletions`)**:
   - When configured, total lines added across all in-scope files must not exceed `max_additions`.
   - Total lines deleted across all in-scope files must not exceed `max_deletions`.
   - Prevents unprompted mass refactorings or destructive file truncations.

## 3. Exit Code Contract

| Exit Code | Meaning | Remediation Action |
|---|---|---|
| `0` | **Pass**: All changes comply with scope and churn bounds. | Proceed to test execution or commit. |
| `1` | **Violation**: One or more files breached scope, hit a forbidden path, or exceeded churn limits. | Agent must revert unauthorized edits (`git checkout -- <file>`) or reduce churn before proceeding. |
| `2` | **Usage / Execution Error**: Invalid arguments or git command failure. | Fix invocation parameters. |

## 4. Diagnostics Schema

When violations occur, diagnostics must be emitted to `stderr` (or in JSON output) in an actionable format for agent self-repair:

```text
[SCOPE-GUARD:ERROR] Scope violation: file "package-lock.json" matches forbidden pattern "*.lock,*-lock.json"
[SCOPE-GUARD:ERROR] Scope violation: file "src/unrelated/service.js" is outside allowed scope "src/auth/**"
[SCOPE-GUARD:ERROR] Churn threshold exceeded: added 142 lines (limit: 100)
```
