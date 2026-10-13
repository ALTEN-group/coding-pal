# Think & Plan Specification Contract

In agentic software development, narrative specifications (lengthy PRDs, free-form design docs) fail AI coding agents: they are ambiguous, bloat the context window, and leave sequencing undefined. This contract follows the Agentic Software Factory's [Think](https://alten-group.github.io/agentic-software-factory/guide/stage-think) and [Plan](https://alten-group.github.io/agentic-software-factory/guide/stage-plan) stages.

- `think.md` is the **Think record**: the options considered, the chosen approach, Forge asset bindings, constraints, blast radius, and any decision record. It is decided here, by the Developer and the Architect, with AI exploring.
- `plan.md` is the **Plan record**: the file scope, acceptance criteria, an ordered implementation checklist (with the code to implement), a test plan, and a blast radius check. It is derived strictly from a validated `think.md`.

This contract defines the authoritative structure, headings, fields, and validation rules for both files. `scripts/validate-specs.mjs` enforces it.

---

## 1. Specifications Directory & Naming

- Default: `specs/` (or `docs/specs/`).
- Scoped features: `specs/<feature-name>/think.md` and `specs/<feature-name>/plan.md`.
- Issue-driven work: `specs/issue-<number>/think.md` and `specs/issue-<number>/plan.md` on branch `specs/issue-<number>`, next to `triage.md`.
- File names are exactly `think.md` and `plan.md` (lowercase ASCII). UTF-8 without BOM.

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
- `Backlog Issue`: the issue or `triage.md` it comes from. Reuse the Triage evidence and system mapping; do not re-derive them.
- `Problem Statement`, `Consumer` (who triggers or consumes the change), `Desired Outcome`.
- Acceptance criteria are written in the Plan, not here.

#### `## Options Considered`
2 to 4 options, each a level-3 heading `### Option <N>: <Name>` (sequential from 1), each with fields:
- `Approach`
- `Source`: exactly one of `Forge reuse`, `Custom build`, `Hybrid`
- `Trade-offs`, `Cost`, `Risk`

Include credible reuse from the Forge versus custom build.

#### `## Chosen Approach`
- `Selected`: `Option <N>`, naming an existing option.
- `Reasoning`: one short paragraph.
- `Approved By`: who approved the chosen approach. The agent leaves exactly `Pending`. After review, the Developer and the Architect, who make the call together, replace it with `<name> (Developer) on YYYY-MM-DD; <name> (Architect) on YYYY-MM-DD` (see Approval Stages).
- `Custom Build Reason`: required when the selected option is a `Custom build`. Record why no Forge asset covers it, and what was searched.

#### `## Forge Asset Bindings`
Pre-approved reusable services, libraries, templates, and API contracts composed into the approach, as `- **forge/<asset-id>@<version>:** <how it is composed>`, for example `- **forge/gatelin@0.1.0-alpha.9:** Fronts the API for JWT sessions and RBAC`. The id and version come from the Forge catalog (see the `forge` skill, which checks bindings with `bindings-check.mjs`). Plan and Code read these bindings.
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
Updates to Persistent Context identified here and carried into the Plan, or `_None._`. Each is `- **Update:** \`path\` - what changes`. The Plan must cover each path with a step.

#### `## Ambiguities & Open Questions`
Unresolved questions that need human clarification, or `_None._`.

---

## 3. `plan.md` Contract

`plan.md` is authored strictly as the downstream result of a validated `think.md`. It reads the Forge bindings, constraints, and blast radius from Think. Unlike `think.md`, it **contains the code to implement**, step by step.

### Required Document Structure (In Exact Order)

1. `# Plan: <Feature or Task Name>`
2. `## File Scope & Boundaries`
3. `## Prerequisites & Context`
4. `## Acceptance Criteria`
5. `## Implementation Checklist`
6. `## Test Plan`
7. `## Open Questions & Assumptions`
8. `## Blast Radius Check`
9. `## Done When`
10. `## Approval` (always the last level-two heading)
### Section Requirements

#### `## File Scope & Boundaries`
- `In Scope`: every file agents may change, as explicit workspace-relative paths in backticks. Never vague phrases.
- `Out of Scope`: files or directories (trailing `/`) agents must not touch, or `_None._`.
- `Irreversible Changes`: `_None._`, or one or more `Step <N> reverses Step <M>` statements. A change a revert cannot undo, such as a data migration, gets its own reverse step. If an in-scope path looks like a migration (`migration`, `changelog`, `liquibase`, `.sql`, `db/`), `_None._` is rejected.

#### `## Prerequisites & Context`
- Mandatory reference to the source `think.md` (for example `- Reference: \`specs/issue-42/think.md\``).
- Dependencies, environment variables, or services needed before Step 1, or the literal `- None.` after the reference line. The section must hold at least one line besides the reference.

#### `## Acceptance Criteria`
3 to 8 observable, true-or-false statements, written so a test can check them without judgement:

```markdown
- **AC-1:** Given an unauthenticated request to POST /roles, then the response is 401 with an empty body.
- **AC-2:** Given a user with the role viewer, when sending POST /roles, then the response is 403.
```

IDs are sequential from `AC-1`. Each begins with `Given` and contains `then`.

#### `## Implementation Checklist`
Ordered, atomic, independently verifiable steps, each a level-3 heading `### Step <N>: <Short Action Name>` (sequential from 1). Every step has these six fields, in this order:

````markdown
### Step 1: <Name>
- **Files:** `<workspace-relative paths>`
- **Action:** <what the step does, in one line>
- **New Code:**
  ```js
  // the code to implement for this step
  ```
