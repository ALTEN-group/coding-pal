# Agents Catalog

Agents are named specialists invoked explicitly for a bounded kind of work. Each agent defines its explicit scope, hard constraints, step-by-step approach, and falsifiable completion criteria (`Done When`).

## Overview Table

| Agent Name | File | Role & Mandate | Domain Guide | Key Constraints | Paired Skill / Instruction |
|---|---|---|---|---|---|
| **Thinker** | `think.agent.md` | Explores options, Forge reuse, and blast radius, producing the Think record (`think.md`). | [Think & Plan](./domain-think-plan.md) | No production or test code changes; Forge-first options; blast radius classified; decision records drafted, never signed; no code blocks. | `think` instruction, `think-plan` skill |
| **Planner** | `plan.agent.md` | Turns a validated Think record into the Plan record (`plan.md`) with file scope, criteria, and atomic steps. | [Think & Plan](./domain-think-plan.md) | Derived strictly from `think.md`; code only in `New Code` fields; preserve bootability; blast radius verified. | `plan` instruction, `think-plan` skill |
| **Code Agent** | `code.agent.md` | Implements the validated Plan one step per turn, runs the checks and controls until green, and opens the pull request with its record. | [Code](./domain-code.md) | Edits only a step's Files; never weakens or edits a control; no production credentials; sets no human validation; stops at the fix-loop limit. | `code-loop`, `pr-record` skills |
| **Gate Fixer** | `gate-fix.agent.md` | Diagnoses and fixes a failing deterministic gate within the step and file scope (agent auto-remediation). | [Prove](./domain-prove.md) | Never weakens, skips, edits, or waives a control; never touches protected paths; stops at the fix-loop limit. | `control-guard`, `code-loop`, `security-gate` skills, `prove-controls` instruction |
| **Learn Analyst** | `learn.agent.md` | Watches what a release does in production: detects and explains anomalies, proposes hypothesis verdicts, drafts incident records, runs the context review, and emits Triage issues. | [Learn](./domain-learn.md) | Never decides, mitigates in production, holds production credentials, or writes a verdict. | `telemetry-scan`, `hypothesis-ledger`, `incident-record`, `learn-signals`, `context-health` skills |
| **Release Planner** | `release.agent.md` | Drafts the per-change release declaration (`release.md`) for DevOps to approve. | [Release](./domain-release.md) | Never deploys, never holds production credentials, never disables a threshold. | `release-plan` skill |
| **Forge Curator** | `forge-curator.agent.md` | Searches the Forge for reuse (discover mode) and evaluates proposed assets for certification (certify mode). | [Forge](./domain-forge.md) | Never invents assets; never edits the catalog without a pull request; never certifies by itself. | `forge` skill |
| **Decision Scribe** | `decision-scribe.agent.md` | Drafts decision records and escalations from a Think record or a described decision. | [Governance & Decisions](./domain-governance.md) | Drafts only: never signs and never marks a record Accepted. | `decision-record` skill |
| **Meeting Analyst** | `meeting-pack.agent.md` | Turns a client meeting transcript into an immutable Meeting Pack with candidate business needs. | [Meet](./domain-meet.md#_1-transcript-to-meeting-pack) | Zero code changes; verbatim client quotes only; transcript never edited; never confirms. | `meeting-pack` skill |
| **Triage Analyst** | `triage.agent.md` | Turns a candidate business need into an evidence-linked `triage.md` with a scorecard and a proposed decision. | [Triage](./domain-triage.md#_1-candidate-need-to-backlog-issue) | Zero code changes; verbatim evidence only; never sets the final decision or a blast radius tier. | `triage` skill |
| **Code Auditor** | `code-audit.agent.md` | Complete, evidence-based code audit of a repo, service, or schema. | [Audit & Remediation](./domain-audit.md#_1-codebase-audit) | Audit agreed scope only; read every file before reporting; no speculative findings. | `audit-reporting` skill |
| **Audit Finding Fixer** | `audit-fix.agent.md` | Surgical remediation of a single finding from a validated audit report. | [Audit & Remediation](./domain-audit.md#_2-surgical-finding-remediation) | One finding only; no unrelated refactoring; verify with narrowest test command. | `audit-reporting` skill |
| **Spec from Code** | `spec-from-code.agent.md` | Reverse-engineers technical specifications from existing code. | [Specs & Docs](./domain-docs.md#_1-reverse-engineering-specifications-spec-from-code) | Grounded strictly in source code; no fabricated features; comprehensive interfaces. | `spec-from-code` skill |
| **Unit Tester** | `unit-test.agent.md` | Writes or updates isolated unit tests with full branch and edge-case coverage. | [Testing & Verification](./domain-testing.md#_1-node-js-module-unit-tests) | **One module scope; edit test files only; never change production code** without explicit consent. | Installed domain test instruction |
| **API Tester** | `api-test.agent.md` | Authors or updates Supertest HTTP API route integration tests. | [Testing & Verification](./domain-testing.md#_2-node-js-http-api-route-tests) | **Route scope only; Supertest assertions; edit test files only; zero production code altered.** | `node-api-tests` instruction |
| **E2E Tester** | `e2e-test.agent.md` | Writes or updates Playwright browser end-to-end tests for user journeys. | [Testing & Verification](./domain-testing.md#_4-angular-playwright-end-to-end-tests) | **`e2e/` scope only; POM pattern; edit test files only; zero production code altered.** | `angular-e2e-tests` instruction |
| **VitePress Docs** | `vitepress-docs.agent.md` | Scaffolds or updates a VitePress documentation site in a user-named folder. | [Specs & Docs](./domain-docs.md#_2-product-documentation-website-vitepress-docs) | Confine all files to docs root; follow `vitepress-docs` instruction; default theme only. | `vitepress-docs-examples` |
| **Performance Tester** | `performance-tests.agent.md` | Designs, scaffolds, or extends k6 load, stress, and spike test suites. | [Testing & Verification](./domain-testing.md#_6-k6-performance-load-benchmarking) | Follow k6 Docker execution pattern; assert realistic thresholds; isolate scenarios. | `k6-performance-examples` |
| **Fuzz Tester** | `fuzz-tests.agent.md` | Configures and runs RESTler API fuzzing pipelines. | [Testing & Verification](./domain-testing.md#_7-restler-api-grammar-fuzzing) | OpenAPI-driven grammar compilation; handle auth refresh; fail on 500 status. | `restler-fuzzing-examples` |
| **Migration Documenter** | `migration-docs.agent.md` | Documents an infrastructure migration (for example on-premise to cloud): assessment, migration plan, and cutover runbook. | [Migration](./domain-migration.md) | Documents only; infrastructure absorbs differences before any application change; every change is registered; no secret values. | `migration-docs` skill and instruction |

---

## Agent Deep Dives

### 1. Code Auditor (`code-audit.agent.md`)
- **Role**: Exhaustive code audit across an agreed boundary (microservice or module).
- **Hard Boundaries**: Reads every file in scope before formulating findings. Prohibited from guessing or reporting hypothetical issues.
- **Completion Gate**: Generated report passes the deterministic validation script `skills/audit-reporting/scripts/audit-report.mjs`.
- **Full Workflow**: See [Codebase Audit Workflow](./domain-audit.md#_1-codebase-audit).

### 2. Audit Finding Fixer (`audit-fix.agent.md`)
- **Role**: Surgical repair of a single finding from an approved audit report.
- **Hard Boundaries**: Exactly one finding per turn. Zero speculative refactoring or adjacent code reorganization.
- **Completion Gate**: Finding resolved, narrowest test passes, zero unrelated files modified.
- **Full Workflow**: See [Surgical Remediation Workflow](./domain-audit.md#_2-surgical-finding-remediation).

### 3. Spec from Code (`spec-from-code.agent.md`)
- **Role**: Reverse-engineers technical specifications and data models directly from source code.
- **Hard Boundaries**: Grounded strictly in observable code; no undocumented or assumed capabilities.
- **Completion Gate**: Area specification markdown files pass `skills/spec-from-code/scripts/spec-docs.mjs` validation.
- **Full Workflow**: See [Technical Specification Pipeline](./domain-docs.md#_1-reverse-engineering-specifications-spec-from-code).

### 4. Unit Tester (`unit-test.agent.md`)
- **Role**: Authors or improves isolated unit tests with complete branch coverage.
- **Hard Boundaries**: Strictly one module in scope. **Edits test files only**; never alters production code without explicit approval.
- **Completion Gate**: All execution paths asserted, narrowest test command passes with exit code 0.
- **Full Workflow**: See [Unit & Component Testing](./domain-testing.md#_1-node-js-module-unit-tests).

### 5. API Tester (`api-test.agent.md`)
- **Role**: Authors and maintains Supertest HTTP API route integration tests.
- **Hard Boundaries**: Strictly route module and `tests/routes/` scope. **Edits test files only**; drives full Express middleware stack; mocks at database and external HTTP boundaries.
- **Completion Gate**: All route verbs, status codes, and response envelopes asserted; narrowest route test command passes with exit code 0.
- **Full Workflow**: See [HTTP API Testing](./domain-testing.md#_2-node-js-http-api-route-tests).

### 6. E2E Tester (`e2e-test.agent.md`)
- **Role**: Authors and updates Playwright browser end-to-end tests.
- **Hard Boundaries**: Confined to `e2e/`. Enforces Page Object Model (POM). Production code is read-only.
- **Completion Gate**: All journey checkpoints pass headlessly against the containerized dev stack.
- **Full Workflow**: See [End-to-End Testing](./domain-testing.md#_4-angular-playwright-end-to-end-tests).

### 7. VitePress Docs (`vitepress-docs.agent.md`)
- **Role**: Scaffolds and maintains product documentation websites using VitePress.
- **Hard Boundaries**: Requires an explicit user-named root (e.g. `website/` or `docs/`). Confined strictly to docs directory.
- **Completion Gate**: `npm run build` succeeds with exit code 0 and all guide pages are indexed in the sidebar navigation.
- **Full Workflow**: See [Product Documentation Website](./domain-docs.md#_2-product-documentation-website-vitepress-docs).

### 8. Performance Tester (`performance-tests.agent.md`)
- **Role**: Designs and executes automated k6 API performance and load benchmarking.
- **Hard Boundaries**: Parameterized scenarios with explicit SLA thresholds; runs via Docker runner.
- **Completion Gate**: k6 scenarios execute cleanly and SLA thresholds pass.
- **Full Workflow**: See [Performance & Load Testing](./domain-testing.md#_6-k6-performance-load-benchmarking).

### 9. Fuzz Tester (`fuzz-tests.agent.md`)
- **Role**: Configures and runs Microsoft RESTler stateful API fuzzing.
- **Hard Boundaries**: Grammar compilation from OpenAPI contract; handles auth refresh; zero 500 error tolerance.
- **Completion Gate**: Fuzz-lean sequence completes with zero unhandled 500 exceptions.
- **Full Workflow**: See [API Fuzz Testing](./domain-testing.md#_7-restler-api-grammar-fuzzing).

### 10. Thinker (`think.agent.md`) & Planner (`plan.agent.md`)
- **Thinker Role**: Explores 2 to 4 options from a prioritized backlog issue, binds Forge assets, classifies blast radius, and writes the `think.md` record without code.
- **Planner Role**: Takes a validated `think.md` and breaks it down into explicit file scopes, observable acceptance criteria, ordered atomic steps with `New Code`, and test plan in `plan.md`.
- **Hard Boundaries**: **No production or test code changes**; codebase is read-only; Thinker writes no code; Planner writes code only in `New Code` fields; decision records stay drafted and unsigned; Developer and Architect record approval.
- **Completion Gate**: `think.md` and `plan.md` pass `skills/think-plan/scripts/validate-specs.mjs` validation with exit code 0.
- **Full Workflow**: See [Business Needs to Specifications](./domain-think-plan.md).

### 11. Triage Analyst (`triage.agent.md`)
- **Role**: Enriches a candidate business need with evidence and system mapping, fills the scorecard, and proposes a decision in `triage.md`, without writing code. In review mode it reports the ranked backlog for the weekly Triage review.
- **Hard Boundaries**: **Zero code changes**; codebase is read-only; one need per run; quotes verbatim from real sources; leaves `Final (PO)` as `Pending` and assigns no blast radius tier; never edits the ledger or weights.
- **Completion Gate**: `triage.md` passes `skills/triage/scripts/validate-triage.mjs --stage proposed` with exit code 0.
- **Full Workflow**: See [Candidate Need to Backlog Issue](./domain-triage.md#_1-candidate-need-to-backlog-issue).

### 12. Meeting Analyst (`meeting-pack.agent.md`)
- **Role**: Turns a plain-text client meeting transcript into a normalized `transcript.md` and a Meeting Pack (`pack.md`) with an executive summary, domain terminology, and candidate business needs backed by verbatim client quotes. In read-back mode it prepares the Product Owner's list and writes nothing.
- **Hard Boundaries**: **Zero code changes**; never edits a transcript line, the glossary, another meeting, or a confirmed pack; every quote verbatim and attributed as `Name (Role)`; leaves all four confirmations `Pending`; stops without recording consent or on secrets; one meeting per run.
- **Completion Gate**: `transcript.md` is unchanged from the normalizer and `pack.md` passes `skills/meeting-pack/scripts/validate-meeting.mjs --stage draft --glossary docs/glossary.md` with exit code 0.
- **Full Workflow**: See [Transcript to Meeting Pack](./domain-meet.md#_1-transcript-to-meeting-pack).

### 13. Code Agent (`code.agent.md`)
- **Role**: Implements a validated `plan.md` one step per turn: applies each step's `New Code`, runs the checks and controls, repairs failures, records progress with `code-loop`, commits on a short-lived branch, and opens the pull request with the `pr-record` body.
- **Hard Boundaries**: Edits only a step's `Files`; never weakens, skips, or edits a control; never holds production credentials; never sets the Human Validation fields; records a context-correction suggestion instead of hand-fixing a misunderstood pattern; stops for the Developer at the fix-loop limit.
- **Completion Gate**: `code-loop.mjs status` shows every step done, and `validate-pr.mjs --stage code` passes.
- **Full Workflow**: See [Code](./domain-code.md).

### 14. Gate Fixer (`gate-fix.agent.md`)
- **Role**: Reads a failing deterministic gate's output, diagnoses the exact fault, and fixes the code within the step and file scope (agent auto-remediation).
- **Hard Boundaries**: Can never weaken, skip, edit, or waive a control; never touches protected paths; re-runs the failed control and `control-guard` after every fix; records each attempt and stops at the fix-loop limit.
- **Completion Gate**: The failed gate passes, `control-guard` reports no finding, and the attempt is recorded.
- **Full Workflow**: See [Prove](./domain-prove.md).

### 15. Release Planner (`release.agent.md`)
- **Role**: Drafts `release.md` for one merged change: tier and rollback from Think, the outcome metric from the Triage hypothesis, rollout stages, and thresholds proposed from the tier defaults.
- **Hard Boundaries**: Never deploys, never holds production credentials, never disables a threshold; DevOps approves.
- **Completion Gate**: `release.md` passes `validate-release.mjs` with `--think`.
- **Full Workflow**: See [Release](./domain-release.md).

### 16. Forge Curator (`forge-curator.agent.md`)
- **Role**: In discover mode, searches the Forge (semantically and with `discover.mjs`) for reuse before a custom build and produces the Think bindings evidence. In certify mode, evaluates a proposed asset against the certification checklist and drafts its catalog entry.
- **Hard Boundaries**: Never invents an asset; never edits the catalog without a pull request (the Architect owns the Forge); never certifies an asset itself.
- **Completion Gate**: The catalog passes `validate-forge.mjs`, and any Think record passes `bindings-check.mjs`.
- **Full Workflow**: See [Forge](./domain-forge.md).

### 17. Decision Scribe (`decision-scribe.agent.md`)
- **Role**: Drafts decision records and escalations from a Think record or a described decision.
- **Hard Boundaries**: Status is always `Drafted` and the signature `Drafted: unsigned`; never signs and never marks a record Accepted; the Architect decides.
- **Completion Gate**: The record passes `validate-decision.mjs`.
- **Full Workflow**: See [Governance & Decisions](./domain-governance.md).

### 18. Learn Analyst (`learn.agent.md`)
- **Role**: Owned by the QA and maintainer. In its modes it detects and explains (telemetry scan plus correlated deploys), presents proposed hypothesis verdicts, drafts and validates incident records, answers "what should a control have caught?", runs the Persistent Context health checks, and emits Triage issues so the loop closes.
- **Hard Boundaries**: Never decides, never mitigates in production, never holds production credentials, never writes a ledger verdict.
- **Completion Gate**: Every artifact it produces passes its skill's validator, and every Learn output is a Triage issue.
- **Full Workflow**: See [Learn](./domain-learn.md).

### 19. Migration Documenter (`migration-docs.agent.md`)
- **Role**: Inventories the current infrastructure from the repository and manifests, maps each component to the target, registers the unavoidable application changes, and writes the migration plan and cutover runbook.
- **Hard Boundaries**: Writes only under `docs/migration/`; never modifies application code, infrastructure code, or pipelines; resolves gaps infrastructure-side first; no secret values; a `Refactor` decision record stays drafted and unsigned.
- **Completion Gate**: The records pass `skills/migration-docs/scripts/validate-migration.mjs --dir` with exit code 0, and `scope-guard` and `secret-guard` are clean.
- **Full Workflow**: See [Migration](./domain-migration.md).
