# Skills Catalog

Skills are on-demand procedural bundles containing contracts, executable scripts, verification fixtures, and scaffolding templates.

Installed via APM as directory bundles under `.agents/skills/<name>/` (Copilot and Cursor) and `.claude/skills/<name>/` (Claude Code).

## Overview Table

| Skill Directory | Type | Paired Primitive | Description |
|---|---|---|---|
| `skills/think-plan/` | Protocol & Validator | `think-plan` instruction, `Think Planner` agent | Specification contract and deterministic validator for `think.md` and `plan.md` specification artifacts. |
| `skills/audit-reporting/` | Protocol & Validator | `code-audit`, `audit-fix` | Deterministic Markdown audit report contract and validation scripts for CI gating. |
| `skills/spec-from-code/` | Protocol & Validator | `spec-from-code` | Technical specification contract under `docs/specs/` with automated schema validation. |
| `skills/vitepress-docs-examples/` | Scaffolding Pack | `vitepress-docs` instruction | VitePress site templates: `package.json`, `config.mjs`, dev Dockerfile, and Pages workflow. |
| `skills/node-express-examples/` | Scaffolding Pack | `node-express` instruction | Express scaffolding: route handlers, controllers, middlewares, and error envelopes. |
| `skills/postgres-liquibase-examples/` | Scaffolding Pack | `postgres-liquibase` instruction | Liquibase XML/YAML changelogs, rollback blocks, audit triggers, and soft-delete SQL. |
| `skills/docker-examples/` | Scaffolding Pack | `docker` instruction | Multi-stage Dockerfiles, Traefik dynamic labels, BuildKit secret mounts, and Compose files. |
| `skills/angular-admin-examples/` | Scaffolding Pack | `angular-admin` instruction | Angular entity slices: CRUD tables, PrimeNG dialogs, reactive form services, and ACL guards. |
| `skills/k6-performance-examples/` | Scaffolding Pack | `k6-performance-tests` instruction | Modular k6 test architecture: virtual users, thresholds, stages, and Docker runners. |
| `skills/scope-guard/` | Guard & Boundary | `sharp-agent` instruction, `audit-fix` agent | Blast-radius and churn guard asserting changes stay within allowed paths and thresholds. |
| `skills/dependency-guard/` | Guard & Dependency | Package manifests, PR reviews | Prevents unauthorized, bloated, or banned dependencies in `package.json`. |
| `skills/secret-guard/` | Guard & Security | Pre-commit hooks, CI scanning | Prevents hardcoded credentials, API keys, private keys, and platform tokens in diffs. |
| `skills/task-gate/` | Gate & Verifier | All agents (`Done When`), CI workflows | Multi-stage verification pipeline (lint, types, tests) with structured self-repair diagnostics. |
| `skills/contract-validator/` | Schema Contract | `spec-from-code`, `audit-reporting` | Declarative schema validator for Markdown and structured artifacts without custom scripts. |
| `skills/test-probe/` | Behavioral Probe | Test authoring agents, CI verification | Anti-tautology probe asserting tests fail when unpatched to prove genuine falsifiability. |
| `skills/rollback-probe/` | Behavioral Probe | `postgres-liquibase`, database migrations | Certifies migration reversibility (Forward $\rightarrow$ Rollback $\rightarrow$ Forward) and idempotency. |

---

## Skill Deep Dives

### 1. Audit Reporting (`skills/audit-reporting/`)
- **Category**: Protocol & Validator
- **Contents**:
  - `SKILL.md`: Procedural guide for generating and checking audit reports.
  - `references/report-contract.md`: Formal human-readable specification of the audit report Markdown structure bounded by `<!-- AUDIT-REPORT:START -->` and `<!-- AUDIT-REPORT:END -->` markers, severity sections (`Critical`, `Important`, `Suggestions`), and strictly formatted finding fields.
  - `scripts/audit-report.mjs`: Fast, deterministic Node.js script that validates reports against the contract rules and normalizes output (sorting findings, assigning `AUDIT-001` identifiers).
  - `scripts/audit-report.test.mjs`: Node.js test suite proving validator correctness across valid and invalid inputs.
