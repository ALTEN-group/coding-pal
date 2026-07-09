---
description: "PostgreSQL + Liquibase pattern for building audited, view-backed schemas: history/audit trail, soft-delete/archival, triggers on views, and seed data. Use when working on PostgreSQL database."
applyTo: "db/**/*.sql"
---

# PostgreSQL + Liquibase Audit/View Pattern

Target: `db/liquibase/<serviceName>/versions/`.

## Folder layout (order = dependency order = changelog order)

Each numbered folder maps to one Liquibase `<changeSet>` per file (`sqlFile path="versions/.../x.sql" splitStatements="false"`, id = `"<folder>-<NN>"`). `splitStatements="false"` is required because function bodies contain `$$ ... $$` blocks with embedded semicolons.

```
versions/
  01-hist/   # log schema + generic history functions/index (created once, first)
  02-func/   # generic reusable functions, then one iud_<entity>()/before_*() per entity needing custom write logic
  03-struct/ # base tables, ordered so FK targets exist before dependents (parents before children, then junction tables)
  04-view/   # read-model views (one per entity), joins + aggregates over 03-struct tables
  05-trig/   # wires 02-func functions onto 03-struct tables and 04-view views
  06-data/   # seed/baseline rows, ON CONFLICT DO NOTHING, ANALYZE; at the end
```

## 1. Audit history (append-only log)

- Dedicated `log` schema, one shared table: `log.history(id serial, tstamp, "schemaName", "tableName", operation, "dbUser", "consumerId", "consumerName", record jsonb)`.
- Generic trigger function `change_trigger()` (SECURITY DEFINER), attached `AFTER INSERT OR UPDATE OR DELETE` on each base table:
  - INSERT/UPDATE → insert a row into `log.history` with `row_to_json(NEW)`, consumer id/name taken from `NEW."creatorId"/"creatorName"` (insert) or `NEW."updaterId"/"updaterName"` (update).
  - DELETE → **delete** matching `log.history` rows for that record (history is not meant to survive a hard delete of its subject).
- For entities written through a view that only has an `INSTEAD OF` trigger, the base table still gets its own plain `AFTER` `change_trigger()` — history logging always happens at the base-table level, never in the view trigger.
- Manual helpers used inside custom trigger functions when you can't rely on the generic trigger: `log_history(schema, table, operation, record_new json)` (validates `creatorId`/`creatorName`/`updaterId`/`updaterName` are present, raises if missing) and `delete_history(schema, table, id)`.
- Many-to-many relations have no `change_trigger()` of their own — junction tables have no `id`/audit columns for it to key off. Instead, `iud_<entity>()` calls `PERFORM log_history('<schema>', '<entity>_<relatedEntity>', TG_OP, jsonb_build_object('id', NEW.id, '<relatedEntity>Ids', NEW."<relatedEntity>Ids", 'creatorId'/'updaterId', NEW."creatorId"/"updaterId", 'creatorName'/'updaterName', NEW."creatorName"/"updaterName")::json);` right after replacing the junction rows via `unnest()` — one call per array column, only `IF NEW.<arrayCol> IS NOT NULL`.
- Functional indexes required because history is queried by JSON field: `idx_history_record_id ON log.history ((CAST(record->>'id' AS INT)))` and `idx_history_schema_table ON log.history ("schemaName","tableName")`.
- Helper `get_history(schema, table)` returns one row per `(record id, operation)`, latest `tstamp` — only build this if a view actually needs a "last change per record" join; otherwise the app layer queries `log.history` directly (filter by `schemaName`, `tableName`, `CAST(record->>'id' AS INT)`, `ORDER BY tstamp ASC`).

## 2. Soft delete / archival

- Every archivable table has `archived boolean DEFAULT FALSE` + `"archivedAt" timestamp`.
- Generic function `set_archived(table, id, new_archived, old_archived)` (SECURITY DEFINER, dynamic SQL via `format()`): sets `"archivedAt" = NOW()` only on the FALSE→TRUE transition, otherwise leaves it untouched; updates `archived`.
- Called with `PERFORM set_archived('<table>', NEW.id, NEW.archived, OLD.archived);` from inside the entity's UPDATE trigger/function — never set `archived`/`archivedAt` with a plain `UPDATE`.
- Hard-delete retention job: generic function `delete(schema, table, archived_at_cutoff)` iterates rows where `"archivedAt" < cutoff`, calls `delete_history()` for each, then deletes the row. Invoked from a scheduled job (Node cron), not from a trigger.

