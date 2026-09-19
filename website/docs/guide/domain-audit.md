# Auditing & Remediation

The **Auditing & Remediation** domain provides automated, evidence-based code review and surgical vulnerability/defect remediation. It transforms subjective code reviews into reproducible, schema-validated artifacts backed by CI gating.

---

## Domain Architecture

```mermaid
---
caption: Code Audit & Remediation Lifecycle
---
flowchart TD
    subgraph Discovery ["1. Audit Phase"]
        direction TB
        USER_AUDIT["Developer / CI"] -->|Invokes| AG_AUDIT["<b>Code Auditor Agent</b><br/>(code-audit.agent.md)"]
        AG_AUDIT -->|Inspects Codebase| STANDARDS["<b>Quality Standards</b><br/>(Installed Instructions)"]
        AG_AUDIT -->|Generates| REPORT["<b>Audit Report</b><br/>(docs/audits/*.md)"]
    end

    subgraph Validation ["2. Automated Contract Gating"]
        direction TB
        REPORT --> S_SCRIPT["<b>skills/audit-reporting/</b><br/>scripts/audit-report.mjs"]
        S_SCRIPT -->|CI Check| VERDICT{"Valid Contract?"}
        VERDICT -->|Pass| ARTIFACT["Approved Findings Table<br/>(SEC-001, PERF-002, etc.)"]
        VERDICT -->|Fail| REJECT["Reject Pull Request"]
    end

    subgraph Remediation ["3. Surgical Fix Phase"]
        direction TB
        ARTIFACT -->|Select Finding| AG_FIX["<b>Audit Finding Fixer</b><br/>(audit-fix.agent.md)"]
        AG_FIX -.->|Enforces Constraints| INST_SHARP["<b>sharp-agent.instructions.md</b><br/>No speculative refactoring"]
        AG_FIX -->|Surgical Patch| CODE["Target File(s)"]
        AG_FIX -->|Run Narrowest Test| TEST["Verification Test"]
        TEST -->|Pass| DONE["Finding Remediated"]
    end
```

---

## Capabilities Matrix

| Capability | Role | Specialist Agent | Scoping Instruction | Protocol & Skill Bundle | Gating Mechanism |
|---|---|---|---|---|---|
| **Codebase Audit** | Full codebase assessment | [`Code Auditor`](./catalog-agents.md#1-code-auditor) | Matching domain instructions | [`audit-reporting`](./catalog-skills.md#1-audit-reporting) | CI schema validation script |
| **Surgical Defect Fix** | Remediation of single finding | [`Audit Finding Fixer`](./catalog-agents.md#2-audit-finding-fixer) | [`sharp-agent`](./catalog-instructions.md#1-sharp-agent) | [`audit-reporting`](./catalog-skills.md#1-audit-reporting) | Narrowest test command execution |

---

## Capability Workflows

### 1. Codebase Audit

- **When to Run**: Repository onboarding, architectural milestone reviews, security checks, and release gates.
- **Agent**: [`Code Auditor`](./catalog-agents.md#1-code-auditor) (`code-audit.agent.md`)
- **Execution Methodology**:
  1. **Scope Agreement**: Confines analysis strictly to the requested repository, microservice, or subdirectory.
  2. **Stack Discovery**: Examines package manifests (`package.json`), Dockerfiles, and database changelogs.
  3. **Standard Application**: Applies active Coding Pal instructions (e.g. `node-express.instructions.md`, `postgres-liquibase.instructions.md`) as the normative criteria.
  4. **Exhaustive Reading**: Reads every source file within the agreed boundary before formulating findings (no speculative or hallucinated issues).
  5. **Standardized Report**: Generates a structured markdown report under `docs/audits/` adhering to the contract defined in [`skills/audit-reporting/references/report-contract.md`](./catalog-skills.md#1-audit-reporting).
- **Falsifiable Done When**:
  - Every file in scope has been reviewed.
  - The audit report compiles and passes validation via the skill script:
    ```bash
    node .agents/skills/audit-reporting/scripts/audit-report.mjs --report docs/audits/code-audit.md
    ```

### 2. Surgical Finding Remediation

- **When to Run**: Addressing a specific finding from an approved audit report.
- **Agent**: [`Audit Finding Fixer`](./catalog-agents.md#2-audit-finding-fixer) (`audit-fix.agent.md`)
- **Governing Constraints**:
  - **One Finding Mandate**: Takes a single finding identifier (e.g., `SEC-001`, `PERF-003`, `MAINT-007`).
  - **Zero Speculative Refactoring**: Prohibited from rewriting adjacent code, changing naming schemes, or introducing new third-party dependencies unless strictly required.
  - **Governed by Sharp Agent**: Adheres to [`sharp-agent.instructions.md`](./catalog-instructions.md#1-sharp-agent) to prevent token waste and scope creep.
- **Execution Methodology**:
  1. Reads the finding description, file paths, line numbers, and recommended remediation from the audit report.
  2. Applies the minimal, targeted modification directly to the affected lines.
  3. Executes the project's narrowest test command covering that code (e.g. `npm test -- tests/auth.test.js`).
- **Falsifiable Done When**:
  - The finding condition is resolved.
  - The narrowest test suite passes.
  - Untouched code and unrelated files remain completely unmodified.

---

## The Audit Report Protocol

The audit report protocol provided by `skills/audit-reporting/` enforces deterministic structure:

```markdown
---
audit_date: YYYY-MM-DD
repository: repo-name
commit_sha: abc1234
scope: path/to/service
auditor: agent-or-person
findings_summary:
  critical: 0
  high: 2
  medium: 1
  low: 3
---

# Code Audit Report: [Target]

## Executive Summary
[High-level findings summary]

## Findings Matrix
| ID | Severity | Category | Summary | File | Line |
|---|---|---|---|---|---|
| SEC-001 | High | Security | SQL concatenation in search query | src/services/user.js | L42 |

## Detailed Findings
### SEC-001: SQL concatenation in search query
...
```

---

## Related Catalogs & Schemas

- [Agents Catalog](./catalog-agents.md)
- [Instructions Catalog](./catalog-instructions.md)
- [Skills Catalog](./catalog-skills.md)
- [Agent Markdown Schema](./schema-agents.md)
- [Skills Markdown Schema](./schema-skills.md)
