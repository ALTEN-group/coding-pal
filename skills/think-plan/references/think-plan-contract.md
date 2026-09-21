# Think & Plan Specification Contract

In agentic software development, traditional narrative specifications (lengthy PRDs, free-form design docs) fail AI coding agents. They are ambiguous, introduce context window bloat, and leave implementation sequencing undefined.

Instead, specifications are the direct output of a two-stage specification workflow: **Think** followed by **Plan**.
- `think.md` captures system understanding, request tracing, component responsibilities, invariants, and the smallest set of changes.
- `plan.md` translates `think.md` into an ordered, numbered checklist of small, verifiable implementation steps that keep the application bootable.

This contract defines the authoritative structure, headings, fields, and validation rules for both files.

---

## 1. Specifications Directory & Naming

- Specification artifacts live in a dedicated directory:
  - Default: `specs/` (or `docs/specs/`).
  - Scoped features: `specs/<feature-name>/think.md` and `specs/<feature-name>/plan.md`.
  - Issue-driven features: `specs/issue-<number>/think.md` and `specs/issue-<number>/plan.md` on branch `specs/issue-<number>`.
- File names must be exactly `think.md` and `plan.md` (lowercase ASCII).
- UTF-8 encoding without BOM.

---

## 2. `think.md` Specification Contract

`think.md` is authored during the **Think phase** (e.g. using an interactive planning session or Think Planner agent) from business needs and codebase exploration. It contains **no production code** and **no task checklist**.

### Required Document Structure (In Exact Order)

1. Level-1 Heading: `# Think: <Feature or Task Name>`
2. Level-2 Heading: `## Business Need & Outcome`
3. Level-2 Heading: `## System Flow & Responsibilities`
4. Level-2 Heading: `## Invariants & Guardrails`
5. Level-2 Heading: `## Minimal Change Scope`
6. Level-2 Heading: `## Ambiguities & Open Questions`

### Section Requirements for `think.md`

#### `## Business Need & Outcome`
- **Problem Statement**: What problem is being solved, or what capability is being added.
- **Target Persona / Consumer**: Who triggers or consumes this change (end user, internal service, admin).
- **Desired Outcome & Acceptance Criteria**: Bullet list of concrete observable outcomes that define business success.

#### `## System Flow & Responsibilities`
- **Request Tracing**: Traces how requests or events currently flow (or will flow) through the layers (e.g. Gateway/Router $\rightarrow$ Controller/Handler $\rightarrow$ Service $\rightarrow$ Entity/Database).
- **Component Responsibilities**: Table or bullets mapping each affected component to its single responsibility.
- **Boundary Identification**: Clarifies where the feature begins and ends.

#### `## Invariants & Guardrails`
- **Non-Negotiable Rules**: Architectural standards, security constraints, authorization rules, transaction boundaries, or error format conventions that must not be broken.
- **Side-Effect Constraints**: Existing services, routes, or database tables that must remain completely untouched.

#### `## Minimal Change Scope`
- **Files to Add**: Explicit workspace paths of new files to create.
- **Files to Modify**: Explicit workspace paths of existing files to touch, with the reason.
- **Explicitly Excluded**: Architectural components or refactorings that are out of scope (prevents overengineering).

#### `## Ambiguities & Open Questions`
- Unresolved questions or external dependencies that need human clarification, or the exact literal string: `_None._`

---

## 3. `plan.md` Specification Contract

`plan.md` is authored during the **Plan phase** (e.g. using an interactive planning session or Think Planner agent) strictly as the downstream result of `think.md`. It contains **no source code**, but provides the exact, numbered execution roadmap for AI build agents.

### Required Document Structure (In Exact Order)

1. Level-1 Heading: `# Plan: <Feature or Task Name>`
2. Level-2 Heading: `## Prerequisites & Context`
3. Level-2 Heading: `## Implementation Checklist`
4. Level-2 Heading: `## Done When`

### Section Requirements for `plan.md`

#### `## Prerequisites & Context`
- Mandatory reference to the source `think.md` location (e.g. `- Reference: specs/think.md`).
- Pre-existing dependencies, environment variables, or running containers required before executing step 1.

#### `## Implementation Checklist`
An ordered sequence of small, atomic, independently verifiable steps. Each step must use a level-3 heading formatted as `### Step <N>: <Short Action Name>` (starting at Step 1, sequential integers).

Every step **must** contain these four structured fields in order:

```markdown
### Step 1: <Name>
- **Files:** <workspace-relative paths to create or modify>
- **Action:** <surgical description of code or config change>
- **Verification:** <narrowest deterministic test, lint, or curl command>
- **Bootable Check:** <command or health check proving the app still starts/boots>
```

Field rules:
- **`Files:`** Lists explicit paths. Every file must be accounted for from `think.md`'s `Minimal Change Scope`. Never use vague phrases like "relevant files".
- **`Action:`** States the surgical change without pasting entire code files.
- **`Verification:`** Must be a runnable, narrow command (e.g., `npm test -- tests/routes/role.test.js` or `npm run lint`).
- **`Bootable Check:`** Must assert that the service boots or passes basic health inspection (e.g., `docker compose up -d && curl -f http://localhost:3000/health` or `node -e 'import("./src/app.js")'`).

#### `## Done When`
A checklist of falsifiable completion criteria:
- Every step in the implementation checklist is marked complete.
- Narrowest verification commands for all steps pass with exit code 0.
- Application boots and health check returns healthy.
- No files outside the agreed `Files:` list were modified.

---

## 4. Anti-Patterns & Prohibitions

1. **No Monolithic Narrative PRDs**: Specifications must not be prose-heavy essays where requirements are scattered across paragraphs.
2. **No Code in Specifications**: Neither `think.md` nor `plan.md` may contain full implementation source code files or large patch diffs. The code is written during the build phase.
3. **No Unbounded Steps**: A step like "Implement user management" is prohibited. Steps must be atomic (e.g., "Add roles router", "Add roles service", "Mount route in app.js").
4. **No Combined Think-Plan Phase**: Thinking and Planning have distinct cognitive models. Do not author `plan.md` without first establishing and validating `think.md`. `plan.md` must always be the downstream result of `think.md`.
5. **No Scope Deviation**: `plan.md` must not add steps that modify files outside the `Minimal Change Scope` established in `think.md`.

---

## 5. Storage & Issue Attachment Convention

In autonomous CI/CD pipelines (e.g. GitHub Actions triggered on `issues: [opened]`):

### Storage on Git Branch
- Specifications are committed to the repository under `specs/issue-<number>/` on a dedicated branch named `specs/issue-<number>`.
- Preserves context for downstream build agents and ensures an auditable git history.

### Attachment via Issue Comment
- **Non-destructive**: Never overwrite or append onto the human user's issue body. The issue description must remain the pure source of truth for the human business need.
- **Publication via Comment**: Post the generated specifications as an **Issue Comment** using the GitHub CLI (`gh issue comment`).
- **Collapsible Layout**: Wrap file contents in `<details>` blocks to keep the issue timeline readable:
  - `think.md` enclosed in `<details><summary>🧠 <b>think.md (System Flow & Invariants)</b></summary> ... </details>`.
  - `plan.md` enclosed in `<details open><summary>📝 <b>plan.md (Implementation Steps)</b></summary> ... </details>`.
- **Status & Label**: Reference the dedicated branch link and label the issue `specs:ready`.
