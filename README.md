# Coding Pal

Instructions, skills, agents, and prompts to improve your AI coding assistant.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the golden standard on choosing and creating each primitive.

## Catalog

**Always-on** means the harness injects the file when matching context is open (for instructions, that is the `applyTo` glob).
**On-demand** means a person or workflow must select, invoke, or match the primitive by name/description.

### Instructions

Stable standards that apply when matching files are in context.

| Name | Applies to | Load | Description |
|---|---|---|---|
| [sharp-agent](instructions/sharp-agent.instructions.md) | `**` | Always-on | Avoid overengineering and reduce token use. Prefer surgical changes and clear problem-solving. |
| [node-express](instructions/node-express.instructions.md) | `src/**/*.js` | Always-on | Node.js Express service conventions: structure, libraries, flow, caching, errors, and security. |
| [node-unit-tests](instructions/node-unit-tests.instructions.md) | `tests/**/*.js` | Always-on | Jest tests under `tests/`: unit tests for modules, HTTP API tests (Supertest) for routes. |
| [postgres-liquibase](instructions/postgres-liquibase.instructions.md) | `db/**/*.sql`, `db/**/*.xml`, `db/**/*.yml`, `db/**/*.yaml` | Always-on | PostgreSQL + Liquibase audited schemas: history trail, soft-delete, view triggers, and seed data. |
| [postgres-liquibase-tests](instructions/postgres-liquibase-tests.instructions.md) | `tests/db/**/*.sql` | Always-on | SQL assertions against a migrated database in the Docker stack. |
| [docker](instructions/docker.instructions.md) | `docker/**`, `**/dockerfile*`, `**/.dockerignore`, `scripts/**/*.sh` | Always-on | Multi-service Docker/Compose workflow behind Traefik, with BuildKit secrets and env-driven naming. |
| [angular-admin](instructions/angular-admin.instructions.md) | `**/src/app/**/*.ts` | Always-on | Angular admin CRUD pattern: feature-sliced entities, ACL, PrimeNG, and app-config registries. |
| [angular-unit-tests](instructions/angular-unit-tests.instructions.md) | `**/src/**/*.spec.ts` | Always-on | Vitest unit specs (`ng test`), colocated with source. |
| [angular-e2e-tests](instructions/angular-e2e-tests.instructions.md) | `**/e2e/**/*.ts` | Always-on | Playwright e2e for the admin app (`e2e/`, stack baseURL). |
| [vitepress-docs](instructions/vitepress-docs.instructions.md) | `**/.vitepress/**`, `**/docs/guide/**/*.md`, `**/docs/index.md`, `**/docs/public/**` | Always-on | VitePress product docs: user-named docs root, Mermaid, Traefik `/docs` in dev, GitHub Pages in prod. |
| [k6-performance-tests](instructions/k6-performance-tests.instructions.md) | `tests/perf/`, perf Compose, runner, workflow | Always-on | K6 API performance scenarios, Docker execution, reports, thresholds, and CI benchmarks. |
| [restler-fuzzing-tests](instructions/restler-fuzzing-tests.instructions.md) | `tests/restler/`, restler Compose/docker, runner, workflow | Always-on | RESTler API fuzzing: spec-driven grammar compilation, authentication, Docker execution, reports, and CI gating. |

### Agents

Named specialists selected explicitly for a bounded kind of work.

| Name | File | Load | Description |
|---|---|---|---|
| Code Auditor | [code-audit](agents/code-audit.agent.md) | On-demand | Audit every file, interface, and relevant architectural layer in an explicitly scoped codebase. |
| Audit Finding Fixer | [audit-fix](agents/audit-fix.agent.md) | On-demand | Remediate a single finding from a validated code audit report. |
| Spec from Code | [spec-from-code](agents/spec-from-code.agent.md) | On-demand | Generate technical specifications from existing code — nothing left undocumented. |
| Unit Tester | [unit-test](agents/unit-test.agent.md) | On-demand | Create or update unit tests with full edge-case coverage and meaningful assertions. |
| VitePress Docs | [vitepress-docs](agents/vitepress-docs.agent.md) | On-demand | Scaffold or write a VitePress product guide from code in a user-named docs root. |
| Performance Tester | [performance-tests](agents/performance-tests.agent.md) | On-demand | Design, scaffold, adapt, or extend a performance-test suite using the available implementation tooling. |
| Fuzz Tester | [fuzz-tests](agents/fuzz-tests.agent.md) | On-demand | Design, scaffold, adapt, or extend a fuzz-testing suite using the available implementation tooling. |

### Skills

On-demand workflows with contracts, scripts, and reusable assets. Scaffolding example packs are skills too: install them with the matching domain instruction so templates ship as a folder (`SKILL.md` + `references/`).

