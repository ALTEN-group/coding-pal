---
name: angular-admin-examples
description: 'Scaffold or match Angular admin CRUD entity slices (model/conf/service, thin feature component, protected routes, resolvers). Use when adding an administrable entity to an Angular admin app.'
license: MIT
---

# Angular Admin Examples

On-demand templates for the Angular admin instruction. Normative rules stay in the installed `angular-admin` instruction; this skill owns scaffolding templates only.

## When to Use This Skill

- Adding a new admin entity (data-access trio, feature component, route, sidenav/table registries).
- Matching ACL-wrapped column configs or lookup resolvers.
- Bootstrapping a brand-new admin app (one-time `main.ts` provider setup) — see the `Bootstrap` section of `references/examples.md`, not the entity steps below.

## Path resolution

Resolve `references/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`).

## Workflow

1. Follow the installed Angular admin instruction for bootstrap, ACL, and registry rules. If the app isn't bootstrapped yet, copy the `Bootstrap` example from `references/examples.md` verbatim — this step runs once per app, never per entity.
2. **Read `references/examples.md` now** before scaffolding.

## Done When

- Entity slice matches the instruction's shape.
- Templates were taken from `references/examples.md`, not improvised from memory.
