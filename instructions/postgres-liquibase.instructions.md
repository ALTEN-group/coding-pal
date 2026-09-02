---
description: "PostgreSQL + Liquibase pattern for building audited, view-backed schemas: history/audit trail, soft-delete/archival, triggers on views, and seed data. Use when working on PostgreSQL database."
applyTo: "db/**/*.sql,db/**/*.xml,db/**/*.yml,db/**/*.yaml"
---

# PostgreSQL + Liquibase Audit/View Pattern

Target: `db/liquibase/<serviceName>/versions/`.

When scaffolding schema objects or matching SQL templates, follow the installed `postgres-liquibase-examples` skill (read its `references/examples.md`). How schema tests are written and run is owned by the installed PostgreSQL / Liquibase test instructions.

## Changeset immutability

- ALWAYS append a new changeset. NEVER edit an existing or already-applied changeset unless the user specifically asks.
- Each numbered folder maps to one Liquibase `<changeSet>` per file (`sqlFile` with `splitStatements="false"`, id = `"<folder>-<NN>"`). `splitStatements="false"` is required because function bodies contain `$$ ... $$` blocks.

## Folder layout (order = dependency order = changelog order)

```
versions/
  01-hist/   # log schema + generic history functions/index (once, first)
  02-func/   # generic functions, then iud_<entity>() / before_*() per entity
  03-struct/ # base tables (FK parents before children, then junctions)
  04-view/   # read-model views (one per entity)
  05-trig/   # wires 02-func onto 03-struct and 04-view
  06-data/   # seed rows, ON CONFLICT DO NOTHING, ANALYZE
```

## 1. Audit history

- Shared `log.history` table in schema `log` (id, tstamp, schemaName, tableName, operation, dbUser, userId, userName, record jsonb).
- Attach `iud_history()` (`SECURITY DEFINER`) `AFTER INSERT OR UPDATE OR DELETE` on each base table:
  - Every operation **appends** a row from `row_to_json(COALESCE(NEW, OLD))`; a hard delete never erases earlier history.
  - Audit identity: INSERT → creator* columns, UPDATE → updater* columns, DELETE → `-1` / `'system'`, since hard deletes only ever run from the archive job.
- History logging always on the **base table**, never inside a view `INSTEAD OF` trigger.
- Manual helpers inside custom triggers: `log_history(...)`.
- Junction tables: no `iud_history()`. Call `log_history` from `iud_<entity>()` after replacing the junction rows via `unnest()` — one call per array column that backs a junction, and only when that column is non-null. Array columns stored on the base table itself (`text[]` and friends) get no call; the base table's own trigger already covers them.
- A manual call passes a synthesized payload (parent id plus the whole array of child ids), so one history row covers the array rather than one row per junction row. That payload must carry the keys `log_history` reads its identity from — `creatorId`/`creatorName` on an INSERT, `updaterId`/`updaterName` on an UPDATE — or the call raises `"userId" is required for tracked operations`.
- Required indexes: `idx_history_record_id` on `(CAST(record->>'id' AS INT))`, `idx_history_schema_table` on `("schemaName","tableName")`.
- Build `get_history(schema, table)` only when a view needs a last-change join; otherwise the app queries `log.history` directly.

## 2. Soft delete / archival

- Archivable tables: `archived boolean DEFAULT FALSE` + `"archivedAt" timestamptz`.
- Use `set_archived(table, id, new_archived, old_archived)` from the entity UPDATE path — never plain `UPDATE` of `archived`/`archivedAt`.
- Hard-delete retention: generic `delete(schema, table, archived_at_cutoff)` removes the rows only. History is kept and aged out by its own scheduled job, so the two retention windows stay independent. Both run from jobs — never a trigger.

## 3. Audit columns (every base table)

`"createdAt"`, `"creatorId"`, `"creatorName"`, `"updatedAt"`, `"updaterId"`, `"updaterName"`. System writes use `"creatorId" = -1`, `"creatorName" = 'system'`.

- Every write must carry its identity: `log_history` rejects a row whose creator (INSERT) or updater (UPDATE) is missing, so seeds and internal callers have to stamp the system author explicitly.
- Any column holding a point in time is `timestamptz`, never a bare `timestamp`. Services write UTC instants while containers run a local `TZ`, so a naive column stores the UTC wall clock and then loses to `NOW()` by the local offset — silently expiring anything with a TTL shorter than that offset.

## 4. Base tables

- `id SERIAL PRIMARY KEY`.
- Optional `core BOOLEAN DEFAULT FALSE` for built-in rows (enforce protection in app/trigger as needed).
- FKs default `ON DELETE CASCADE ON UPDATE CASCADE`.
- Many-to-many → junction table, composite PK, both FKs cascade.

## 5. Views + INSTEAD OF triggers

When a view exists, the app reads and writes through the **view**:

- `04-view`: `CREATE OR REPLACE VIEW` with joins/aggregates; fold M2M via `array_agg(DISTINCT ...) FILTER (...)`.
- `02-func`: `iud_<entity>()` (`SECURITY DEFINER`) for INSERT / UPDATE (`COALESCE` for partial updates) / DELETE; replace junction rows only when the array column is non-null; call `set_archived` on archive transitions.
- `05-trig`: `INSTEAD OF` on the view + `AFTER` `iud_history()` on the base table.

## 6. Immutable columns

`BEFORE UPDATE` trigger that overwrites incoming values with `OLD` for locked fields — separate from history/view triggers.

## 7. Business-rule guards

Invariants that are not `CHECK` constraints → `BEFORE INSERT` trigger that `RAISE EXCEPTION`. One function per rule.

## 8. Seed data (`06-data`)

Insert through the view when one exists (`ON CONFLICT DO NOTHING`, system author, end with `ANALYZE;`) so `iud_*` populates junctions.
