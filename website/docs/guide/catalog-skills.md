# Skills Catalog

Skills are on-demand procedural bundles containing contracts, executable scripts, verification fixtures, and scaffolding templates.

Installed via APM as directory bundles under `.agents/skills/<name>/` (Copilot and Cursor) and `.claude/skills/<name>/` (Claude Code).

## Overview Table

| Skill Directory | Type | Paired Primitive | Description |
|---|---|---|---|
| `skills/think/` | Protocol & Validator | `think` instruction, `Thinker` agent | Contract and deterministic validator (`validate-think.mjs`) for the Think record (`think.md`). |
| `skills/plan/` | Protocol & Validator | `plan` instruction, `Planner` agent | Contract and deterministic validator (`validate-plan.mjs`) for the Plan record (`plan.md`), including cross-checks against `think.md`. |
| `skills/code-loop/` | Gate & Tracker | `code-loop` instruction, `Code Agent`, `Gate Fixer` | Steps through a validated plan, records progress in `progress.json`, enforces the fix-loop limit, and guards short-lived agent branches. |
| `skills/pr-record/` | Protocol & Validator | `Code Agent`, `code-loop` instruction | Pull request contract: links, acceptance-criteria traceability, dependencies, blast radius, and the human-validation record by tier. |
| `skills/prove/` | Protocol & Validator | `Prove Validator` agent, `prove` instruction | Prove record contract (`specs/issue-<n>/prove.md`) and deterministic validator (`validate-prove.mjs`) verifying all 13 controls, criteria traceability, semantic review, findings, and verdict. |
| `skills/criteria-verify/` | Gate & Verifier | `Gate Fixer`, CI | Criteria Test Verification: every `AC-<n>` has a passing mapped test, from JUnit XML, Jest/Vitest JSON, or TAP / runner logs. |
| `skills/mutation-bar/` | Gate & Verifier | `Gate Fixer`, CI | Mutation Testing Bar from Stryker or summary JSON, raise-only thresholds. |
| `skills/contract-compat/` | Contract | `Gate Fixer`, CI | Breaking-change detection between two OpenAPI or JSON Schema documents, with a signed decision record as the only override. |
| `skills/security-gate/` | Guard & Security | `Gate Fixer`, CI | SARIF, Conftest/OPA and CycloneDX license gate with approved, expiring waivers. |
| `skills/control-guard/` | Guard & Integrity | `prove-controls` instruction, `Gate Fixer` | Refuses diffs that weaken controls (R1-R8) and enforces the bug rule on a commit range. |
| `skills/preview-smoke/` | Behavioral Probe | CI preview | Probes a running preview's routes for status, JSON values, and latency. |
| `skills/verification-pipeline/` | Scaffolding Pack | `Code Agent`, `Gate Fixer`, CI | Platform Rails delivery skeleton: `verify.yml` and `remediate.yml` templates and `rails-check`. |
| `skills/release-plan/` | Protocol & Validator | `release` instruction, `Release Planner` | Per-change `release.md` contract and validator, plus the deterministic rollout decision (promote, hold, rollback). |
| `skills/hypothesis-ledger/` | Protocol & Validator | `Learn Analyst` | Hypothesis ledger with deterministic verdict proposals and feature-deletion tracking. |
| `skills/incident-record/` | Protocol & Validator | `Learn Analyst`, `learn` instruction | Incident record contract and validator: mitigation before diagnosis, failing test first, review within five working days. |
| `skills/telemetry-scan/` | Behavioral Probe | `Learn Analyst` | Predictive monitoring from exported telemetry: anomalies, trends, breaches, and the deploys that precede them. |
| `skills/learn-signals/` | Protocol & Emitter | `Learn Analyst`, `triage` skill | Turns incidents, invalidated hypotheses, and findings into Triage issue bodies. |
| `skills/context-health/` | Guard & Audit | `Learn Analyst` | Persistent Context lint and a corrections log that proposes new artifacts after two corrections. |
| `skills/forge/` | Catalog & Validator | `forge` instruction, `Forge Curator`, `Thinker` | The Forge catalog (Gatelin, Foxnox), certification rules, deterministic discovery, binding checks, and health signals. |
| `skills/decision-record/` | Protocol & Validator | `decision-record` instruction, `Decision Scribe` | Attributed autonomous decisions and escalations, with genuine human signatures supported when requested. |
| `skills/flow-metrics/` | Metrics | `Learn Analyst`, retrospectives | The factory's metrics computed from a JSONL event log. |
| `skills/meeting-pack/` | Protocol & Validator | `meeting-pack` instruction, `Meeting Analyst` agent | Meeting Pack contract, plain-text transcript normalizer, deterministic validator (verbatim quotes, glossary, confirmations), and Triage emission. |
| `skills/triage/` | Protocol & Validator | `triage` instruction, `Triage Analyst` agent | Triage contract, deterministic validator (evidence, scorecard, decision rules, ledger), and backlog ranking for `triage.md` artifacts. |
| `skills/audit-reporting/` | Protocol & Validator | `code-audit`, `audit-fix` | Deterministic Markdown audit report contract and validation scripts for CI gating. |
| `skills/spec-from-code/` | Protocol & Validator | `spec-from-code` | Technical specification contract under `docs/specs/` with automated schema validation. |
| `skills/vitepress-docs-examples/` | Scaffolding Pack | `vitepress-docs` instruction | VitePress site templates: `package.json`, `config.mjs`, dev Dockerfile, and Pages workflow. |
| `skills/node-express-examples/` | Scaffolding Pack | `node-express` instruction | Express scaffolding: route handlers, controllers, middlewares, and error envelopes. |
| `skills/postgres-liquibase-examples/` | Scaffolding Pack | `postgres-liquibase` instruction | Liquibase XML/YAML changelogs, rollback blocks, audit triggers, and soft-delete SQL. |
| `skills/docker-examples/` | Scaffolding Pack | `docker` instruction | Multi-stage Dockerfiles, Traefik dynamic labels, BuildKit secret mounts, and Compose files. |
| `skills/angular-admin-examples/` | Scaffolding Pack | `angular-admin` instruction | Angular entity slices: CRUD tables, PrimeNG dialogs, reactive form services, and ACL guards. |
| `skills/k6-performance-examples/` | Scaffolding Pack | `k6-performance-tests` instruction | Modular k6 test architecture: virtual users, thresholds, stages, and Docker runners. |
| `skills/restler-fuzzing-examples/` | Scaffolding Pack | `restler-fuzzing-tests` instruction | OpenAPI compiler configurations, fuzzing dictionary templates, and headless CI runner scripts. |
| `skills/scope-guard/` | Guard & Boundary | `sharp-agent` instruction, `audit-fix` agent | Blast-radius and churn guard asserting changes stay within allowed paths and thresholds. |
| `skills/dependency-guard/` | Guard & Dependency | Package manifests, PR reviews | Prevents unauthorized, bloated, or banned dependencies in `package.json`. |
| `skills/secret-guard/` | Guard & Security | Pre-commit hooks, CI scanning | Prevents hardcoded credentials, API keys, private keys, and platform tokens in diffs. |
| `skills/task-gate/` | Gate & Verifier | All agents (`Done When`), CI workflows | Multi-stage verification pipeline (lint, types, tests) with structured self-repair diagnostics. |
| `skills/contract-validator/` | Schema Contract | `spec-from-code`, `audit-reporting` | Declarative schema validator for Markdown and structured artifacts without custom scripts. |
| `skills/test-probe/` | Behavioral Probe | Test authoring agents, CI verification | Anti-tautology probe asserting tests fail when unpatched to prove genuine falsifiability. |
| `skills/rollback-probe/` | Behavioral Probe | `postgres-liquibase`, database migrations | Certifies migration reversibility (Forward $\rightarrow$ Rollback $\rightarrow$ Forward) and idempotency. |
| `skills/migration-docs/` | Protocol & Validator | `migration-docs` instruction, `Migration Documenter` agent | Contract and deterministic validator for the infrastructure migration records (`assessment.md`, `migration-plan.md`, `runbook.md`) and their cross-checks. |

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

