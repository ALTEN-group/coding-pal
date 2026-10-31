# Prompts Catalog

Prompts are user-facing entry points exposed as slash commands in the AI chat window. They resolve parameters, active editor selections, and open file paths before delegating the work to a specialized agent.

## Overview Table

| Command | File | Bound Agent | Argument Hint | Domain Workflow | Purpose |
|---|---|---|---|---|---|
| `/node-unit-tests` | `node-unit-tests.prompt.md` | **Unit Tester** | `optional src path, e.g. src/services/user.service.js` | [Testing & Verification](./domain-testing.md#_1-node-js-module-unit-tests) | Generates or updates isolated Jest unit tests for a Node module. |
| `/node-api-tests` | `node-api-tests.prompt.md` | **API Tester** | `optional route path, e.g. src/routes/app.js` | [Testing & Verification](./domain-testing.md#_2-node-js-http-api-route-tests) | Generates or updates Supertest HTTP API route tests for an Express route module. |
| `/angular-unit-tests` | `angular-unit-tests.prompt.md` | **Unit Tester** | `optional src path, e.g. src/app/...` | [Testing & Verification](./domain-testing.md#_3-angular-vitest-component-specs) | Generates or updates Vitest unit tests colocated with an Angular component/service. |
| `/angular-e2e-tests` | `angular-e2e-tests.prompt.md` | **E2E Tester** | `optional flow name, e.g. auth-login` | [Testing & Verification](./domain-testing.md#_4-angular-playwright-end-to-end-tests) | Generates Playwright end-to-end tests under `e2e/`. |
| `/postgres-liquibase-tests` | `postgres-liquibase-tests.prompt.md` | **Unit Tester** | `optional db area, e.g. db/changelog` | [Testing & Verification](./domain-testing.md#_5-postgresql-liquibase-migration-assertions) | Generates SQL assertion tests validating migrations against PostgreSQL. |
| `/vitepress-docs` | `vitepress-docs.prompt.md` | **VitePress Docs** | `docs root, e.g. website` | [Specs & Docs](./domain-docs.md#_2-product-documentation-website-vitepress-docs) | Scaffolds or updates a complete VitePress product documentation website. |
| `/performance-tests` | `performance-tests.prompt.md` | **Performance Tester** | `target service or route` | [Testing & Verification](./domain-testing.md#_6-k6-performance-load-benchmarking) | Scaffolds or updates a k6 performance test suite. |
| `/fuzz-tests` | `fuzz-tests.prompt.md` | **Fuzz Tester** | `OpenAPI path or service name` | [Testing & Verification](./domain-testing.md#_7-restler-api-grammar-fuzzing) | Scaffolds or runs RESTler grammar-based fuzzing tests. |
| `/code` | `code.prompt.md` | **Code Agent** | `issue number or specs directory, optional step number` | [Code](./domain-code.md) | Implements a validated plan one step at a time until green, then opens the pull request with its record. |
| `/prove` | `prove.prompt.md` | **Prove Validator** | `pull request number, issue number, or specs directory` | [Prove](./domain-prove.md) | Validates a pull request against its `think.md`, `plan.md`, and all deterministic controls, writing `specs/issue-<n>/prove.md`. |
| `/fix-gates` | `fix-gates.prompt.md` | **Gate Fixer** | `path to failing gate output or pull request number` | [Prove](./domain-prove.md) | Diagnoses and fixes a failing deterministic gate without weakening any control. |
| `/release-plan` | `release-plan.prompt.md` | **Release Planner** | `issue number or specs directory` | [Release](./domain-release.md) | Drafts the release declaration for DevOps to approve. |
| `/outcome-review` | `outcome-review.prompt.md` | **Learn Analyst** | `ledger path and observed values` | [Learn](./domain-learn.md) | Prepares the weekly Outcome review pack with proposed verdicts. |
| `/context-review` | `context-review.prompt.md` | **Learn Analyst** | `repository root and optional notes` | [Learn](./domain-learn.md) | Prepares the weekly Persistent Context & Controls review pack. |
| `/incident` | `incident.prompt.md` | **Learn Analyst** | `timeline notes file or incident record` | [Learn](./domain-learn.md) | Drafts and validates an incident record. |
| `/pre-read` | `pre-read.prompt.md` | **Learn Analyst** | `triage-review, outcome-review, context-review, or operating-retro` | [Learn](./domain-learn.md) | Drafts the AI pre-read for a recurring meeting. Writes nothing. |
| `/operating-retro` | `operating-retro.prompt.md` | **Learn Analyst** | `events file or metrics report` | [Learn](./domain-learn.md) | Prepares the monthly Operating-Model Retrospective pack. |
| `/forge-search` | `forge-search.prompt.md` | **Forge Curator** | `the need in a sentence` | [Forge](./domain-forge.md) | Searches the Forge for reusable assets and produces the Think bindings evidence. |
| `/forge-certify` | `forge-certify.prompt.md` | **Forge Curator** | `repository URL or path of the proposed asset` | [Forge](./domain-forge.md) | Evaluates a proposed asset against the certification checklist and drafts its catalog entry. |
| `/decision` | `decision.prompt.md` | **Decision Scribe** | `the decision to record, or a path to think.md` | [Governance & Decisions](./domain-governance.md) | Records an attributed autonomous decision or escalation. |
| `/meet` | `meet.prompt.md` | **Meeting Analyst** | `transcript export or meeting directory` | [Meet](./domain-meet.md#_1-transcript-to-meeting-pack) | Turns a client meeting transcript into `transcript.md` and a validated Meeting Pack. |
| `/meet-readback` | `meet-readback.prompt.md` | **Meeting Analyst** | `transcript file` | [Meet](./domain-meet.md#_2-read-back-list) | Prepares the Product Owner's read-back list before the meeting ends. |
| `/triage` | `triage.prompt.md` | **Triage Analyst** | `issue number or source path, e.g. #42` | [Triage](./domain-triage.md#_1-candidate-need-to-backlog-issue) | Turns a candidate need or ticket batch into evidence-linked `triage.md` files with a proposed decision. |
| `/triage-review` | `triage-review.prompt.md` | **Triage Analyst** | `optional specs directory, e.g. specs` | [Triage](./domain-triage.md#_2-weekly-review-pack) | Prepares the ranked backlog for the weekly Triage review. |
| `/migration-docs` | `migration-docs.prompt.md` | **Migration Documenter** | `source to target and optional docs directory` | [Migration](./domain-migration.md) | Writes the migration assessment, plan, and runbook with minimal application changes. |

---

## Command Invocation & Target Resolution

Each prompt enforces a deterministic parameter resolution pipeline (argument $\rightarrow$ active editor selection $\rightarrow$ open file). If resolution fails, the prompt halts and asks the user rather than guessing.

### 1. `/node-unit-tests`
- **Invocation**: `/node-unit-tests [src/path/to/module.js]`
- **Target Resolution**: Checks chat prompt for `src/**/*.js`, falls back to active editor selection or current file. If the file is under `src/routes/`, redirects to `/node-api-tests`.
- **Delegation**: Maps to `tests/<path>/<file>.test.js` and hands off execution to **Unit Tester**. See [Node.js Module Unit Tests](./domain-testing.md#_1-node-js-module-unit-tests).

### 2. `/node-api-tests`
- **Invocation**: `/node-api-tests [src/routes/path/to/route.js]`
- **Target Resolution**: Checks chat prompt for `src/routes/**/*.js`, falls back to active editor selection or open route file.
- **Delegation**: Maps to `tests/routes/<resource>.test.js` and hands off execution to **API Tester**. See [Node.js HTTP API Route Tests](./domain-testing.md#_2-node-js-http-api-route-tests).

### 3. `/angular-unit-tests`
- **Invocation**: `/angular-unit-tests [src/app/path/to/component.ts]`
- **Target Resolution**: Resolves target TypeScript component, service, or pipe from prompt, selection, or tab.
- **Delegation**: Colocates `*.spec.ts` adjacent to source and hands off to **Unit Tester**. See [Angular Vitest Component Specs](./domain-testing.md#_3-angular-vitest-component-specs).

### 4. `/angular-e2e-tests`
- **Invocation**: `/angular-e2e-tests [flow-name]`
- **Target Resolution**: Resolves target workflow or feature name under `e2e/`.
- **Delegation**: Hands off to **E2E Tester** enforcing Page Object Model. See [Angular Playwright E2E Tests](./domain-testing.md#_4-angular-playwright-end-to-end-tests).

### 5. `/postgres-liquibase-tests`
- **Invocation**: `/postgres-liquibase-tests [db/changelog/path]`
- **Target Resolution**: Resolves target migration changelog or schema table.
- **Delegation**: Maps to `tests/db/<area>.sql` and hands off to **Unit Tester**. See [PostgreSQL Migration Assertions](./domain-testing.md#_5-postgresql-liquibase-migration-assertions).

### 6. `/vitepress-docs`
- **Invocation**: `/vitepress-docs [docs-root]`
- **Target Resolution**: Takes positional argument as documentation root (e.g., `website/`). Halts and prompts if missing.
- **Delegation**: Hands off scaffolding and configuration to **VitePress Docs**. See [Product Documentation Website](./domain-docs.md#_2-product-documentation-website-vitepress-docs).

### 7. `/performance-tests`
- **Invocation**: `/performance-tests [service-name]`
- **Target Resolution**: Identifies target API service or endpoint to benchmark.
- **Delegation**: Hands off k6 scenario generation and threshold setup to **Performance Tester**. See [k6 Performance Benchmarking](./domain-testing.md#_6-k6-performance-load-benchmarking).

### 8. `/fuzz-tests`
- **Invocation**: `/fuzz-tests [openapi-path]`
- **Target Resolution**: Resolves OpenAPI/Swagger contract path.
- **Delegation**: Hands off grammar compilation and RESTler execution to **Fuzz Tester**. See [RESTler API Grammar Fuzzing](./domain-testing.md#_7-restler-api-grammar-fuzzing).

### 9. `/triage`
- **Invocation**: `/triage [issue-or-source-path] [extra-source...]`
- **Target Resolution**: Takes an issue number or URL, or a meeting pack, ticket export, audit report, or notes file. Falls back to the active editor file. Asks when the target is unclear.
- **Delegation**: Hands off enrichment, scoring, and the proposed decision to **Triage Analyst**, which writes `specs/issue-<n>/triage.md` and validates it at the `proposed` stage. See [Candidate Need to Backlog Issue](./domain-triage.md#_1-candidate-need-to-backlog-issue).

### 10. `/triage-review`
- **Invocation**: `/triage-review [specs-directory]`
- **Target Resolution**: Takes the specifications directory, defaulting to `specs/`.
- **Delegation**: Hands off to **Triage Analyst** in review mode, which ranks the scored backlog and lists unscored needs, ties, and `explore` follow-ups without writing files. See [Weekly Review Pack](./domain-triage.md#_2-weekly-review-pack).

### 11. `/meet`
- **Invocation**: `/meet [transcript-export-or-meeting-directory]`
- **Target Resolution**: Takes a plain-text export or an existing `meetings/<date>-<slug>/` directory. Falls back to the active editor file. For an export it asks for the title, date, tool, recording consent statement, and a roster (name, role, side) for every speaker, and never invents them.
- **Delegation**: Hands off to **Meeting Analyst** in pack mode, which writes `transcript.md` once and `pack.md`, and validates at the `draft` stage with `docs/glossary.md`. See [Transcript to Meeting Pack](./domain-meet.md#_1-transcript-to-meeting-pack).

### 12. `/meet-readback`
- **Invocation**: `/meet-readback [transcript-file]`
- **Target Resolution**: Takes a transcript file (plain text or `transcript.md`), falling back to the active editor file.
- **Delegation**: Hands off to **Meeting Analyst** in read-back mode, which lists the captured needs with verbatim quotes, terms to confirm, and open questions, without writing files. See [Read-Back List](./domain-meet.md#_2-read-back-list).

### 13. `/code`
- **Invocation**: `/code [issue-number-or-specs-dir] [step]`
- **Delegation**: **Code Agent** implements the next unfinished plan step (or the named one) through `code-loop`, then opens the pull request with the `pr-record` body. See [Code](./domain-code.md).

### 14. `/fix-gates`
- **Invocation**: `/fix-gates [gate-output-path-or-pr-number]`
- **Delegation**: **Gate Fixer** diagnoses and fixes the failing gate within the fix-loop limit. See [Prove](./domain-prove.md).

### 15. `/release-plan`
- **Invocation**: `/release-plan [issue-number-or-specs-dir]`
- **Delegation**: **Release Planner** drafts `release.md` for DevOps to approve. See [Release](./domain-release.md).

### 16. `/forge-search`
- **Invocation**: `/forge-search "<the need in a sentence>"`
- **Delegation**: **Forge Curator** in discover mode returns ranked assets and the Think bindings evidence. See [Forge](./domain-forge.md).

### 17. `/forge-certify`
- **Invocation**: `/forge-certify [repository-url-or-path]`
- **Delegation**: **Forge Curator** in certify mode evaluates the asset and drafts its catalog entry. See [Forge](./domain-forge.md).

### 18. `/decision`
- **Invocation**: `/decision [decision-or-think-path]`
- **Delegation**: **Decision Scribe** chooses and validates an explicitly attributed automated decision, or records an escalation. See [Governance & Decisions](./domain-governance.md).

### 19. `/outcome-review`, `/context-review`, `/incident`, `/pre-read`, `/operating-retro`
- **Delegation**: All five hand off to **Learn Analyst**. `/outcome-review` lists hypotheses due with proposed verdicts and the maths; `/context-review` runs the context lint and proposes artifacts from repeated corrections; `/incident` drafts and validates an incident record; `/pre-read <meeting>` drafts the AI pre-read for `triage-review`, `outcome-review`, `context-review`, or `operating-retro` and writes nothing; `/operating-retro` prepares the monthly retrospective from the flow-metrics report. None of them decides. See [Learn](./domain-learn.md).

### 20. `/migration-docs`
- **Invocation**: `/migration-docs [source to target] [docs-dir]`
- **Target Resolution**: Takes the source, the target, and an optional output directory (default `docs/migration/<name>/`). Asks when the source or the target is unclear and continues with the next missing record instead of overwriting a validated one.
- **Delegation**: **Migration Documenter** writes and validates the records. See [Migration](./domain-migration.md).
