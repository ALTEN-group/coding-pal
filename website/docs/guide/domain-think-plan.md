# Think & Plan

The **Think & Plan** domain provides an automated, agentic specification methodology that translates unstructured business needs and user stories into persistent, machine-consumable artifacts (`think.md` and `plan.md`).

Rather than writing narrative PRDs that overwhelm AI agent context and compound errors, Coding Pal enforces a strict two-stage pipeline: **Think** (grounding architecture, tracing flows, mapping components, and bounding minimal scope) followed by **Plan** (sequencing atomic steps with narrow verification commands and explicit bootability checks). Downstream build agents consume these persistent artifacts step-by-step with zero hallucinated scope.

---

## Domain Architecture

```mermaid
---
caption: Business Needs to Specifications Pipeline (Think -> Plan -> Build)
---
flowchart TD
    subgraph Phase1 ["1. Think Phase (Architectural Analysis)"]
        direction TB
        BIZ["<b>Business Need / User Story</b><br/>Feature request, RFC, issue, or prompt"]
        AG_THINK["<b>Think Phase / Planner</b><br/>Flow tracing, invariants, scope bounding"]
        THINK_DOC["<b>think.md</b><br/>System flows, responsibilities, invariants, minimal scope"]

        BIZ --> AG_THINK
        AG_THINK --> THINK_DOC
    end

    subgraph Phase2 ["2. Plan Phase (Implementation Sequencing)"]
        direction TB
        AG_PLAN["<b>Plan Phase / Planner</b><br/>Translates think.md into atomic roadmap"]
        PLAN_DOC["<b>plan.md</b><br/>Ordered atomic steps, verification, bootable checks"]

        AG_PLAN --> PLAN_DOC
    end

    subgraph Phase3 ["3. Build Phase (Atomic Execution)"]
        direction TB
        BUILD_AG["<b>AI Build / Coding Agent</b><br/>Executes exactly 1 step per turn"]
        DONE["<b>Verified Implementation</b><br/>Application boots · All narrow tests pass"]

        BUILD_AG --> DONE
    end

    subgraph Governance ["Standards & Deterministic Validation"]
        direction TB
        INST_SPEC["<b>think-plan.instructions.md</b><br/>Bootability & phase separation standards"]
        SKILL_SPEC["<b>skills/think-plan/</b><br/>Contract & validate-specs.mjs"]
    end

    THINK_DOC -->|"Primary Input to Plan Phase"| AG_PLAN
    PLAN_DOC -->|"Input to Build Phase"| BUILD_AG

    AG_THINK -.->|Standards| INST_SPEC
    AG_PLAN -.->|Standards| INST_SPEC
    THINK_DOC ===|Deterministic Validation| SKILL_SPEC
    PLAN_DOC ===|Deterministic Validation| SKILL_SPEC

    classDef stage fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef instruction fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;
    classDef skill fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#faf5ff;
    classDef artifact fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
    classDef input fill:#1e293b,stroke:#64748b,stroke-width:2px,color:#f8fafc;
    classDef verify fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;

    class BIZ input;
    class AG_THINK,AG_PLAN,BUILD_AG stage;
    class INST_SPEC instruction;
    class SKILL_SPEC skill;
    class THINK_DOC,PLAN_DOC artifact;
    class DONE verify;
```

---

## Capabilities Matrix

