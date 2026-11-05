# Prompt Markdown Schema

A **Prompt** is a user-invocable slash command (`/command`). It is the entry point: it resolves the target from arguments, selection, or open file, then hands it to one [Agent](./schema-agents.md). It owns **input resolution only**; conventions, contracts, and method stay elsewhere.

Files live in `prompts/<name>.prompt.md`, and the slug equals the frontmatter `name`.

| Family | Examples |
|---|---|
| **Stack test prompts** | `node-unit-tests`, `node-api-tests`, `angular-unit-tests`, `angular-e2e-tests`, `postgres-liquibase-tests` |
| **Stage commands** | `triage`, `think`, `plan`, `code`, `prove`, `release-plan` |
| **Meeting & Learn ceremonies** | `meet`, `meet-readback`, `triage-review`, `outcome-review`, `context-review`, `operating-retro`, `pre-read`, `incident` |
| **Utilities** | `decision`, `fix-gates`, `migration-docs`, `fuzz-tests`, `performance-tests`, `demo-videos`, `vitepress-docs` |

Several prompts can share an agent (five use `Learn Analyst`); the prompt names the mode in `## Run`.

---

## Frontmatter

| Field | Required | Rules |
|---|---|---|
| `name` | **Yes** | Kebab-case, equal to the file slug. Becomes `/name`. |
| `description` | **Yes** | Double-quoted. What it produces, plus *"Use when the user wants ..."* for stack and docs prompts. |
| `agent` | **Yes** | Exact `name` of an existing agent. The harness treats it as optional, but every Coding Pal prompt sets it. |
| `argument-hint` | **Yes** | `"<what>, e.g. <example>"`. Prefix optional arguments with `optional`. Mode selectors list choices. |

---

## Body

No H1. Three parts:

```markdown
Slash command for the **<Agent>** agent[ on <scope>].

## Resolve The Target

<Precedence for finding the target.>
If the target is still unclear, ask. Do not guess.

## Run

Hand the resolved <target> to <Agent>[ in <mode> mode].
<Which skill or instruction owns the details. How to verify.>
```

- **Resolve** has two shapes. Stack prompts use an ordered list: a path in the message, then the selection, then the open file. Stage and ceremony prompts use prose: first argument (`42`, `#42`, `specs/issue-42`), then the active editor file *only if it is of the right kind*. Both end with the **ask, don't guess** guard. It may also hold input collection (`meet` asks for consent and a speaker roster), redirects (`node-unit-tests` → `/node-api-tests` for routes), and path mapping (`src/<path>/<file>.js` → `tests/<path>/<file>.test.js`).
- **Run** hands off, names the mode, points to the owning skill or instruction (*"do not restate or override them"*), and names the verification (the narrowest command, or the skill's validator). Read-only prompts such as `pre-read` may list the skill commands they run.

---

## Anti-Patterns

> [!WARNING]
> 1. **Restating ownership**: do not copy conventions or runner flags; point to the instruction or skill.
> 2. **Guessing the target**: ask instead of scanning the repository.
> 3. **Unknown agent**: `agent` must match an existing `name` exactly.
> 4. **Duplicate agents**: if prompts differ only by mode, keep one agent.

---

## Example

```markdown
---
name: node-unit-tests
description: "Generate or update a Jest unit test file for a Node.js module (services, utils, controllers, middlewares). Use when the user wants isolated unit tests for an open file, a selection, or a src/ path."
agent: Unit Tester
argument-hint: "optional src path, e.g. src/services/user.service.js"
---

Slash command for the **Unit Tester** agent on one Node.js `src/` module.

## Resolve the target

Use the first that is a source module:

1. A `src/**/*.js` path in this message
2. The current selection
3. The currently open file

If none of those is source under `src/`, ask which file to test. Do not guess.

If the source is under `src/routes/`, use `/node-api-tests` instead.

Map `src/<path>/<file>.js` → `tests/<path>/<file>.test.js` (create missing directories). Path layout, runner, and execution are owned by the installed Node.js unit-test instructions — do not restate or override them.

## Run

Hand the resolved source and mapped test path to Unit Tester. Verify with the **narrowest** project test command.
```
