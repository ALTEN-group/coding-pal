---
name: app-state-analysis
description: Use when asked to audit, assess, or document the current state of an application - architecture, database schema, deployment, cloud readiness, test practices, CI/CD. Produces an evidence-based HTML report in the ALTEN design system. Read-only; does not change the code under analysis.
---

# Application state analysis

Role: senior reviewer producing an evidence-based snapshot of an application. Output is one standalone HTML report. You analyse; you do NOT modify application code, config, or CI.

MUST read `skill://alten-html-docs` before writing the report and follow it for all HTML/design rules.

## Principles

- Evidence first. Every finding cites `path:line` (or command output). Claims you could not verify are tagged `[INFERENCE]`; things you looked for and did not find are stated as "absent (searched: …)".
- Observed ≠ recommended. Separate "État constaté" (facts) from "Recommandations" (opinions, with rationale and effort).
- Run, don't guess: when safe and cheap, run build/test/lint/schema-dump commands to get real results. NEVER run destructive commands, deploy, or touch real databases/cloud accounts. Do not install global tooling.
- Read project guidance first (`README`, `AGENTS.md`/`CLAUDE.md`, `docs/`), then verify it against the code. Flag docs that contradict code.
- Scope: if the user names a subset of domains, cover only those and say so in the report. Default is all six.
- Large repos: delegate per-domain investigation to parallel `scout` tasks (one per domain, read-only, each returning findings with `path:line` evidence); you integrate and write the report.

## Workflow

