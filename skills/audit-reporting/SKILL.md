---
name: audit-reporting
description: 'Create predictable, actionable code-audit reports in a strict Markdown contract and validate them before publication. Use when an audit agent reports bugs, security findings, performance risks, or code-quality issues for CI workflows, GitHub issues, or other automated consumers.'
license: MIT
---

# Audit Reporting

Produce audit findings that automated workflows can validate and publish safely.

## When to Use This Skill

- An audit agent must return deterministic, validated Markdown findings.
- A CI workflow must publish AI findings to an issue or artifact safely.

## Workflow

1. **Read the contract file now before proceeding** — use your file-reading tool on `./references/report-contract.md`. Do not skip this step.
2. Examine every file in the configured scope.
3. Write findings following the contract: report only evidenced problems, no positive findings, prioritize by severity.
4. Return **only** the delimited Markdown fragment specified in the contract — nothing outside the markers, structure and headings exactly as defined.
5. When command execution is available, validate and normalize before publishing:

```bash
node scripts/audit-report.mjs --input raw-audit.md --output audit.md --scope src --scope db/liquibase
```

Treat a nonzero validator exit as an invalid report and regenerate rather than publishing raw output.
6. After a zero validator exit, read the normalized output file and **print its full contents verbatim as the final response** — do not summarize it, do not reference the file path, do not write a narrative instead. The CI pipeline reads your stdout; it cannot access files you wrote to `/tmp/` or any other path.

## Done When

- Every finding has a concrete repository-relative location, evidence, impact, and actionable recommendation.
- If no findings exist, the contract's explicit empty report is returned.
- The validator script accepts the report without errors.

## Gotchas

- **Do not invent finding IDs or severity counts.** The validation script derives them.
- **Do not use absolute paths.** Locations must be repository-relative and inside a configured scope.
- **Do not weaken evidence to fit the template.** Omit an unverified finding instead.
- **Do not publish unvalidated model output.** Prompt compliance is advisory; validation is the enforcement boundary.
- **Do not write the report only to a file.** The delimited block (`<!-- AUDIT-REPORT:START -->` … `<!-- AUDIT-REPORT:END -->`) must appear verbatim in your final response. The CI pipeline reads your stdout; it never reads `/tmp/` or any other path you wrote to.