| Name | Load | Description |
|---|---|---|
| [audit-reporting](skills/audit-reporting/SKILL.md) | On-demand | Produce deterministic Markdown audit reports and validate them before CI publication. |
| [spec-reporting](skills/spec-reporting/SKILL.md) | On-demand | Produce structured Markdown specs under `docs/specs/` and validate them (pairs with Spec from Code). |
| [node-express-examples](skills/node-express-examples/SKILL.md) | On-demand | Express scaffolding templates (pairs with `node-express` instruction). |
| [postgres-liquibase-examples](skills/postgres-liquibase-examples/SKILL.md) | On-demand | Liquibase/SQL scaffolding templates (pairs with `postgres-liquibase` instruction). |
| [docker-examples](skills/docker-examples/SKILL.md) | On-demand | Docker/Compose scaffolding snippets (pairs with `docker` instruction). |
| [angular-admin-examples](skills/angular-admin-examples/SKILL.md) | On-demand | Angular admin entity-slice templates (pairs with `angular-admin` instruction). |
| [vitepress-docs-examples](skills/vitepress-docs-examples/SKILL.md) | On-demand | VitePress site templates (pairs with `vitepress-docs` instruction). |
| [k6-performance-examples](skills/k6-performance-examples/SKILL.md) | On-demand | Reusable k6 architecture patterns (pairs with `k6-performance-tests` instruction). |
| [restler-fuzzing-examples](skills/restler-fuzzing-examples/SKILL.md) | On-demand | Reusable RESTler fuzzing architecture patterns (pairs with `restler-fuzzing-tests` instruction). |

### Prompts

Focused, parameterized commands invoked explicitly.

| Name | File | Load | Description |
|---|---|---|---|
| Node unit tests | [node-unit-tests](prompts/node-unit-tests.prompt.md) | On-demand | Slash command: resolve a `src/` module, map its test file, run Unit Tester (unit vs HTTP API by path). |
| Angular unit tests | [angular-unit-tests](prompts/angular-unit-tests.prompt.md) | On-demand | Slash command: resolve a `src/` module, map `*.spec.ts`, run Unit Tester (Vitest). |
| Angular e2e tests | [angular-e2e-tests](prompts/angular-e2e-tests.prompt.md) | On-demand | Slash command: resolve a flow, map `e2e/<area>.spec.ts`, run Unit Tester (Playwright). |
| Postgres / Liquibase tests | [postgres-liquibase-tests](prompts/postgres-liquibase-tests.prompt.md) | On-demand | Slash command: resolve a `db/` area, map `tests/db/`, run Unit Tester. |
| VitePress docs | [vitepress-docs](prompts/vitepress-docs.prompt.md) | On-demand | Slash command: require a docs-root folder, run VitePress Docs. |
| Performance tests | [performance-tests](prompts/performance-tests.prompt.md) | On-demand | Slash command: implement a performance-test suite for a named service or application. |
| Fuzz tests | [fuzz-tests](prompts/fuzz-tests.prompt.md) | On-demand | Slash command: implement a fuzz-testing suite for a named service or application. |

## Install with APM

Declare what you need in the consumer project's `apm.yml`, then run `apm install`.

Because this repo ships skills under `skills/`, APM treats it as a **skill bundle**. Agents and instructions must be listed as **virtual path** dependencies; skills are selected from the bundle with a `skills:` subset. Do not nest `agents:` / `instructions:` under a single `git: ALTEN-group/coding-pal` entry — APM will install only the skills and skip the rest.

Dependencies are the same for every harness. Only `targets:` (and `apm install --target`) changes.

| Harness | `targets:` | `apm install --target` |
|---|---|---|
| GitHub Copilot | `[copilot]` | `copilot` |
| Claude Code | `[claude]` | `claude` |
| Cursor | `[cursor]` | `cursor` |
| Copilot + Cursor | `[copilot, cursor]` | `copilot,cursor` |
| All three | `[copilot, claude, cursor]` | `copilot,claude,cursor` |

Claude Code and Cursor do **not** load Copilot’s `.github/instructions/` and `.github/agents/` paths. Use `claude`, `cursor`, or both so APM writes native files for each harness.