| Capability | Invocation / Entry Point | Specialist Agent | Scoping Instruction | Supporting Skill | Output Artifact |
|---|---|---|---|---|---|
| **Business Needs to Specifications** | Planning session or [`Think Planner`](./catalog-agents.md#9-think-planner) agent (CI) | [`Think Planner`](./catalog-agents.md#9-think-planner) | [`think-plan`](./catalog-instructions.md#think--plan-instructions) | [`think-plan`](./catalog-skills.md#10-think-plan) | `specs/think.md` and `specs/plan.md` (System flows, invariants, atomic checklist, bootability checks) |

---

## Capability Workflows

### 1. Business Needs to Specifications: Think & Plan

- **When to Run**: Before authoring code for any non-trivial business need, user story, feature request, or architectural change. Can be run interactively in the IDE (planning session) or headlessly in CI/CD when a GitHub issue is opened.
- **Why It Replaces Traditional Specs**:
  - Traditional PRDs and narrative design docs are verbose, full of unstated assumptions, and swamp the LLM context window with conversational prose.
  - In an agentic operating model, specifications are actionable data structures for models:
    1. `think.md` grounds the LLM in real codebase architecture, data flows, invariants, and bounds the minimal change footprint.
    2. `plan.md` sequences the implementation into atomic, dependency-ordered steps where each step verifies local functionality and asserts the application remains bootable.
  - Downstream build agents consume `plan.md` one step at a time in fresh context sessions, preventing error compounding.
- **Workflow Steps**:
  1. **Phase 1: Think**:
     - *Interactive (IDE)*: Open a planning or reasoning session with your AI assistant and prompt with the business requirement: *"Analyze the business need for [feature] and save findings to specs/think.md."*
     - *Headless (GitHub Action)*: Triggered on `issues: [opened]`, invoking the **Think Planner** agent (`think-plan.agent.md`) with the issue title and body.
     - The `think-plan.instructions.md` standard automatically loads, ensuring the model traces existing flows, maps component responsibilities, respects invariants, and confines scope without writing code.
     - Emits `specs/think.md` conforming to [`skills/think-plan/references/think-plan-contract.md`](./catalog-skills.md#10-think-plan).
  2. **Phase 2: Plan**:
     - *Interactive (IDE)*: In a clean planning session: *"From specs/think.md, generate specs/plan.md."*
     - *Headless (CI)*: The **Think Planner** agent automatically synthesizes `specs/plan.md` directly from the validated `think.md`.
     - Emits `specs/plan.md` containing atomic steps with explicit `Files:`, `Action:`, `Verification:`, and `Bootable Check:`.
  3. **Phase 3: Automated Validation**:
     - Specs are deterministically validated via the skill validator:
       ```bash
       node .agents/skills/think-plan/scripts/validate-specs.mjs --dir specs
       ```
  4. **Phase 4: Agentic Build**:
     - Launch an AI build or coding agent with clean context.
     - Prompt: *"From specs/plan.md, implement Step 1 only."*
     - The agent executes one verified step at a time, keeping the application bootable throughout.

#### Downstream Execution Discipline

When an AI build agent implements functionality from `plan.md`:
1. It reads `plan.md` in a fresh chat session (clean context).
2. It executes **exactly one step** from the checklist.
3. It runs the step's `Verification` command and asserts that the application still boots (`Bootable Check`).
4. Only when both pass does it mark the step done and proceed to the next step in a clean session.

#### Storage & GitHub Issue Attachment Pattern

When automating specifications from GitHub issues in CI/CD, specifications follow the **Issue Comment + Dedicated Branch** pattern:

```mermaid
---
caption: GitHub Actions Issue-to-Specification Workflow
---
flowchart TD
    ISSUE["<b>1. Issue #42 Created</b><br/>Human business requirement"] --> ACT["<b>2. GitHub Action Triggered</b><br/>issues: [opened]"]
    ACT --> AG["<b>3. Think Planner Agent</b><br/>Generates think.md, then derives plan.md"]
    AG --> VAL["<b>4. Deterministic Validator</b><br/>node validate-specs.mjs"]
    VAL --> BR["<b>5. Push to Branch</b><br/>specs/issue-42"]
    BR --> COM["<b>6. Post Issue Comment</b><br/>gh issue comment with collapsible &lt;details&gt;"]
    COM --> LBL["<b>7. Add Label</b><br/>specs:ready"]

    classDef input fill:#1e293b,stroke:#64748b,stroke-width:2px,color:#f8fafc;
    classDef runner fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef git fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
    classDef notify fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#faf5ff;

    class ISSUE input;
    class ACT,VAL runner;
    class AG agent;
    class BR git;
    class COM,LBL notify;
```

1. **Non-destructive Issue Comment**: The action **never overwrites** the issue description. Leaving the human product owner's original words intact preserves the authentic requirement while keeping discussions and reviews threaded.
2. **Collapsible Visual Layout**: Full specifications are posted in a comment formatted with HTML `<details>` tags:
   - `think.md` enclosed in `<details><summary>🧠 <b>think.md (System Flow & Invariants)</b></summary> ... </details>`.
   - `plan.md` enclosed in `<details open><summary>📝 <b>plan.md (Implementation Steps)</b></summary> ... </details>`.
3. **Dedicated Branch Storage**: Files are committed to `specs/issue-<number>/` on branch `specs/issue-<number>`, providing clean filesystem access for downstream build agents.

- **Falsifiable Done When**:
  - `think.md` and `plan.md` pass `skills/think-plan/scripts/validate-specs.mjs` with exit code 0.
  - Zero code was modified during specification generation.

---

## Related Catalogs & Schemas

- [Prompts Catalog](./catalog-prompts.md)
- [Agents Catalog](./catalog-agents.md)
- [Instructions Catalog](./catalog-instructions.md)
- [Skills Catalog](./catalog-skills.md)
- [Persistent Context Architecture](./persistent-context.md)
- [Specs & Docs Domain](./domain-docs.md)
