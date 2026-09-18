# Skills Catalog

Skills are on-demand procedural bundles containing contracts, executable scripts, verification fixtures, and scaffolding templates.

Installed via APM as directory bundles under `.agents/skills/<name>/` (Copilot and Cursor) and `.claude/skills/<name>/` (Claude Code).

## Overview Table

| Skill Directory | Type | Paired Primitive | Description |
|---|---|---|---|
| `skills/audit-reporting/` | Protocol & Validator | `code-audit`, `audit-fix` | Deterministic Markdown audit report contract and validation scripts for CI gating. |
| `skills/spec-reporting/` | Protocol & Validator | `spec-from-code` | Technical specification contract under `docs/specs/` with automated schema validation. |
| `skills/vitepress-docs-examples/` | Scaffolding Pack | `vitepress-docs` instruction | VitePress site templates: `package.json`, `config.mjs`, dev Dockerfile, and Pages workflow. |
| `skills/node-express-examples/` | Scaffolding Pack | `node-express` instruction | Express scaffolding: route handlers, controllers, middlewares, and error envelopes. |
| `skills/postgres-liquibase-examples/` | Scaffolding Pack | `postgres-liquibase` instruction | Liquibase XML/YAML changelogs, rollback blocks, audit triggers, and soft-delete SQL. |
| `skills/docker-examples/` | Scaffolding Pack | `docker` instruction | Multi-stage Dockerfiles, Traefik dynamic labels, BuildKit secret mounts, and Compose files. |
| `skills/angular-admin-examples/` | Scaffolding Pack | `angular-admin` instruction | Angular entity slices: CRUD tables, PrimeNG dialogs, reactive form services, and ACL guards. |
| `skills/k6-performance-examples/` | Scaffolding Pack | `k6-performance-tests` instruction | Modular k6 test architecture: virtual users, thresholds, stages, and Docker runners. |
| `skills/restler-fuzzing-examples/` | Scaffolding Pack | `restler-fuzzing-tests` instruction | Microsoft RESTler configuration, dictionary generation, compile scripts, and auth workflows. |

---

## Skill Deep Dives

### 1. Audit Reporting (`skills/audit-reporting/`)
- **Category**: Protocol & Validator
- **Contents**:
  - `SKILL.md`: Procedural guide for generating and checking audit reports.
  - `references/contract.md`: Formal human-readable specification of the audit report Markdown structure (frontmatter, executive summary, findings table, detailed findings).
  - `scripts/validate-report.js`: Fast, deterministic Node.js script that validates reports against the contract rules (finding ID formats, required headings, valid severities).
  - `fixtures/`: Valid and invalid report samples used to test the validator in CI.
- **Workflow**:
  ```bash
  # Validate a generated audit report in CI
  node .agents/skills/audit-reporting/scripts/validate-report.js --report docs/audits/service-audit.md
  ```

### 2. Spec Reporting (`skills/spec-reporting/`)
- **Category**: Protocol & Validator
- **Contents**:
  - `SKILL.md`: Step-by-step extraction workflow.
  - `references/contract.md`: Spec file schema for endpoints, request/response models, database schemas, and background jobs.
  - `scripts/validate-spec.js`: Automated validator asserting that all exported symbols are documented.

### 3. VitePress Docs Examples (`skills/vitepress-docs-examples/`)
- **Category**: Scaffolding Pack
- **Contents**:
  - `SKILL.md`: Guidance on path resolution and docs scaffolding.
  - `references/examples.md`: Complete copy-ready templates for `package.json`, `config.mjs`, `index.md`, dev `dockerfile`, and GitHub Pages workflow.
- **Usage**: Scaffolding agents substitute `<docs-root>` and copy templates directly to set up documentation sites like this one.

### 4. Node.js Express Examples (`skills/node-express-examples/`)
- **Category**: Scaffolding Pack
- **Contents**:
  - Scaffolding templates for route handlers, Joi/Zod request validation middlewares, centralized error handling, and Supertest integration tests.

### 5. PostgreSQL & Liquibase Examples (`skills/postgres-liquibase-examples/`)
- **Category**: Scaffolding Pack
- **Contents**:
  - Templates for audited table creations, auto-updating `updated_at` triggers, soft-delete rules, and corresponding rollback tags.

### 6. Docker Examples (`skills/docker-examples/`)
- **Category**: Scaffolding Pack
- **Contents**:
  - Alpine Node, Go, and Python Dockerfile snippets using BuildKit secret caching and Traefik Compose declarations.

### 7. Angular Admin Examples (`skills/angular-admin-examples/`)
- **Category**: Scaffolding Pack
- **Contents**:
  - Feature-sliced entity templates, PrimeNG Table configs, column sorting, pagination, and ACL-aware button directives.

### 8. k6 Performance Examples (`skills/k6-performance-examples/`)
- **Category**: Scaffolding Pack
- **Contents**:
  - Scenarios for load testing (ramping VUs), soak testing (endurance), and stress testing, including threshold assertions.

### 9. RESTler Fuzzing Examples (`skills/restler-fuzzing-examples/`)
- **Category**: Scaffolding Pack
- **Contents**:
  - OpenAPI compiler configurations, fuzzing dictionary templates, and headless CI runner scripts.
