# Persistent Context Architecture

Persistent Context represents the collection of rules, schemas, specialized personas, and procedural workflows that remain available to an AI coding assistant across development cycles.

Instead of relying on volatile chat memory or giant prompt dumps, Coding Pal organizes persistent context into four distinct primitives, loaded dynamically according to context and user action.

## Context Lifecycle: Always-On vs On-Demand

```mermaid
---
caption: Persistent Context Loading Mechanism
---
flowchart TD
    subgraph Trigger ["Session Event"]
        E1["File Opened / Context Focused"]
        E2["User Types Slash Command (/...)"]
        E3["User Invokes Agent (--agent)"]
        E4["Task Matches Skill Description"]
    end

    subgraph Catalog ["Coding Pal Primitives"]
        I["<b>Instructions</b> (*.instructions.md)<br/>Always-On via applyTo glob"]
        P["<b>Prompts</b> (*.prompt.md)<br/>On-Demand Slash Command"]
        A["<b>Agents</b> (*.agent.md)<br/>On-Demand Named Specialist"]
        S["<b>Skills</b> (skills/&lt;name&gt;/SKILL.md)<br/>On-Demand Procedural Workflow"]
    end

    subgraph Execution ["AI Coding Context"]
        CTX["<b>LLM Context Window</b><br/>(Surgical, Bounded & Evidence-Based)"]
    end

    E1 -->|Glob Match| I --> CTX
    E2 -->|Slash Command| P --> CTX
    E3 -->|Explicit Select| A --> CTX
    E4 -->|Dynamic Trigger| S --> CTX
    P -.->|Resolves & Invokes| A
    A -.->|Consults Contract| S
    A -.->|Subject to Rules| I

    classDef instruction fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;
    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef skill fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#faf5ff;
    classDef prompt fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef execution fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
    classDef event fill:#1e293b,stroke:#64748b,stroke-width:1.5px,color:#f8fafc;

    class I instruction;
    class P prompt;
    class A agent;
    class S skill;
    class CTX execution;
    class E1,E2,E3,E4 event;
```

| Primitive | Loading Model | Trigger Condition | Primary Purpose |
|---|---|---|---|
| **Instruction** | **Always-on** | Active file matches `applyTo` glob pattern | Stable rules, conventions, security guidelines, and architectural standards |
| **Agent** | **On-demand** | Explicitly selected (e.g. `--agent <name>`) | Scoped specialist with bounded method, strict constraints, and completion criteria |
| **Skill** | **On-demand** | Semantic task match or explicitly loaded by agent/user | Multi-file procedures, contracts, executable validation scripts, and templates |
| **Prompt** | **On-demand** | Explicitly invoked via slash command (`/<name>`) | Parameterized entry point mapping user intent to agents and instructions |

## The Decision Tree

When adding persistent guidance, start from the desired operational behavior rather than file format:

```mermaid
---
caption: Context Primitive Decision Tree
---
flowchart TD
    Start{"Guide an AI Assistant"}
    Q1{"Applies automatically<br/>across a file pattern?"}
    Q2{"Defines a named specialist<br/>with bounded scope & method?"}
    Q3{"Multi-file workflow,<br/>contract, or validator script?"}
    Q4{"Focused parameterized<br/>command for a user?"}

    R1["<b>Instruction</b><br/>instructions/*.instructions.md"]
    R2["<b>Agent</b><br/>agents/*.agent.md"]
    R3["<b>Skill</b><br/>skills/&lt;name&gt;/SKILL.md"]
    R4["<b>Prompt</b><br/>prompts/*.prompt.md"]

    Start --> Q1
    Q1 -->|Yes| R1
    Q1 -->|No| Q2
    Q2 -->|Yes| R2
    Q2 -->|No| Q3
    Q3 -->|Yes| R3
    Q3 -->|No| Q4
    Q4 -->|Yes| R4

    classDef decision fill:#312e81,stroke:#6366f1,stroke-width:2px,color:#eef2ff;
    classDef instruction fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;
    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef skill fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#faf5ff;
    classDef prompt fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;

    class Start,Q1,Q2,Q3,Q4 decision;
    class R1 instruction;
    class R2 agent;
    class R3 skill;
    class R4 prompt;
```

