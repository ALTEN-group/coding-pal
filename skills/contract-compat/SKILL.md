---
name: contract-compat
description: 'Classify OpenAPI or JSON Schema differences as BREAKING or compatible, failing breaking changes without an Accepted decision record with explicit automated attribution or genuine human signature. Use in the agent loop and CI to prevent silent contract breaks.'
license: MIT
---

# Contract Compat

Deterministic Contract & Schema Compatibility gate. It compares released and changed contracts and prints `BREAKING` or `compatible`. Critical contract breaks require an Accepted decision record; automated decisions need no human sign-off.

## When to Use This Skill

- A change touches an OpenAPI document or a JSON Schema that other systems consume.
- CI (Prove) must block a pull request that removes an operation or response, removes or retypes a response property, adds a required request input, or adds security to an operation.
- An intended breaking change needs an Accepted decision record with explicit attribution.

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

# Intended breaking change, authorized by an attributed Accepted decision record
node <skill-dir>/scripts/contract-compat.mjs --base base.json --head openapi.json \
  --allow-breaking docs/decisions/0007-remove-legacy-role.md
```

4. Treat a nonzero exit as failure. Restore compatibility or, for an intended break, validate an Accepted decision with an Automation decider and `Automated by <identity> on YYYY-MM-DD` attribution. Preserve staged rollout and rollback requirements; never forge human approval.

## Done When

- The script exits 0 with no BREAKING line, or every break is covered by a valid Accepted decision record with automated attribution or genuine human signature.
- The base contract was not edited to hide a difference.
- No fabricated human signature exists.
