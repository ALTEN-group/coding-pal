# Prompts Catalog

Prompts are user-facing entry points exposed as slash commands in the AI chat window. They resolve parameters, active editor selections, and open file paths before delegating the work to a specialized agent.

## Overview Table

| Command | File | Bound Agent | Argument Hint | Domain Workflow | Purpose |
|---|---|---|---|---|---|
| `/node-unit-tests` | `node-unit-tests.prompt.md` | **Unit Tester** | `optional src path, e.g. src/services/user.service.js` | [Testing & Verification](./domain-testing.md#1-nodejs-module-unit-tests) | Generates or updates isolated Jest unit tests for a Node module. |
| `/node-api-tests` | `node-api-tests.prompt.md` | **API Tester** | `optional route path, e.g. src/routes/app.js` | [Testing & Verification](./domain-testing.md#2-nodejs-http-api-route-tests) | Generates or updates Supertest HTTP API route tests for an Express route module. |
| `/angular-unit-tests` | `angular-unit-tests.prompt.md` | **Unit Tester** | `optional src path, e.g. src/app/...` | [Testing & Verification](./domain-testing.md#3-angular-vitest-component-specs) | Generates or updates Vitest unit tests colocated with an Angular component/service. |
| `/angular-e2e-tests` | `angular-e2e-tests.prompt.md` | **E2E Tester** | `optional flow name, e.g. auth-login` | [Testing & Verification](./domain-testing.md#4-angular-playwright-end-to-end-tests) | Generates Playwright end-to-end tests under `e2e/`. |
| `/postgres-liquibase-tests` | `postgres-liquibase-tests.prompt.md` | **Unit Tester** | `optional db area, e.g. db/changelog` | [Testing & Verification](./domain-testing.md#5-postgresql--liquibase-migration-assertions) | Generates SQL assertion tests validating migrations against PostgreSQL. |
| `/vitepress-docs` | `vitepress-docs.prompt.md` | **VitePress Docs** | `docs root, e.g. website` | [Specs & Docs](./domain-docs.md#2-product-documentation-website-vitepress-docs) | Scaffolds or updates a complete VitePress product documentation website. |
| `/performance-tests` | `performance-tests.prompt.md` | **Performance Tester** | `target service or route` | [Testing & Verification](./domain-testing.md#6-k6-performance--load-benchmarking) | Scaffolds or updates a k6 performance test suite. |
| `/fuzz-tests` | `fuzz-tests.prompt.md` | **Fuzz Tester** | `OpenAPI path or service name` | [Testing & Verification](./domain-testing.md#7-restler-api-grammar-fuzzing) | Scaffolds or runs RESTler grammar-based fuzzing tests. |

---

## Command Invocation & Target Resolution

Each prompt enforces a deterministic parameter resolution pipeline (argument $\rightarrow$ active editor selection $\rightarrow$ open file). If resolution fails, the prompt halts and asks the user rather than guessing.

### 1. `/node-unit-tests`
- **Invocation**: `/node-unit-tests [src/path/to/module.js]`
- **Target Resolution**: Checks chat prompt for `src/**/*.js`, falls back to active editor selection or current file. If the file is under `src/routes/`, redirects to `/node-api-tests`.
- **Delegation**: Maps to `tests/<path>/<file>.test.js` and hands off execution to **Unit Tester**. See [Node.js Module Unit Tests](./domain-testing.md#1-nodejs-module-unit-tests).

### 2. `/node-api-tests`
- **Invocation**: `/node-api-tests [src/routes/path/to/route.js]`
- **Target Resolution**: Checks chat prompt for `src/routes/**/*.js`, falls back to active editor selection or open route file.
- **Delegation**: Maps to `tests/routes/<resource>.test.js` and hands off execution to **API Tester**. See [Node.js HTTP API Route Tests](./domain-testing.md#2-nodejs-http-api-route-tests).

### 3. `/angular-unit-tests`
- **Invocation**: `/angular-unit-tests [src/app/path/to/component.ts]`
- **Target Resolution**: Resolves target TypeScript component, service, or pipe from prompt, selection, or tab.
- **Delegation**: Colocates `*.spec.ts` adjacent to source and hands off to **Unit Tester**. See [Angular Vitest Component Specs](./domain-testing.md#3-angular-vitest-component-specs).

### 4. `/angular-e2e-tests`
- **Invocation**: `/angular-e2e-tests [flow-name]`
- **Target Resolution**: Resolves target workflow or feature name under `e2e/`.
- **Delegation**: Hands off to **E2E Tester** enforcing Page Object Model. See [Angular Playwright E2E Tests](./domain-testing.md#4-angular-playwright-end-to-end-tests).

### 5. `/postgres-liquibase-tests`
- **Invocation**: `/postgres-liquibase-tests [db/changelog/path]`
- **Target Resolution**: Resolves target migration changelog or schema table.
- **Delegation**: Maps to `tests/db/<area>.sql` and hands off to **Unit Tester**. See [PostgreSQL Migration Assertions](./domain-testing.md#5-postgresql--liquibase-migration-assertions).

### 6. `/vitepress-docs`
- **Invocation**: `/vitepress-docs [docs-root]`
- **Target Resolution**: Takes positional argument as documentation root (e.g., `website/`). Halts and prompts if missing.
- **Delegation**: Hands off scaffolding and configuration to **VitePress Docs**. See [Product Documentation Website](./domain-docs.md#2-product-documentation-website-vitepress-docs).

### 7. `/performance-tests`
- **Invocation**: `/performance-tests [service-name]`
- **Target Resolution**: Identifies target API service or endpoint to benchmark.
- **Delegation**: Hands off k6 scenario generation and threshold setup to **Performance Tester**. See [k6 Performance Benchmarking](./domain-testing.md#6-k6-performance--load-benchmarking).

### 8. `/fuzz-tests`
- **Invocation**: `/fuzz-tests [openapi-path]`
- **Target Resolution**: Resolves OpenAPI/Swagger contract path.
- **Delegation**: Hands off grammar compilation and RESTler execution to **Fuzz Tester**. See [RESTler API Grammar Fuzzing](./domain-testing.md#7-restler-api-grammar-fuzzing).
