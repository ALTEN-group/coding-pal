# Skills Catalog

Skills are on-demand procedural bundles containing contracts, executable scripts, verification fixtures, and scaffolding templates.

Installed via APM as directory bundles under `.agents/skills/<name>/` (Copilot and Cursor) and `.claude/skills/<name>/` (Claude Code).

## Overview Table

| Skill Directory | Type | Paired Primitive | Description |
|---|---|---|---|
| `skills/think/` | Protocol & Validator | `think` instruction, `Thinker` agent | Contract and deterministic validator (`validate-think.mjs`) for the Think record (`think.md`). |
| `skills/plan/` | Protocol & Validator | `plan` instruction, `Planner` agent | Contract and deterministic validator (`validate-plan.mjs`) for the Plan record (`plan.md`), including cross-checks against `think.md`. |
| `skills/code/` | Protocol & Validator | `Code Agent`, `code` instruction | Agent branch guard (`branch-guard.mjs`) and pull request contract (`validate-pr.mjs`): links, acceptance-criteria traceability, dependencies, blast radius, and the human-validation record by tier. |
| `skills/prove/` | Protocol, Validator & Controls | `Prove Validator`, `Gate Fixer`, `prove` instruction | Prove record contract (`specs/issue-<n>/prove.md`), validator (`validate-prove.mjs`), and all 8 deterministic control scripts (`control-guard`, `secret-guard`, `dependency-guard`, `scope-guard`, `task-gate`, `criteria-verify`, `test-probe`, `preview-smoke`). |
| `skills/release-plan/` | Protocol & Validator | `release` instruction, `Release Planner` | Per-change `release.md` contract and validator, plus the deterministic rollout decision (promote, hold, rollback). |
| `skills/hypothesis-ledger/` | Protocol & Validator | `Learn Analyst` | Hypothesis ledger with deterministic verdict proposals and feature-deletion tracking. |
| `skills/incident-record/` | Protocol & Validator | `Learn Analyst`, `learn` instruction | Incident record contract and validator: mitigation before diagnosis, failing test first, review within five working days. |
| `skills/telemetry-scan/` | Behavioral Probe | `Learn Analyst` | Predictive monitoring from exported telemetry: anomalies, trends, breaches, and the deploys that precede them. |
| `skills/learn-signals/` | Protocol & Emitter | `Learn Analyst`, `triage` skill | Turns incidents, invalidated hypotheses, and findings into Triage issue bodies. |
| `skills/context-health/` | Guard & Audit | `Learn Analyst` | Persistent Context lint and a corrections log that proposes new artifacts after two corrections. |
| `skills/decision-record/` | Protocol & Validator | `decision-record` instruction, `Decision Scribe` | Attributed autonomous decisions and escalations, with genuine human signatures supported when requested. |
| `skills/flow-metrics/` | Metrics | `Learn Analyst`, retrospectives | The factory's metrics computed from a JSONL event log. |
| `skills/meeting-pack/` | Protocol & Validator | `meeting-pack` instruction, `Meeting Analyst` agent | Meeting Pack contract, plain-text transcript normalizer, deterministic validator (verbatim quotes, glossary, confirmations), and Triage emission. |
| `skills/triage/` | Protocol & Validator | `triage` instruction, `Triage Analyst` agent | Triage contract, deterministic validator (evidence, scorecard, decision rules, ledger), and backlog ranking for `triage.md` artifacts. |
| `skills/audit-reporting/` | Protocol & Validator | `code-audit`, `audit-fix` | Deterministic Markdown audit report contract and validation scripts for CI gating. |
| `skills/spec-from-code/` | Protocol & Validator | `spec-from-code` | Technical specification contract under `docs/specs/` with automated schema validation. |
| `skills/vitepress-docs/` | Standards & Scaffolding | `VitePress Docs` agent | VitePress site rules and templates: `package.json`, `config.mjs`, dev Dockerfile, and Pages workflow. |
| `skills/playwright-demo-videos/` | Standards & Scaffolding | `Demo Videos` agent | Demo recording rules and templates: Playwright config, Director (fake cursor, gestures), scenarios, ffmpeg encoder, VitePress video section. |
| `skills/node-express-examples/` | Scaffolding Pack | `node-express` instruction | Express scaffolding: route handlers, controllers, middlewares, and error envelopes. |
| `skills/postgres-liquibase-examples/` | Scaffolding Pack | `postgres-liquibase` instruction | Liquibase XML/YAML changelogs, rollback blocks, audit triggers, and soft-delete SQL. |
| `skills/docker-examples/` | Scaffolding Pack | `docker` instruction | Multi-stage Dockerfiles, Traefik dynamic labels, BuildKit secret mounts, and Compose files. |
| `skills/angular-admin-examples/` | Scaffolding Pack | `angular-admin` instruction | Angular entity slices: CRUD tables, PrimeNG dialogs, reactive form services, and ACL guards. |
| `skills/k6-performance-tests/` | Standards & Scaffolding | `Performance Tester` agent | Modular k6 test architecture, thresholds, authentication, stages, and Docker runners. |
| `skills/restler-fuzzing-tests/` | Standards & Scaffolding | `Fuzz Tester` agent | RESTler OpenAPI compiler rules, fuzzing modes, token refresh, and headless CI runner scripts. |
| `skills/contract-validator/` | Schema Contract | `spec-from-code`, `audit-reporting` | Declarative schema validator for Markdown and structured artifacts without custom scripts. |
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

