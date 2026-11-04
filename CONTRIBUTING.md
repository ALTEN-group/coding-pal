# Contributing to Coding Pal

This guide defines where reusable Copilot guidance belongs and the standard for adding it to this collection.

## Choose the Right Primitive

Start with the behavior you need to add, not the file type you want to create.

| Primitive | Use it for | Load | Loads when | Owns |
|---|---|---|---|---|
| Instruction | Stable standards that affect code or files matching a path | Always-on | A matching file is in context (`applyTo`) | Rules, conventions, security, architecture, and coding standards |
| Agent | A named specialist that performs a bounded kind of work | On-demand | Explicitly selected with `--agent` or by a user | Scope, method, constraints, and task completion |
| Skill | A reusable on-demand workflow with assets and tools | On-demand | Its description matches the task, or a user/agent opens it | Procedures, contracts, templates, scripts, fixtures, and artifact validation |
| Prompt | A single focused command with parameters | On-demand | Explicitly invoked | One repeatable request or operation |

Use the smallest primitive that owns the behavior without forcing unrelated work to load it.

## Decision Tree

1. **When should it load?**
   - **Always-on** (applies across a file glob or background rule): create an **instruction** (`instructions/*.instructions.md`). If it also needs code scaffolds or multi-line examples, offload them to a paired **skill** (`skills/<name>-examples/`).
   - **On-demand** (invoked per task): branch by **what it owns** below.
2. **What does it own (on-demand)?**
   - **User slash command** (`/name` + input resolution): create a **prompt** (`prompts/*.prompt.md`) that delegates to an **agent**.
   - **Specialist persona** (bounded scope, constraints, method, and `Done When`): create an **agent** (`agents/*.agent.md`). If it emits a structured artifact or needs machine validation, pair it with a **skill**.
   - **Reusable workflow or check** (contract, validator script, fixtures, or templates): create a **skill** (`skills/<name>/SKILL.md`).
3. If a capability spans multiple branches, split responsibilities across paired primitives. Do not make one file own everything.

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

Keep the agent clean. It owns how the task is conducted, not a reusable artifact protocol. For example, the Code Auditor owns audit scope and review method; the `audit-reporting` skill owns the report contract and validator. The Spec from Code agent owns extraction scope and method; the `spec-from-code` skill owns the spec-file contract and validator.

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

Keep the skill portable. Avoid repository-specific paths and scopes unless they are command inputs. For example, `audit-reporting` accepts `--scope` arguments instead of hard-coding a service layout. A skill that owns a record contract (for example `triage`, `think`, `plan`, `decision-record`) may state the record's conventional location in its contract, such as `specs/issue-<n>/triage.md` or `docs/decisions/`, but every script must take that location as an argument and never default to it.

### Prompts Own Single Operations

Put user-invocable focused commands in `prompts/*.prompt.md`. APM deploys them to the harness path (e.g. `.github/prompts/` for Copilot). Prompts are appropriate for requests such as “generate a release note for this PR” or “draft a migration checklist for this change.”

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
| Task coverage completion | Agent (`Done When`) |
| Reusable output contract | Skill — Contract (`references/`) |
| Artifact validity completion | Skill — Contract (`Done When`) |
| Blast-radius, secret & dependency boundaries | Skill — Guard (`skills/prove/scripts/`) |
| Report parsing, validation, normalization | Skill — Gate (`scripts/`) |
| Falsifiable execution certification & probes | Skill — Gate & Probe (narrow test command + `task-gate.mjs` / `test-probe.mjs` / validators) |
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
7. Test new scripts with their narrowest test command (`node --test skills/<name>/scripts/*.test.mjs`). CI runs all of them with `node --test skills/*/scripts/*.test.mjs` and lints Persistent Context with `context-lint.mjs`.
8. Verify YAML frontmatter and Markdown links.
9. Install the package in a clean consumer project with APM when changing distributable files.
10. Update the consumer only after the shared package is published and its lockfile can resolve the new commit.

## Running Tests

Coding Pal uses Node.js's native test runner (`node:test` and `node:assert/strict`) so tests run with zero external dependencies.

A helper script `./scripts/test.sh` is provided at the repository root.

### 1. Run the Entire Test Suite

Run all skill tests across the entire repository with a formatted summary:

```bash
./scripts/test.sh
# or natively:
node --test --test-reporter=spec skills/*/scripts/*.test.mjs
```

### 2. Run a Targeted Skill Test Suite

Run tests for a single skill during local development:

```bash
./scripts/test.sh <skill-name>
# example: ./scripts/test.sh think
# or natively:
node --test skills/<name>/scripts/*.test.mjs
```

### 3. Lint Persistent Context Standards

Verify instruction length, frontmatter fields, and detect over-broad patterns or drift:

```bash
./scripts/test.sh --lint
# or natively:
node skills/context-health/scripts/context-lint.mjs --root .
```

## APM Distribution

Install individual agents or instructions by path. Install a named skill from the package bundle:

```bash
apm install ALTEN-group/coding-pal --skill audit-reporting --target copilot
```

Run `apm update` after a shared package release, then commit the regenerated lockfile. Do not hand-edit generated APM hashes or lock entries.

## Documentation Website (Local Development)

Coding Pal includes a VitePress documentation website under `website/` describing the persistent context catalog, markdown file schemas, and distribution model.

### 1. Using Development Scripts (Recommended)

Start the documentation website in development mode:

```bash
./scripts/start-dev.sh
```

This builds and runs the containerized VitePress server with live hot-reload at:
**`http://localhost:5174/docs/`**

To view logs:

```bash
docker compose -p coding-pal -f docker/docker-compose.yml logs -f
```

To stop the development environment:

```bash
./scripts/stop-dev.sh
```

To stop and remove built Docker images:

```bash
./scripts/stop-dev.sh --rmi
```

### 2. Using Node.js directly

From the repository root:

```bash
# Navigate to website folder and install dependencies
cd website
npm install

# Start local development server with hot-reload
npm run dev
```

The site will start at `http://localhost:5174/docs/`.

To test the production build locally:

```bash
# Build static site
npm run build

# Preview production build
npm run preview
```

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
- [ ] Every new agent, prompt, instruction, and skill is listed in its catalog, in the Full Canonical Configuration Reference of `apm-distribution.md`, and (for a domain guide) in the `.vitepress/config.mjs` sidebar.
- [ ] Documentation site builds cleanly (`npm run build` in `website/`) if docs or catalog entries were modified.

