# Agents Catalog

Agents are named specialists invoked explicitly for a bounded kind of work. Each agent defines its explicit scope, hard constraints, step-by-step approach, and falsifiable completion criteria (`Done When`).

## Overview Table

| Agent Name | File | Role & Mandate | Domain Guide | Key Constraints | Paired Skill / Instruction |
|---|---|---|---|---|---|
| **Think Planner** | `think-plan.agent.md` | Transforms business requirements or issues into `think.md` and `plan.md`. | [Think & Plan](./domain-think-plan.md#1-business-needs-to-specifications-think-plan) | Zero code changes; atomic steps with explicit verification and bootability checks. | `think-plan` skill |
| **Code Auditor** | `code-audit.agent.md` | Complete, evidence-based code audit of a repo, service, or schema. | [Auditing & Remediation](./domain-audit.md#1-codebase-audit) | Audit agreed scope only; read every file before reporting; no speculative findings. | `audit-reporting` skill |
| **Audit Finding Fixer** | `audit-fix.agent.md` | Surgical remediation of a single finding from a validated audit report. | [Auditing & Remediation](./domain-audit.md#2-surgical-finding-remediation) | One finding only; no unrelated refactoring; verify with narrowest test command. | `audit-reporting` skill |
| **Spec from Code** | `spec-from-code.agent.md` | Reverse-engineers technical specifications from existing code. | [Architecture & Docs](./domain-docs.md#1-reverse-engineering-specifications-spec-from-code) | Grounded strictly in source code; no fabricated features; comprehensive interfaces. | `spec-from-code` skill |
| **Unit Tester** | `unit-test.agent.md` | Writes or updates isolated unit tests with full branch and edge-case coverage. | [Testing & Verification](./domain-testing.md#1-nodejs-unit--route-integration-tests) | **One module scope; edit test files only; never change production code** without explicit consent. | Installed domain test instruction |
| **E2E Tester** | `e2e-test.agent.md` | Writes or updates Playwright browser end-to-end tests for user journeys. | [Testing & Verification](./domain-testing.md#3-angular-playwright-end-to-end-tests) | **`e2e/` scope only; POM pattern; edit test files only; zero production code altered.** | `angular-e2e-tests` instruction |
| **VitePress Docs** | `vitepress-docs.agent.md` | Scaffolds or updates a VitePress documentation site in a user-named folder. | [Architecture & Docs](./domain-docs.md#2-product-documentation-website-vitepress-docs) | Confine all files to docs root; follow `vitepress-docs` instruction; default theme only. | `vitepress-docs-examples` |
| **Performance Tester** | `performance-tests.agent.md` | Designs, scaffolds, or extends k6 load, stress, and spike test suites. | [Testing & Verification](./domain-testing.md#5-k6-performance--load-benchmarking) | Follow k6 Docker execution pattern; assert realistic thresholds; isolate scenarios. | `k6-performance-examples` |
| **Fuzz Tester** | `fuzz-tests.agent.md` | Configures and runs RESTler API fuzzing pipelines. | [Testing & Verification](./domain-testing.md#6-restler-api-grammar-fuzzing) | OpenAPI-driven grammar compilation; handle auth refresh; fail on 500 status. | `restler-fuzzing-examples` |

---

## Agent Deep Dives

### 1. Code Auditor (`code-audit.agent.md`)
- **Role**: Exhaustive code audit across an agreed boundary (microservice or module).
- **Hard Boundaries**: Reads every file in scope before formulating findings. Prohibited from guessing or reporting hypothetical issues.
- **Completion Gate**: Generated report passes the deterministic validation script `skills/audit-reporting/scripts/audit-report.mjs`.
- **Full Workflow**: See [Codebase Audit Workflow](./domain-audit.md#1-codebase-audit).

### 2. Audit Finding Fixer (`audit-fix.agent.md`)
- **Role**: Surgical repair of a single finding from an approved audit report.
- **Hard Boundaries**: Exactly one finding per turn. Zero speculative refactoring or adjacent code reorganization.
- **Completion Gate**: Finding resolved, narrowest test passes, zero unrelated files modified.
- **Full Workflow**: See [Surgical Remediation Workflow](./domain-audit.md#2-surgical-finding-remediation).

### 3. Spec from Code (`spec-from-code.agent.md`)
- **Role**: Reverse-engineers technical specifications and data models directly from source code.
- **Hard Boundaries**: Grounded strictly in observable code; no undocumented or assumed capabilities.
- **Completion Gate**: Area specification markdown files pass `skills/spec-from-code/scripts/spec-docs.mjs` validation.
- **Full Workflow**: See [Technical Specification Pipeline](./domain-docs.md#1-reverse-engineering-specifications-spec-from-code).

### 4. Unit Tester (`unit-test.agent.md`)
- **Role**: Authors or improves isolated unit tests with complete branch coverage.
- **Hard Boundaries**: Strictly one module in scope. **Edits test files only**; never alters production code without explicit approval.
- **Completion Gate**: All execution paths asserted, narrowest test command passes with exit code 0.
- **Full Workflow**: See [Unit & Component Testing](./domain-testing.md#1-nodejs-unit--route-integration-tests).

### 5. E2E Tester (`e2e-test.agent.md`)
- **Role**: Authors and updates Playwright browser end-to-end tests.
- **Hard Boundaries**: Confined to `e2e/`. Enforces Page Object Model (POM). Production code is read-only.
- **Completion Gate**: All journey checkpoints pass headlessly against the containerized dev stack.
- **Full Workflow**: See [End-to-End Testing](./domain-testing.md#3-angular-playwright-end-to-end-tests).

### 6. VitePress Docs (`vitepress-docs.agent.md`)
- **Role**: Scaffolds and maintains product documentation websites using VitePress.
- **Hard Boundaries**: Requires an explicit user-named root (e.g. `website/` or `docs/`). Confined strictly to docs directory.
- **Completion Gate**: `npm run build` succeeds with exit code 0 and all guide pages are indexed in the sidebar navigation.
- **Full Workflow**: See [Product Documentation Website](./domain-docs.md#2-product-documentation-website-vitepress-docs).

### 7. Performance Tester (`performance-tests.agent.md`)
- **Role**: Designs and executes automated k6 API performance and load benchmarking.
- **Hard Boundaries**: Parameterized scenarios with explicit SLA thresholds; runs via Docker runner.
- **Completion Gate**: k6 scenarios execute cleanly and SLA thresholds pass.
- **Full Workflow**: See [Performance & Load Testing](./domain-testing.md#5-k6-performance--load-benchmarking).

### 8. Fuzz Tester (`fuzz-tests.agent.md`)
- **Role**: Configures and runs Microsoft RESTler stateful API fuzzing.
- **Hard Boundaries**: Grammar compilation from OpenAPI contract; handles auth refresh; zero 500 error tolerance.
- **Completion Gate**: Fuzz-lean sequence completes with zero unhandled 500 exceptions.
- **Full Workflow**: See [API Fuzz Testing](./domain-testing.md#6-restler-api-grammar-fuzzing).

### 9. Think Planner (`think-plan.agent.md`)
- **Role**: Analyzes business requirements, user stories, or issues and produces persistent architectural specifications (`think.md` and `plan.md`) without writing code.
- **Hard Boundaries**: **Zero code changes**; codebase is read-only; derives `plan.md` strictly from an approved `think.md`; enforces explicit verification and bootable check per step.
- **Completion Gate**: `think.md` and `plan.md` pass `skills/think-plan/scripts/validate-specs.mjs` validation with exit code 0.
- **Full Workflow**: See [Business Needs to Specifications](./domain-think-plan.md#1-business-needs-to-specifications-think-plan).