### 3. VitePress Docs (`skills/vitepress-docs/`)
- **Category**: Standards & Scaffolding
- **Contents**:
  - `SKILL.md`: Normative VitePress layout, stack, branding, sidebar rules, and path resolution.
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

### 8. k6 Performance Tests (`skills/k6-performance-tests/`)
- **Category**: Standards & Scaffolding
- **Contents**:
  - `SKILL.md` & `references/implementation-patterns.md`: Normative architecture, threshold rules, authentication lifecycle, and templates for load, soak, and stress testing.

### 9. RESTler Fuzzing Tests (`skills/restler-fuzzing-tests/`)
- **Category**: Standards & Scaffolding
- **Contents**:
  - `SKILL.md` & `references/implementation-patterns.md`: Normative rules and templates for OpenAPI compiler configurations, token-refresh authentication, data safety, and headless CI runner scripts.

### 10. Think (`skills/think/`) & Plan (`skills/plan/`)
- **Category**: Protocol & Validator
- **Contents**:
  - `skills/think/SKILL.md` & `references/think-contract.md`: Authoritative schema for `think.md` (options, chosen approach, system flow, constraints, blast radius, decision record, Persistent Context updates).
  - `skills/think/scripts/validate-think.mjs`: Standalone deterministic Node.js validator for `think.md` (`--think` or `--dir`, with `--stage draft|approved`).
  - `skills/plan/SKILL.md` & `references/plan-contract.md`: Authoritative schema for `plan.md` (file scope, acceptance criteria, steps with `Files`, `Action`, `Verification`, `Bootable Check`, `Serves`, test plan, blast radius check).
  - `skills/plan/scripts/validate-plan.mjs`: Standalone deterministic Node.js validator for `plan.md` (`--plan` or `--dir`, with `--think` cross-check and `--stage draft|approved`).
  - `scripts/*.test.mjs` and `scripts/*-fixtures.mjs`: Test suites and valid fixtures for each skill.
- **Workflow**:
  ```bash
  # Validate think.md in CI or local harness
  node .agents/skills/think/scripts/validate-think.mjs --think specs/issue-42/think.md

  # Validate plan.md and cross-check against think.md
  node .agents/skills/plan/scripts/validate-plan.mjs --dir specs/issue-42
  ```

