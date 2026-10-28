# Think Specification Contract (`think.md`)

In agentic software development, narrative specifications (lengthy PRDs, free-form design docs) fail AI coding agents: they are ambiguous, bloat the context window, and mix option exploration with implementation details. This contract follows the Agentic Software Factory's [Think](https://alten-group.github.io/agentic-software-factory/guide/stage-think) stage.

- `think.md` is the **Think record**: the options considered, the chosen approach, Forge asset bindings, constraints, blast radius, and any decision record. It is decided here, by the Developer and the Architect, with AI exploring.
- `plan.md` (governed separately by the `plan` skill) is derived downstream from a validated `think.md`.

This contract defines the authoritative structure, headings, fields, and validation rules for `think.md`. `scripts/validate-think.mjs` enforces it.

---

## 1. Specifications Directory & Naming

- Default: `specs/` (or `docs/specs/`).
- Scoped features: `specs/<feature-name>/think.md`.
- Issue-driven work: `specs/issue-<number>/think.md`.
- File name is exactly `think.md` (lowercase ASCII). UTF-8 without BOM.

Fields are written as bullets: `- **<Label>:** <value>`. Continuation lines (sub-bullets, tables, code blocks) belong to the preceding field. Fenced code blocks are opaque: headings and fields inside them are ignored. Where a section may be empty, write the exact literal `_None._`.

---

## 2. `think.md` Contract

`think.md` contains **no source code** and **no task checklist**. The validator rejects fenced code blocks other than plain text or `mermaid`, checkbox items, and `### Step` headings.

### Required Document Structure (In Exact Order)

1. `# Think: <Feature or Task Name>`, followed by these ten level-two headings, in order:
2. `## Business Need & Outcome`
3. `## Options Considered`
4. `## Chosen Approach`
5. `## Forge Asset Bindings`
6. `## System Flow & Responsibilities`
7. `## Constraints & Invariants`
8. `## Blast Radius`
9. `## Decision Record`
10. `## Persistent Context Updates`
11. `## Ambiguities & Open Questions`

### Section Requirements

#### `## Business Need & Outcome`
- `Backlog Issue`: the issue (`#<number>`) or `triage.md` it comes from. When `triage.md` exists, reuse its evidence and system mapping; do not re-derive them.
- `Problem Statement`, `Consumer` (who triggers or consumes the change), `Desired Outcome`.
- Acceptance criteria are written in the Plan (`plan.md`), not here.

#### `## Options Considered`
2 to 4 options, each a level-3 heading `### Option <N>: <Name>` (sequential from 1), each with fields:
- `Approach`
- `Source`: exactly one of `Forge reuse`, `Custom build`, `Hybrid`
- `Trade-offs`, `Cost`, `Risk`

Include credible reuse from the Forge (or existing dependencies) versus custom build.

#### `## Chosen Approach`
- `Selected`: `Option <N>`, naming an existing option.
- `Reasoning`: one short paragraph.
- `Approved By`: who approved the chosen approach. The agent leaves exactly `Pending`. After review, the Developer and the Architect, who make the call together, replace it with `<name> (Developer) on YYYY-MM-DD; <name> (Architect) on YYYY-MM-DD` (see Approval Stages).
- `Custom Build Reason`: required when the selected option is a `Custom build`. Record why no Forge asset covers it, and what was searched.

#### `## Forge Asset Bindings`
Pre-approved reusable services, libraries, templates, and API contracts composed into the approach, as `- **forge/<asset-id>@<version>:** <how it is composed>`, for example `- **forge/gatelin@0.1.0-alpha.9:** Fronts the API for JWT sessions and RBAC`. The id and version come from the Forge catalog (see the `forge` skill, which checks bindings with `bindings-check.mjs`).
- A `Forge reuse` or `Hybrid` selection must list real bindings. A label that is not `forge/<asset-id>@<version>` (or `None`) is rejected.
- A `Custom build` selection must state `- **None:** <reason>`.
- `None` cannot be combined with real bindings.

#### `## System Flow & Responsibilities`
Grounded in the real codebase, Forge assets, and Persistent Context. Never invent layers.
- `Request Tracing`: how requests or events flow through the layers.
- `Component Responsibilities`: each affected component and its single responsibility.
- `Boundaries`: where the change begins and ends.

