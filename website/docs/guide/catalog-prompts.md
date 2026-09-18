# Prompts Catalog

Prompts are user-facing entry points exposed as slash commands in the AI chat window. They resolve parameters, active editor selections, and open file paths before delegating the work to a specialized agent.

## Overview Table

| Command | File | Bound Agent | Argument Hint | Purpose |
|---|---|---|---|---|
| `/node-unit-tests` | `node-unit-tests.prompt.md` | **Unit Tester** | `optional src path, e.g. src/routes/app.js` | Generates Jest unit tests or Supertest HTTP API route tests for a Node module. |
| `/angular-unit-tests` | `angular-unit-tests.prompt.md` | **Unit Tester** | `optional src path, e.g. src/app/...` | Generates or updates Vitest unit tests colocated with an Angular component/service. |
| `/angular-e2e-tests` | `angular-e2e-tests.prompt.md` | **Unit Tester** | `optional flow name, e.g. auth-login` | Generates Playwright end-to-end tests under `e2e/`. |
| `/postgres-liquibase-tests` | `postgres-liquibase-tests.prompt.md` | **Unit Tester** | `optional db area, e.g. db/changelog` | Generates SQL assertion tests validating migrations against PostgreSQL. |
| `/vitepress-docs` | `vitepress-docs.prompt.md` | **VitePress Docs** | `docs root, e.g. website` | Scaffolds or updates a complete VitePress product documentation website. |
| `/performance-tests` | `performance-tests.prompt.md` | **Performance Tester** | `target service or route` | Scaffolds or updates a k6 performance test suite. |
| `/fuzz-tests` | `fuzz-tests.prompt.md` | **Fuzz Tester** | `OpenAPI path or service name` | Scaffolds or runs RESTler grammar-based fuzzing tests. |

---

## Command Details & Usage

### 1. `/node-unit-tests`
- **Invocation**: `/node-unit-tests [src/path/to/module.js]`
- **Target Resolution**:
  1. Checks for a `src/**/*.js` path in the prompt message.
  2. Falls back to active IDE selection.
  3. Falls back to currently active editor tab.
- **Mapping**: `src/<path>/<file>.js` → `tests/<path>/<file>.test.js`. If under `src/routes/`, applies the HTTP API Supertest standard; otherwise applies module unit testing.
- **Agent Handover**: Invokes **Unit Tester** with resolved paths.

### 2. `/angular-unit-tests`
- **Invocation**: `/angular-unit-tests [src/app/path/to/component.ts]`
- **Target Resolution**: Resolves target TypeScript component, service, or pipe.
- **Mapping**: Colocates `component.spec.ts` in the same directory as `component.ts`.
- **Agent Handover**: Invokes **Unit Tester** with Vitest conventions.

### 3. `/angular-e2e-tests`
- **Invocation**: `/angular-e2e-tests [flow-name]`
- **Target Resolution**: Resolves user workflow name or target page area.
- **Mapping**: Creates or updates `e2e/<area>.spec.ts`.
- **Agent Handover**: Invokes **Unit Tester** with Playwright POM guidelines.

### 4. `/postgres-liquibase-tests`
- **Invocation**: `/postgres-liquibase-tests [db/changelog/path]`
- **Target Resolution**: Resolves target migration changelog or schema table.
- **Mapping**: `db/<area>/...` → `tests/db/<area>.sql`.
- **Agent Handover**: Invokes **Unit Tester** to author SQL rollback and forward assertions.

### 5. `/vitepress-docs`
- **Invocation**: `/vitepress-docs [docs-root]`
- **Target Resolution**: Takes positional argument as documentation folder (e.g., `website`). If omitted, prompts user to specify the root folder rather than guessing.
- **Agent Handover**: Invokes **VitePress Docs** to scaffold or update the VitePress site.

### 6. `/performance-tests`
- **Invocation**: `/performance-tests [service-name]`
- **Target Resolution**: Identifies the API service or endpoint to benchmark.
- **Agent Handover**: Invokes **Performance Tester** to generate k6 load tests and thresholds.

### 7. `/fuzz-tests`
- **Invocation**: `/fuzz-tests [openapi-path]`
- **Target Resolution**: Identifies OpenAPI/Swagger contract for the service.
- **Agent Handover**: Invokes **Fuzz Tester** to compile grammars and execute RESTler fuzzing.