### 11. Prove (`skills/prove/`)
- **Category**: Protocol, Validator & Controls
- **Contents**:
  - `SKILL.md` & `references/prove-contract.md`: Schema for `specs/issue-<n>/prove.md` (header links, 8 required deterministic controls, criteria verification table cross-checked against `plan.md`, semantic review across `Client Intent`, `Behavioral Experience`, and `Safety & Blast Radius`, numbered findings, and `PASS|FAIL` verdict) and `scripts/validate-prove.mjs` (`--stage draft|pass`).
  - `scripts/control-guard.mjs` & `references/control-guard-contract.md`: Control integrity guard (rules R1-R8: deleted tests, skip markers, lowered thresholds, weakened workflows, protected paths, suppressions, production credentials in agent workflows, removed assertions).
  - `scripts/secret-guard.mjs` & `references/secret-contract.md`: Fast regex and entropy scanner asserting diffs or source files contain zero hardcoded secrets.
  - `scripts/dependency-guard.mjs` & `references/dependency-contract.md`: Manifest invariant guard inspecting `package.json` diffs to block unvetted or banned libraries.
  - `scripts/scope-guard.mjs` & `references/guard-contract.md`: Blast-radius and churn guard asserting diffs stay within permitted `--scope` globs, forbidden file rules, and churn limits.
  - `scripts/task-gate.mjs` & `references/gate-contract.md`: Multi-stage verification runner executing sequential checks with fail-fast semantics and decisive failure snippet extraction.
  - `scripts/verify-criteria.mjs` & `references/criteria-verify-contract.md`: Criteria Test Verification gate mapping tests to `AC-<n>` from JUnit XML, Jest/Vitest JSON, or TAP / runner logs.
  - `scripts/test-probe.mjs` & `references/probe-contract.md`: Anti-tautology probe temporarily unpatching source code to prove tests genuinely fail without the fix.
  - `scripts/preview-smoke.mjs` & `references/preview-smoke-contract.md`: Preview smoke probe checking routes (status, JSON path, latency) of a running preview.
- **Workflow**:
  ```bash
  # Run Prove controls and validate prove.md
  node .agents/skills/prove/scripts/scope-guard.mjs --git --base origin/main --scope "src/auth/**"
  node .agents/skills/prove/scripts/secret-guard.mjs --git --base origin/main
  node .agents/skills/prove/scripts/dependency-guard.mjs --git --base origin/main --allow "zod,dotenv"
  node .agents/skills/prove/scripts/control-guard.mjs --git origin/main
  node .agents/skills/prove/scripts/task-gate.mjs --stage "lint:npm run lint" --stage "tests:npm test" --json
  node .agents/skills/prove/scripts/verify-criteria.mjs --plan specs/issue-42/plan.md --report junit.xml
  node .agents/skills/prove/scripts/test-probe.mjs --test-cmd "npm test -- tests/auth.test.js" --source "src/auth/service.js" --base origin/main
  node .agents/skills/prove/scripts/preview-smoke.mjs --url http://localhost:3000
  node .agents/skills/prove/scripts/validate-prove.mjs --dir specs/issue-42 --stage pass
  ```

### 12. Contract Validator (`skills/contract-validator/`)
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

### 13. Rollback Probe (`skills/rollback-probe/`)
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

### 14. Triage (`skills/triage/`)
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

### 15. Meeting Pack (`skills/meeting-pack/`)
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

### 16. Code (`skills/code/`)
- **Category**: Protocol & Validator
- **Contents**: Agent branch guard (`scripts/branch-guard.mjs`), PR contract (`references/code-contract.md`), template (`references/pull_request_template.md`), and PR validator (`scripts/validate-pr.mjs`). Code checks short-lived branch naming/age, scope, traceability, and dependencies. Prove supports all-tier autonomous assessment with `--allow-auto-prove`, retaining High/Critical rollback evidence and Critical rollout references. Genuine human formats remain supported.
- **Workflow**: `node .agents/skills/code/scripts/branch-guard.mjs --git --base main --max-age-days 5` and `node .agents/skills/code/scripts/validate-pr.mjs --body pr.md --dir specs/issue-42 --stage prove`

### 17. Release Plan (`skills/release-plan/`)
- **Category**: Protocol & Validator
- **Contents**: `references/release-contract.md`, `references/release.yml` (tag-triggered workflow template), `scripts/validate-release.mjs`, and `scripts/evaluate-rollout.mjs` (exit 0 promote, 2 hold, 1 rollback).
- **Workflow**: `node .agents/skills/release-plan/scripts/validate-release.mjs --dir specs/issue-42`

