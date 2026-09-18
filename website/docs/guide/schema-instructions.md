# Instruction Markdown Schema

An **Instruction** is an always-on standard that injects automatically into the AI assistant's context when open or edited files match a defined glob pattern.

Instruction files live under `instructions/*.instructions.md`.

## File Naming & Location

```text
instructions/
└── <kebab-case-name>.instructions.md
```

Examples:
- `instructions/sharp-agent.instructions.md`
- `instructions/node-express.instructions.md`
- `instructions/docker.instructions.md`
- `instructions/vitepress-docs.instructions.md`

---

## Frontmatter Schema

Every instruction file **must** begin with a YAML frontmatter block enclosed by triple dashes (`---`).

```yaml
---
description: string
applyTo: string
---
```

### Fields

| Field | Type | Required | Description | Constraints & Best Practices |
|---|---|---|---|---|
| `description` | `string` | **Yes** | What this instruction enforces and when it applies. | Clear, concise summary of the standard (e.g., conventions, structure, security). |
| `applyTo` | `string` | **Yes** | Glob pattern matching relevant files. | **Use the narrowest practical glob.** E.g., `src/**/*.js` or `db/**/*.sql`. Glob `"**"` is reserved strictly for universal rules (like `sharp-agent`). |

### Example Frontmatter

```yaml
---
description: "VitePress product documentation site: user-supplied docs root, Markdown guides, Mermaid, Traefik /docs in dev, GitHub Pages in prod. Use when scaffolding or editing a VitePress docs site."
applyTo: "**/.vitepress/**,**/docs/guide/**/*.md,**/docs/index.md,**/docs/public/**"
---
```

---

## Document Body Schema

Instructions must be **imperative, concise, and normative**.

```markdown
# <Standard Title>

When scaffolding or matching full files, follow the installed `<name>-examples` skill (read its `references/examples.md`).

## <Area 1: Structure & Naming>

- Rule 1
- Rule 2

## <Area 2: Security & Boundaries>

- Rule 1

## <Area 3: Architectural Checklist>

- Rule 1
```

### Core Authoring Principles

1. **Short & Imperative**: State clear rules, checklists, and prohibitions. Avoid conversational preamble.
2. **Template Offloading**: Never put multi-page scaffolding templates directly inside an instruction. Point to an installed companion skill in `skills/<name>-examples/` instead.
3. **No Task Scopes**: Do not define agent-specific execution steps (like "Step 1: Read files, Step 2: Output report"). Those belong in Agents and Skills.
4. **No Fluff**: Every sentence must express an enforceable engineering constraint.

---

## Annotated Reference Example

```markdown
---
description: "Avoid overengineering and reduce token use. Prefer surgical changes and clear problem-solving."
applyTo: "**"
---

# Sharp Agent

You are a pragmatic, surgical engineer. Optimize for clarity, simplicity, and low token use.

## Core Directives

- DO NOT overengineer. Solve the immediate problem directly.
- DO NOT add unrequested dependencies, abstractions, layers, or generic helpers.
- DO NOT rewrite or reformat untouched code.
- Prefer surgical edits over full-file replacements.
- Make changes verifiable: run the narrowest test command that exercises the change.
```
