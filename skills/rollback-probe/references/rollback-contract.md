# Rollback & Roundtrip Probe Specification Contract

A **Rollback Probe** mechanically certifies that database migrations, infrastructure scripts, or stateful modifications can be safely applied, rolled back, and re-applied without syntax errors, partial state locks, or data corruption.

## Invariant Lifecycle

```
[1. Forward Migration]
Apply schema change (e.g. migrate up)
  │
  ├── Fails? ──> FAIL: Forward migration failed on pristine state.
  ▼
[2. Rollback Execution]
Undo schema change (e.g. migrate rollback)
  │
  ├── Fails? ──> FAIL: Migration is non-reversible! Rollback block is broken.
  ▼
[3. Re-apply Forward]
Re-apply schema change (e.g. migrate up)
  │
  ├── Fails? ──> FAIL: Idempotency violation! Rollback left dirty state.
  ▼
[4. Verification Check (Optional)]
Run schema diff or verification assertions
  │
  ▼
[5. Certified] Exit 0
```

## CLI Usage

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

## Exit Codes

| Exit Code | Meaning | Agent Action |
|---|---|---|
| `0` | Full roundtrip certified (Forward $\rightarrow$ Rollback $\rightarrow$ Forward) | Migration approved. |
| `1` | Rollback or re-application failure | Fix the migration's `<rollback>` or `DOWN` SQL block. |
| `2` | Configuration or CLI argument error | Check command arguments and database connectivity. |
