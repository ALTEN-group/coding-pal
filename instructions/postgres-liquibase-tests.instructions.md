---
description: "Testing conventions for PostgreSQL + Liquibase: SQL assertions against a migrated database in the Docker stack, not changeset edits."
applyTo: "tests/db/**/*.sql"
---

# PostgreSQL / Liquibase Testing Instructions

Schema design is owned by the installed PostgreSQL / Liquibase instructions. This file owns tests under `tests/db/` only. Test files are **not** Liquibase changesets; you may edit them freely.

## Path convention

- Schema at `db/liquibase/<service>/…` → tests at `tests/db/<service>/<area>.sql`.
- One concern per file (view read, archive transition, history row, seed). Do not invent a second tree under `db/liquibase/` for tests.

## What to assert

- Behavior the schema instruction requires: reads/writes through the view when one exists, `set_archived` for archive, `log.history` for audited tables, seed `ON CONFLICT DO NOTHING`.
- Do not restate DDL in the test file. Call the objects the changelog already created.

## Execution

- Apply changelog first (Liquibase in the stack), then run the SQL test file against that database.
- Use the project's Docker Compose / script path for Postgres and Liquibase. Do not use a host-only `psql` that is not the stack database.
- Never target production or a shared non-dev database.

## Isolation

- Run against a disposable or dedicated test database in the stack.
- Tests must be safe to re-run (clean up rows you insert, or use transactions that roll back when the project already does that).