```
Do you need to guide an AI assistant?
│
├── 1. Does the guidance apply to most code changes matching a file pattern?
│   └── YES ➔ Create an INSTRUCTION (instructions/*.instructions.md)
│
├── 2. Does it define a named specialist with bounded scope, method, and rules?
│   └── YES ➔ Create an AGENT (agents/*.agent.md)
│
├── 3. Does it provide a multi-file workflow, contract, validator script, or templates?
│   └── YES ➔ Create a SKILL (skills/<name>/SKILL.md)
│
└── 4. Is it a focused, parameterized single command for a user?
    └── YES ➔ Create a PROMPT (prompts/*.prompt.md)
```

> [!TIP]
> If a single capability seems to span multiple answers, **split responsibilities**. Do not create a single file that attempts to act as an agent, define general coding standards, and dictate machine-readable report contracts all at once.

## Ownership Rules

A core tenet of Coding Pal is **Single Authoritative Ownership**:
- Every rule or convention belongs to exactly one file.
- Other primitives link to or invoke the owner; they do not restate, duplicate, or override the owner.

### 1. Instructions Own Standards
Durable, file-oriented standards live in `instructions/*.instructions.md`.
- Enforces conventions like error handling, SQL patterns, Docker container layering, or UI component structure.
- Injected automatically only when relevant files are in context via `applyTo`.
- Keeps instructions short and imperative. Scaffolding templates and long code samples belong in a paired skill under `skills/<name>-examples/`.

### 2. Agents Own Task Scope and Method
Specialist personas live in `agents/*.agent.md`.
- Answers: What work is in scope? Which layers are touched? What constraints apply? How is the task verified?
- Agents conduct work; they do not own report formats, schemas, or universal coding rules.

### 3. Skills Own Workflows, Contracts, and Validation
Complex, multi-step procedures live in `skills/<skill-name>/`.
- Always a directory containing `SKILL.md` plus optional `references/`, `scripts/`, `fixtures/`, and `templates/`.
- Owns machine-readable contracts and deterministic validation scripts.

### 4. Prompts Own Single Parameterized Operations
Slash commands live in `prompts/*.prompt.md`.
- Maps user inputs, selections, and active paths to a specific agent and its guiding instructions.
- Parameter resolution pipeline with clear precedence.

---

## The Golden Split

When an agent executes a workflow that produces a structured artifact (e.g., Code Audit producing an audit report, or Spec from Code producing technical specifications), responsibilities are split strictly according to the **Golden Split**:

```mermaid
---
caption: The Golden Split Responsibility Matrix
---
classDiagram
    class Agent {
        +Files in scope
        +Investigation method
        +Constraints
        +Coverage completion ("Done When")
    }
    class DomainInstruction {
        +Universal coding conventions
        +Security standards
        +Architecture rules
    }
    class Skill {
        +Reusable output contract
        +Report format in references/
        +Validator script in scripts/
        +Validation fixtures in fixtures/
    }
    class Workflow_CI {
        +Artifact publication
        +PR gating & retries
    }

    Agent --> DomainInstruction : Enforces quality standard
    Agent --> Skill : Implements contract
    Workflow_CI --> Skill : Executes validator script
```

| Concern | Authoritative Owner | Example in Coding Pal |
|---|---|---|
| Target files and systems to examine | **Agent** | `code-audit.agent.md` defines which modules are in scope |
| Method of investigation or repair | **Agent** | `audit-fix.agent.md` defines surgical one-finding repair |
| Domain coding standards & security rules | **Instruction** | `node-express.instructions.md`, `docker.instructions.md` |
| Reusable output schema and format | **Skill** (`references/`) | `skills/audit-reporting/references/contract.md` |
| Deterministic artifact validation | **Skill** (`scripts/`) | `skills/audit-reporting/scripts/validate.js` |
| Task coverage completion | **Agent** (`Done When`) | "Every file in scope has been examined" |
| Artifact validity completion | **Skill** (`Done When`) | "Report satisfies the validation contract" |
| CI publication, gating, and PR checks | **Consuming Workflow** | GitHub Actions workflow in consumer repo |

> [!IMPORTANT]
> An agent must say *"Follow the installed `audit-reporting` skill"*. It must **not** duplicate report headings, field names, or validation rules in its own body. Model compliance alone is not enforcement — workflows must run the deterministic skill script.
