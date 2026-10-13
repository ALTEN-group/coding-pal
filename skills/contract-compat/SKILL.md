---
name: contract-compat
description: 'Classify the differences between two OpenAPI 3.x JSON documents (or two JSON Schemas, with local $ref resolved) as BREAKING or compatible, and fail on any breaking change unless an Accepted, human-signed decision record is supplied. Use when the agent loop or CI (Prove stage) must guarantee that public interfaces and consumer contracts never break silently.'
license: MIT
---

# Contract Compat

Deterministic Contract & Schema Compatibility gate. It compares the released contract (base) with the changed contract (head) and prints every change as `BREAKING` or `compatible`. A breaking public contract is a Critical blast radius, so it only passes with a signed decision record.

## When to Use This Skill

- A change touches an OpenAPI document or a JSON Schema that other systems consume.
- CI (Prove) must block a pull request that removes an operation or response, removes or retypes a response property, adds a required request input, or adds security to an operation.
- A breaking change is intended and must be released through an Architect-signed decision record.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/contract-compat/` or `.claude/skills/contract-compat/`, use that base path. Run the script from the repository root and write `<skill-dir>` as that install path.

## Workflow

1. **Read `references/contract-compat-contract.md` now.** It is the authoritative source for what counts as breaking, supported documents, output format, and the decision-record rule.
2. Produce JSON for both sides. YAML, Swagger 2.0, external `$ref`, and Pact are not supported: convert or bundle first.

```bash
git show origin/main:openapi.json > base.json
```

3. Run the gate from the repository root:

```bash
node <skill-dir>/scripts/contract-compat.mjs --base base.json --head openapi.json

# Intended breaking change, released by an Accepted decision record signed by the Architect
node <skill-dir>/scripts/contract-compat.mjs --base base.json --head openapi.json \
  --allow-breaking docs/decisions/0007-remove-legacy-role.md
```

4. Treat a nonzero exit as a failed gate. Restore compatibility (keep the old field, make the new one optional, add a new version). If the break is intended, ask the Architect for a decision record. The AI may draft it, but only a person signs it.

## Done When

- The script exits 0 with no `BREAKING` line, or every `BREAKING` line is covered by an `Accepted` decision record signed by a named Architect.
- The base contract was not edited to hide a difference.
- No decision record was signed or marked `Accepted` by the AI.