1. **Recon** (single pass): list root, manifests (`package.json`, `pom.xml`, `go.mod`, `pyproject.toml`…), lockfiles, Dockerfiles, compose files, CI files, IaC (`terraform/`, `helm/`, `k8s/`, `deploy/`), migrations, test dirs, docs. Identify components, languages, runtimes, versions.
2. **Investigate** each domain with its checklist below.
3. **Verify** with real commands where possible (build, tests, lint/typecheck, `docker compose config`, dependency audit). Record exact command + outcome (pass/fail, counts, duration).
4. **Rate** each domain and each finding (scale below).
5. **Write** the HTML report to `docs/analysis/<app>-state-<YYYY-MM-DD>.html` (create the dir if needed; follow the user's path if given).
6. **Check** the rendered page in a browser; fix layout issues.
7. Reply with: path to report, the domain scores, top 5 findings. Nothing else.

## Domain checklists

### 1. Architecture
- Components/services and responsibilities; entry points; runtime topology.
- Layering and dependency direction; are boundaries enforced (architecture tests, lint rules, module visibility)?
- Data flow for the main use case(s), traced through the code.
- External integrations (APIs, queues, mail, auth providers); sync vs async; failure handling.
- Cross-cutting: authn/authz model, validation, error model, logging, config, i18n, time/date handling.
- API contract: documented? matches code? versioning? error format?
- Coupling hot spots, oversized modules, duplicated logic, dead code, tech debt markers (`TODO`, `FIXME`).
- Dependency health: outdated/EOL runtimes and frameworks, known-vulnerable packages (`npm audit` or equivalent), license risks.
- Diagram: include one mermaid-equivalent as inline SVG/HTML boxes (no external JS) of components and flows.

### 2. Database & schemas
- Engine(s) and version; ORM/driver; connection pooling config.
- Schema: tables, columns, types, PK/FK, unique/check constraints, indexes (inventory from migrations or entities; dump from a throwaway local DB if possible). Include an entity table or relationship diagram.
- Migrations: tool, ordering, reversibility, run at startup vs as separate step, safe for rolling deploys (expand/contract)?
- Integrity: constraints in DB vs only in code; nullable/default hygiene; soft delete; audit columns; timezone handling.
- Performance: missing indexes for known query paths, N+1 patterns, unbounded queries, pagination.
- Data lifecycle: seeds, backups/restore, retention, PII/GDPR columns, encryption at rest.
- Parity: dev/test DB vs production engine (e.g. in-memory fake vs PostgreSQL) and what is therefore untested.

### 3. Deployment
- Build artifacts: Dockerfiles (base image pin, multi-stage, non-root user, `.dockerignore`, healthcheck, image size), compose files, reverse proxy config.
- Environments: dev/staging/prod differences; how config and secrets are injected; `.env` handling and committed secrets (search the tree and git-tracked files).
- Release process: versioning/tagging, promotion, rollback procedure, migration step, downtime expectations.
- Docs: is there a runnable, accurate deployment guide? Try `docker compose config` or equivalent to validate it.

### 4. Cloud deployment readiness
Rate against these criteria (each: Met / Partial / Not met / N/A, with evidence):
- Stateless processes; no local-disk state; sessions/state externalised; horizontal scaling possible (in-process buses, caches, schedulers, SSE/WebSocket fan-out break this - flag them).
- Config via environment (12-factor); no secrets in images or repo; secret manager compatible; config validated at startup.
- Containers: reproducible, pinned, minimal, non-root, read-only-FS friendly, SIGTERM graceful shutdown.
- Health: liveness and readiness endpoints distinct; DB dependency handled; startup probes/time.
- Observability: structured logs to stdout, request/correlation IDs, metrics endpoint, tracing hooks, error reporting; PII not logged (tokens in URLs!).
- Resilience: timeouts, retries/backoff, circuit breaking, idempotency, connection-pool limits, rate limiting.
- Data: managed-DB compatible, TLS to DB, backup/restore + PITR, migration strategy in multi-instance deploys (single runner / lock).
- Security posture: TLS termination, security headers/CORS, authn/authz, dependency and image scanning, least-privilege runtime.
- Infra as code: Terraform/Helm/Kubernetes manifests present? Resource requests/limits, autoscaling, network policies?
- Cost/ops: expected resource profile, log volume, cold start.
- Conclude with a verdict (Prêt / Prêt sous conditions / Non prêt) and an ordered list of blockers vs improvements. Name the target platform assumption (e.g. Kubernetes, ECS, Cloud Run, VM) or state it is unspecified.

### 5. Test practices
- Inventory by layer (unit, integration, e2e, contract, UI) with counts and locations; run the suites and record pass/fail/skipped/duration. Report flaky or skipped tests.
- Coverage: configured? measured? thresholds enforced? Where is it high/low relative to risk (business rules, authorization, HTTP contract, DB adapters)?
- Quality: do tests assert behavior and boundaries or only wiring/mocks? Determinism (clocks, randomness, ports), isolation, speed.
- Realism: DB/adapters tested against the real engine? Test doubles drift from production behavior?
- Tooling: runners, fixtures/factories, test-data conventions, architecture tests, lint/typecheck as gates; local vs CI parity.
- Gaps: untested critical paths (authz, migrations, error paths, concurrency), no e2e/browser coverage, no load/security tests.

### 6. CI/CD
- Pipeline definition(s) (`.gitlab-ci.yml`, `.github/workflows`, etc.): stages, triggers, branches/tags, runners, caching, parallelism, duration.
- Gates: are build, lint/typecheck, tests, audit, image scan, migration check run **before** merge/publish? Or is CI only a publisher?
- Artifacts: image build/tagging/provenance, registry, immutability, SBOM/signing.
- Delivery: automatic vs manual deploy, environments, approvals, rollback, secrets handling in CI variables.
- Reproducibility: pinned base images/actions/tool versions, lockfile install (`npm ci`), version parity with local/prod.
- Gaps between what CI runs and what contributors are told to run locally.

## Rating scale

Domain score 0-4 (4 = exemplary, 3 = solid with minor gaps, 2 = works with notable gaps, 1 = fragile, 0 = absent/unsafe). Justify each score in one sentence.

Finding severity (design-system palette only - never red):

| Severity | Label | Badge | Meaning |
|---|---|---|---|
| 3 | Critique | `badge-navy` | Security, data loss, or blocks production |
| 2 | Majeur | `badge-ochre` | Real risk or strong maintainability cost; fix soon |
| 1 | Mineur | `badge-azure` | Improvement worth scheduling |
| 0 | Info | `badge-grey` | Observation, no action required |

Each finding: ID (`ARCH-1`, `DB-2`, `CLOUD-3`, `TEST-1`, `CI-2`, `DEPLOY-1`), severity, one-line title, evidence (`path:line`), impact, recommendation, effort (S/M/L).

## Report structure

Standalone HTML following `skill://alten-html-docs` (language: the user's; French by default for this repo). Sections, each using the numbered `.title-block` + `title-highlight` + `section-intro` pattern:

1. **Hero** - application name, "État de l'application", date, commit SHA/branch analysed, scope.
2. **Synthèse** - 5-line executive summary; domain score table (domain, score /4, verdict badge, one-line justification); top findings as `.card-pillar` cards; `.dataviz` of the six scores with a legend/labels (not colour only).
3. **Architecture** - component/flow diagram, layering, findings.
4. **Base de données** - engine, entity/relationship table, migration approach, findings.
5. **Déploiement** - artifacts, environments, release process, findings.
6. **Préparation cloud** - criteria table (Met/Partial/Not met + evidence), verdict, blockers vs improvements.
7. **Pratiques de test** - suite inventory table with measured results, coverage, gaps, findings.
8. **CI/CD** - pipeline stages table, gates matrix, findings.
9. **Plan d'action** - findings ordered by severity then effort, in one table (ID, title, severity badge, effort, domain).
10. **Annexes** - commands run with results, files/areas not analysed, `[INFERENCE]` list, methodology and rating scale.

Use `.card-light` for per-domain summaries, `.rules`/`.rule` for strengths vs weaknesses, `<code>` for paths and commands, tables for inventories. Diagrams: inline SVG using only design-system tokens/colours.

## Done checklist

- [ ] All requested domains covered; scope limits stated
- [ ] Every finding has `path:line` evidence or an explicit "absent (searched: …)"
- [ ] Commands actually run are listed with real outcomes; none fabricated
- [ ] Facts and recommendations separated; unverified claims tagged `[INFERENCE]`
- [ ] Report follows `alten-html-docs` (copied `<style>`, tokens only, no red/black), viewed in a browser
- [ ] No application files modified (only the report was added)