- **Workflow**:
  ```bash
  # Validate and normalize an audit report in CI
  node .agents/skills/audit-reporting/scripts/audit-report.mjs --input docs/audits/service-audit.md --output docs/audits/service-audit.md
  ```

### 2. Spec from Code (`skills/spec-from-code/`)
- **Category**: Protocol & Validator
- **Contents**:
  - `SKILL.md`: Step-by-step extraction workflow.
  - `references/spec-contract.md`: Spec file schema for area specs, component sections (`Purpose`, `Inputs`, `Outputs`, `Side effects`, `Tests`), and `Ambiguous or undocumented` sections.
  - `scripts/spec-docs.mjs`: Automated validator asserting that all spec files conform to file shape, heading rules, component fields, and max line limits.
  - `scripts/spec-docs.test.mjs`: Node.js test suite asserting spec validation coverage.
- **Workflow**:
  ```bash
  # Validate technical specifications in CI
  node .agents/skills/spec-from-code/scripts/spec-docs.mjs --dir docs/specs
  ```

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

### 10. Think & Plan (`skills/think-plan/`)
- **Category**: Protocol & Validator
- **Contents**:
  - `SKILL.md`: Step-by-step guidance on authoring, formatting, and verifying `think.md` and `plan.md`.
  - `references/think-plan-contract.md`: Authoritative schema for `think.md` (business need, system flow, invariants, minimal change footprint) and `plan.md` (sequential atomic steps with `Files:`, `Action:`, `Verification:`, and `Bootable Check:`).
  - `scripts/validate-specs.mjs`: Fast, deterministic Node.js script asserting that `think.md` and `plan.md` satisfy the specification contract, heading constraints, and bootability checks before build agents touch source code.
  - `scripts/validate-specs.test.mjs`: Test suite asserting validator coverage across valid and invalid inputs.
- **Workflow**:
  ```bash
  # Validate specifications directory in CI or local harness
  node .agents/skills/think-plan/scripts/validate-specs.mjs --dir specs
  ```

### 11. Scope Guard (`skills/scope-guard/`)
- **Category**: Guard & Boundary
- **Contents**:
  - `SKILL.md`: Step-by-step guidance on validating agent blast radius and diff bounds.
  - `references/guard-contract.md`: Invariant specification defining path matching semantics, forbidden file rules (`*.lock`, `*-lock.json`, `.env*`), churn bounds, and exit code contracts.
  - `scripts/scope-guard.mjs`: Fast, zero-dependency Node.js CLI asserting that repository diffs stay within permitted scopes and limits.
  - `scripts/scope-guard.test.mjs`: Node.js test suite proving guard evaluation across valid and invalid inputs.
- **Workflow**:
  ```bash
  # Assert current git changes stay within permitted scope and churn limits
  node .agents/skills/scope-guard/scripts/scope-guard.mjs --git --scope "src/auth/**" --max-additions 100
  ```

### 12. Task Gate (`skills/task-gate/`)
- **Category**: Gate & Verifier
- **Contents**:
  - `SKILL.md`: Pipeline orchestration and self-repair diagnostic guidance.
  - `references/gate-contract.md`: Schema for gate configurations, stage declarations, and diagnostic envelopes.
  - `scripts/task-gate.mjs`: Fast Node.js CLI executing multi-stage checks with fail-fast semantics and decisive failure snippet extraction.
  - `scripts/task-gate.test.mjs`: Test suite asserting stage execution, failure capture, and diagnostic formatting.
- **Workflow**:
  ```bash
  # Execute verification pipeline with JSON diagnostics for agent self-repair
  node .agents/skills/task-gate/scripts/task-gate.mjs --stage "lint:npm run lint" --stage "tests:npm test" --json
  ```

