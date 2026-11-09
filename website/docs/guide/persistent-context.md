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
- A **skill** can also be loaded directly, without selecting an agent. The assistant uses the skill's name and `description` in its `SKILL.md` frontmatter as a summary; when the user's request is a semantic fit for that description, the assistant can load the full skill instructions. This is not just keyword matching. For example, a request to run linting, type checks, and tests may match a skill whose description covers multi-stage verification.

| Primitive | Loading Model | Trigger Condition | Primary Purpose |
|---|---|---|---|
| **Instruction** | **Always-on** | Active file matches `applyTo` glob pattern | Stable rules, conventions, security guidelines, and architectural standards |
| **Agent** | **On-demand** | Explicitly selected (e.g. `--agent <name>`) | Scoped specialist with bounded method, strict constraints, and completion criteria |
| **Skill** | **On-demand** | The task semantically matches the skill's declared name/description, or an agent/user explicitly loads it | Multi-file procedures, contracts, executable validation scripts, and templates |
| **Prompt** | **On-demand** | Explicitly invoked via slash command (`/<name>`) | Parameterized entry point mapping user intent to agents and instructions |

## The Decision Tree

When adding persistent guidance, branch first by **when it should load**, then by **what it owns**. Solid arrows select the primary primitive; dashed arrows show when to pair it rather than overloading one file:

```mermaid
---
caption: Context Primitive Decision Tree
---
flowchart TD
    Q1{"When should it load?"}
    Q2{"What does it own?"}

    R1["<b>Instruction</b><br/>instructions/*.instructions.md<br/><i>Short, imperative standards</i>"]
    R4["<b>Prompt</b><br/>prompts/*.prompt.md<br/><i>/command + argument resolution</i>"]
    R2["<b>Agent</b><br/>agents/*.agent.md<br/><i>Bounded scope, method & Done When</i>"]
    R3["<b>Skill</b><br/>skills/&lt;name&gt;/SKILL.md<br/><i>Contracts, validator scripts & templates</i>"]

    Q1 -->|"Always-on<br/>(file glob or background rule)"| R1
    Q1 -->|"On-demand<br/>(invoked per task)"| Q2

    Q2 -->|"User slash command"| R4
    Q2 -->|"Specialist persona"| R2
    Q2 -->|"Reusable workflow or check"| R3

    R4 -.->|"Always delegates to"| R2
    R1 -.->|"Needs code scaffolds?"| R3
    R2 -.->|"Needs output contract<br/>or validator?"| R3

    classDef decision fill:#312e81,stroke:#6366f1,stroke-width:2px,color:#eef2ff;
    classDef instruction fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;
    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef skill fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#faf5ff;
    classDef prompt fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;

    class Q1,Q2 decision;
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

When an agent executes a workflow that produces a structured artifact or code change (e.g., Code Audit producing an audit report, Audit Fix repairing a finding, or Spec from Code producing technical specifications), responsibilities are split strictly across canonical primitives and the deterministic control roles they own:

```mermaid
---
caption: The Golden Split Responsibility Architecture
---
flowchart TD
    INST["<b>Instruction</b><br/><code>instructions/*.instructions.md</code><br/>• Universal coding conventions<br/>• Security &amp; architecture rules"]

    AGENT["<b>Agent</b><br/><code>agents/*.agent.md</code><br/>• Target files &amp; system scope<br/>• Investigation / implementation method<br/>• Constraints &amp; boundaries<br/>• Task coverage <code>Done When</code>"]

    subgraph SKILL ["<b>Skill Package</b> (<code>skills/&lt;name&gt;/</code> &amp; <code>skills/prove/</code>)"]
        direction TB
        CONTRACT["<b>📄 Contract</b> (<code>references/</code>)<br/>• Reusable output schema &amp; markers<br/>• Artifact validity <code>Done When</code>"]
        GUARD["<b>🛡️ Guard</b> (<code>skills/prove/scripts/</code>)<br/>• Allowed paths whitelist<br/>• Forbidden file &amp; secret protection<br/>• Diff churn &amp; dependency limits"]
        GATE["<b>🚦 Gate &amp; 🎯 Probe</b> (<code>scripts/</code> &amp; <code>fixtures/</code>)<br/>• Deterministic artifact validator<br/>• Multi-stage <code>task-gate</code> &amp; narrowest tests<br/>• Anti-tautology &amp; rollback probes"]
    end

    CI["<b>Consuming Workflow / CI</b><br/>• Executes Guards, Gates &amp; Validators<br/>• PR gating, retries &amp; artifact publication"]

    INST -->|"Governs quality standards"| AGENT
    AGENT -->|"Follows contract"| CONTRACT
    AGENT -->|"Self-checks in loop"| GUARD
    AGENT -->|"Self-certifies completion"| GATE
    CI -->|"Enforces scope &amp; safety"| GUARD
    CI -->|"Verifies &amp; gates PR"| GATE

    classDef instruction fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;
    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef contract fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#faf5ff;
    classDef guard fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef gate fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
    classDef execution fill:#1e293b,stroke:#64748b,stroke-width:2px,color:#f8fafc;

    class INST instruction;
    class AGENT agent;
    class CONTRACT contract;
    class GUARD guard;
    class GATE gate;
    class CI execution;
