# Instructions Catalog

Instructions are persistent, always-on engineering standards. The harness automatically injects the instruction into the LLM context when the open or modified file matches the declared `applyTo` glob.

## Overview Table

| Instruction | File | Pattern (`applyTo`) | Companion Skill | Description |
|---|---|---|---|---|
| **Sharp Agent** | `sharp-agent.instructions.md` | `**` | — | Directives against overengineering, premature abstractions, and token waste. |
| **Node.js Express** | `node-express.instructions.md` | `src/**/*.js` | `node-express-examples` | Architecture, routing, middleware flow, caching, error envelopes, and security. |
| **Node Unit Tests** | `node-unit-tests.instructions.md` | `tests/**/*.js` | — | Jest test conventions: isolated module unit tests and Supertest HTTP API route tests. |
| **PostgreSQL & Liquibase** | `postgres-liquibase.instructions.md` | `db/**/*.{sql,xml,yml,yaml}` | `postgres-liquibase-examples` | Audited schemas, soft-delete triggers, history trails, and migration changeSet conventions. |
| **PostgreSQL Liquibase Tests** | `postgres-liquibase-tests.instructions.md` | `tests/db/**/*.sql` | — | Deterministic SQL assertion scripts validating migrations against containerized DB. |
| **Docker & Compose** | `docker.instructions.md` | `docker/**`, `**/dockerfile*`, `scripts/**/*.sh` | `docker-examples` | Multi-service Compose stack behind Traefik, BuildKit secret mounts, non-root users. |
| **Angular Admin** | `angular-admin.instructions.md` | `**/src/app/**/*.ts` | `angular-admin-examples` | Feature-sliced entities, PrimeNG components, dynamic ACL, and app-config registries. |
| **Angular Unit Tests** | `angular-unit-tests.instructions.md` | `**/src/**/*.spec.ts` | — | Vitest unit specs (`ng test`), isolated testing, mock providers, and component DOM assertions. |
| **Angular E2E Tests** | `angular-e2e-tests.instructions.md` | `**/e2e/**/*.ts` | — | Playwright end-to-end tests covering login, CRUD workflows, and responsive layouts. |
| **VitePress Docs** | `vitepress-docs.instructions.md` | `**/.vitepress/**`, `**/docs/**/*.md` | `vitepress-docs-examples` | VitePress product docs: user-named docs root, Mermaid, Traefik `/docs` in dev, GitHub Pages in prod. |
| **k6 Performance Tests** | `k6-performance-tests.instructions.md` | `tests/perf/`, perf Compose | `k6-performance-examples` | k6 API performance scenarios, Docker execution, metric thresholds, and HTML/JSON summaries. |
| **RESTler Fuzzing Tests** | `restler-fuzzing-tests.instructions.md` | `tests/restler/`, restler Compose | `restler-fuzzing-examples` | RESTler stateful REST API fuzzing: OpenAPI compilation, auth tokens, fuzz-lean CI gating. |

---

## Detailed Instruction Specifications

### 1. Sharp Agent (`sharp-agent.instructions.md`)
- **Applies to**: `**` (All sessions and file types)
- **Mandate**: Core directive for all models to stay sharp, direct, and token-efficient.
- **Rules**:
  - Solve the user's specific problem without introducing unrequested architecture.
  - Never rewrite unrelated code or reformat files outside scope.
  - Never add libraries or external npm/pip packages unless instructed.
  - Always verify with the narrowest project command.

### 2. Node.js Express (`node-express.instructions.md`)
- **Applies to**: `src/**/*.js`
- **Mandate**: Consistent enterprise Node.js microservice architecture.
- **Rules**:
  - Layered directory separation: `routes/`, `controllers/`, `services/`, `models/`, `middlewares/`.
  - Standardized JSON responses: `{ data: ... }` for success and `{ error: { code, message } }` for failures.
  - Mandatory security headers (Helmet, CORS validation) and strict input validation via schemas.
  - Explicit error handling through centralized Express error middleware.

