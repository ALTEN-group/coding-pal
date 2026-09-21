# Persistent Context Architecture

Persistent Context represents the collection of rules, schemas, specialized personas, and procedural workflows that remain available to an AI coding assistant across development cycles.

Instead of relying on volatile chat memory or giant prompt dumps, Coding Pal organizes persistent context into four distinct primitives, loaded dynamically according to context and user action.

## Context Lifecycle: Always-On vs On-Demand

Two rules govern how primitives reach the context window:

1. **An instruction file has two independent activation gates, and either one is enough to load it.** `applyTo` matches against a file the agent is working on this turn; `description` matches semantically against the task itself, with no file required at all. Neither gate needs a prompt, agent, or skill to request it — the check runs automatically in the background. If an instruction has neither an `applyTo` match this turn nor a `description` relevant to the task, it does not load. Where a match does happen (either gate), that instruction simply stacks underneath whichever prompt, agent, or skill also fires — it is never an alternative to them.
2. **Prompts, Agents, and Skills are three separate on-demand entry points.** Only one of them starts a given turn (a slash command, an explicit agent invocation, or a semantic skill match) — but a prompt or an agent can pull in a skill downstream of that entry point.

### The Always-On Layer

```mermaid
---
caption: Instruction Loading — triggered automatically by file pattern or task description
---
flowchart TD
    subgraph Triggers ["Automatic Triggers (either matches)"]
        direction TB
        T1["File matches <code>applyTo</code> pattern"]
        T2["Task matches <code>description</code> semantically"]
    end

    T1 --> I["<b>Instruction</b><br/>*.instructions.md"]
    T2 --> I
    I --> CTX["<b>LLM Context Window</b>"]

    classDef instruction fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;
    classDef execution fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
    classDef event fill:#1e293b,stroke:#64748b,stroke-width:1.5px,color:#f8fafc;

    class I instruction;
    class CTX execution;
    class T1,T2 event;
```

### The Three On-Demand Entry Points

Each entry point below is a separate way a turn can **start**. Pick the row that matches how the user acted; the instruction layer above still applies on top of all three.

```mermaid
---
caption: On-Demand Entry Points — pick one starting trigger per turn
---
flowchart TD
    subgraph Entry ["How the turn starts (pick one)"]
        direction TB
        T1["User types a slash command<br/>(/name)"]
        T2["User explicitly selects an agent<br/>(--agent name)"]
        T3["Task description matches<br/>a skill's purpose"]
    end

    T1 -->|"Resolves parameters, maps to"| P["<b>Prompt</b><br/>*.prompt.md"]
    P -->|"Delegates to"| A["<b>Agent</b><br/>*.agent.md"]

    T2 -->|"Selects"| A

    A -->|"Invokes if the task<br/>needs a contract"| S["<b>Skill</b><br/>skills/&lt;name&gt;/SKILL.md"]

    T3 -->|"Loads directly"| S

    A --> CTX["<b>LLM Context Window</b>"]
    S --> CTX

    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef skill fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#faf5ff;
    classDef prompt fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef execution fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
    classDef event fill:#1e293b,stroke:#64748b,stroke-width:1.5px,color:#f8fafc;

    class P prompt;
    class A agent;
    class S skill;
    class CTX execution;
    class T1,T2,T3 event;
```

Three things to read off this diagram:
- A **prompt** never reaches the context window directly — it always hands off to the agent it maps to.
- An **agent** (whether reached via a prompt or invoked directly) may pull in a **skill** if the task requires a reusable contract or validator.
- A **skill** can also be reached with no agent involved at all, when the task description alone matches it.

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
    class Agent:::agent {
        +Files in scope
        +Investigation method
        +Constraints
        +Coverage completion ("Done When")
    }
    class DomainInstruction:::instruction {
        +Universal coding conventions
        +Security standards
        +Architecture rules
    }
    class Skill:::skill {
        +Reusable output contract
        +Report format in references/
        +Validator script in scripts/
        +Validation fixtures in fixtures/
    }
    class Workflow_CI:::execution {
        +Artifact publication
        +PR gating & retries
    }

    Agent --> DomainInstruction : Enforces quality standard
    Agent --> Skill : Implements contract
    Workflow_CI --> Skill : Executes validator script

    classDef instruction fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;
    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef skill fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#faf5ff;
    classDef execution fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
