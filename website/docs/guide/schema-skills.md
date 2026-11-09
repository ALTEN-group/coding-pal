# Skill Markdown Schema & Directory Bundle

A **Skill** is an on-demand bundle: a normative contract, the scripts that enforce it, and the workflow that ties them together. Agents and instructions refer to it by name (*"Follow the installed `think` skill"*) and never copy its contract. A skill is **always a directory**.

```text
skills/<name>/
├── SKILL.md      # Required entry point
├── references/   # Contracts (<topic>-contract.md), examples.md, implementation-patterns.md
└── scripts/      # <name>.mjs, <name>.test.mjs, <name>-fixture(s).mjs, vendor/ (rare)
```

Only `SKILL.md` is required. No shipped skill uses separate `fixtures/` or `templates/` directories: fixtures are importable builders in `scripts/`, and templates live in `references/examples.md`.

| Family | Skills | Shape |
|---|---|---|
| **Record contracts & validators** | `think`, `plan`, `triage`, `decision-record`, `incident-record`, `hypothesis-ledger`, `meeting-pack`, `migration-docs`, `release-plan`, `spec-from-code`, `contract-validator`, `code`, `prove` | Contract plus validator scripts. `prove` has one contract per control and eight control scripts. |
| **Probes, signals & metrics** | `rollback-probe`, `telemetry-scan`, `learn-signals`, `flow-metrics`, `context-health` | Scripts that compute or emit from evidence. |
| **Scaffolding examples** | `node-express-examples`, `postgres-liquibase-examples`, `angular-admin-examples`, `docker-examples` | `SKILL.md` and `references/examples.md`. No scripts. |
| **Suite & site patterns** | `k6-performance-tests`, `restler-fuzzing-tests`, `playwright-demo-videos`, `vitepress-docs` | Normative rules in `SKILL.md`, scaffolding in `references/`. No scripts. |

> [!NOTE]
> `skills/app-state-analysis/` and `skills/alten-html-docs/` do not follow this schema (no `license`, `skill://` references, product-specific). Do not copy them.

---

## Frontmatter

| Field | Required | Rules |
|---|---|---|
| `name` | **Yes** | Kebab-case, equal to the directory name. Scaffolding skills end in `-examples`. |
| `description` | **Yes** | Single-quoted YAML (double any apostrophe). *What it does*, then *"Use when ..."* with concrete trigger terms. This is what harnesses match against. |
| `license` | **Yes** | `MIT`. |

---

## Body

````markdown
# <Skill Title>

<One sentence: what it produces or enforces.>

## When to Use This Skill

- <Which agent or CI job calls it>

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory**, not the repository root or the current directory.

## Workflow

1. **Read `references/<topic>-contract.md` now.**
2. <Draft or run>, then validate:

   ```bash
   node <skill-dir>/scripts/<validator>.mjs --dir specs/issue-42
   ```

## Done When

- `<validator>.mjs` exits with code 0.
````

- `When to Use` and `Done When` are absent from `k6-performance-tests` and `restler-fuzzing-tests`.
- Scaffolding skills: three steps (follow the instruction, **read `references/examples.md` now**, adapt the templates).
- Pattern skills put normative sections (`Architecture`, `Scenarios`, `Thresholds`, ...) before `Workflow`.
- Keep `SKILL.md` short; detail goes in `references/`.

---

## Script Conventions

Scripts are the **enforcement boundary**: a nonzero exit means the artifact is invalid.

- Node.js ESM (`.mjs`) with a `#!/usr/bin/env node` shebang. CI uses Node 22.
- Exit `0` when valid. Scripts consumed by agents or CI offer `--json`.
- Locations and scopes are arguments (`--dir`, `--file`, `--input`, `--scope`, `--stage`), never repository-specific defaults.
- `<script>.test.mjs` beside the script, using `node:test`. `<name>-fixture.mjs` exports valid sample artifacts that tests mutate; it is not named `*.test.mjs`, so the test glob skips it.
- A skill that builds on another imports it from the sibling skill (`plan` → `think`) or vendors it under `scripts/vendor/` (`learn-signals`).

```bash
scripts/test.sh            # node --test skills/*/scripts/*.test.mjs
scripts/test.sh plan       # one skill
scripts/test.sh --lint     # context-lint
```

---

## Example

```markdown
---
name: node-express-examples
description: 'Scaffold or match Node.js Express resource templates (routes, entities, services, middlewares, jobs). Use when adding a new Express resource, wiring cache sub-stacks, or copying an existing service pattern.'
license: MIT
---

# Node.js / Express Examples

On-demand code samples for the Node.js Express instruction. Normative rules stay in the installed `node-express` instruction; this skill owns scaffolding templates only.

## When to Use This Skill

- Adding a new resource (entity, service, router, cache middlewares).

## Path resolution

Resolve `references/` relative to **this skill's install directory**.

## Workflow

1. Follow the installed Node.js Express instruction for rules and checklists.
2. **Read `references/examples.md` now** before writing scaffolding code.
3. Adapt the templates to the resource name and fields.

## Done When

- New files match the instruction's folder layout and conventions.
- Templates were taken from `references/examples.md`, not improvised from memory.
```