### 10. Think (`skills/think/`) & Plan (`skills/plan/`)
- **Category**: Protocol & Validator
- **Contents**:
  - `skills/think/SKILL.md` & `references/think-contract.md`: Authoritative schema for `think.md` (options, chosen approach, Forge bindings, system flow, constraints, blast radius, decision record, Persistent Context updates).
  - `skills/think/scripts/validate-think.mjs`: Standalone deterministic Node.js validator for `think.md` (`--think` or `--dir`, with `--stage draft|approved`).
  - `skills/plan/SKILL.md` & `references/plan-contract.md`: Authoritative schema for `plan.md` (file scope, acceptance criteria, steps with `Files`, `Action`, `New Code`, `Verification`, `Bootable Check`, `Serves`, test plan, blast radius check).
  - `skills/plan/scripts/validate-plan.mjs`: Standalone deterministic Node.js validator for `plan.md` (`--plan` or `--dir`, with `--think` cross-check and `--stage draft|approved`).
  - `scripts/*.test.mjs` and `scripts/*-fixtures.mjs`: Test suites and valid fixtures for each skill.
- **Workflow**:
  ```bash
  # Validate think.md in CI or local harness
  node .agents/skills/think/scripts/validate-think.mjs --think specs/issue-42/think.md

  # Validate plan.md and cross-check against think.md
  node .agents/skills/plan/scripts/validate-plan.mjs --dir specs/issue-42
  ```

