---
name: migration-docs
description: 'Structure, author, and validate the migration documentation set (assessment.md, migration-plan.md, runbook.md) for moving an application from one infrastructure to another, such as on-premise to cloud, while keeping application changes minimal. Use when a Migration Documenter agent or a migration planning session inventories the source, maps it to the target, registers unavoidable application changes, sequences waves with data migration, validation and rollback, or writes the cutover runbook.'
license: MIT
---

# Migration Documentation

Produce deterministic migration records that a cutover team can execute without guessing, and that keep the application untouched wherever the infrastructure can absorb the difference.

## When to Use This Skill

- An application or platform must move between infrastructures (on-premise to cloud, cloud to cloud, datacenter to datacenter, cloud to on-premise) and the move needs documentation.
- The current state is undocumented and must be inventoried from repositories, manifests, and interviews.
- An existing migration document set must be checked for completeness before a cutover is approved.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/migration-docs/` or `.claude/skills/migration-docs/`, use that base path.

## Workflow

1. **Read `references/migration-contract.md` now.** It is the authoritative source for the headings, tables, fields, the Application Change Policy, and the cross-checks.
2. Write the records in sequence. Each record derives from the previous validated one:
   - `assessment.md`: inventory the source with evidence, map every component to a target and a strategy, and register every application change with its Change Budget.
   - `migration-plan.md`: group the migrated components into dependency-ordered waves, then define data migration, connectivity and identity, validation, rollback, and decommissioning.
   - `runbook.md`: turn each wave into numbered steps with owner, action, verification, rollback, and duration.
3. Validate with the deterministic script from this skill's directory:

```bash
# Validate every record present in the directory and cross-check them
node scripts/validate-migration.mjs --dir docs/migration/<name>

# Or validate records individually
node scripts/validate-migration.mjs --assessment docs/migration/<name>/assessment.md
node scripts/validate-migration.mjs --assessment <assessment.md> --plan <migration-plan.md> --allow-open-questions
```

Treat a nonzero exit as invalid output and fix the file rather than ignoring the error. Model compliance alone is advisory; the script is the enforcement gate.

## Done When

- The validator accepts the written records with exit code 0, including the cross-checks between them.
- Every inventory component has evidence and exactly one target mapping.
- Every application change is in the register with a reason the infrastructure side could not cover it, within the declared Change Budget.
- No secret value appears in any record.
