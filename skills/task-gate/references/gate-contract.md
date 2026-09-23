# Task Gate Specification Contract

A **Gate** is an executable verification pipeline that certifies whether an agent's work satisfies falsifiable completion criteria before declaring "done".

## Gate Configuration Schema

A gate can be declared as a JSON file or passed dynamically via CLI flags.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "name": "service-verification",
  "failFast": true,
  "stages": [
    {
      "name": "syntax_and_lint",
      "command": "npm run lint"
    },
    {
      "name": "type_check",
      "command": "npx tsc --noEmit"
    },
    {
      "name": "narrowest_test",
      "command": "npm test -- tests/auth.test.js"
    }
  ]
}
```

## CLI Usage

```bash
# Run from a configuration file
node scripts/task-gate.mjs --config gate.json

# Run ad-hoc stages
node scripts/task-gate.mjs --stage "lint:npm run lint" --stage "tests:npm test"

# Output structured JSON diagnostics for agent self-repair
node scripts/task-gate.mjs --config gate.json --json
```

## Exit Codes

| Exit Code | Meaning | Agent Action |
|---|---|---|
| `0` | All gate stages passed | Task completion certified. Proceed to commit or hand-off. |
| `1` | One or more gate stages failed | Ingest structured diagnostics, inspect failed stage, self-repair. |
| `2` | Configuration / execution error | Fix gate parameters or check environment prerequisites. |

## Diagnostic Envelope (`--json`)

When a stage fails, the gate emits structured diagnostics so the agent context receives targeted feedback rather than unparsed log dumps:

```json
{
  "ok": false,
  "name": "service-verification",
  "durationMs": 412,
  "failedStage": {
    "name": "narrowest_test",
    "command": "npm test -- tests/auth.test.js",
    "exitCode": 1,
    "errorSnippet": "AssertionError: expected 401 to equal 200 at tests/auth.test.js:34"
  },
  "stages": [
    { "name": "syntax_and_lint", "status": "passed", "durationMs": 120 },
    { "name": "narrowest_test", "status": "failed", "durationMs": 292 }
  ]
}
```