## 3. Audit columns (every base table)

```
"createdAt" TIMESTAMP DEFAULT NOW(), "creatorId" INT, "creatorName" TEXT,
"updatedAt" TIMESTAMP NULL,          "updaterId" INT, "updaterName" TEXT
```
System-initiated writes (seed data, jobs) use `"creatorId" = -1, "creatorName" = 'system'`.

## 4. Base tables

- `id SERIAL PRIMARY KEY`.
- Optional `core BOOLEAN DEFAULT FALSE` to mark built-in/seeded rows that the app must protect from deletion (enforce in app/service layer, not DB constraint, unless the entity needs it in a trigger).
- FKs: `ON DELETE CASCADE ON UPDATE CASCADE` by default.
- Many-to-many → dedicated junction table, composite PK, both FKs `ON DELETE CASCADE ON UPDATE CASCADE` (e.g. `<entity>_<relatedEntity>("<entity>Id","<relatedEntity>Id")`).

## 5. Views + INSTEAD OF triggers (read/write model split)

If a view is defined for specific tables, the application reads and writes directly through the **view**:

- `04-view/<n>.sql`: `CREATE OR REPLACE VIEW <entity>s AS SELECT ... FROM <entity> LEFT JOIN <parents> ... LEFT JOIN <junction> ... LEFT JOIN <related> ... GROUP BY <entity>.id, <denormalized parent cols> ORDER BY id`. Use `array_agg(DISTINCT x) FILTER (WHERE x IS NOT NULL)` to fold junction-table relations into arrays (e.g. `"<relatedEntity>Id"`, `"<relatedEntity>Ids"`).
- `02-func/<n>.sql`: `iud_<entity>()` trigger function (SECURITY DEFINER) implementing the view's write path:
  - `TG_OP = 'INSERT'`: `INSERT INTO <entity> (...) VALUES (...) RETURNING id INTO NEW.id;` then insert junction rows from array columns via `unnest()`.
  - `TG_OP = 'UPDATE'`: `UPDATE <entity> SET col = COALESCE(NEW.col, col), ... WHERE id = NEW.id;`, replace junction rows (`DELETE ... WHERE "<entity>Id" = NEW.id;` then re-insert via `unnest()`) only `IF NEW.<arrayCol> IS NOT NULL`, and call `PERFORM set_archived(...)` for the archive transition.
  - `COALESCE` on every column makes partial updates (`PATCH`-style) safe by default.
- `05-trig/<n>.sql` wires two triggers per entity:
  ```sql
  CREATE TRIGGER <entity>s_iud_trigger
  INSTEAD OF INSERT OR UPDATE OR DELETE ON "<entity>s"
  FOR EACH ROW EXECUTE PROCEDURE iud_<entity>();

  CREATE TRIGGER <entity>_history_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "<entity>"
  FOR EACH ROW EXECUTE PROCEDURE change_trigger();
  ```

## 6. Locking down specific columns

For fields that must be immutable after creation (e.g. `<entity>.<immutableColumn>`), add a `BEFORE UPDATE` trigger function that overwrites the incoming value with the old one:
```sql
CREATE OR REPLACE FUNCTION before_update_<entity>() RETURNS trigger AS $$
BEGIN
  NEW.<col> = OLD.<col>;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
Wire as `BEFORE UPDATE ON <entity> ... EXECUTE PROCEDURE before_update_<entity>();` — separate from the history/view triggers.

## 7. Business-rule guards

Simple invariants that can't be expressed as a `CHECK` constraint go in a `BEFORE INSERT` trigger function that `RAISE EXCEPTION` when violated (e.g. capping rows per user with a `SELECT COUNT(*) ... WHERE` guard). Keep these single-purpose, one function per rule.

## 8. Seed data (`06-data`)

One `INSERT INTO <view>` (or base table if no views) per entity, `ON CONFLICT DO NOTHING`, system-authored (`-1, 'system'`), file ends with `ANALYZE;`. Insert through the view so the `iud_*` trigger populates junction tables too.

## 9. App-side consumption (Node/Express layer)

- Services/routes query the **view** if exists, or the base table otherwise.
- History endpoints query `log.history` directly (`WHERE "schemaName" = $1 AND "tableName" = $2 AND CAST(record->>'id' AS INT) = $3 ORDER BY tstamp ASC`) — don't add a bespoke history table per entity.
- A scheduled job calls the generic `delete()` function to purge history/rows past retention, not raw `DELETE` statements.
