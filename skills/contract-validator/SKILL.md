---
name: contract-validator
description: 'Declaratively assert that structured Markdown or text artifacts strictly adhere to schema contracts, required markers, heading hierarchies, and line constraints without custom scripts.'
license: MIT
---

# Contract Validator

Declarative schema and invariant enforcement for structured artifacts exchanged between agents and CI.

## When to Use This Skill

- An AI agent produces a structured document (e.g. audit report, architecture decision record, spec document) and must verify schema compliance before hand-off.
- A consumer project wants to define custom artifact formats using JSON schemas rather than writing imperative parser scripts.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (e.g. `.agents/skills/contract-validator/` or `.claude/skills/contract-validator/`).

## Workflow

1. Read `references/contract-schema.md` to define or inspect a contract definition.
2. Validate an artifact against a contract:

```bash
# Validate an artifact against a declarative contract
node scripts/validate-contract.mjs --contract contracts/report.contract.json --file docs/report.md

# Validate with JSON output for automated agent ingestion
node scripts/validate-contract.mjs --contract contracts/spec.contract.json --file docs/spec.md --json
```

3. If the validator exits with code 1:
   - Read the reported violations (e.g. missing markers, unsequenced headings, forbidden patterns).
   - Repair the artifact.
   - Re-run until the command exits with code 0.

## Done When

- `scripts/validate-contract.mjs` exits with code 0.
- All required markers, headings, fields, and constraints are satisfied.
