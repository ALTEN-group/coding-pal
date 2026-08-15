# Coding Pal

Instructions, skills, agents, and prompts to improve your AI coding assistant.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the golden standard on choosing and creating each primitive.

## Catalog

### Instructions

Stable standards that apply when matching files are in context.

| Name | Applies to | Description |
|---|---|---|
| [sharp-agent](instructions/sharp-agent.instructions.md) | `**` | Avoid overengineering and reduce token use. Prefer surgical changes and clear problem-solving. |
| [node-express](instructions/node-express.instructions.md) | `src/**/*.js` | Node.js Express service conventions: structure, libraries, flow, caching, errors, and security. |
| [node-unit-tests](instructions/node-unit-tests.instructions.md) | `tests/**/*.js` | Jest / Supertest conventions and formatting for Node.js unit tests. |
| [postgres-liquibase](instructions/postgres-liquibase.instructions.md) | `db/**/*.sql` | PostgreSQL + Liquibase audited schemas: history trail, soft-delete, view triggers, and seed data. |
| [docker](instructions/docker.instructions.md) | `docker/**`, `**/dockerfile*`, docker lifecycle `scripts/` | Multi-service Docker/Compose workflow behind Traefik, with BuildKit secrets and env-driven naming. |
| [angular-admin](instructions/angular-admin.instructions.md) | `admin/src/**/*.ts` | Angular admin CRUD pattern: feature-sliced entities, ACL, PrimeNG, and app-config registries. |

### Agents

Named specialists selected explicitly for a bounded kind of work.

| Name | File | Description |
|---|---|---|
| Node.js Express.js Back-end Code Audit | [node-express-back-end-code-audit](agents/node-express-back-end-code-audit.agent.md) | Audit every file, class, function, and endpoint in a Node.js Express service and PostgreSQL schema. |
| Node.js Express.js Audit Fix | [node-express-audit-fix](agents/node-express-audit-fix.agent.md) | Remediate a single audit finding in a Node.js Express service or PostgreSQL schema. |
| Spec from Code | [spec-from-code](agents/spec-from-code.agent.md) | Generate technical specifications from existing code — nothing left undocumented. |
| Unit Tester | [unit-test](agents/unit-test.agent.md) | Create or update unit tests with full edge-case coverage and meaningful assertions. |

### Skills

On-demand workflows with contracts, scripts, and reusable assets. Scaffolding example packs are skills too: install them with the matching domain instruction so templates ship as a folder (`SKILL.md` + `references/`).

| Name | Path | Description |
|---|---|---|
| [audit-reporting](skills/audit-reporting/SKILL.md) | `skills/audit-reporting/` | Produce deterministic Markdown audit reports and validate them before CI publication. |
| [node-express-examples](skills/node-express-examples/SKILL.md) | `skills/node-express-examples/` | Express scaffolding templates (pairs with `node-express` instruction). |
| [postgres-liquibase-examples](skills/postgres-liquibase-examples/SKILL.md) | `skills/postgres-liquibase-examples/` | Liquibase/SQL scaffolding templates (pairs with `postgres-liquibase` instruction). |
| [docker-examples](skills/docker-examples/SKILL.md) | `skills/docker-examples/` | Docker/Compose scaffolding snippets (pairs with `docker` instruction). |
| [angular-admin-examples](skills/angular-admin-examples/SKILL.md) | `skills/angular-admin-examples/` | Angular admin entity-slice templates (pairs with `angular-admin` instruction). |

### Prompts

Focused, parameterized commands invoked explicitly.

| Name | File | Description |
|---|---|---|
| Node unit tests | [node-unit-tests](prompts/node-unit-tests.prompt.md) | Generate a Jest + Supertest unit test suite for a Node.js module (runs under the Unit Tester agent). |

## Install with APM

Declare what you need in the consumer project's `apm.yml`, then run `apm install`.

Because this repo ships skills under `skills/`, APM treats it as a **skill bundle**. Agents and instructions must be listed as **virtual path** dependencies; skills are selected from the bundle with a `skills:` subset. Do not nest `agents:` / `instructions:` under a single `git: ALTEN-group/coding-pal` entry — APM will install only the skills and skip the rest.

### Example: GitHub Copilot

The example below targets **GitHub Copilot** only (`targets: [copilot]`). Dependencies are the same for Cursor; only the `targets:` list (and install `--target`) changes.

```yml
# apm.yml — ships with your project
name: your-project
version: 1.0.0
author: your-name
targets:
  - copilot
dependencies:
  apm:
    # Agents (virtual paths — single-file primitives)
    - ALTEN-group/coding-pal/agents/unit-test.agent.md
    - ALTEN-group/coding-pal/agents/node-express-back-end-code-audit.agent.md
    - ALTEN-group/coding-pal/agents/node-express-audit-fix.agent.md
    # Instructions (virtual paths — single-file primitives)
    - ALTEN-group/coding-pal/instructions/sharp-agent.instructions.md
    - ALTEN-group/coding-pal/instructions/node-express.instructions.md
    - ALTEN-group/coding-pal/instructions/node-unit-tests.instructions.md
    - ALTEN-group/coding-pal/instructions/postgres-liquibase.instructions.md
    - ALTEN-group/coding-pal/instructions/docker.instructions.md
    - ALTEN-group/coding-pal/instructions/angular-admin.instructions.md
    # Skills (folder bundles — SKILL.md + references/ + scripts/)
    - git: ALTEN-group/coding-pal
      skills:
        - audit-reporting
        - node-express-examples
        - postgres-liquibase-examples
        - docker-examples
        - angular-admin-examples
  mcp: {}
```

