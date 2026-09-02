# PostgreSQL + Liquibase — Examples

Companion samples for the `postgres-liquibase` instruction, shipped by the `postgres-liquibase-examples` skill. Normative rules live in the instruction; use these templates only when scaffolding.

## View + INSTEAD OF + history triggers

```sql
CREATE TRIGGER <entity>s_iud_trigger
  INSTEAD OF INSERT OR UPDATE OR DELETE ON "<entity>s"
  FOR EACH ROW EXECUTE PROCEDURE iud_<entity>();

CREATE TRIGGER <entity>_history_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "<entity>"
  FOR EACH ROW EXECUTE PROCEDURE iud_history();
```

## Immutable column guard

```sql
CREATE OR REPLACE FUNCTION before_update_<entity>() RETURNS trigger AS $$
BEGIN
  NEW.<col> = OLD.<col>;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Wire as `BEFORE UPDATE ON <entity> ... EXECUTE PROCEDURE before_update_<entity>();`.

## Junction history from `iud_<entity>()`

```sql
IF NEW."<relatedEntity>Ids" IS NOT NULL THEN
  PERFORM log_history(
    '<schema>',
    '<entity>_<relatedEntity>',
    TG_OP,
    jsonb_build_object(
      'id', NEW.id,
      '<relatedEntity>Ids', NEW."<relatedEntity>Ids",
      'creatorId', NEW."creatorId",
      'creatorName', NEW."creatorName",
      'updaterId', NEW."updaterId",
      'updaterName', NEW."updaterName"
    )::json
  );
END IF;
```

## Soft-delete transition

```sql
PERFORM set_archived('<table>', NEW.id, NEW.archived, OLD.archived);
```

## Audit columns

Column types for scaffolding. Which columns are required, and the system author values, are in the PostgreSQL / Liquibase instruction.

```sql
"createdAt" TIMESTAMP DEFAULT NOW(), "creatorId" INT, "creatorName" TEXT,
"updatedAt" TIMESTAMP NULL,          "updaterId" INT, "updaterName" TEXT
```