### 11. Scope Guard (`skills/scope-guard/`)
- **Category**: Guard & Boundary
- **Contents**:
  - `SKILL.md`: Step-by-step guidance on validating agent blast radius and diff bounds.
  - `references/guard-contract.md`: Invariant specification defining path matching semantics, forbidden file rules (`*.lock`, `*-lock.json`, `.env*`), churn bounds, and exit code contracts.
  - `scripts/scope-guard.mjs`: Fast, zero-dependency Node.js CLI asserting that repository diffs (against `HEAD` or `--base <git-ref>`) stay within permitted scopes and limits.
  - `scripts/scope-guard.test.mjs`: Node.js test suite proving guard evaluation across valid and invalid inputs.
- **Workflow**:
  ```bash
  # Assert current git changes stay within permitted scope and churn limits
  node .agents/skills/scope-guard/scripts/scope-guard.mjs --git --base origin/main --scope "src/auth/**" --max-additions 100
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
  - `scripts/test-probe.mjs`: Automated probe temporarily unpatching source code (against `HEAD` or `--base <git-ref>`) to prove that newly generated tests actually fail without the fix.
  - `scripts/test-probe.test.mjs`: Test suite proving detection of vacuous tests and atomic file restoration.
- **Workflow**:
  ```bash
  # Verify that a test suite fails when the source fix is absent
  node .agents/skills/test-probe/scripts/test-probe.mjs --test-cmd "npm test -- tests/auth.test.js" --source "src/auth/service.js" --base origin/main
  ```

### 15. Dependency Guard (`skills/dependency-guard/`)
- **Category**: Guard & Dependency
- **Contents**:
  - `SKILL.md`: Dependency blast-radius guidance and policy workflows.
  - `references/dependency-contract.md`: Manifest invariant contract defining zero-unprompted-dependency rules and banned libraries.
  - `scripts/dependency-guard.mjs`: Node.js CLI inspecting package.json diffs against git `HEAD` (or `--base <git-ref>`) to block unvetted libraries.
  - `scripts/dependency-guard.test.mjs`: Test suite covering new package detection, allow-lists, banned lists, and loose versions.
- **Workflow**:
  ```bash
  # Assert no unauthorized dependencies were added to package.json
  node .agents/skills/dependency-guard/scripts/dependency-guard.mjs --git --base origin/main --allow "zod,dotenv"
  ```

### 16. Secret Guard (`skills/secret-guard/`)
- **Category**: Guard & Security
- **Contents**:
  - `SKILL.md`: Secret leak prevention workflow and remediation steps.
  - `references/secret-contract.md`: Credential pattern contract (AWS keys, private keys, platform tokens, high-entropy assignments).
  - `scripts/secret-guard.mjs`: Fast regex and entropy scanner asserting diffs (against `HEAD` or `--base <git-ref>`) or source files contain zero hardcoded secrets.
  - `scripts/secret-guard.test.mjs`: Test suite asserting detection and secret masking across credentials.
- **Workflow**:
  ```bash
  # Scan git diff for hardcoded credentials before commit
  node .agents/skills/secret-guard/scripts/secret-guard.mjs --git --base origin/main
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