```

| Concern | Authoritative Owner | Example in Coding Pal |
|---|---|---|
| Target files and systems to examine | **Agent** | `spec-from-code.agent.md` defines which modules are in scope |
| Method of investigation or repair | **Agent** | `gate-fix.agent.md` defines bounded gate failure repair |
| Domain coding standards & security rules | **Instruction** | `node-express.instructions.md`, `docker.instructions.md` |
| Task coverage completion | **Agent** (`Done When`) | "Every file in scope has been examined" |
| Reusable output schema and format | **Skill — Contract** (`references/`) | `skills/spec-from-code/references/spec-contract.md` |
| Artifact validity completion | **Skill — Contract** (`Done When`) | "Specification files satisfy the validation contract" |
| Blast-radius, secret & dependency boundaries | **Skill — Guard** (`skills/prove/scripts/`) | `scope-guard.mjs`, `secret-guard.mjs`, `dependency-guard.mjs` |
| Deterministic artifact validation | **Skill — Gate** (`scripts/`) | `skills/spec-from-code/scripts/spec-docs.mjs` |
| Falsifiable execution certification & probes | **Skill — Gate & Probe** (`scripts/`) | `task-gate.mjs`, `test-probe.mjs`, `validate-think.mjs`, `validate-plan.mjs` |
| CI publication, gating, and PR checks | **Consuming Workflow** | GitHub Actions workflow in consumer repo |

> [!IMPORTANT]
> An agent must say *"Follow the installed `spec-from-code` skill"*. It must **not** duplicate report headings, field names, or validation rules in its own body. Model compliance alone is not enforcement — workflows must run the deterministic skill script.

---

## Stage Records as Persistent Context

While **Instructions**, **Agents**, **Skills**, and **Prompts** define *how* an assistant operates, agents also need durable project memory across turns and lifecycle stages. Relying on narrative prose documents or volatile chat history introduces three failure modes:
1. **Context Window Exhaustion**: Long descriptive threads deplete the agent's context window before execution begins.
2. **Ambiguity & Hallucinated Scope**: Models infer unstated requirements or refactor adjacent components when boundaries are not explicit.
3. **Cross-Session State Loss**: Handing work from one specialist agent to the next (or resuming in a clean session) loses reasoning and constraints unless state is committed to the repository.

Across the [Agentic Software Factory](./overview.md#agentic-software-factory-coverage), every stage reads validated artifacts committed by upstream stages and writes its own machine-validated record:

```mermaid
---
caption: Repository Artifacts as Persistent Context Across Stages
---
flowchart LR
    M["<b>0. Meet</b><br/>meeting-pack.md<br/>docs/glossary.md"] --> TR["<b>1. Triage</b><br/>triage.md<br/>ledger.md / weights.json"]
    TR --> TH["<b>2. Think</b><br/>think.md"]
    TH --> PL["<b>3. Plan</b><br/>plan.md"]
    PL --> CD["<b>4. Code &amp; 5. Prove</b><br/>PR record &amp; prove.md"]
    CD --> RL["<b>6. Release</b><br/>release.md"]
    RL --> LN["<b>7. Learn</b><br/>Verdicts &amp; incidents"]
    LN -.->|"New issues &amp; context updates"| TR

    classDef artifact fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
    class M,TR,TH,PL,CD,RL,LN artifact;
```

| Stage | Persistent Record(s) | Authoritative Skill | Role in Context Continuity | Domain Guide |
|---|---|---|---|---|
| **0 — Meet** | `meeting-pack.md`, `docs/glossary.md` | `skills/meeting-pack/` | Captures verbatim client quotes and updates the shared domain glossary by PR | [Meet](./domain-meet.md) |
| **1 — Triage** | `triage.md`, `specs/triage/ledger.md`, `weights.json` | `skills/triage/` | Records evidence, system mapping, scorecard, and persistent triage memory | [Triage](./domain-triage.md) |
| **2 — Think** | `specs/issue-<n>/think.md` | `skills/think/` | Records options considered, chosen approach, constraints, and blast radius tier (no code) | [Think & Plan](./domain-think-plan.md) |
| **3 — Plan** | `specs/issue-<n>/plan.md` | `skills/plan/` | Sequences file scope, acceptance criteria, and dependency-ordered atomic steps with verification and bootability checks (no code) | [Think & Plan](./domain-think-plan.md) |
| **4 — Code** | Short-lived branch & PR record | `skills/code/` | Executes plan steps in clean sessions, linking the issue, plan, and criterion-to-test traceability | [Code](./domain-code.md) |
| **5 — Prove** | `specs/issue-<n>/prove.md` | `skills/prove/` | Certifies deterministic controls (`control-guard`, `scope-guard`, `task-gate`, `criteria-verify`, `test-probe`, etc.) against `think.md` and `plan.md` | [Prove](./domain-prove.md) |
| **6 — Release** | `specs/issue-<n>/release.md` | `skills/release-plan/` | Declares rollout thresholds and rollback procedures before deployment | [Release](./domain-release.md) |
| **7 — Learn** | Hypothesis ledger & incident records | `skills/learn/`, `skills/context-health/` | Evaluates production outcomes, checks Persistent Context health, and feeds new issues back into Triage | [Learn](./domain-learn.md) |

### Clean-Session Execution Discipline

Because each stage's output is committed and deterministically validated by its owning skill script, downstream agents do not need the upstream conversation history:
1. Each agent starts in a **fresh chat session (clean context)** and loads only the upstream record(s) it depends on.
2. It performs a bounded unit of work (for example, choosing an approach in `think.md`, sequencing steps in `plan.md`, or executing a single step in **Code**).
3. It runs the narrowest deterministic verification command and contract validator before handing off to the next stage.