### 3. Node Unit Tests (`node-unit-tests.instructions.md`)
- **Applies to**: `tests/**/*.js`
- **Mandate**: Jest unit and HTTP integration testing standards.
- **Rules**:
  - Clear split between module unit tests (`tests/services/`) and Supertest route tests (`tests/routes/`).
  - No shared mutable state between test cases (`beforeEach` cleanup).
  - Assert status codes, response shapes, and error envelopes on all branches.

### 4. PostgreSQL & Liquibase (`postgres-liquibase.instructions.md`)
- **Applies to**: `db/**/*.sql`, `db/**/*.xml`, `db/**/*.yml`, `db/**/*.yaml`
- **Mandate**: Enterprise database schema migrations and audited data lifecycle.
- **Rules**:
  - Every changeSet must be rollbackable (`<rollback>` tag required).
  - Audit triggers track `created_at`, `updated_at`, and `created_by`.
  - Soft-delete semantics via `deleted_at IS NULL` partial indices.

### 5. PostgreSQL Liquibase Tests (`postgres-liquibase-tests.instructions.md`)
- **Applies to**: `tests/db/**/*.sql`
- **Mandate**: Verification of database migrations.
- **Rules**:
  - Verifies migration scripts roll forward and rollback cleanly against an ephemeral PostgreSQL Docker container.
  - Asserts constraint violations, triggers, and foreign key cascades.

### 6. Docker & Compose (`docker.instructions.md`)
- **Applies to**: `docker/**`, `**/dockerfile*`, `**/.dockerignore`, `scripts/**/*.sh`
- **Mandate**: Production-ready containerization and local dev orchestration.
- **Rules**:
  - Multi-stage builds targeting Alpine or distroless base images.
  - Strict non-root user execution (`USER user` with explicit UID/GID).
  - Secure credential passing via BuildKit `--mount=type=secret`.
  - Traefik reverse proxy labels with dynamic PathPrefix routing.

### 7. Angular Admin (`angular-admin.instructions.md`)
- **Applies to**: `**/src/app/**/*.ts`
- **Mandate**: Feature-sliced admin portal architecture.
- **Rules**:
  - Entities organized in feature slices: `components/`, `services/`, `models/`.
  - PrimeNG integration for data tables, form controls, and dialogs.
  - Role-based UI guards and dynamic action ACL.

### 8. Angular Unit Tests (`angular-unit-tests.instructions.md`)
- **Applies to**: `**/src/**/*.spec.ts`
- **Mandate**: Vitest unit testing for Angular components, services, and pipes.
- **Rules**:
  - Colocated with component source code.
  - Mock external HTTP dependencies using `provideHttpClientTesting()`.

### 9. Angular E2E Tests (`angular-e2e-tests.instructions.md`)
- **Applies to**: `**/e2e/**/*.ts`
- **Mandate**: Playwright browser test automation.
- **Rules**:
  - Page Object Model (POM) pattern under `e2e/pages/`.
  - Tests user journey from authentication to complex entity operations.

### 10. VitePress Docs (`vitepress-docs.instructions.md`)
- **Applies to**: `**/.vitepress/**`, `**/docs/**/*.md`, `**/docs/public/**`
- **Mandate**: Modern VitePress product documentation sites.
- **Rules**:
  - User-named docs root (`website/` or `docs/`).
  - Pre-bundled fastdom and Mermaid plugin integration.
  - Local dev behind Traefik at `/docs`; GitHub Pages deploy from `docs/.vitepress/dist`.

### 11. k6 Performance Tests (`k6-performance-tests.instructions.md`)
- **Applies to**: `tests/perf/`, perf Compose, runner, workflow
- **Mandate**: Automated API load, stress, and soak benchmarking.
- **Rules**:
  - Scenarios parameterized with VUs and duration.
  - Strict thresholds: `http_req_duration: ['p(95)<200']`, `http_req_failed: ['rate<0.01']`.

### 12. RESTler Fuzzing Tests (`restler-fuzzing-tests.instructions.md`)
- **Applies to**: `tests/restler/`, restler Compose, runner, workflow
- **Mandate**: Microsoft RESTler grammar-based fuzz testing.
- **Rules**:
  - Compiles OpenAPI / Swagger specs into executable fuzz grammars.
  - Validates authentication token refreshes during long-running fuzzing runs.
  - Zero 500 errors policy for CI fuzz-lean gates.