### 18. Triage (`skills/triage/`)
- **Category**: Protocol & Validator
- **Contents**:
  - `SKILL.md`: Step-by-step guidance on authoring, validating, and ranking `triage.md` artifacts.
  - `references/triage-contract.md`: Authoritative schema for `triage.md` (backlog issue, evidence, system mapping, scorecard, decision), the validation stages, the triage ledger, and the strategic weights.
  - `scripts/validate-triage.mjs`: Deterministic Node.js validator for the `proposed` and `final` stages, with verbatim quote verification (`--source`) and ledger checks (`--ledger`).
  - `scripts/rank-backlog.mjs`: Deterministic ranking of scored triage issues for the weekly review, using Product Owner weights.
  - `scripts/*.test.mjs` and `scripts/triage-fixture.mjs`: Test suites and the shared valid fixture.
- **Workflow**:
  ```bash
  # Gate the AI output, then the Product Owner decision
  node .agents/skills/triage/scripts/validate-triage.mjs --dir specs/issue-42 --stage proposed
  node .agents/skills/triage/scripts/validate-triage.mjs --dir specs/issue-42 --stage final
  # Rank the backlog for the weekly Triage review
  node .agents/skills/triage/scripts/rank-backlog.mjs --dir specs --weights specs/triage/weights.json
  ```

### 19. Meeting Pack (`skills/meeting-pack/`)
- **Category**: Protocol & Validator
- **Contents**:
  - `SKILL.md`: Step-by-step guidance on normalizing, building, validating, confirming, and handing off a Meeting Pack.
  - `references/meeting-pack-contract.md`: Authoritative schema for `transcript.md`, `pack.md`, the validation stages, the glossary, and the Triage handoff.
  - `scripts/normalize-transcript.mjs`: Converts a plain-text transcript export and a speaker roster into the immutable `transcript.md` and prints its SHA-256.
  - `scripts/validate-meeting.mjs`: Deterministic validator for the transcript, the pack (`draft` and `confirmed` stages), and `docs/glossary.md`, including verbatim quote verification and the transcript digest.
  - `scripts/emit-candidates.mjs`: Turns a confirmed pack into backlog issue bodies, `candidates.json`, and `glossary-additions.md`.
  - `scripts/*.test.mjs` and `scripts/meeting-fixtures.mjs`: Test suites and the shared valid fixtures.
- **Workflow**:
  ```bash
  node .agents/skills/meeting-pack/scripts/validate-meeting.mjs --dir meetings/2026-09-24-acme-discovery --glossary docs/glossary.md
  node .agents/skills/meeting-pack/scripts/validate-meeting.mjs --dir meetings/2026-09-24-acme-discovery --glossary docs/glossary.md --stage confirmed
  node .agents/skills/meeting-pack/scripts/emit-candidates.mjs --dir meetings/2026-09-24-acme-discovery --out build/candidates
  ```

### 20. Code Loop (`skills/code-loop/`)
- **Category**: Gate & Tracker
- **Contents**: `scripts/code-loop.mjs` (`status`, `next`, `start`, `pass`, `fail`; state in `specs/issue-<n>/progress.json`; the fix-loop limit of 5 cannot be reset; a plan changed after Code started is rejected), `scripts/branch-guard.mjs` (`feature|fix|chore/issue-<n>-<slug>` names, no long-running branches), and tests.
- **Workflow**: `node .agents/skills/code-loop/scripts/code-loop.mjs next --dir specs/issue-42`

### 21. PR Record (`skills/pr-record/`)
- **Category**: Protocol & Validator
- **Contents**: PR contract, template, and validator. Code checks scope, traceability, dependencies, and completed steps. Prove supports all-tier autonomous assessment with `--allow-auto-prove`, retaining High/Critical rollback evidence and Critical rollout references. Genuine human formats remain supported.
- **Workflow**: `node .agents/skills/pr-record/scripts/validate-pr.mjs --body pr.md --dir specs/issue-42 --stage prove`

