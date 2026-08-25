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

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under e.g. `.github/skills/audit-reporting/` or `.copilot/skills/audit-reporting/`, use that base path.

## Workflow

1. **Read `references/report-contract.md` now** — it is the only source for markers, sections, fields, limits, and empty-report shape. Do not skip this step. Scope examination and layer review are owned by the calling agent.
2. Draft a report that follows that contract. Do not treat the draft as published until the validator below has accepted it (or command execution is unavailable).
3. When command execution is available, validate and normalize from this skill's directory:

```bash
node scripts/audit-report.mjs --input /path/to/raw-audit.md --output /path/to/audit.md --scope src --scope db/liquibase
```

Treat a nonzero validator exit as an invalid report and regenerate rather than publishing raw output. Prompt compliance is advisory; the validator is the enforcement boundary.
4. After a zero validator exit, read the normalized output file and **print its full contents verbatim as the final response**. Do not summarize, do not cite the file path, do not write a narrative instead. The CI pipeline reads stdout; it cannot read `/tmp/` or any other path you wrote.

## Done When

- The validator script accepts the report without errors.
- The accepted report has been printed verbatim in the final response.
