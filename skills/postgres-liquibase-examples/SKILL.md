---
name: postgres-liquibase-examples
description: 'Scaffold or match PostgreSQL + Liquibase schema templates (views, INSTEAD OF triggers, history, soft-delete, seeds). Use when adding entities, triggers, or changelog SQL under db/liquibase.'
license: MIT
---

# PostgreSQL / Liquibase Examples

On-demand SQL samples for the PostgreSQL + Liquibase instruction. Normative rules stay in the installed `postgres-liquibase` instruction; this skill owns scaffolding templates only.

## When to Use This Skill

- Adding or extending audited entities, views, or triggers.
- Matching history, soft-delete, immutable-column, or seed patterns.

## Path resolution

Resolve `references/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`).

## Workflow

1. Follow the installed PostgreSQL / Liquibase instruction for rules and changeset immutability.
2. **Read `references/examples.md` now** before writing SQL.

## Done When

- SQL matches the instruction's folder order and conventions.
- Templates were taken from `references/examples.md`, not improvised from memory.