### 22. Criteria Verify (`skills/criteria-verify/`)
- **Category**: Gate & Verifier
- **Contents**: `scripts/verify-criteria.mjs` maps tests to `AC-<n>` by name or file path from JUnit XML, Jest/Vitest JSON, or TAP / runner logs (`TAP version ...`, `ok`/`not ok`, `ok   <name>`/`FAIL <name>`, `# file: <path>`) and fails on any uncovered, failing, or skipped-only criterion.
- **Workflow**: `node .agents/skills/criteria-verify/scripts/verify-criteria.mjs --plan specs/issue-42/plan.md --report junit.xml`

### 23. Mutation Bar (`skills/mutation-bar/`)
- **Category**: Gate & Verifier
- **Contents**: `scripts/mutation-bar.mjs` scores Stryker or summary JSON (default minimum 80), lists survivors, supports `--changed`, and can only be raised from `mutation-bar.json`, never lowered.
- **Workflow**: `node .agents/skills/mutation-bar/scripts/mutation-bar.mjs --report reports/mutation.json`

### 24. Contract Compat (`skills/contract-compat/`)
- **Category**: Contract
- **Contents**: `scripts/contract-compat.mjs` classifies changes between two OpenAPI 3.x or JSON Schema JSON documents as breaking or compatible. `--allow-breaking` accepts only an Accepted decision record signed by a named person. YAML is not read, and Pact is out of scope.
- **Workflow**: `node .agents/skills/contract-compat/scripts/contract-compat.mjs --base base.json --head head.json`

### 25. Security Gate (`skills/security-gate/`)
- **Category**: Guard & Security
- **Contents**: `scripts/security-gate.mjs` reads SARIF (Semgrep, Trivy, CodeQL), Conftest/OPA JSON, and CycloneDX licenses. Waivers need a reason, a named approver, and an expiry.
- **Workflow**: `node .agents/skills/security-gate/scripts/security-gate.mjs --sarif semgrep.sarif --sbom sbom.json --allow-licenses "MIT,Apache-2.0"`

### 26. Control Guard (`skills/control-guard/`)
- **Category**: Guard & Integrity
- **Contents**: `scripts/control-guard.mjs` (rules R1-R8: deleted tests, skip markers, lowered thresholds, weakened workflows, protected paths, suppressions, production credentials in agent workflows, removed assertions) and `scripts/bug-rule.mjs` (a test-only commit must precede the fix commit).
- **Workflow**: `node .agents/skills/control-guard/scripts/control-guard.mjs --git origin/main`

### 27. Preview Smoke (`skills/preview-smoke/`)
- **Category**: Behavioral Probe
- **Contents**: `scripts/preview-smoke.mjs` probes routes (status, JSON path, latency) of a running preview, retrying only while the app is not answering.
- **Workflow**: `node .agents/skills/preview-smoke/scripts/preview-smoke.mjs --url http://localhost:3000`

### 28. Verification Pipeline (`skills/verification-pipeline/`)
- **Category**: Scaffolding Pack
- **Contents**: `references/verify.yml` and `references/remediate.yml` workflow templates (controls run from the base branch copy, so a pull request cannot change the controls that judge it), and `scripts/rails-check.mjs`, which reports what a project is missing from the Platform Rails.
- **Workflow**: `node .agents/skills/verification-pipeline/scripts/rails-check.mjs --root .`

### 29. Release Plan (`skills/release-plan/`)
- **Category**: Protocol & Validator
- **Contents**: `references/release-contract.md`, `references/release.yml` (tag-triggered workflow template), `scripts/validate-release.mjs`, and `scripts/evaluate-rollout.mjs` (exit 0 promote, 2 hold, 1 rollback).
- **Workflow**: `node .agents/skills/release-plan/scripts/validate-release.mjs --dir specs/issue-42`

### 30. Hypothesis Ledger (`skills/hypothesis-ledger/`)
- **Category**: Protocol & Validator
- **Contents**: `scripts/ledger.mjs` (`validate`, `add`, `due`, `propose`, `stats`). `propose` computes a verdict from baseline, target, and observed value and never writes it.
- **Workflow**: `node .agents/skills/hypothesis-ledger/scripts/ledger.mjs due --file specs/learn/hypotheses.md`