- **Verification:** <narrowest deterministic test, lint, or curl command>
- **Bootable Check:** <command proving the whole application still starts and works>
- **Serves:** AC-1, AC-2
````

- `Files`: explicit paths in backticks. Every file must lie within `In Scope` and none within `Out of Scope`.
- `Action`: one line.
- `New Code`: the code for this step, drafted by AI, in one or more fenced code blocks. Use the literal `_None._` when the step writes no code (for example documentation or configuration removal). Keep it small enough for the step to stay atomic; split the step rather than pasting a large file.
- `Verification`: a runnable, narrow command in backticks (for example one test file). A step is checked by a command, not by opinion.
- `Bootable Check`: a command in backticks asserting the whole application still starts (for example `docker compose up -d && curl -f http://localhost:3000/health`).
- `Serves`: the acceptance criteria this step helps satisfy.

A step is well formed when it does one thing, depends only on earlier steps, leaves the application bootable, and can be checked by a command.

Coverage rules enforced by the validator:
- Every `In Scope` file appears in at least one step, and no step touches a file outside `In Scope`.
- Every acceptance criterion is served by at least one step.

#### `## Test Plan`
A Markdown table with exactly these columns, one row per acceptance criterion at least:

```markdown
| Criterion | Test | Step |
|---|---|---|
| AC-1 | tests/routes/role.test.js: rejects unauthenticated requests | Step 3 |
```

`Step` is the step that creates the test, and that step must serve the criterion. Every criterion appears in the table.

#### `## Open Questions & Assumptions`
`_None._`, or bullets `- **Assumption:** ...` and `- **Question:** ... **Answer:** ...`. Every question is answered before Code starts. Use `--allow-open-questions` only while the Plan is still a draft.

#### `## Blast Radius Check`
Plan only checks that the tier set in Think still holds for the file scope:
- `Tier from Think`: must equal the tier in `think.md`.
- `Still Holds`: `Yes`, or `Raised to <tier>` (strictly higher). If the plan touches more than Think assumed, such as authentication, data, or a public contract, raise the tier.
- `Reason`: required when raised; otherwise `_None._`.
- `Rollback`: required when raised to `High` or `Critical`, naming the rollback mechanism. Raising to `Critical` also requires a decision record in `think.md` (checked when `think.md` is validated with the plan).

#### `## Done When`
Falsifiable completion criteria: every step complete, every verification passing, the application bootable and healthy, and no file outside `In Scope` modified. The Developer reviews and approves the plan (recorded in `## Approval`).

#### `## Approval`
- `Approved By`: the agent leaves exactly `Pending`. After review, the Developer replaces it with `<name> (Developer) on YYYY-MM-DD`. The Architect may be added as `; <name> (Architect) on YYYY-MM-DD`. Code starts only from an approved plan.

---

## 4. Approval Stages and Cross-File Checks

### Approval Stages (`--stage draft|approved`, default `draft`)

`validate-specs.mjs` applies `--stage` to both files; an unknown value is an error. The AI never approves.

| Stage | `think.md` `Approved By` | `plan.md` `Approved By` |
|---|---|---|
| `draft` | exactly `Pending` | exactly `Pending` |
| `approved` | `<name> (Developer) on YYYY-MM-DD; <name> (Architect) on YYYY-MM-DD` | `<name> (Developer) on YYYY-MM-DD`, optionally `; <name> (Architect) on YYYY-MM-DD` |

At `approved`: role strings are exact, dates are valid `YYYY-MM-DD`, two approvers are two different people, and names that are placeholders (`TBD`, `x`, `<name>`) or an AI or automation (Copilot, Claude, GPT, bot, agent, and so on) are rejected, with the same check as the signed decision record.

### Cross-File Checks (`--dir` or `--think` with `--plan`)

- `Tier from Think` equals the `think.md` tier.
- Every `Persistent Context Updates` path in `think.md` is covered by an implementation step.
- `plan.md` without `think.md` is invalid.
- A plan validated at `approved` requires `think.md` to be approved too (the Plan reads decisions made in Think), and no plan approval date is before the latest `think.md` approval date.

---

## 5. Anti-Patterns & Prohibitions

1. **No monolithic narrative PRDs.** Requirements are fields, not essays.
2. **No code in `think.md`.** Code lives in the Plan's `New Code` fields and is written for real in Code.
3. **No unbounded steps.** "Implement user management" is prohibited; split it.
4. **No combined Think-Plan phase.** Never author `plan.md` before `think.md` is validated.
5. **No scope deviation.** No step touches a file outside `In Scope`.
6. **No re-deriving Triage.** Reuse the Triage evidence and system mapping.
7. **No unrecorded custom build.** A custom implementation of something the Forge offers needs a recorded reason.
8. **No AI-signed decision records.** AI drafts. The Architect signs.
9. **No AI approval.** The agent leaves `Approved By: Pending` in both files; only named people approve.

---

## 6. Storage & Issue Attachment Convention

In autonomous CI/CD pipelines (for example triggered by the Product Owner's `decision:todo` label, or by `issues: [opened]` where Triage is not used):

- Commit to `specs/issue-<number>/` on branch `specs/issue-<number>`.
- **Non-destructive**: never overwrite the human issue body. Post an **Issue Comment** with `gh issue comment`.
- Wrap file contents in collapsible blocks:
  - `<details><summary>🧠 <b>think.md (Options, Blast Radius &amp; Constraints)</b></summary> ... </details>`
  - `<details open><summary>📝 <b>plan.md (Scope, Criteria &amp; Steps)</b></summary> ... </details>`
- Reference the branch and apply the label `specs:ready`. The Architect signs any drafted decision record, and the Developer approves the plan, before Code starts.
