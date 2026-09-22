# Prompt Markdown Schema

A **Prompt** is an on-demand, user-invocable command (typically exposed as a slash command `/command` in AI chat interfaces). It acts as a bridge between human input and specialized agents, resolving arguments, active editor selections, and open files.

Prompt files live under `prompts/*.prompt.md`.

## File Naming & Location

```text
prompts/
└── <kebab-case-name>.prompt.md
```

Examples:
- `prompts/node-unit-tests.prompt.md`
- `prompts/vitepress-docs.prompt.md`
- `prompts/angular-unit-tests.prompt.md`
- `prompts/fuzz-tests.prompt.md`

---

## Frontmatter Schema

Every prompt file **must** begin with a YAML frontmatter block enclosed by triple dashes (`---`).

```yaml
---
name: string
description: string
agent: string
argument-hint: string
---
```

### Fields

| Field | Type | Required | Description | Constraints & Best Practices |
|---|---|---|---|---|
| `name` | `string` | **Yes** | The command identifier. | Lowercase kebab-case (e.g., `node-unit-tests`). In chat interfaces, this becomes the slash command (`/node-unit-tests`). |
| `description` | `string` | **Yes** | Description of the command. | Explains what the command produces and when the user should type it. |
| `agent` | `string` | **Optional** | Target agent to execute the operation. | Must match the `name` field of an agent in `agents/*.agent.md` (e.g., `Unit Tester`, `VitePress Docs`). |
| `argument-hint` | `string` | **Optional** | Autocomplete hint displayed in IDE input. | Short placeholder describing expected argument (e.g., `optional src path, e.g. src/routes/application.js` or `docs root, e.g. website`). |

### Example Frontmatter

```yaml
---
name: node-unit-tests
description: "Generate or update a Jest unit test file for a Node.js module (services, utils, controllers, middlewares). Use when the user wants isolated unit tests for an open file, a selection, or a src/ path."
agent: Unit Tester
argument-hint: "optional src path, e.g. src/services/user.service.js"
---
```

---

## Document Body Schema

The body of a prompt markdown file adheres to a standardized three-part schema:

```markdown
Slash command for the **<Target Agent>** agent on <subject scope>.

## Resolve <target / parameters>

Use the first that is a valid target:

1. <Argument from prompt message>
2. <Current editor selection>
3. <Currently open file in context>

If none of those match, ask which file/resource to target. Do not guess.

<Target-to-Artifact Mapping Rules>

## Run

Hand the resolved target and parameters to <Target Agent>.
Verify with the narrowest project command per the installed <domain> instructions.
```

### Section 1: Command Mandate

- **Format**: Opening sentence immediately following frontmatter.
- **Requirement**: Explicitly names the target agent and describes the high-level operation.
- **Example**: `Slash command for the **Unit Tester** agent on one Node.js src/ module.`

### Section 2: `## Resolve <target>` (Parameter Precedence)

Defines a strict fallback sequence for resolving inputs without guessing:

1. **Positional Arguments**: An explicit path or parameter provided in the chat prompt.
2. **Editor Selection**: Active code or path selected in the IDE.
3. **Open File Context**: The file currently focused in the editor.
4. **Fallback Guard**: If no valid target is found, the agent **must ask the user** rather than hallucinating or scanning the entire repository.

This section also specifies **Target-to-Artifact Mapping**:
- Translates source paths to destination paths (e.g., `src/<path>/<file>.js` → `tests/<path>/<file>.test.js`).
- Creates missing directories automatically.
- Detects domain flavors (e.g., routes vs general modules) to select appropriate testing patterns.

### Section 3: `## Run`

Instructs the harness on how to initiate the task:
- Passes the resolved target and mapped destination to the bound agent.
- Explicitly states that conventions, test runners, and assertions are owned by the relevant **domain instructions**, warning the agent not to restate or override them.
- Mandates verifying the outcome using the **narrowest project command**.

---

## Annotated Reference Example

```markdown
---
name: node-unit-tests
description: "Generate or update a Jest unit test file for a Node.js module (services, utils, controllers, middlewares). Use when the user wants isolated unit tests for an open file, a selection, or a src/ path."
agent: Unit Tester
argument-hint: "optional src path, e.g. src/services/user.service.js"
---

Slash command for the **Unit Tester** agent on one Node.js `src/` module.

## Resolve the target

Use the first that is a source module:

1. A `src/**/*.js` path in this message
2. The current selection
3. The currently open file

If none of those is source under `src/`, ask which file to test. Do not guess.

If the source is under `src/routes/`, use `/node-api-tests` instead (or hand off to **API Tester** following `node-api-tests.instructions.md`).

Map `src/<path>/<file>.js` → `tests/<path>/<file>.test.js` (create missing directories). Follow the **Unit tests** section of the installed Node.js unit-test instructions. Path layout, runner, and execution are owned by those instructions — follow them; do not restate or override them.

## Run

Hand the resolved source and mapped test path to Unit Tester. Verify with the **narrowest** project test command, executed per the installed Node.js unit-test instructions.
```