```

| Concern | Authoritative Owner | Example in Coding Pal |
|---|---|---|
| Target files and systems to examine | **Agent** | `code-audit.agent.md` defines which modules are in scope |
| Method of investigation or repair | **Agent** | `audit-fix.agent.md` defines surgical one-finding repair |
| Domain coding standards & security rules | **Instruction** | `node-express.instructions.md`, `docker.instructions.md` |
| Reusable output schema and format | **Skill** (`references/`) | `skills/audit-reporting/references/report-contract.md` |
| Deterministic artifact validation | **Skill** (`scripts/`) | `skills/audit-reporting/scripts/audit-report.mjs` |
| Task coverage completion | **Agent** (`Done When`) | "Every file in scope has been examined" |
| Artifact validity completion | **Skill** (`Done When`) | "Report satisfies the validation contract" |
| CI publication, gating, and PR checks | **Consuming Workflow** | GitHub Actions workflow in consumer repo |

> [!IMPORTANT]
> An agent must say *"Follow the installed `audit-reporting` skill"*. It must **not** duplicate report headings, field names, or validation rules in its own body. Model compliance alone is not enforcement — workflows must run the deterministic skill script.

---

## Specifications as Persistent Context: Think & Plan

In traditional engineering, specifications are narrative Product Requirement Documents (PRDs) written in conversational prose. For AI coding agents, traditional specifications introduce critical failure modes:
1. **Context Window Exhaustion**: Long descriptive documents deplete the agent's context window before coding even begins.
2. **Ambiguity & Hallucinated Scope**: Models infer unstated features or refactor adjacent components when requirements lack strict boundaries.
3. **Monolithic Error Compounding**: Asking an agent to implement a full feature in one shot leads to cascading failures across multiple files.

Coding Pal replaces traditional specifications with **two persistent, machine-consumable artifacts**:

```mermaid
---
caption: Phased Specification Architecture (Think -> Plan -> Build)
---
flowchart TD
    BN["<b>Business Need</b><br/>User story / issue"] --> T["<b>1. Think Phase</b><br/>Copilot Plan Mode"]
    T --> TM["<b>think.md</b><br/>Flows, invariants, minimal scope"]
    TM --> P["<b>2. Plan Phase</b><br/>Copilot Plan Mode"]
    P --> PM["<b>plan.md</b><br/>Atomic steps + bootable check"]
    PM --> B["<b>3. Build Phase</b><br/>Copilot Agent Mode (1 step/turn)"]

    classDef stage fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef artifact fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
    classDef input fill:#1e293b,stroke:#64748b,stroke-width:2px,color:#f8fafc;

    class BN input;
    class T,P,B stage;
    class TM,PM artifact;
```

### The Two Specification Primitives

| Specification Artifact | Phase | Execution Mode | Authoritative Owner | Key Content |
|---|---|---|---|---|
| `think.md` | **Think** | Copilot Plan Mode / `Think Planner` agent | `skills/think-plan/` | Request flow tracing, component responsibilities, architectural invariants, and explicit minimal change scope. **No code or task checklists.** |
| `plan.md` | **Plan** | Copilot Plan Mode / `Think Planner` agent | `skills/think-plan/` | Numbered atomic steps (`### Step N:`), explicit file paths, surgical actions, narrowest verification commands, and per-step **bootability checks**. **No code.** |

### Downstream Execution Discipline
When an AI build agent implements functionality from `plan.md`:
1. It reads `plan.md` in a fresh chat session (clean context).
2. It executes **exactly one step** from the checklist.
3. It runs the step's `Verification` command and asserts that the application still boots (`Bootable Check`).
4. Only when both pass does it mark the step done and proceed to the next step in a clean session.

> [!TIP]
> For automated workflows, headless CI execution, and the GitHub issue attachment pattern, see the dedicated [Think & Plan Domain Guide](./domain-think-plan.md).

