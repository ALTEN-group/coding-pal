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

- Shared `log.history` table in schema `log` (id, tstamp, schemaName, tableName, operation, dbUser, consumerId, consumerName, record jsonb).
- Attach `change_trigger()` (`SECURITY DEFINER`) `AFTER INSERT OR UPDATE OR DELETE` on each base table:
  - INSERT/UPDATE → insert history row from `row_to_json(NEW)`; consumer from creator*/updater* columns.
  - DELETE → delete matching history rows for that record.
- History logging always on the **base table**, never inside a view `INSTEAD OF` trigger.
- Manual helpers inside custom triggers: `log_history(...)`, `delete_history(...)`.
- Junction tables: no `change_trigger()`; call `log_history` from `iud_<entity>()` after replacing junction rows via `unnest()`, one call per array column when non-null.
- Required indexes: `idx_history_record_id` on `(CAST(record->>'id' AS INT))`, `idx_history_schema_table` on `("schemaName","tableName")`.
- Build `get_history(schema, table)` only when a view needs a last-change join; otherwise the app queries `log.history` directly.

## 2. Soft delete / archival

- Archivable tables: `archived boolean DEFAULT FALSE` + `"archivedAt" timestamp`.
- Use `set_archived(table, id, new_archived, old_archived)` from the entity UPDATE path — never plain `UPDATE` of `archived`/`archivedAt`.
- Hard-delete retention: generic `delete(schema, table, archived_at_cutoff)` (history purge then row delete), invoked from a scheduled job — not a trigger.

## 3. Audit columns (every base table)

`"createdAt"`, `"creatorId"`, `"creatorName"`, `"updatedAt"`, `"updaterId"`, `"updaterName"`. System writes use `"creatorId" = -1`, `"creatorName" = 'system'`.

## 4. Base tables

- `id SERIAL PRIMARY KEY`.
- Optional `core BOOLEAN DEFAULT FALSE` for built-in rows (enforce protection in app/trigger as needed).
- FKs default `ON DELETE CASCADE ON UPDATE CASCADE`.
- Many-to-many → junction table, composite PK, both FKs cascade.

## 5. Views + INSTEAD OF triggers

When a view exists, the app reads and writes through the **view**:

- `04-view`: `CREATE OR REPLACE VIEW` with joins/aggregates; fold M2M via `array_agg(DISTINCT ...) FILTER (...)`.
- `02-func`: `iud_<entity>()` (`SECURITY DEFINER`) for INSERT / UPDATE (`COALESCE` for partial updates) / DELETE; replace junction rows only when the array column is non-null; call `set_archived` on archive transitions.
- `05-trig`: `INSTEAD OF` on the view + `AFTER` `change_trigger()` on the base table.

## 6. Immutable columns

`BEFORE UPDATE` trigger that overwrites incoming values with `OLD` for locked fields — separate from history/view triggers.

## 7. Business-rule guards

Invariants that are not `CHECK` constraints → `BEFORE INSERT` trigger that `RAISE EXCEPTION`. One function per rule.

## 8. Seed data (`06-data`)

Insert through the view when one exists (`ON CONFLICT DO NOTHING`, system author, end with `ANALYZE;`) so `iud_*` populates junctions.
