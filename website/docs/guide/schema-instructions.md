# Instruction Markdown Schema

An **Instruction** is an always-on, normative standard injected into the AI's context when opened or edited files match its `applyTo` glob. It owns **rules**. Task steps belong to agents, output contracts and validators to skills, entry points to prompts.

Files live in `instructions/<name>.instructions.md`.

| Family | Instructions | `applyTo` targets |
|---|---|---|
| **Stack patterns** | `node-express`, `postgres-liquibase`, `angular-admin`, `docker` | Stack source or config (`src/**/*.js`, `db/**/*.sql,...`) |
| **Test conventions** | `node-unit-tests`, `node-api-tests`, `angular-unit-tests`, `angular-e2e-tests`, `postgres-liquibase-tests` | Test paths (`tests/routes/**/*.js,...`, `tests/db/**/*.sql`) |
| **Artifact & stage standards** | `triage`, `think`, `plan`, `code`, `prove`, `release`, `learn`, `decision-record`, `meeting-pack`, `migration-docs` | The artifact (`**/think.md`, `**/docs/decisions/**`) |
| **Universal** | `sharp-agent` | `**` |

---

## Frontmatter

| Field | Required | Rules |
|---|---|---|
| `description` | **Yes** | Double-quoted. Missing is a lint **error**. Artifact standards read `Normative standards for <artifact> (<file>). Applies when authoring, reviewing, or consuming ...`. |
| `applyTo` | **Yes** | Narrowest practical glob, one quoted string. Multiple globs are comma-separated; braces are allowed (`"tests/**/*.{js,mjs,ts}"`). `"**"` is reserved for `sharp-agent`. |

`skills/context-health/scripts/context-lint.mjs` runs in CI. Errors: `missing-description`, `dangling-reference` (names a skill, agent, or prompt that doesn't exist), `secret`. Warnings: more than 120 lines, near-duplicates, older than 180 days, instruction count growing over 20%.

---

## Body

Start with an `# H1` (except `sharp-agent`) and an **ownership statement**: what the file owns and what it delegates. Stay imperative and under 120 lines.

| Family | Template |
|---|---|
| **Artifact & stage** | `When authoring or validating <artifact>, follow the installed <skill> skill (read its references/<x>-contract.md).` Then `## Roles` (most), normative sections, optional `## Scope`. |
| **Stack pattern** | `Target: <path>.` Pointer to the `<stack>-examples` skill. Topical rule sections, ending in a checklist where useful. |
| **Test conventions** | Ownership paragraph naming the sibling instructions. Then `Path convention`, `What to assert` (include the `AC-<n>` id in test names), `Execution`, `Isolation`. |
| **Universal** | Tradeoff note, an output-contract override, then numbered principles. |

---

## Anti-Patterns

> [!WARNING]
> 1. **Embedded templates**: point to the `*-examples` skill instead.
> 2. **Copied contracts**: never repeat a record's headings or fields; point to the skill's contract.
> 3. **Task steps**: "Step 1: read, Step 2: report" belongs in an agent.
> 4. **Overlap**: delegate adjacent topics to the sibling instruction by name.

---

## Example

```markdown
---
description: "Normative standards for the Think record (think.md) derived from backlog issues. Applies when authoring, reviewing, or exploring options in think.md."
applyTo: "**/think.md"
---

# Specification Standards: Think

When authoring or validating the Think record, follow the installed `think` skill (read its `references/think-contract.md`).

## Phase Separation

- **Strict sequence**: Never create `plan.md` without a validated `think.md`.
- **Where code lives**: `think.md` and `plan.md` contain **no source code**.

## `think.md` Standards

- **Options, not conclusions**: Record 2 to 4 credible options with trade-offs, cost, and risk, then the chosen approach.
- **Blast radius is set here, once**: Name the rollback mechanism for High and Critical.
```
