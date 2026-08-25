---
name: postgres-liquibase-tests
description: "Generate or update a SQL test file under tests/db for a Liquibase/Postgres schema area. Use when the user wants tests for a changelog SQL file, a selection, or a db/ path."
agent: Unit Tester
argument-hint: "optional path, e.g. db/liquibase/myservice/versions/04-view/01-users.sql"
---

Slash command for the **Unit Tester** agent on one PostgreSQL / Liquibase schema area.

## Resolve the target

Use the first that is schema (not `tests/db/`):

1. A `db/**/*.sql` (or changelog xml/yml) path in this message
2. The current selection
3. The currently open file

If none of those is under `db/`, ask which schema area to test. Do not guess.

Map `db/liquibase/<service>/…` → `tests/db/<service>/<area>.sql` (create missing directories). Path layout and execution are owned by the installed PostgreSQL / Liquibase test instructions — follow them; do not restate or override them.

## Run

Hand the resolved schema path and mapped test file to Unit Tester. Verify with the **narrowest** project command, executed per those instructions.