```bash
apm install --target copilot
```

Pick only the agents, instructions, and skills your project needs. Pair each domain instruction with its `*-examples` skill when you want scaffolding templates (e.g. `node-express` + `node-express-examples`). Skills install as whole folders (`SKILL.md` + `references/` + any scripts).

### Example: Cursor

Cursor does **not** load Copilot’s `.github/instructions/` and `.github/agents/` paths. Use `targets: [cursor]` so APM writes Cursor-native files. Dependencies are the same; only `targets` changes:

```yml
# apm.yml — Cursor only
name: your-project
version: 1.0.0
author: your-name
targets:
  - cursor
dependencies:
  apm:
    - ALTEN-group/coding-pal/agents/unit-test.agent.md
    - ALTEN-group/coding-pal/agents/node-express-back-end-code-audit.agent.md
    - ALTEN-group/coding-pal/agents/node-express-audit-fix.agent.md
    - ALTEN-group/coding-pal/instructions/sharp-agent.instructions.md
    - ALTEN-group/coding-pal/instructions/node-express.instructions.md
    - ALTEN-group/coding-pal/instructions/node-unit-tests.instructions.md
    - ALTEN-group/coding-pal/instructions/postgres-liquibase.instructions.md
    - ALTEN-group/coding-pal/instructions/docker.instructions.md
    - ALTEN-group/coding-pal/instructions/angular-admin.instructions.md
    - git: ALTEN-group/coding-pal
      skills:
        - audit-reporting
        - node-express-examples
        - postgres-liquibase-examples
        - docker-examples
        - angular-admin-examples
  mcp: {}
```

```bash
apm install --target cursor
```

APM rewrites instructions to `.cursor/rules/*.mdc` and agents to `.cursor/agents/`. Skills still land in `.agents/skills/`.

### Example: Copilot and Cursor together

If the repo uses both harnesses, list both targets. APM deploys each primitive to every active target:

```yml
# apm.yml — GitHub Copilot + Cursor
name: your-project
version: 1.0.0
author: your-name
targets:
  - copilot
  - cursor
dependencies:
  apm:
    - ALTEN-group/coding-pal/agents/unit-test.agent.md
    - ALTEN-group/coding-pal/agents/node-express-back-end-code-audit.agent.md
    - ALTEN-group/coding-pal/agents/node-express-audit-fix.agent.md
    - ALTEN-group/coding-pal/instructions/sharp-agent.instructions.md
    - ALTEN-group/coding-pal/instructions/node-express.instructions.md
    - ALTEN-group/coding-pal/instructions/node-unit-tests.instructions.md
    - ALTEN-group/coding-pal/instructions/postgres-liquibase.instructions.md
    - ALTEN-group/coding-pal/instructions/docker.instructions.md
    - ALTEN-group/coding-pal/instructions/angular-admin.instructions.md
    - git: ALTEN-group/coding-pal
      skills:
        - audit-reporting
        - node-express-examples
        - postgres-liquibase-examples
        - docker-examples
        - angular-admin-examples
  mcp: {}
```

```bash
apm install --target copilot,cursor
```

Resulting layout:

| Path | From |
|---|---|
| `.github/instructions/*.instructions.md` | Copilot |
| `.github/agents/*.agent.md` | Copilot |
| `.cursor/rules/*.mdc` | Cursor (rewritten from instructions) |
| `.cursor/agents/` | Cursor |
| `.agents/skills/<name>/` | Shared (both) |

### Where files land

| Primitive | GitHub Copilot (`copilot`) | Cursor (`cursor`) |
|---|---|---|
| Instructions | `.github/instructions/` | `.cursor/rules/` (`.mdc`) |
| Agents | `.github/agents/` | `.cursor/agents/` |
| Prompts | `.github/prompts/` | harness-specific |
| Skills | `.agents/skills/` | `.agents/skills/` (same shared layout) |

Skills use the shared `.agents/skills/` layout (cross-client Agent Skills), not `.github/`. That is APM’s default — not a misconfiguration. Older APM could deploy skills under per-client paths (e.g. `.github/skills/`, `.cursor/skills/`) via `--legacy-skill-paths`; prefer the shared layout unless you have a reason not to.

### One-off installs

You can also add a single primitive by path or skill name:

```bash
apm install ALTEN-group/coding-pal/instructions/sharp-agent.instructions.md --target copilot
apm install ALTEN-group/coding-pal --skill audit-reporting --target copilot
```

For Cursor, pass `--target cursor` (or `copilot,cursor`) the same way.

### Keep your collection up to date

```bash
apm update
```

Learn more about [**Agent Package Manager**](https://microsoft.github.io/apm/quickstart/)
