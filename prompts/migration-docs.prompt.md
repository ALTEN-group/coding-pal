---
name: migration-docs
description: "Document the migration of an application from one infrastructure to another (for example on-premise to cloud): assessment, migration plan, and cutover runbook, with minimal application changes."
agent: Migration Documenter
argument-hint: "source to target and optional docs directory, e.g. 'on-premise VMware to Azure docs/migration/orders'"
---

Slash command for the **Migration Documenter** agent.

## Resolve The Target

Use the arguments as the migration to document: the source infrastructure, the target infrastructure, and optionally the output directory (default `docs/migration/<migration-name>/`). Treat any remaining text as extra context, such as the Change Budget (`none`, `config-only`, `minimal-code`), constraints, or the cutover deadline.

If the source or the target is missing or unclear, ask for it. Do not guess. If the directory already holds migration records, continue with the next missing one instead of overwriting a validated record.

## Run

Hand the resolved migration to Migration Documenter. Write the records in order (`assessment.md`, `migration-plan.md`, `runbook.md`) and validate each with the `migration-docs` skill. Report the open questions and the decisions the Architect and DevOps must make. Do not modify the application, infrastructure code, or pipelines.
