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
| [docker](instructions/docker.instructions.md) | `docker/**`, `**/dockerfile*`, `scripts/*.sh` | Multi-service Docker/Compose workflow behind Traefik, with BuildKit secrets and env-driven naming. |
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

On-demand workflows with contracts, scripts, and reusable assets.

| Name | Path | Description |
|---|---|---|
| [audit-reporting](skills/audit-reporting/SKILL.md) | `skills/audit-reporting/` | Produce deterministic Markdown audit reports and validate them before CI publication. |

### Prompts

Focused, parameterized commands invoked explicitly.

| Name | File | Description |
|---|---|---|
| Node unit tests | [node-unit-tests](prompts/node-unit-tests.prompt.md) | Generate a Jest + Supertest unit test suite for a Node.js module (runs under the Unit Tester agent). |

## Install with APM

To install this collection in an APM-enabled project, first create an `apm.yml` file:

```yml
# apm.yml — ships with your project
name: your-project
version: 1.0.0
author: your-name
targets:
- copilot
dependencies:
  apm: {}
  mcp: {}

```

### Then install a package

```bash
apm install ALTEN-group/coding-pal/instructions/sharp-agent.instructions.md --target copilot
```

This installs the `instructions/sharp-agent.instructions.md` file to your project so your coding assistant can use it.

Install a named skill from the package bundle:

```bash
apm install ALTEN-group/coding-pal --skill audit-reporting --target copilot
```

### Keep your collection up to date

```bash
apm update
```

Learn more about [**Agent Package Manager**](https://microsoft.github.io/apm/quickstart/)