### 31. Incident Record (`skills/incident-record/`)
- **Category**: Protocol & Validator
- **Contents**: `scripts/validate-incident.mjs` enforces timestamp order, mitigation before diagnosis, a reproducing test, the five-working-day review, and control hardening, and reports time to restore.
- **Workflow**: `node .agents/skills/incident-record/scripts/validate-incident.mjs --file docs/incidents/2026-10-01-checkout-errors.md`

### 32. Telemetry Scan (`skills/telemetry-scan/`)
- **Category**: Behavioral Probe
- **Contents**: `scripts/telemetry-scan.mjs` finds anomalies, trends toward a threshold, and breaches in exported series, and lists the deploys that precede them. Exit 3 means a high-severity finding.
- **Workflow**: `node .agents/skills/telemetry-scan/scripts/telemetry-scan.mjs --series series.json --thresholds thresholds.json`

### 33. Learn Signals (`skills/learn-signals/`)
- **Category**: Protocol & Emitter
- **Contents**: `scripts/emit-learn-issues.mjs` writes Triage issue bodies (`needs:triage`, `source:learn`, `learn-signal` marker) from validated incidents, ledger verdicts, and telemetry findings.
- **Workflow**: `node .agents/skills/learn-signals/scripts/emit-learn-issues.mjs --out build/signals --incident docs/incidents/2026-10-01-checkout-errors.md`

### 34. Context Health (`skills/context-health/`)
- **Category**: Guard & Audit
- **Contents**: `scripts/context-lint.mjs` (missing description, broad `applyTo`, oversized or near-duplicate instructions, missing references, secrets, staleness, growth) and `scripts/context-corrections.mjs` (a log that proposes an artifact once a topic is corrected or re-explained twice).
- **Workflow**: `node .agents/skills/context-health/scripts/context-lint.mjs --root .`

### 35. Forge (`skills/forge/`)
- **Category**: Catalog & Validator
- **Contents**: `catalog.json` (Gatelin and Foxnox), `references/forge-contract.md`, and `scripts/validate-forge.mjs`, `discover.mjs`, `bindings-check.mjs`, `forge-health.mjs`.
- **Workflow**: `node .agents/skills/forge/scripts/discover.mjs --need "JWT sessions and role-based access control"`

### 36. Decision Record (`skills/decision-record/`)
- **Category**: Protocol & Validator
- **Contents**: `references/decision-record-contract.md`, `scripts/validate-decision.mjs` (records, numbering, Think cross-check), and `scripts/escalations.mjs` (open escalations whose default date has passed).
- **Workflow**: `node .agents/skills/decision-record/scripts/validate-decision.mjs --dir docs/decisions`

### 37. Flow Metrics (`skills/flow-metrics/`)
- **Category**: Metrics
- **Contents**: `references/metrics-contract.md`, `scripts/emit-event.mjs`, and `scripts/flow-metrics.mjs`, which reports every factory metric against its target from `metrics/events.jsonl`. Lines of code, story points, and editor suggestion acceptance are never computed.
- **Workflow**: `node .agents/skills/flow-metrics/scripts/flow-metrics.mjs --events metrics/events.jsonl`

### 38. Migration Docs (`skills/migration-docs/`)
- **Category**: Protocol & Validator
- **Contents**: `SKILL.md`, `references/migration-contract.md` (record structure, Application Change Policy, cross-checks), and `scripts/validate-migration.mjs` with its fixtures and tests.
- **Workflow**: `node .agents/skills/migration-docs/scripts/validate-migration.mjs --dir docs/migration/<name>`.

### 39. Prove (`skills/prove/`)
- **Category**: Protocol & Validator
- **Contents**: `SKILL.md`, `references/prove-contract.md` (schema for `specs/issue-<n>/prove.md`: header links, 13 required deterministic controls, criteria verification table cross-checked against `plan.md`, semantic review across `Client Intent`, `Behavioral Experience`, and `Safety & Blast Radius`, numbered findings, and `PASS|FAIL` verdict), and `scripts/validate-prove.mjs` (`--stage draft|pass`).
- **Workflow**: `node .agents/skills/prove/scripts/validate-prove.mjs --dir specs/issue-42 --stage pass`