### 18. Hypothesis Ledger (`skills/hypothesis-ledger/`)
- **Category**: Protocol & Validator
- **Contents**: `scripts/ledger.mjs` (`validate`, `add`, `due`, `propose`, `stats`). `propose` computes a verdict from baseline, target, and observed value and never writes it.
- **Workflow**: `node .agents/skills/hypothesis-ledger/scripts/ledger.mjs due --file specs/learn/hypotheses.md`

### 19. Incident Record (`skills/incident-record/`)
- **Category**: Protocol & Validator
- **Contents**: `scripts/validate-incident.mjs` enforces timestamp order, mitigation before diagnosis, a reproducing test, the five-working-day review, and control hardening, and reports time to restore.
- **Workflow**: `node .agents/skills/incident-record/scripts/validate-incident.mjs --file docs/incidents/2026-10-01-checkout-errors.md`

### 20. Telemetry Scan (`skills/telemetry-scan/`)
- **Category**: Behavioral Probe
- **Contents**: `scripts/telemetry-scan.mjs` finds anomalies, trends toward a threshold, and breaches in exported series, and lists the deploys that precede them. Exit 3 means a high-severity finding.
- **Workflow**: `node .agents/skills/telemetry-scan/scripts/telemetry-scan.mjs --series series.json --thresholds thresholds.json`

### 21. Learn Signals (`skills/learn-signals/`)
- **Category**: Protocol & Emitter
- **Contents**: `scripts/emit-learn-issues.mjs` writes Triage issue bodies (`needs:triage`, `source:learn`, `learn-signal` marker) from validated incidents, ledger verdicts, and telemetry findings.
- **Workflow**: `node .agents/skills/learn-signals/scripts/emit-learn-issues.mjs --out build/signals --incident docs/incidents/2026-10-01-checkout-errors.md`

### 22. Context Health (`skills/context-health/`)
- **Category**: Guard & Audit
- **Contents**: `scripts/context-lint.mjs` (missing description, broad `applyTo`, oversized or near-duplicate instructions, missing references, secrets, staleness, growth) and `scripts/context-corrections.mjs` (a log that proposes an artifact once a topic is corrected or re-explained twice).
- **Workflow**: `node .agents/skills/context-health/scripts/context-lint.mjs --root .`

### 23. Decision Record (`skills/decision-record/`)
- **Category**: Protocol & Validator
- **Contents**: `references/decision-record-contract.md`, `scripts/validate-decision.mjs` (records, numbering, Think cross-check), and `scripts/escalations.mjs` (open escalations whose default date has passed).
- **Workflow**: `node .agents/skills/decision-record/scripts/validate-decision.mjs --dir docs/decisions`

### 24. Flow Metrics (`skills/flow-metrics/`)
- **Category**: Metrics
- **Contents**: `references/metrics-contract.md`, `scripts/emit-event.mjs`, and `scripts/flow-metrics.mjs`, which reports every factory metric against its target from `metrics/events.jsonl`. Lines of code, story points, and editor suggestion acceptance are never computed.
- **Workflow**: `node .agents/skills/flow-metrics/scripts/flow-metrics.mjs --events metrics/events.jsonl`

### 25. Migration Docs (`skills/migration-docs/`)
- **Category**: Protocol & Validator
- **Contents**: `SKILL.md`, `references/migration-contract.md` (record structure, Application Change Policy, cross-checks), and `scripts/validate-migration.mjs` with its fixtures and tests.
- **Workflow**: `node .agents/skills/migration-docs/scripts/validate-migration.mjs --dir docs/migration/<name>`.

### 26. Playwright Demo Videos (`skills/playwright-demo-videos/`)
- **Category**: Standards & Scaffolding
- **Contents**: `SKILL.md` (filming, reset, encoding, and embedding rules) and `references/examples.md` (demo `playwright.config.ts`, `support/director.ts` with fake cursor and human-speed gestures, login and editing scenario templates with off-camera reset, `to-mp4.mjs` ffmpeg encoder, VitePress `DemoVideos.vue` home section).
- **Workflow**: `npm run demos` in the app, i.e. `playwright test --config=demos/playwright.config.ts && node demos/to-mp4.mjs <output-dir>`.
