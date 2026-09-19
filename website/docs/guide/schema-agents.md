# Agent Markdown Schema

An **Agent** is an on-demand specialist persona invoked explicitly by the user or an orchestration workflow. It defines the bounded scope, constraints, method, and falsifiable completion criteria for a specific role.

Agent files live under `agents/*.agent.md`.

## File Naming & Location

```text
agents/
└── <kebab-case-name>.agent.md
```

Examples:
- `agents/unit-test.agent.md`
- `agents/e2e-test.agent.md`
- `agents/code-audit.agent.md`
- `agents/vitepress-docs.agent.md`

---

## Frontmatter Schema

Every agent file **must** begin with a YAML frontmatter block enclosed by triple dashes (`---`).

```yaml
---
name: string
description: string
---
```

### Fields

| Field | Type | Required | Description | Constraints & Best Practices |
|---|---|---|---|---|
| `name` | `string` | **Yes** | Human-readable title of the specialist persona. | Capitalized words (e.g., `Unit Tester`, `Code Auditor`, `VitePress Docs`). Displayed in IDE agent selectors. |
| `description` | `string` | **Yes** | Semantic discovery phrase explaining what the agent does and when to invoke it. | **Must include explicit trigger criteria.** Start with *"Use when..."*. State both capabilities and boundary conditions (e.g., *"not for changing production code"*). |

### Example Frontmatter

```yaml
---
name: Unit Tester
description: "Use when you need to create or update unit tests for a specific module. Prefer this specialist for coverage, isolation, and meaningful assertions — not for changing production code."
---
```

---

## Document Body Schema

The body of an agent markdown file adheres to a strict four-section schema:

```markdown
You are a specialist at <domain / responsibility>.

## Constraints

- <Constraint 1>
- <Constraint 2>

## Approach

1. <Step 1: Resolve Target & Scope>
2. <Step 2: Inspect Context & Evidence>
3. <Step 3: Define Execution Contract>
4. <Step 4: Execute Surgical Changes>
5. <Step 5: Verify via Narrowest Command>

## Done When

- <Falsifiable Criterion 1>
- <Falsifiable Criterion 2>
```

### Section 1: Specialist Persona Statement

- **Format**: Opening paragraph immediately following frontmatter.
- **Requirement**: A single, declarative sentence stating the specialist identity and primary mandate.
- **Example**: `You are a specialist at writing and maintaining unit tests.`

### Section 2: `## Constraints`

Defines hard boundaries that the agent **must not cross**.

- **Scope boundary**: Limits work to one module, one finding, or explicitly named files.
- **Modification permissions**: E.g., `Edit test files only. Do not change production source.`
- **Tooling restrictions**: Forbids introducing unvetted frameworks, libraries, or global linters.
- **Instruction adherence**: Mandates following installed domain instructions for conventions and patterns.

### Section 3: `## Approach`

A numbered, sequential execution pipeline that the LLM must execute in order:

1. **Resolve**: Determine targets from arguments, open files, or active selections. Fail fast if ambiguous; ask rather than guess.
2. **Inspect**: Read relevant manifests, source files, and tests *before* writing or modifying anything.
3. **Plan / Contract**: List execution paths, finding items, or specific changes before applying them.
4. **Execute**: Make surgical edits respecting the project's existing style and domain instructions.
5. **Verify**: Run the **narrowest possible test command** (not the full monolithic test suite unless no other option exists). Fix introduced errors.

### Section 4: `## Done When`

A checklist of **falsifiable completion conditions**.

- Must be objectively verifiable through tool output or file inspection.
- Prevents the agent from prematurely exiting or claiming success without proof.
- **Examples**:
  - `Every execution path listed in step 3 has at least one meaningful assertion.`
  - `The narrowest test command you ran passes with exit code 0.`
  - `No production files were modified without user approval.`

---

## Anti-Patterns

> [!WARNING]
> Avoid these common agent design mistakes:
> 1. **Owning Report Formats**: Do not specify Markdown report headings, tables, or JSON schemas inside an agent. That leaks output contracts. Reference an installed **Skill** instead (e.g., `Follow the installed audit-reporting skill`).
> 2. **Unbounded Scope**: Never allow an agent to "scan the whole repository" unless it is explicitly an auditor designed for that purpose.
> 3. **Unfalsifiable Done When**: Criteria like *"The code looks good"* or *"All requirements are satisfied"* are unacceptable. Criteria must specify passing test commands or exact file verifications.

---

## Annotated Reference Example

```markdown
---
name: Unit Tester
description: "Use when you need to create or update unit tests for a specific module. Prefer this specialist for coverage, isolation, and meaningful assertions — not for changing production code."
---

You are a specialist at writing and maintaining unit tests.

## Constraints

- Scope is **one module** (and its existing test file) unless the user names more.
- Edit **test files only**. Do not change production source. If you find a real bug, explain it and ask permission before touching production code.
- DO NOT write shallow tests — every test must assert a meaningful outcome.
- DO NOT skip edge cases among the branches you listed: nulls, empty inputs, boundaries, errors, and unexpected types that the code actually handles.
- DO NOT introduce a new test framework, runner, or assertion library. Use what the project already uses.
- Follow the project's installed test instructions for framework, file location, mocking, and how tests are executed. If none are installed, match existing tests in the repo.

## Approach

1. Resolve the target module from the request (path, selection, or open file). If none is clear, ask — do not guess and do not scan the whole tree.
2. Read that module and any existing tests for it.
3. List the execution paths you will cover: happy path, edge cases, error cases. That list is the coverage contract for this run.
4. Write or update tests for those paths only, matching the project's existing test layout and naming. Keep tests isolated — no shared mutable state between cases.
5. Run the **narrowest** project test command that exercises the files you changed (not the entire suite unless that is the only command). Fix failures you introduced.

## Done When

- Every path listed in step 3 has at least one meaningful assertion.
- The narrowest test command you ran passes.
- No production files were changed, unless the user approved a bug fix.
```
