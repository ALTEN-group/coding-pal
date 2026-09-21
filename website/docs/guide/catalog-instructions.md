# Instructions Catalog

Instructions are persistent, always-on engineering standards. The harness automatically injects the instruction into the LLM context when the open or modified file matches the declared `applyTo` glob.

## Overview Table

| Instruction | File | Pattern (`applyTo`) | Domain Guide | Companion Skill | Description |
|---|---|---|---|---|---|
| **Think & Plan** | `think-plan.instructions.md` | `**/think.md,**/plan.md,**/specs/**` | [Think & Plan](./domain-think-plan.md#1-business-needs-to-specifications-think-plan) | `think-plan` | Standards for specifications as `think.md` and `plan.md`: bootability preservation, atomic steps, and clean phase separation. |
| **Sharp Agent** | `sharp-agent.instructions.md` | `**` | [Auditing & Remediation](./domain-audit.md#2-surgical-finding-remediation) | — | Directives against overengineering, premature abstractions, and token waste. |
| **Node.js Express** | `node-express.instructions.md` | `src/**/*.js` | [Stacks & Infrastructure](./domain-stacks.md#1-nodejs--express-microservices) | `node-express-examples` | Layered microservice architecture, routing, middleware flow, and error envelopes. |
| **Node Unit Tests** | `node-unit-tests.instructions.md` | `tests/**/*.js` | [Testing & Verification](./domain-testing.md#1-nodejs-unit--route-integration-tests) | — | Jest test conventions: isolated module unit tests and Supertest HTTP API route tests. |
| **PostgreSQL & Liquibase** | `postgres-liquibase.instructions.md` | `db/**/*.{sql,xml,yml,yaml}` | [Stacks & Infrastructure](./domain-stacks.md#3-postgresql--liquibase-database-evolution) | `postgres-liquibase-examples` | Audited schemas, soft-delete triggers, history trails, and migration changeSet conventions. |
| **PostgreSQL Liquibase Tests** | `postgres-liquibase-tests.instructions.md` | `tests/db/**/*.sql` | [Testing & Verification](./domain-testing.md#4-postgresql--liquibase-migration-assertions) | — | Deterministic SQL assertion scripts validating migrations against containerized DB. |
| **Docker & Compose** | `docker.instructions.md` | `docker/**`, `**/dockerfile*`, `scripts/**/*.sh` | [Stacks & Infrastructure](./domain-stacks.md#4-docker-traefik--container-infrastructure) | `docker-examples` | Multi-service Compose stack behind Traefik, BuildKit secret mounts, non-root users. |
| **Angular Admin** | `angular-admin.instructions.md` | `**/src/app/**/*.ts` | [Stacks & Infrastructure](./domain-stacks.md#2-angular-enterprise-admin-portal) | `angular-admin-examples` | Feature-sliced entities, PrimeNG components, dynamic ACL, and app-config registries. |
| **Angular Unit Tests** | `angular-unit-tests.instructions.md` | `**/src/**/*.spec.ts` | [Testing & Verification](./domain-testing.md#2-angular-vitest-component-specs) | — | Vitest unit specs (`ng test`), isolated testing, mock providers, and component DOM assertions. |
| **Angular E2E Tests** | `angular-e2e-tests.instructions.md` | `**/e2e/**/*.ts` | [Testing & Verification](./domain-testing.md#3-angular-playwright-end-to-end-tests) | — | Playwright end-to-end tests covering login, CRUD workflows, and responsive layouts. |
| **VitePress Docs** | `vitepress-docs.instructions.md` | `**/.vitepress/**`, `**/docs/**/*.md` | [Architecture & Docs](./domain-docs.md#2-product-documentation-website-vitepress-docs) | `vitepress-docs-examples` | VitePress product docs: user-named docs root, Mermaid, Traefik `/docs` in dev, GitHub Pages in prod. |
| **k6 Performance Tests** | `k6-performance-tests.instructions.md` | `tests/perf/`, perf Compose | [Testing & Verification](./domain-testing.md#5-k6-performance--load-benchmarking) | `k6-performance-examples` | k6 API performance scenarios, Docker execution, metric thresholds, and HTML/JSON summaries. |
| **RESTler Fuzzing Tests** | `restler-fuzzing-tests.instructions.md` | `tests/restler/`, restler Compose | [Testing & Verification](./domain-testing.md#6-restler-api-grammar-fuzzing) | `restler-fuzzing-examples` | RESTler stateful REST API fuzzing: OpenAPI compilation, auth tokens, fuzz-lean CI gating. |

---

## Detailed Specifications by Domain

Normative architectural rules and code examples are maintained in the respective domain guides to preserve single authoritative ownership.

### Universal & Remediation Instructions
- **Sharp Agent (`sharp-agent.instructions.md`)**: Injected across all files (`**`). Mandates minimal diffs, token efficiency, zero unrequested dependencies, and test verification before completion. See [Surgical Remediation](./domain-audit.md#2-surgical-finding-remediation).

### Application Stack Instructions
- **Node.js Express (`node-express.instructions.md`)**: Enforces strict separation between routes, controllers, and services, standard `{ data }` / `{ error }` JSON envelopes, and security headers. Detailed in [Node.js & Express Microservices](./domain-stacks.md#1-nodejs--express-microservices).
- **PostgreSQL & Liquibase (`postgres-liquibase.instructions.md`)**: Mandates rollbackable changeSets, automatic timestamp audit triggers, and soft deletion. Detailed in [PostgreSQL & Liquibase Database Evolution](./domain-stacks.md#3-postgresql--liquibase-database-evolution).
- **Docker & Compose (`docker.instructions.md`)**: Enforces multi-stage builds, non-root users, BuildKit secrets, and Traefik routing. Detailed in [Docker & Container Infrastructure](./domain-stacks.md#4-docker-traefik--container-infrastructure).
- **Angular Admin (`angular-admin.instructions.md`)**: Governs feature-sliced entities, PrimeNG tables, and dynamic ACL. Detailed in [Angular Enterprise Admin Portal](./domain-stacks.md#2-angular-enterprise-admin-portal).

### Automated Testing Instructions
- **Node Unit Tests (`node-unit-tests.instructions.md`)**: Governs Jest unit and Supertest route assertions. Detailed in [Node.js Unit & Route Integration Tests](./domain-testing.md#1-nodejs-unit--route-integration-tests).
- **Angular Unit Tests (`angular-unit-tests.instructions.md`)**: Governs colocated Vitest specs. Detailed in [Angular Vitest Component Specs](./domain-testing.md#2-angular-vitest-component-specs).
- **Angular E2E Tests (`angular-e2e-tests.instructions.md`)**: Governs Playwright Page Object Model suites. Detailed in [Angular Playwright End-to-End Tests](./domain-testing.md#3-angular-playwright-end-to-end-tests).
- **PostgreSQL Liquibase Tests (`postgres-liquibase-tests.instructions.md`)**: Governs SQL forward and rollback assertions. Detailed in [PostgreSQL Liquibase Tests](./domain-testing.md#4-postgresql--liquibase-migration-assertions).
- **k6 Performance Tests (`k6-performance-tests.instructions.md`)**: Governs load and spike scenarios with strict SLA thresholds. Detailed in [k6 Performance Benchmarking](./domain-testing.md#5-k6-performance--load-benchmarking).
- **RESTler Fuzzing Tests (`restler-fuzzing-tests.instructions.md`)**: Governs API grammar fuzzing and zero 500 error gates. Detailed in [RESTler API Grammar Fuzzing](./domain-testing.md#6-restler-api-grammar-fuzzing).

### Think & Plan Instructions
- **Think & Plan (`think-plan.instructions.md`)**: Governs persistent specification artifacts (`think.md` and `plan.md`). Enforces that specifications are structured models of architecture and execution rather than narrative prose, mandating atomic steps, verification commands, and bootability checks before build agents touch code. Detailed in [Business Needs to Specifications](./domain-think-plan.md#1-business-needs-to-specifications-think-plan).

### Documentation & Architecture Instructions
- **VitePress Docs (`vitepress-docs.instructions.md`)**: Governs docs site scaffolding, VitePress configuration, Mermaid diagrams, and dual dev/prod routing. Detailed in [Product Documentation Website](./domain-docs.md#2-product-documentation-website-vitepress-docs).
