---
name: rollback-probe
description: 'Mechanically verify that database migrations and stateful changes can be cleanly applied, rolled back, and re-applied without syntax errors or dirty state.'
license: MIT
---

# Rollback Probe

Certifies database migration and schema reversibility via automated roundtrip execution.

## When to Use This Skill

- An AI agent creates or edits database migrations (Liquibase, Flyway, Prisma, raw SQL).
- A CI gate needs to ensure that deployment rollbacks will not fail in production.
- A project enforces that every forward schema change has a verified inverse.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (e.g. `.agents/skills/rollback-probe/` or `.claude/skills/rollback-probe/`).

## Workflow

1. Read `references/rollback-contract.md` to review the 3-step roundtrip invariant.
2. Execute the rollback probe:

```bash
# Verify Liquibase/SQL rollback integrity
node scripts/rollback-probe.mjs \
  --forward "npm run migrate:up" \
  --rollback "npm run migrate:down"

# Run with optional verification assertion and JSON diagnostics
node scripts/rollback-probe.mjs \
  --forward "npm run migrate:up" \
  --rollback "npm run migrate:down" \
  --verify "npm test -- tests/db.test.js" \
  --json
```

3. If the probe fails:
   - Inspect the failed step (`2_ROLLBACK` or `3_REAPPLY_FORWARD`).
   - Fix the inverse SQL / `<rollback>` tag or restore dropped constraints.
   - Re-run until the probe exits with code 0.

## Done When

- `scripts/rollback-probe.mjs` exits with code 0.
- Forward $\rightarrow$ Rollback $\rightarrow$ Forward succeeds without errors.
