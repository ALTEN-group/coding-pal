# Agents Catalog

Agents are named specialists invoked explicitly for a bounded kind of work. Each agent defines its explicit scope, hard constraints, step-by-step approach, and falsifiable completion criteria (`Done When`).

## Overview Table

| Agent Name | File | Role & Mandate | Key Constraints | Paired Skill / Instruction |
|---|---|---|---|---|
| **Code Auditor** | `code-audit.agent.md` | Complete, evidence-based code audit of a repo, service, or schema. | Audit agreed scope only; read every file before reporting; no speculative findings. | `audit-reporting` skill |
| **Audit Finding Fixer** | `audit-fix.agent.md` | Surgical remediation of a single finding from a validated audit report. | One finding only; no unrelated refactoring; verify with narrowest test command. | `audit-reporting` skill |
| **Spec from Code** | `spec-from-code.agent.md` | Reverse-engineers technical specifications from existing code. | Grounded strictly in source code; no fabricated features; comprehensive interfaces. | `spec-reporting` skill |
| **Unit Tester** | `unit-test.agent.md` | Writes or updates isolated unit tests with full branch and edge-case coverage. | **One module scope; edit test files only; never change production code** without explicit user consent. | Installed domain test instruction |
| **E2E Tester** | `e2e-test.agent.md` | Writes or updates Playwright browser end-to-end tests for user journeys. | **`e2e/` scope only; POM pattern; edit test files only; zero production code altered.** | `angular-e2e-tests` instruction |
| **VitePress Docs** | `vitepress-docs.agent.md` | Scaffolds or updates a VitePress documentation site in a user-named folder. | Confine all files to docs root; follow `vitepress-docs` instruction; default theme only. | `vitepress-docs-examples` |
| **Performance Tester** | `performance-tests.agent.md` | Designs, scaffolds, or extends k6 load, stress, and spike test suites. | Follow k6 Docker execution pattern; assert realistic thresholds; isolate scenarios. | `k6-performance-examples` |
| **Fuzz Tester** | `fuzz-tests.agent.md` | Configures and runs RESTler API fuzzing pipelines. | OpenAPI-driven grammar compilation; handle auth refresh; fail on 500 status. | `restler-fuzzing-examples` |

---

## Agent Deep Dives

### 1. Code Auditor (`code-audit.agent.md`)
- **When to Invoke**: When onboarding to a new codebase, preparing a release gate, or conducting architectural reviews.
- **Methodology**:
  1. Resolves target repository and explicit file/service boundary.
  2. Discovers tech stack from package manifests, configs, and migrations.
  3. Applies matching domain instructions as quality standards.
  4. Reads every file in scope before reporting.
  5. Produces a validated report adhering to the `audit-reporting` skill contract.
- **Done When**: Every file in scope has been examined and a validated audit report is generated.

### 2. Audit Finding Fixer (`audit-fix.agent.md`)
- **When to Invoke**: When remediating an item from a code audit report.
- **Methodology**:
  1. Takes a single finding identifier (e.g., `SEC-001`, `PERF-003`).
  2. Reads the finding description, evidence line numbers, and recommended remediation.
  3. Makes surgical changes targeting only the problematic code.
  4. Executes the narrowest test command to ensure no regressions are introduced.
- **Done When**: The finding is resolved, the narrowest test passes, and untouched code remains pristine.

### 3. Spec from Code (`spec-from-code.agent.md`)
- **When to Invoke**: When legacy code lacks documentation or when standardizing API specifications.
- **Methodology**:
  1. Inspects source code, types, route definitions, and DB schemas.
  2. Documents endpoints, payload models, auth requirements, error conditions, and side effects.
  3. Validates output against the `spec-reporting` skill schema.
- **Done When**: All public interfaces and models are documented without omissions.

### 4. Unit Tester (`unit-test.agent.md`)
- **When to Invoke**: Creating or improving test coverage for a specific module or component.
- **Methodology**:
  1. Target is strictly **one module**.
  2. Lists all execution paths (happy path, nulls, boundaries, errors, unexpected types).
  3. Writes tests exercising those paths with meaningful assertions.
  4. Runs the project's narrowest test command (e.g. `npx jest tests/services/user.test.js`).
- **Done When**: Every listed path has assertions, narrowest test passes, and **zero production code was altered**.

### 5. E2E Tester (`e2e-test.agent.md`)
- **When to Invoke**: Creating or maintaining end-to-end browser tests for user flows, authentication, or entity CRUD pages.
- **Methodology**:
  1. Resolves target user journey or page area under `e2e/`.
  2. Identifies accessible roles and UI checkpoints (forms, navigation, banners, ACL boundaries).
  3. Reuses shared helpers in `e2e/helpers/` and enforces Page Object Model (POM).
  4. Executes the narrowest headless Playwright command against the running stack.
- **Done When**: All checkpoints are asserted, narrowest Playwright command passes headlessly, and zero production code was altered.

### 6. VitePress Docs (`vitepress-docs.agent.md`)
- **When to Invoke**: When scaffolding or maintaining a product documentation website.
- **Methodology**:
  1. Requires an explicit docs root folder (e.g. `website/` or `docs/`).
  2. Scaffolds `package.json`, dev `dockerfile`, `.vitepress/config.mjs`, and index/guide pages.
  3. Configures Mermaid diagrams and sidebar navigation.
  4. Verifies docs build using `npm run build`.
- **Done When**: Site builds with exit code 0 and all guide pages are indexed in the sidebar.

### 7. Performance Tester (`performance-tests.agent.md`)
- **When to Invoke**: Designing API performance test suites or validating SLA thresholds.
- **Methodology**:
  1. Analyzes target service routes and payload patterns.
  2. Implements modular k6 scenarios (smoke, load, stress, spike, soak).
  3. Scaffolds Docker runner and Traefik integration.
- **Done When**: k6 test scripts execute locally in Docker and threshold checks pass.

### 8. Fuzz Tester (`fuzz-tests.agent.md`)
- **When to Invoke**: Hardening REST APIs against security flaws, malformed payloads, and crash bugs.
- **Methodology**:
  1. Validates OpenAPI specification.
  2. Compiles grammar files for RESTler.
  3. Runs compile, test, and lean-fuzz suites against the containerized service.
- **Done When**: RESTler fuzz run completes with zero unhandled server exceptions (500 errors).
