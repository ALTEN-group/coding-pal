# Decision Record Specification Contract

Some decisions are not the squad's. The Agentic Software Factory's [governance page](https://alten-group.github.io/agentic-software-factory/guide/governance) assigns them to the **Architect** and requires a written record. This contract defines two persistent artifacts: the **decision record** (a decision that was made) and the **escalation** (a decision that must be made, with a date by which silence adopts the recommendation).

AI may choose and accept decisions autonomously, including public API, schema, High, and Critical changes, provided all required controls pass. Attribute those decisions explicitly to automation; never invent human sign-off. The Architect owns the decision policy and handles escalated failures, not routine per-change approval.

---

## 1. Directory & Naming

- Decision records: `docs/decisions/<NNNN>-<slug>.md`. `NNNN` is a 4-digit sequential number starting at `0001`, unique, with no gaps. `<slug>` is lowercase kebab-case.
- Escalations: `docs/decisions/escalations/<YYYY-MM-DD>-<slug>.md`. The date is the day the escalation was raised.
- `README.md` files are ignored. UTF-8 without BOM.
- A record is never deleted or renumbered. A reversed decision is `Superseded` by a newer record.

---

## 2. When a Decision Record Is Required

These are the decisions the governance decision table assigns to the Architect. Each maps to a `Type`:

| Factory decision | `Type` | Extra required field |
|---|---|---|
| Public contract or cross-service boundary change | `contract-change` | none |
| Data model change affecting other squads | `data-model` | `Migration Plan` |
| Security-sensitive change (auth, PII, billing) | `security` | none (the review record lives on the pull request) |
| Adding a new runtime, database, or vendor | `runtime-vendor` | none |
| AI usage policy and model access | `ai-policy` | none |
| Adopting a new model, agent, or prompt standard | `model-adoption` | `Evaluation Report` |
| Adopting an external tool outside the core platform | `tooling` | `Native Alternatives Considered`, `Context Preservation` |
| Any other Architect decision | `other` | none |

Think sets `Required: yes` in `## Decision Record` of `think.md` when the approach alters a public API, changes a schema, or shifts service boundaries. A `Critical` blast radius always requires one.

---

## 3. Decision Record Structure

### Required Document Structure (In Exact Order)

1. `# Decision: <title>`
2. A header block of `- **<Field>:** <value>` bullets
3. `## Context`
4. `## Options`
5. `## Decision`
6. `## Consequences`

No other level-2 headings. No source code blocks.

### Header Fields

| Field | Content |
|---|---|
| `Status` | `Drafted`, `Accepted`, `Rejected`, or `Superseded` |
| `Date` | ISO `YYYY-MM-DD` |
| `Type` | One of the types in section 2 |
| `Deciders` | Comma-separated `<name> (<role>)`. Human roles: `Product Owner`, `Developer`, `Architect`, `DevOps`, `QA and maintainer`. Autonomous decisions use `<identity> (Automation)`. An Architect or Automation identity is required |
| `Source` | The issue (`#42` or `issue-42`) or a workspace path such as `specs/issue-42/think.md` |
| `Supersedes` | A 4-digit record number, or `_None._` |
| `Signature` | `Drafted: unsigned`, `Automated by <identity> on YYYY-MM-DD`, or an actual `Signed by <name> (Architect) on YYYY-MM-DD` |

Type-specific fields (also in the header block, never `_None._`):

- `tooling`: `Native Alternatives Considered` (why the core platform cannot meet the need) and `Context Preservation` (how AI context is preserved without loss).
- `data-model`: `Migration Plan` (the migration, its rollback, and the squads affected).
- `model-adoption`: `Evaluation Report` (workspace path to the evaluation; the validator checks it exists).

### Sections

- `## Context`: the forces at play and the constraints. Reuse the Think record; do not re-derive it.
- `## Options`: 2 or more `### Option <N>: <name>` blocks, numbered from 1, each with non-empty `Pros` and `Cons`.
- `## Decision`: the chosen option and the reason. Written as a fact, not a proposal.
- `## Consequences`: what changes, what becomes harder, and what to monitor.

### Status and Signature

| Status | Signature | Who |
|---|---|---|
| `Drafted` | `Drafted: unsigned` | Any author; incomplete or explicitly awaiting review |
| `Accepted` | `Signed by <name> (Architect) on <date>` | The Architect |
| `Rejected` | `Signed by <name> (Architect) on <date>` | The Architect |
| `Superseded` | `Signed by <name> (Architect) on <date>` | The Architect, as part of the superseding record |

For autonomous decisions, Accepted, Rejected, and Superseded records instead use `Automated by <identity> on YYYY-MM-DD`, matching an Automation entry in Deciders. The date must be real and no earlier than the record date. `Drafted` remains unsigned. These are automated decisions, not human signatures.

For human signatures, the signer must be a real Architect listed in Deciders, with a valid date no earlier than the record date. Bare roles, placeholders, and AI identities cannot masquerade as human names. Automation identities are valid only in the explicit automated decision format; human escalation resolutions retain their existing attribution checks.

### Supersession

- A record that lists `Supersedes: NNNN` must be newer than its target, and each target is superseded by one record only.
- When the superseding record is `Accepted` (or itself later `Superseded`), the target must be `Superseded`. While it is `Drafted` or `Rejected`, the target must still be `Accepted`.
- A `Superseded` record must be named by exactly one other record.

---

## 4. Escalation Structure

Escalate only for: cross-squad conflict, security exposure, compliance obligation, external commitment, or budget impact. Everything else is the squad's decision.

`# Escalation: <title>` followed by `- **<Field>:** <value>` bullets:

| Field | Content |
|---|---|
| `Decision` | The decision that has to be made |
| `Options` | A bulleted or numbered list of 2 or more options (indented under the field) |
| `Recommendation` | The option the author recommends and why |
| `Default Date` | ISO date. **Silence by this date means the recommendation is adopted** |
| `Reason` | `cross-squad conflict`, `security exposure`, `compliance obligation`, `external commitment`, or `budget impact` |
| `Status` | `Open`, `Decided`, or `Adopted by default` |
| `Resolution` | Required unless `Open`. `Decided by <name> (<role>) on YYYY-MM-DD`, or `Adopted by default on YYYY-MM-DD` (not before the Default Date) |

The `Default Date` cannot precede the date in the file name.

`scripts/escalations.mjs due` lists Open escalations whose Default Date has passed (their recommendation is adopted by default and the record must be updated; exit code 1) and those due within 2 days.

---

## 5. Think Cross-Check

`validate-decision.mjs --think specs/issue-<n>/think.md` reads `## Decision Record` and `## Blast Radius` from `think.md` and checks:

1. `Required` is `yes` or `no`. A `Critical` tier with `Required: no` is rejected.
2. When `yes`, `Record` is a workspace path that exists and itself validates.
3. Think `Status: Automated by <identity> on YYYY-MM-DD` requires an Accepted record with matching automation attribution. `Status: Signed` remains reserved for human Architect signatures. A `Drafted` record is never accepted.
4. Think Drafted requires an unsigned record. Accepted automated decisions use matching identity and date in Think's decision Status; genuine human signatures may still use Signed.

`--root <dir>` sets the workspace root for resolving paths (default: the current directory).

---

## 6. Anti-Patterns & Prohibitions

1. **No forged human signatures.** AI records decisions as Automation, never as a named human Architect.
2. **No single-option records.** A decision with one option was not a decision. Record the options that were rejected.
3. **No missing consequences.** Every option has a real downside; `Cons: _None._` is rejected.
4. **No tool without proof.** A `tooling` record that cannot show a native alternative was considered and how AI context is preserved is rejected.
5. **No silent edits.** Do not rewrite an `Accepted` record. Supersede it.
6. **No escalation by habit.** Only the five reasons above justify an escalation.
