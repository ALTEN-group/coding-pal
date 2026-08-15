# Contributing to Coding Pal

This guide defines where reusable Copilot guidance belongs and the standard for adding it to this collection.

## Choose the Right Primitive

Start with the behavior you need to add, not the file type you want to create.

| Primitive | Use it for | Loads when | Owns |
|---|---|---|---|
| Instruction | Stable standards that affect code or files matching a path | A matching file is in context | Rules, conventions, security, architecture, and coding standards |
| Agent | A named specialist that performs a bounded kind of work | Explicitly selected with `--agent` or by a user | Scope, method, constraints, and task completion |
| Skill | A reusable on-demand workflow with assets and tools | Its description matches the task | Procedures, contracts, templates, scripts, fixtures, and artifact validation |
| Prompt | A single focused command with parameters | Explicitly invoked | One repeatable request or operation |

Use the smallest primitive that owns the behavior without forcing unrelated work to load it.

## Decision Tree

1. Does the guidance apply to most code changes in a file family?
   - Create an **instruction**.
2. Does it define a named specialist with a distinct scope, method, or permissions?
   - Create an **agent**.
3. Does it provide a reusable workflow, a contract, scripts, fixtures, templates, or references used by several tasks or agents?
   - Create a **skill**.
4. Is it one focused operation with a small set of inputs?
   - Create a **prompt**.
5. If it does not fit one answer, split responsibilities. Do not make one file own everything.

## Ownership Rules

Every rule has one authoritative home. Other files link to or invoke it; they do not restate it.

### Instructions Own Standards

Put durable, file-oriented standards in `instructions/*.instructions.md`.

Examples:

- Node.js and Express security, error handling, and endpoint conventions.
- PostgreSQL and Liquibase migration standards.
- Docker image and Compose conventions.
- Angular admin UI conventions.

Instructions must contain YAML frontmatter with:

```yaml
---
description: "What this instruction enforces and when it applies."
applyTo: "src/**/*.js"
---
```

Use the narrowest practical `applyTo` glob. `"**"` is reserved for rules that genuinely apply to all work. Do not put task-specific output formats, release procedures, or agent-only steps in an instruction.

Keep instructions imperative and short (rules, constraints, checklists). Put long code samples and scaffolding templates in a paired skill under `skills/<name>-examples/` (`SKILL.md` + `references/`). The instruction points at that skill for on-demand reads; examples must not duplicate ownership of normative rules.

### Agents Own Task Scope and Method

Put named specialists in `agents/*.agent.md`.

An agent should answer:

- What work does this specialist perform?
- Which files, systems, or layers are in scope?
- Which tools or commands are forbidden or required?
- Which domain instructions define quality?
- What must be true before the task is complete?

Use this shape:

```markdown
---
name: Domain Specialist
description: "Use when ..."
---

You are a specialist at ...

## Constraints

- DO NOT ...

## Approach

1. ...

## Done When

- ...
```

Keep the agent clean. It owns how the task is conducted, not a reusable artifact protocol. For example, the Node/Express audit agent owns audit scope and review method; the `audit-reporting` skill owns the report contract and validator.

### Skills Own Reusable Workflows and Artifacts

Put a skill in `skills/<skill-name>/`. A skill is a directory, never a standalone file.

```text
skills/<skill-name>/
├── SKILL.md
├── references/     # Normative specifications or background material
├── scripts/        # Executable validation or automation
├── fixtures/       # Inputs and expected outputs for script tests
└── templates/      # Copy-and-customize scaffolds only when needed
```

`SKILL.md` requires this frontmatter:

```yaml
---
name: lowercase-hyphenated-name
description: 'What it does. Use when ... specific trigger terms ...'
license: MIT
---
```

The description is the discovery surface. State both capability and concrete trigger phrases. A vague description makes a good skill invisible.

Use a skill when a workflow needs one or more of the following:

- A normative contract shared by multiple agents or workflows.
- Scripts that validate, normalize, generate, or test artifacts.
- Fixtures that prove the scripts handle valid and invalid input.
- References that are too detailed for an agent body.
- Templates that consumers copy and customize.

Keep the skill portable. Avoid repository-specific paths and scopes unless they are command inputs. For example, `audit-reporting` accepts `--scope` arguments instead of hard-coding a service layout.

### Prompts Own Single Operations

Put user-invocable focused commands in `.github/prompts/*.prompt.md` when a project needs them. Prompts are appropriate for requests such as “generate a release note for this PR” or “draft a migration checklist for this change.”

Use a prompt when the operation is short and parameterized. Promote it to a skill when it gains a multi-step process, scripts, templates, fixtures, or substantial reference material.

## Contracts, Examples, and Templates

Use the following distinction consistently:

| Resource | Purpose | Rule |
|---|---|---|
| Contract in `references/` | Normative requirements | It is the human-readable source of truth |
| Script in `scripts/` | Deterministic enforcement | It rejects or canonicalizes invalid artifacts |
| Fixture in `fixtures/` | Test input or expected result | It proves script behavior |
| Template in `templates/` | A starter file a consumer modifies | Add only when consumers copy it |
| Example in a contract | Illustrates a rule | Keep it short and non-normative unless stated otherwise |

Do not create both a complete contract and a near-identical template. That produces drift. If an artifact is generated or canonicalized by a script, prefer one contract plus fixtures over a copyable template.

## The Golden Split

When an agent uses a skill, divide responsibility this way:

| Concern | Owner |
|---|---|
| Files and systems to examine | Agent |
| Domain-specific review or implementation method | Agent and applicable instructions |
| Universal coding standards | Instruction |
| Reusable output contract | Skill |
| Report parsing, validation, normalization | Skill script |
| Task coverage completion | Agent `Done When` |
| Artifact validity completion | Skill `Done When` |
| CI retries, artifacts, publication, and fallbacks | Consuming workflow |

An agent may say “follow the installed `audit-reporting` skill.” It must not duplicate report headings, field definitions, finding IDs, or validator rules. A workflow must execute the validator; model compliance alone is not enforcement.

## Quality Standard

Before submitting a contribution:

1. State the target user task in one sentence.
2. Apply the decision tree and explain why the selected primitive owns the behavior.
3. Use an explicit, specific description in frontmatter.
4. Keep rules concise, imperative, and testable.
5. Remove duplicated ownership from adjacent agents, skills, prompts, and instructions.
6. Add a deterministic script and tests when output must be machine-consumable.
7. Test new scripts with their narrowest test command.
8. Verify YAML frontmatter and Markdown links.
9. Install the package in a clean consumer project with APM when changing distributable files.
10. Update the consumer only after the shared package is published and its lockfile can resolve the new commit.

## APM Distribution

Install individual agents or instructions by path. Install a named skill from the package bundle:

```bash
apm install ALTEN-group/coding-pal --skill audit-reporting --target copilot
```

Run `apm update` after a shared package release, then commit the regenerated lockfile. Do not hand-edit generated APM hashes or lock entries.

## Review Checklist

- [ ] Correct primitive selected by the decision tree.
- [ ] One authoritative owner for each rule.
- [ ] Description includes what and when.
- [ ] Instructions use a narrow `applyTo` pattern.
- [ ] Agents state scope, constraints, approach, and task completion.
- [ ] Skills include portable workflow guidance and only needed resources.
- [ ] Contracts and templates do not duplicate each other.
- [ ] Machine-consumed artifacts have deterministic validation.
- [ ] Tests cover valid input, invalid input, and deterministic output.
- [ ] APM installation and lockfile behavior have been verified.
