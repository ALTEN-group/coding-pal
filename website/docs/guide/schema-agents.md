# Agent Markdown Schema

An **Agent** is an on-demand specialist persona, invoked by the user (usually through a [Prompt](./schema-prompts.md)) or by a workflow. It owns *how a task is conducted*: scope, constraints, method, and falsifiable completion. Conventions belong to [Instructions](./schema-instructions.md) and artifact contracts to [Skills](./schema-skills.md); the agent only points to them.

Files live in `agents/<slug>.agent.md`. The slug is not always the `name` (`gate-fix.agent.md` → `Gate Fixer`).

| Family | Agents |
|---|---|
| **Test & build specialists** | `Unit Tester`, `API Tester`, `E2E Tester`, `Fuzz Tester`, `Performance Tester`, `VitePress Docs`, `Demo Videos`, `Spec from Code`, `Migration Documenter` |
| **Codebase audit specialists** | `dead-code`, `test-gap`, `docs-sync`, `dependency-leverage` |
| **Factory stage agents** | `Meeting Analyst`, `Triage Analyst`, `Thinker`, `Decision Scribe`, `Planner`, `Code Agent`, `Prove Validator`, `Gate Fixer`, `Release Planner`, `Learn Analyst` |

Stage agents use the same schema but embed exact validator commands in `Approach` and anchor `Done When` on validator exit codes.

---

## Frontmatter

| Field | Required | Rules |
|---|---|---|
| `name` | **Yes** | Capitalized role noun phrase. **Unique**: a prompt's `agent:` must match it exactly. |
| `description` | **Yes** | Double-quoted. Most start with *"Use when..."*; stage agents may open with an imperative outcome. State boundaries and handoffs (*"not for changing production code"*). |

No other keys. Tools and skills are not declared in frontmatter; boundaries go in `## Constraints`.

---

## Body

No H1. Fixed section order:

```markdown
You are a specialist at <responsibility>.

## Constraints
- <Boundary>
- DO NOT <prohibition>

## Scope            <!-- optional -->
- Default scope: <what the user named in the request>
- If the user names none, ask for <a root path or glob>. Do not guess.

## Approach
1. <Resolve target> 2. <Inspect> 3. <List the contract> 4. <Execute> 5. <Verify>

## Done When
- <Falsifiable criterion>
```

| Section | Content |
|---|---|
| Persona | One sentence. Stage agents may add a context paragraph or open in the first person (`You choose and record ...`). |
| `## Constraints` | Hard limits, with prohibitions as `DO NOT`. Typical: one-module or one-finding scope, write permissions (*"Edit test files only"*), no new frameworks, *"Follow the installed `think` skill"* instead of restating its contract, never forge approval (`Automated by <Agent> on YYYY-MM-DD`). |
| `## Scope` | Only on `Spec from Code`, `Fuzz Tester`, `Performance Tester`, `VitePress Docs`. |
| `## Approach` | Numbered. Specialists: resolve, inspect, list the contract, execute, verify with the **narrowest** command. Stage agents: bold-labelled steps with commands such as `node .agents/skills/think/scripts/validate-think.mjs --think <path>`. |
| `## Done When` | Checkable from tool output: *"`think.md` passes validation with exit code 0"*, *"Zero production files were modified"*. |
| `## Output Format` | Only on structured audit agents (`dead-code`, `test-gap`, `docs-sync`, `dependency-leverage`) that emit `audit-findings.json` and `audit-report.md` for automated runners. |

---

## Anti-Patterns

> [!WARNING]
> 1. **Owning report formats**: reference an installed skill instead (except structured audit agents emitting `audit-findings.json`).
> 2. **Unbounded edits**: audit agents are strictly read-only; modification agents must bound their file scope.
> 3. **Unfalsifiable Done When**: *"The code looks good"* is not a criterion.
> 4. **Restating conventions**: point to the installed instruction.
> 5. **Forged approval**: stage agents record automation, never a human signature.

> [!NOTE]
> `agents/app-state-analyst.md` does not follow this schema (no `.agent.md` suffix, extra `tools` and `autoload-skills` keys, `skill://` references, product-specific). Do not copy it.

---

## Example

```markdown
---
name: Spec from Code
description: "Use when you need to generate specifications from existing code. Covers every file, class, function, and endpoint — nothing is left undocumented."
---

You are a specialist at extracting specifications from source code.

## Constraints

- DO NOT guess or assume behavior — only document what the code explicitly does.
- DO NOT modify any code.

## Scope

- Default scope: paths or modules named in the user request.
- If the user names none, ask for a root path or glob before writing files.

## Approach

1. Read every relevant file in scope before writing anything.
2. Describe **what** each component does and **how**, from the code only.
3. Follow the installed `spec-from-code` skill to structure and validate the Markdown files.

## Done When

- Every component in scope has a specification entry.
- A validated `spec-from-code` directory has been produced.
```
