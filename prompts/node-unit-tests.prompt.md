---
name: node-unit-tests
description: "Generate or update a Jest + Supertest unit test file for a Node.js module. Use when the user wants tests for an open file, a selection, or a src/ path."
agent: Unit Tester
argument-hint: "optional src path, e.g. src/routes/application.js"
---

Slash command for the **Unit Tester** agent on one Node.js `src/` module.

## Resolve the target

Use the first that is a source module:

1. A `src/**/*.js` path in this message
2. The current selection
3. The currently open file

If none of those is source under `src/`, ask which file to test. Do not guess.

Map `src/<path>/<file>.js` → `tests/<path>/<file>.test.js` (create missing directories). Path layout, Jest/Supertest, and container execution are owned by the installed Node.js unit-test instructions — follow them; do not restate or override them.

## Run

Hand the resolved source and mapped test path to Unit Tester. Verify with the **narrowest** project test command, executed per the installed Node.js unit-test instructions.