#### `## Constraints & Invariants`
- `Decision Records`: existing decision records that bound the solution, or `_None._`.
- `Non-Negotiable Rules`: security, compliance, latency, schema compatibility, authorization, transaction boundaries, error envelopes.
- `Side-Effect Constraints`: services, routes, or tables that must remain untouched, or `_None._`.

#### `## Blast Radius`
Classified once, here, as defined in the Factory's governance page. The tier sets the human validation the change needs in Prove.
- `Tier`: `Low`, `Medium`, `High`, or `Critical`.
- `Affected`: the APIs, schemas, queues, and consumers touched.
- `Rationale`: why this tier.
- `Rollback`: the rollback mechanism. **Required for `High` and `Critical`** (`_None._`, `None`, or `no rollback` are rejected); otherwise `_None._`.

| Tier | Criteria |
|---|---|
| Low | Internal refactor, non-breaking schema change, copy edit behind green deterministic tests |
| Medium | New public endpoint, schema addition, integration with an external vendor |
| High | Auth, permissions, billing, PII processing, data migration |
| Critical | Irreversible data migration, breaking public contract, infrastructure change |

#### `## Decision Record`
Required when the approach alters a public API, changes a database schema, or shifts service boundaries. AI drafts it from repository conventions. The Architect reviews and signs it.
- `Required`: `yes` or `no`.
- If `yes`: `Record` (workspace path) and `Status`. `Status` is `Drafted` while awaiting the Architect (free text after it, for example `Drafted, awaiting Architect`), or `Signed by <name> (Architect) on YYYY-MM-DD` with a valid date. The name must be a person: names containing an AI or automation word (copilot, claude, gpt, gemini, chatgpt, openai, anthropic, bot, agent, dependabot, renovate, github-actions, ai, llm) or a placeholder (`TBD`, `x`, `<name>`) are rejected.
- If `no`: `Reason`.
- A `Critical` tier always requires a decision record.

#### `## Persistent Context Updates`
Updates to Persistent Context identified here and carried into the Plan, or `_None._`. Each is `- **Update:** \`path\` - what changes`. The downstream Plan must cover each path with a step.

#### `## Ambiguities & Open Questions`
Unresolved questions that need human clarification, or `_None._`.

---

## 3. Approval Stages (`--stage draft|approved`, default `draft`)

`validate-think.mjs` checks `--stage`. The AI never approves.

| Stage | `think.md` `Approved By` |
|---|---|
| `draft` | exactly `Pending` |
| `approved` | `<name> (Developer) on YYYY-MM-DD; <name> (Architect) on YYYY-MM-DD` |

At `approved`: role strings are exact, dates are valid `YYYY-MM-DD`, two approvers are two different people, and names that are placeholders (`TBD`, `x`, `<name>`) or an AI or automation (Copilot, Claude, GPT, bot, agent, and so on) are rejected, with the same check as the signed decision record.

---

## 4. Anti-Patterns & Prohibitions

1. **No monolithic narrative PRDs.** Requirements are fields, not essays.
2. **No code in `think.md`.** Code lives in the Plan's `New Code` fields and is written for real in Code.
3. **No task checklists or `### Step` headings in `think.md`.** Sequencing belongs to the Plan stage.
4. **No re-deriving Triage.** When `triage.md` exists, reuse its evidence and system mapping.
5. **No unrecorded custom build.** A custom implementation needs a recorded `Custom Build Reason`.
6. **No AI-signed decision records.** AI drafts. The Architect signs.
7. **No AI approval.** The agent leaves `Approved By: Pending`; only named people approve.

---

## 5. Storage & Issue Attachment Convention

In autonomous CI/CD pipelines (for example triggered by `ready`, `todo`, or `decision:todo` labels, or by `issues: [opened]` where Triage is not used):

- **Non-destructive Issue Comment**: never overwrite the human issue body. Post an **Issue Comment** with `gh issue comment` containing the validated `think.md` (optionally wrapped in `<details><summary>🧠 <b>think.md (Options, Blast Radius &amp; Constraints)</b></summary> ... </details>`).
- **Branch Storage (when enabled)**: commit `specs/issue-<number>/think.md` on branch `specs/issue-<number>`.
