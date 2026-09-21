# Authoring & Contribution Guide

This guide defines the engineering standard for creating, testing, and contributing new persistent context primitives to Coding Pal.

## Authoring Workflow

Follow this five-step sequence before submitting a contribution:

```mermaid
---
caption: Contribution Lifecycle
---
flowchart TD
    S1["<b>1. State User Task</b><br/>(Define immediate problem in one sentence)"]
    S2["<b>2. Apply Decision Tree</b><br/>(Select Instruction, Agent, Skill, or Prompt)"]
    S3["<b>3. Enforce Single Ownership</b><br/>(Ensure no duplicate rules in adjacent files)"]
    S4["<b>4. Author Schema & Code</b><br/>(Strict YAML frontmatter & markdown sections)"]
    S5["<b>5. Automated Verification</b><br/>(Run script tests, lints, and APM dry run)"]

    S1 --> S2 --> S3 --> S4 --> S5

    classDef step1 fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef step2 fill:#312e81,stroke:#6366f1,stroke-width:2px,color:#eef2ff;
    classDef step3 fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#faf5ff;
    classDef step4 fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;
    classDef step5 fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;

    class S1 step1;
    class S2 step2;
    class S3 step3;
    class S4 step4;
    class S5 step5;
```

### Step 1: State the User Task
Define the exact engineering task in one sentence (e.g., *"Scaffold a VitePress documentation website in a user-named folder"* or *"Remediate a single security finding from an audit report"*).

### Step 2: Apply the Decision Tree
Consult the authoritative [Persistent Context Decision Tree](./persistent-context.md#the-decision-tree) to select the correct primitive (**Instruction**, **Agent**, **Skill**, or **Prompt**) based on desired runtime activation and operational scope.

### Step 3: Enforce Single Ownership
Verify against existing primitives in `instructions/`, `agents/`, `skills/`, and `prompts/`. Adhere strictly to [Single Authoritative Ownership](./persistent-context.md#ownership-rules):
- Never duplicate conventions, report headings, or schemas across multiple files.
- Instructions own standards, agents own task scope, skills own contracts and validators, and prompts own user entry points.

### Step 4: Follow Precise Schemas
Adhere to the exact Markdown and frontmatter schemas:
- [Agent Schema](./schema-agents.md)
- [Prompt Schema](./schema-prompts.md)
- [Instruction Schema](./schema-instructions.md)
- [Skill Schema](./schema-skills.md)

### Step 5: Test Deterministically
When a skill produces machine-consumable artifacts (such as audit reports or OpenAPI specs):
- Implement an automated validator script in `scripts/`.
- Add positive and negative fixtures in `fixtures/`.
- Ensure tests verify edge cases: missing headings, malformed IDs, unexpected statuses.

---

## Review Checklist

Before opening a pull request, verify that every item on this checklist passes:

- [ ] **Correct Primitive Selected**: Choice matches the decision tree criteria.
- [ ] **Single Authoritative Owner**: No duplicated rules between instructions, agents, skills, or prompts.
- [ ] **Explicit Semantic Description**: Frontmatter `description` states both *what* it does and *when* to invoke it.
- [ ] **Narrowest `applyTo` Glob**: Instructions avoid `"**"` unless universally applicable.
- [ ] **Bounded Agent Method**: Agent specifies strict constraints, sequential approach, and falsifiable `Done When`.
- [ ] **Portable Skills**: Skills accept parameters (e.g. `--scope`) rather than hard-coding repo-specific paths.
- [ ] **No Leaky Contracts**: Agents say *"Follow the installed skill"* rather than copying output headings.
- [ ] **Machine Validation**: Deterministic validator scripts exist for structured output formats.
- [ ] **APM Installation Verified**: Clean test installation passes via `apm install`.
- [ ] **Docs Site Builds Cleanly**: `npm run build` in `website/` succeeds if documentation or catalog primitives were modified.