### 13. Contract Validator (`skills/contract-validator/`)
- **Category**: Schema Contract
- **Contents**:
  - `SKILL.md`: Declarative document validation workflow.
  - `references/contract-schema.md`: Specification for `*.contract.json` rules (markers, headings, sequence, max lines).
  - `scripts/validate-contract.mjs`: Generic validator evaluating Markdown/JSON files against declarative contracts without writing custom scripts.
  - `scripts/validate-contract.test.mjs`: Test suite covering marker detection, heading sequences, line overflow, and forbidden patterns.
- **Workflow**:
  ```bash
  # Declaratively validate an artifact against a contract
  node .agents/skills/contract-validator/scripts/validate-contract.mjs --contract contracts/report.contract.json --file docs/report.md
  ```

### 14. Test Probe (`skills/test-probe/`)
- **Category**: Behavioral Probe
- **Contents**:
  - `SKILL.md`: Anti-tautology and test efficacy verification workflow.
  - `references/probe-contract.md`: Falsifiability lifecycle contract (Baseline $\rightarrow$ Inversion $\rightarrow$ Assertion $\rightarrow$ Restoration).
  - `scripts/test-probe.mjs`: Automated probe temporarily unpatching source code to prove that newly generated tests actually fail without the fix.
  - `scripts/test-probe.test.mjs`: Test suite proving detection of vacuous tests and atomic file restoration.
- **Workflow**:
  ```bash
  # Verify that a test suite fails when the source fix is absent
  node .agents/skills/test-probe/scripts/test-probe.mjs --test-cmd "npm test -- tests/auth.test.js" --source "src/auth/service.js"
  ```

### 15. Dependency Guard (`skills/dependency-guard/`)
- **Category**: Guard & Dependency
- **Contents**:
  - `SKILL.md`: Dependency blast-radius guidance and policy workflows.
  - `references/dependency-contract.md`: Manifest invariant contract defining zero-unprompted-dependency rules and banned libraries.
  - `scripts/dependency-guard.mjs`: Node.js CLI inspecting package.json diffs against git HEAD to block unvetted libraries.
  - `scripts/dependency-guard.test.mjs`: Test suite covering new package detection, allow-lists, banned lists, and loose versions.
- **Workflow**:
  ```bash
  # Assert no unauthorized dependencies were added to package.json
  node .agents/skills/dependency-guard/scripts/dependency-guard.mjs --git --allow "zod,dotenv"
  ```

### 16. Secret Guard (`skills/secret-guard/`)
- **Category**: Guard & Security
- **Contents**:
  - `SKILL.md`: Secret leak prevention workflow and remediation steps.
  - `references/secret-contract.md`: Credential pattern contract (AWS keys, private keys, platform tokens, high-entropy assignments).
  - `scripts/secret-guard.mjs`: Fast regex and entropy scanner asserting diffs or source files contain zero hardcoded secrets.
  - `scripts/secret-guard.test.mjs`: Test suite asserting detection and secret masking across credentials.
- **Workflow**:
  ```bash
  # Scan git diff for hardcoded credentials before commit
  node .agents/skills/secret-guard/scripts/secret-guard.mjs --git
  ```

### 17. Rollback Probe (`skills/rollback-probe/`)
- **Category**: Behavioral Probe
- **Contents**:
  - `SKILL.md`: Migration reversibility and idempotency verification workflow.
  - `references/rollback-contract.md`: Roundtrip lifecycle specification (Forward $\rightarrow$ Rollback $\rightarrow$ Forward Re-apply).
  - `scripts/rollback-probe.mjs`: CLI automating migration application, rollback, and re-apply to guarantee clean inverse state.
  - `scripts/rollback-probe.test.mjs`: Test suite covering forward failure, rollback failure, and idempotency verification.
- **Workflow**:
  ```bash
  # Certify database migration reversibility and idempotency
  node .agents/skills/rollback-probe/scripts/rollback-probe.mjs \
    --forward "npm run migrate:up" \
    --rollback "npm run migrate:down"
  ```



