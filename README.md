# Coding Pal

> Version-controlled persistent context primitives (instructions, skills, agents, prompts) to standardize and improve AI coding assistants across engineering teams.

Documentation website: **[https://alten-group.github.io/coding-pal/](https://alten-group.github.io/coding-pal/)**


Coding Pal codifies organizational engineering standards, specialist personas, procedural workflows, and interactive slash commands into machine-readable Markdown files. It eliminates hallucinated conventions, prompt drift, token waste, and unbounded agent behaviors across **GitHub Copilot**, **Claude Code**, and **Cursor**.

Persistent context is organized into four core primitives:

| Primitive | Purpose | Catalog Reference |
|---|---|---|
| 📋 **Instructions** | Normative engineering standards applied when matching files open (`applyTo` glob). | [Browse Instructions](https://alten-group.github.io/coding-pal/guide/catalog-instructions.html) |
| 🤖 **Agents** | Named specialists with strict boundaries and falsifiable completion criteria. | [Browse Agents](https://alten-group.github.io/coding-pal/guide/catalog-agents.html) |
| ⚡ **Skills** | Procedural bundles with contracts, automated CI validators, and scaffolding templates. | [Browse Skills](https://alten-group.github.io/coding-pal/guide/catalog-skills.html) |
| 💬 **Prompts** | Interactive slash commands parameterized from active IDE selections and files. | [Browse Prompts](https://alten-group.github.io/coding-pal/guide/catalog-prompts.html) |

---

## Quickstart with APM

Coding Pal packages and distributes primitives to multiple AI coding environments using [Agent Package Manager (APM)](https://microsoft.github.io/apm/).

### 1. Declare Dependencies in `apm.yml`

Create an `apm.yml` in your consumer project root and select the primitives you need:

```yaml
# apm.yml — consumer project configuration
name: my-service
version: 1.0.0
targets:
  - copilot   # and/or: claude, cursor
dependencies:
  apm:
    # Virtual Path Dependencies (Agents, Prompts, Instructions)
    - ALTEN-group/coding-pal/instructions/sharp-agent.instructions.md
    - ALTEN-group/coding-pal/instructions/node-express.instructions.md
    - ALTEN-group/coding-pal/agents/unit-test.agent.md
    - ALTEN-group/coding-pal/prompts/node-unit-tests.prompt.md

    # Companion Skill Bundles (Templates & Validators)
    - git: ALTEN-group/coding-pal
      skills:
        - node-express-examples
```

> 👉 For the complete reference manifest listing every available agent, prompt, instruction, and skill, see the **[Full APM Configuration Reference](https://alten-group.github.io/coding-pal/guide/apm-distribution.html#full-canonical-configuration-reference)** on the documentation website.

### 2. Install for Your Target Harness

```bash
# GitHub Copilot
apm install --target copilot

# Claude Code or Cursor
apm install --target claude
apm install --target cursor

# Multi-harness deployment
apm install --target copilot,claude,cursor
```

APM compiles and translates each primitive into the target harness's native configuration format:
- **Copilot**: `.github/instructions/`, `.github/agents/`, `.github/prompts/`, `.agents/skills/`
- **Claude Code**: `.claude/rules/`, `.claude/agents/`, `.claude/commands/`, `.claude/skills/`
- **Cursor**: `.cursor/rules/*.mdc`, `.cursor/agents/`, `.cursor/commands/`, `.agents/skills/`

---

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for:
- Golden standards for choosing between instructions, agents, skills, and prompts.
- Authoring checklists and validation scripts.
- Local VitePress documentation server quickstart (`./scripts/start-dev.sh`).
