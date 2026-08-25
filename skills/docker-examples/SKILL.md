---
name: docker-examples
description: 'Scaffold or match Docker/Compose templates (non-root users, BuildKit secrets, Traefik labels, compose anchors). Use when adding Dockerfiles, compose services, or docker lifecycle scripts.'
license: MIT
---

# Docker Examples

On-demand snippets for the Docker workflow instruction. Normative rules stay in the installed `docker` instruction; this skill owns scaffolding templates only.

## When to Use This Skill

- Adding or editing Dockerfiles, compose files, or Traefik labels.
- Wiring BuildKit secrets, non-root users, or compose YAML anchors.

## Path resolution

Resolve `references/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`).

## Workflow

1. Follow the installed Docker instruction for naming, layout, and script conventions.
2. **Read `references/examples.md` now** before scaffolding.

## Done When

- Compose/Dockerfiles follow the instruction's conventions.
- Templates were taken from `references/examples.md`, not improvised from memory.
