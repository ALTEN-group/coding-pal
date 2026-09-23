# Contract Schema Specification

A **Contract** defines the machine-readable schema and invariants of structured artifacts exchanged between agents, workflows, and CI.

## Declarative Contract Schema (`*.contract.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "name": "audit-report-contract",
  "rules": {
    "maxLines": 500,
    "requiredMarkers": [
      "<!-- AUDIT-REPORT:START -->",
      "<!-- AUDIT-REPORT:END -->"
    ],
    "requiredHeadings": [
      "## Critical",
      "## Important"
    ],
    "headingSequence": [
      "Critical",
      "Important",
      "Suggestions"
    ],
    "requiredFields": [
      "- **ID:**",
      "- **Location:**",
      "- **Severity:**"
    ],
    "forbiddenPatterns": [
      "TODO",
      "TBD",
      "PLACEHOLDER"
    ]
  }
}
```

## CLI Usage

```bash
# Validate an artifact against a declarative contract
node scripts/validate-contract.mjs --contract contracts/audit.contract.json --file docs/audits/report.md

# Validate with JSON output
node scripts/validate-contract.mjs --contract contracts/spec.contract.json --file docs/specs/auth.md --json
```

## Exit Codes

| Exit Code | Meaning | Agent Action |
|---|---|---|
| `0` | Artifact strictly conforms to contract | Artifact approved for publication or hand-off. |
| `1` | Schema / structural violation | Inspect reported errors (line numbers, missing markers) and repair artifact. |
| `2` | Configuration / file not found | Fix file path or contract parameters. |
