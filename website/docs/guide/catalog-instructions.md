# Instructions Catalog

Instructions are persistent, always-on engineering standards. The harness automatically injects the instruction into the LLM context when the open or modified file matches the declared `applyTo` glob.

## Overview Table

| Instruction | File | Pattern (`applyTo`) | Domain Guide | Companion Skill | Description |
|---|---|---|---|---|---|
| **Think** | `think.instructions.md` | `**/think.md` | [Think & Plan](./domain-think-plan.md) | `think-plan` | Standards for the Think record: 2 to 4 options, Forge-first bindings, blast radius tiering, decision records, zero source code. |
| **Plan** | `plan.instructions.md` | `**/plan.md` | [Think & Plan](./domain-think-plan.md) | `think-plan` | Standards for the Plan record: strictly derived from think.md, explicit file scope, acceptance criteria, atomic steps with `New Code`, bootability preservation. |
| **Code** | `code-loop.instructions.md` | `**/specs/**/progress.json,**/pull_request_template.md,**/PULL_REQUEST_TEMPLATE.md` | [Code](./domain-code.md) | `code-loop`, `pr-record` | Code stage rules: no manual code, green before PR, tests named by acceptance criterion, bounded dependencies, short-lived branches, fix-loop limit. |
| **Prove Controls** | `prove-controls.instructions.md` | `**/.github/workflows/**,**/control-guard.json,**/mutation-bar.json,**/waivers.json,**/rails.json` | [Prove](./domain-prove.md) | `control-guard`, `security-gate`, `verification-pipeline`, `preview-smoke` | Controls are fixed: agents run them but never change them. Waivers need a reason, an approver, and an expiry. The bug rule. |
| **Release** | `release.instructions.md` | `**/release.md,**/.github/workflows/release*.yml` | [Release](./domain-release.md) | `release-plan` | Deploy is not release, the flag is the release decision, thresholds and rollback are declared before deployment, one issue per release. |
| **Learn** | `learn.instructions.md` | `**/incidents/**,**/specs/learn/**` | [Learn](./domain-learn.md) | `incident-record`, `hypothesis-ledger` | Incident records and the hypothesis ledger: mitigation before diagnosis, a failing test first, review within five working days, humans decide verdicts, invalidated features are deleted. |
| **Forge** | `forge.instructions.md` | `**/docs/forge/**,**/forge-catalog.json,**/skills/forge/catalog.json` | [Forge](./domain-forge.md) | `forge` | Catalog-only standard: certified before listed, owner, versioning, explicit deprecation, compose before you build when authoring entries. Bindings are owned by the Think & Plan instruction and the forge contract. |
| **Decision Record** | `decision-record.instructions.md` | `**/docs/decisions/**` | [Governance & Decisions](./domain-governance.md) | `decision-record` | Decision records and escalations: AI drafts, the Architect signs. |
| **Meeting Pack** | `meeting-pack.instructions.md` | `**/meetings/**,**/docs/glossary.md` | [Meet](./domain-meet.md#_1-transcript-to-meeting-pack) | `meeting-pack` | Standards for client meeting records: immutable transcripts, verbatim client evidence, consent, glossary stewardship, human confirmation. |
| **Triage** | `triage.instructions.md` | `**/triage.md,**/specs/triage/**` | [Triage](./domain-triage.md#_1-candidate-need-to-backlog-issue) | `triage` | Standards for triage artifacts: verbatim evidence, coarse scoring, AI proposes and the Product Owner decides, ledger memory. |
| **Sharp Agent** | `sharp-agent.instructions.md` | `**` | [Audit & Remediation](./domain-audit.md#_2-surgical-finding-remediation) | — | Directives against overengineering, premature abstractions, and token waste. |
| **Node.js Express** | `node-express.instructions.md` | `src/**/*.js` | [Tech Stacks](./domain-stacks.md#_1-node-js-express-microservices) | `node-express-examples` | Layered microservice architecture, routing, middleware flow, and error envelopes. |
| **Node Unit Tests** | `node-unit-tests.instructions.md` | `tests/**/*.js` | [Testing & Verification](./domain-testing.md#_1-node-js-module-unit-tests) | — | Jest test conventions: isolated module unit tests for services, utils, controllers, and middlewares. |
| **Node HTTP API Tests** | `node-api-tests.instructions.md` | `tests/routes/**/*.js,tests/api/**/*.js` | [Testing & Verification](./domain-testing.md#_2-node-js-http-api-route-tests) | — | Supertest HTTP API route test conventions: endpoint contracts, request/response assertions, and boundary mocking. |
| **PostgreSQL & Liquibase** | `postgres-liquibase.instructions.md` | `db/**/*.{sql,xml,yml,yaml}` | [Tech Stacks](./domain-stacks.md#_3-postgresql-liquibase-database-evolution) | `postgres-liquibase-examples` | Audited schemas, soft-delete triggers, history trails, and migration changeSet conventions. |
| **PostgreSQL Liquibase Tests** | `postgres-liquibase-tests.instructions.md` | `tests/db/**/*.sql` | [Testing & Verification](./domain-testing.md#_5-postgresql-liquibase-migration-assertions) | — | Deterministic SQL assertion scripts validating migrations against containerized DB. |
| **Docker & Compose** | `docker.instructions.md` | `docker/**`, `**/dockerfile*`, `scripts/**/*.sh` | [Tech Stacks](./domain-stacks.md#_4-docker-traefik-container-infrastructure) | `docker-examples` | Multi-service Compose stack behind Traefik, BuildKit secret mounts, non-root users. |
| **Angular Admin** | `angular-admin.instructions.md` | `**/src/app/**/*.ts` | [Tech Stacks](./domain-stacks.md#_2-angular-enterprise-admin-portal) | `angular-admin-examples` | Feature-sliced entities, PrimeNG components, dynamic ACL, and app-config registries. |
| **Angular Unit Tests** | `angular-unit-tests.instructions.md` | `**/src/**/*.spec.ts` | [Testing & Verification](./domain-testing.md#_3-angular-vitest-component-specs) | — | Vitest unit specs (`ng test`), isolated testing, mock providers, and component DOM assertions. |
| **Angular E2E Tests** | `angular-e2e-tests.instructions.md` | `**/e2e/**/*.ts` | [Testing & Verification](./domain-testing.md#_4-angular-playwright-end-to-end-tests) | — | Playwright end-to-end tests covering login, CRUD workflows, and responsive layouts. |
| **VitePress Docs** | `vitepress-docs.instructions.md` | `**/.vitepress/**`, `**/docs/**/*.md` | [Specs & Docs](./domain-docs.md#_2-product-documentation-website-vitepress-docs) | `vitepress-docs-examples` | VitePress product docs: user-named docs root, Mermaid, Traefik `/docs` in dev, GitHub Pages in prod. |
| **k6 Performance Tests** | `k6-performance-tests.instructions.md` | `tests/perf/`, perf Compose | [Testing & Verification](./domain-testing.md#_6-k6-performance-load-benchmarking) | `k6-performance-examples` | k6 API performance scenarios, Docker execution, metric thresholds, and HTML/JSON summaries. |
| **RESTler Fuzzing Tests** | `restler-fuzzing-tests.instructions.md` | `tests/restler/`, restler Compose | [Testing & Verification](./domain-testing.md#_7-restler-api-grammar-fuzzing) | `restler-fuzzing-examples` | RESTler stateful REST API fuzzing: OpenAPI compilation, auth tokens, fuzz-lean CI gating. |
| **Migration Docs** | `migration-docs.instructions.md` | `**/docs/migration/**/*.md` | [Migration](./domain-migration.md) | `migration-docs` | Migration records: strict order, minimal application change, evidence, no secrets, rollback designed in. |

---

## Detailed Specifications by Domain

Normative architectural rules and code examples are maintained in the respective domain guides to preserve single authoritative ownership.

### Universal & Remediation Instructions
- **Sharp Agent (`sharp-agent.instructions.md`)**: Injected across all files (`**`). Mandates minimal diffs, token efficiency, zero unrequested dependencies, and test verification before completion. See [Surgical Remediation](./domain-audit.md#_2-surgical-finding-remediation).

### Tech Stack Instructions
- **Node.js Express (`node-express.instructions.md`)**: Enforces strict separation between routes, controllers, and services, standard `{ data }` / `{ error }` JSON envelopes, and security headers. Detailed in [Node.js & Express Microservices](./domain-stacks.md#_1-node-js-express-microservices).
- **PostgreSQL & Liquibase (`postgres-liquibase.instructions.md`)**: Mandates rollbackable changeSets, automatic timestamp audit triggers, and soft deletion. Detailed in [PostgreSQL & Liquibase Database Evolution](./domain-stacks.md#_3-postgresql-liquibase-database-evolution).
- **Docker & Compose (`docker.instructions.md`)**: Enforces multi-stage builds, non-root users, BuildKit secrets, and Traefik routing. Detailed in [Docker & Container Infrastructure](./domain-stacks.md#_4-docker-traefik-container-infrastructure).
- **Angular Admin (`angular-admin.instructions.md`)**: Governs feature-sliced entities, PrimeNG tables, and dynamic ACL. Detailed in [Angular Enterprise Admin Portal](./domain-stacks.md#_2-angular-enterprise-admin-portal).

### Migration Instructions
- **Migration Docs (`migration-docs.instructions.md`)**: Governs the assessment, migration plan, and runbook. Enforces the strict record order, the Change Budget, infrastructure-first resolution of gaps, evidence for every inventory row, and a designed rollback. Detailed in [Migration](./domain-migration.md).

### Automated Testing Instructions
- **Node Unit Tests (`node-unit-tests.instructions.md`)**: Governs Jest module unit assertions for isolated services and utilities. Detailed in [Node.js Module Unit Tests](./domain-testing.md#_1-node-js-module-unit-tests).
- **Node HTTP API Tests (`node-api-tests.instructions.md`)**: Governs Supertest HTTP route integration assertions. Detailed in [Node.js HTTP API Route Tests](./domain-testing.md#_2-node-js-http-api-route-tests).
- **Angular Unit Tests (`angular-unit-tests.instructions.md`)**: Governs colocated Vitest specs. Detailed in [Angular Vitest Component Specs](./domain-testing.md#_3-angular-vitest-component-specs).
- **Angular E2E Tests (`angular-e2e-tests.instructions.md`)**: Governs Playwright Page Object Model suites. Detailed in [Angular Playwright End-to-End Tests](./domain-testing.md#_4-angular-playwright-end-to-end-tests).
- **PostgreSQL Liquibase Tests (`postgres-liquibase-tests.instructions.md`)**: Governs SQL forward and rollback assertions. Detailed in [PostgreSQL Liquibase Tests](./domain-testing.md#_5-postgresql-liquibase-migration-assertions).
- **k6 Performance Tests (`k6-performance-tests.instructions.md`)**: Governs load and spike scenarios with strict SLA thresholds. Detailed in [k6 Performance Benchmarking](./domain-testing.md#_6-k6-performance-load-benchmarking).
- **RESTler Fuzzing Tests (`restler-fuzzing-tests.instructions.md`)**: Governs API grammar fuzzing and zero 500 error gates. Detailed in [RESTler API Grammar Fuzzing](./domain-testing.md#_7-restler-api-grammar-fuzzing).

### Think & Plan Instructions
- **Think & Plan (`think-plan.instructions.md`)**: Governs the Think record (`think.md`) and the Plan record (`plan.md`). Enforces Forge-first options, blast radius classification, drafted (never signed) decision records, observable acceptance criteria, atomic steps that carry their `New Code`, a test plan, and bootability checks before build agents touch code. Detailed in [Business Needs to Specifications](./domain-think-plan.md#_1-business-needs-to-specifications-think-plan).

### Meeting Pack Instructions
- **Meeting Pack (`meeting-pack.instructions.md`)**: Governs client meeting records (`transcript.md`, `pack.md`, and `docs/glossary.md`). Enforces an immutable transcript, verbatim client-attributed evidence, recorded consent, no secrets, one-page summaries, glossary stewardship, and the rule that AI structures while people confirm. Detailed in [Transcript to Meeting Pack](./domain-meet.md#_1-transcript-to-meeting-pack).

### Triage Instructions
- **Triage (`triage.instructions.md`)**: Governs persistent triage artifacts (`triage.md`, the ledger, and the weights). Enforces clean per-need context, verbatim evidence, coarse 1 to 5 scoring, memory of prior decisions, and the rule that AI proposes while the Product Owner decides. Detailed in [Candidate Need to Backlog Issue](./domain-triage.md#_1-candidate-need-to-backlog-issue).

### Delivery & Governance Instructions
- **Code (`code-loop.instructions.md`)**: Developers do not write manual code; green before PR; tests named by their `AC-<n>`; dependencies declared in the plan; short-lived branches; fix-loop limit of 5. See [Code](./domain-code.md).
- **Prove Controls (`prove-controls.instructions.md`)**: Controls are fixed and agents never change them; waivers need a reason, an approver, and an expiry; no `continue-on-error`; no production credentials for agents; the bug rule. See [Prove](./domain-prove.md).
- **Learn (`learn.instructions.md`)**: Incident records and the hypothesis ledger: mitigation before diagnosis, a failing test before the fix, review within five working days, humans decide verdicts, invalidated features are deleted, and every Learn output becomes a Triage issue. See [Learn](./domain-learn.md).
- **Release (`release.instructions.md`)**: Deploy is not release; the flag is the release decision; an immutable versioned artifact; thresholds and rollback declared per change; one issue per release. See [Release](./domain-release.md).
- **Forge (`forge.instructions.md`)**: Standards for the catalog and its entries only: certified before listed, owner, versioning, explicit deprecation, compose before you build. Bindings (`forge/<id>@<version>`) belong to the Think & Plan instruction and the `forge` contract. See [Forge](./domain-forge.md).
- **Decision Record (`decision-record.instructions.md`)**: AI drafts, the Architect signs; sequential numbering; escalations name a default date. See [Governance & Decisions](./domain-governance.md).

### Specs & Docs Instructions
- **VitePress Docs (`vitepress-docs.instructions.md`)**: Governs docs site scaffolding, VitePress configuration, Mermaid diagrams, and dual dev/prod routing. Detailed in [Product Documentation Website](./domain-docs.md#_2-product-documentation-website-vitepress-docs).