```yml
# apm.yml — ships with your project
name: your-project
version: 1.0.0
author: your-name
targets:
  - copilot   # and/or: claude, cursor
dependencies:
  apm:
    # Agents
    - ALTEN-group/coding-pal/agents/unit-test.agent.md
    - ALTEN-group/coding-pal/agents/vitepress-docs.agent.md
    - ALTEN-group/coding-pal/agents/performance-tests.agent.md
    - ALTEN-group/coding-pal/agents/fuzz-tests.agent.md
    # Pipelines Agents
    - ALTEN-group/coding-pal/agents/code-audit.agent.md
    - ALTEN-group/coding-pal/agents/audit-fix.agent.md
    # Prompts
    - ALTEN-group/coding-pal/prompts/node-unit-tests.prompt.md
    - ALTEN-group/coding-pal/prompts/angular-unit-tests.prompt.md
    - ALTEN-group/coding-pal/prompts/angular-e2e-tests.prompt.md
    - ALTEN-group/coding-pal/prompts/postgres-liquibase-tests.prompt.md
    - ALTEN-group/coding-pal/prompts/vitepress-docs.prompt.md
    - ALTEN-group/coding-pal/prompts/performance-tests.prompt.md
    - ALTEN-group/coding-pal/prompts/fuzz-tests.prompt.md
    # Instructions
    - ALTEN-group/coding-pal/instructions/sharp-agent.instructions.md
    - ALTEN-group/coding-pal/instructions/node-express.instructions.md
    - ALTEN-group/coding-pal/instructions/node-unit-tests.instructions.md
    - ALTEN-group/coding-pal/instructions/postgres-liquibase.instructions.md
    - ALTEN-group/coding-pal/instructions/postgres-liquibase-tests.instructions.md
    - ALTEN-group/coding-pal/instructions/docker.instructions.md
    - ALTEN-group/coding-pal/instructions/angular-admin.instructions.md
    - ALTEN-group/coding-pal/instructions/angular-unit-tests.instructions.md
    - ALTEN-group/coding-pal/instructions/angular-e2e-tests.instructions.md
    - ALTEN-group/coding-pal/instructions/vitepress-docs.instructions.md
    - ALTEN-group/coding-pal/instructions/k6-performance-tests.instructions.md
    - ALTEN-group/coding-pal/instructions/restler-fuzzing-tests.instructions.md
    # Skills (folder bundles — SKILL.md + references/ + scripts/)
    - git: ALTEN-group/coding-pal
      skills:
        - node-express-examples
        - postgres-liquibase-examples
        - docker-examples
        - angular-admin-examples
        - vitepress-docs-examples
        - k6-performance-examples
        - restler-fuzzing-examples
        - audit-reporting
  mcp: {}
```

```bash
apm install --target copilot          # or: claude   or: cursor   or: copilot,claude,cursor
```

Pick only the agents, instructions, and skills your project needs. Pair each domain instruction with its `*-examples` skill when you want scaffolding templates (e.g. `node-express` + `node-express-examples`). Skills install as whole folders (`SKILL.md` + `references/` + any scripts).

APM deploys each primitive to every listed target.

| Path | From |
|---|---|
| `.github/instructions/*.instructions.md` | Copilot |
| `.github/agents/*.agent.md` | Copilot |
| `.github/prompts/*.prompt.md` | Copilot |
| `.claude/rules/*.md` | Claude Code |
| `.claude/agents/*.md` | Claude Code |
| `.claude/commands/*.md` | Claude Code (compiled from prompts) |
| `.claude/skills/<name>/SKILL.md` | Claude Code |
| `.cursor/rules/*.mdc` | Cursor (rewritten from instructions) |
| `.cursor/agents/*.md` | Cursor |
| `.cursor/commands/*.md` | Cursor (compiled from prompts) |
| `.agents/skills/<name>/SKILL.md` | Shared (Copilot and Cursor) |

### Where files land

| Primitive | GitHub Copilot (`copilot`) | Claude Code (`claude`) | Cursor (`cursor`) |
|---|---|---|---|
| Instructions | `.github/instructions/` | `.claude/rules/` | `.cursor/rules/` (`.mdc`) |
| Agents | `.github/agents/` | `.claude/agents/` | `.cursor/agents/` |
| Prompts | `.github/prompts/` | `.claude/commands/` | `.cursor/commands/` |
| Skills | `.agents/skills/` | `.claude/skills/` | `.agents/skills/` (same shared layout) |

Skills use the shared `.agents/skills/` layout for Copilot and Cursor, but Claude Code keeps its target-native `.claude/skills/` directory. That is APM’s default — not a misconfiguration. Older APM could deploy skills under per-client paths (e.g. `.github/skills/`, `.cursor/skills/`) via `--legacy-skill-paths`; prefer the default layout unless you have a reason not to.

### One-off installs

You can also add a single primitive by path or skill name:

```bash
apm install ALTEN-group/coding-pal/instructions/sharp-agent.instructions.md --target copilot
apm install ALTEN-group/coding-pal --skill audit-reporting --target copilot
```

For Claude Code or Cursor, pass `--target claude`, `--target cursor`, or a comma-separated target list such as `copilot,claude,cursor` the same way.

### Keep your collection up to date

```bash
apm update
```

Learn more about [**Agent Package Manager**](https://microsoft.github.io/apm/quickstart/)
