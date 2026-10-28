# Plan Specification Contract (`plan.md`)

In agentic software development, narrative specifications and unbounded task lists fail AI coding agents: they bloat the context window, leave sequencing undefined, and cause errors to compound across steps. This contract follows the Agentic Software Factory's [Plan](https://alten-group.github.io/agentic-software-factory/guide/stage-plan) stage.

- `plan.md` is the **Plan record**: the file scope, acceptance criteria, an ordered implementation checklist (with the code to implement), a test plan, and a blast radius check. It is derived strictly from a validated `think.md`.

This contract defines the authoritative structure, headings, fields, cross-checks, and validation rules for `plan.md`. `scripts/validate-plan.mjs` enforces it.

---

## 1. Specifications Directory & Naming

- Default: `specs/` (or `docs/specs/`).
- Scoped features: `specs/<feature-name>/plan.md` (alongside `think.md`).
- Issue-driven work: `specs/issue-<number>/plan.md` (alongside `think.md` and `triage.md`).
- File name is exactly `plan.md` (lowercase ASCII). UTF-8 without BOM.

Fields are written as bullets: `- **<Label>:** <value>`. Continuation lines (sub-bullets, tables, code blocks) belong to the preceding field. Fenced code blocks are opaque: headings and fields inside them are ignored. Where a section may be empty, write the exact literal `_None._`.

---

## 2. `plan.md` Contract

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

## 3. Approval Stages and Cross-File Checks

### Approval Stages (`--stage draft|approved`, default `draft`)

`validate-plan.mjs` applies `--stage` to `plan.md` (and to `think.md` when cross-checking); an unknown value is an error. The AI never approves.

| Stage | `plan.md` `Approved By` |
|---|---|
| `draft` | exactly `Pending` |
| `approved` | `<name> (Developer) on YYYY-MM-DD`, optionally `; <name> (Architect) on YYYY-MM-DD` |

At `approved`: role strings are exact, dates are valid `YYYY-MM-DD`, two approvers are two different people, and names that are placeholders (`TBD`, `x`, `<name>`) or an AI or automation (Copilot, Claude, GPT, bot, agent, and so on) are rejected.

### Cross-File Checks (`--dir` or `--plan` with `--think`)

When `--dir <specs-dir>` or `--think <path/to/think.md>` is provided, `validate-plan.mjs` also validates `think.md` and enforces:
- `Tier from Think` equals the `think.md` tier.
- Every `Persistent Context Updates` path in `think.md` is covered by an implementation step.
- `plan.md` without `think.md` in `--dir` is invalid.
- A plan validated at `approved` requires `think.md` to be approved too (`<name> (Developer) on YYYY-MM-DD; <name> (Architect) on YYYY-MM-DD`), and no plan approval date is before the latest `think.md` approval date.

---

## 4. Anti-Patterns & Prohibitions

1. **No monolithic narrative PRDs.** Requirements are fields, not essays.
2. **No unbounded steps.** "Implement user management" is prohibited; split it.
3. **No authoring `plan.md` before `think.md` is validated.**
4. **No scope deviation.** No step touches a file outside `In Scope`.
5. **No opinion-based verification.** Every step's `Verification` and `Bootable Check` must be runnable commands in backticks.
6. **No AI approval.** The agent leaves `Approved By: Pending`; only named people approve.

---

## 5. Storage & Issue Attachment Convention

In autonomous CI/CD pipelines:

- **Non-destructive Issue Comment**: never overwrite the human issue body. Post an **Issue Comment** with `gh issue comment` containing the validated `plan.md`, optionally wrapped in a collapsible `<details>` block:
  - `<details open><summary>📝 <b>plan.md (Scope, Criteria &amp; Steps)</b></summary> ... </details>`
- **Branch Storage (when enabled)**: commit to `specs/issue-<number>/plan.md` on branch `specs/issue-<number>`, reference the branch in the comment, and apply the label `specs:ready`. The Developer approves the plan before Code starts.
