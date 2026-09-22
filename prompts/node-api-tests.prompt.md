---
name: node-api-tests
description: "Generate or update a Supertest HTTP API test file for a Node.js Express route. Use when the user wants API endpoint tests for an open route file, a selection, or a src/routes path."
agent: API Tester
argument-hint: "optional route path, e.g. src/routes/application.js"
---

Slash command for the **API Tester** agent on one Node.js Express route module.

## Resolve the target

Use the first that is a route source module:

1. A `src/routes/**/*.js` path in this message
2. The current selection (if within a route file)
3. The currently open file (if under `src/routes/`)

If the target is a non-route module (e.g. `src/services/`, `src/utils/`), refer to `/node-unit-tests`. If no route file can be resolved, ask which route module to test. Do not guess.

Map `src/routes/<resource>.js` → `tests/routes/<resource>.test.js` (create missing directories). Follow the installed Node.js API testing instructions (`node-api-tests.instructions.md`). Test layout, runner, and execution conventions are owned by those instructions — follow them; do not restate or override them.

## Run

Hand the resolved route source and mapped test path to **API Tester**. Verify with the **narrowest** project test command inside the container (e.g. `npm test -- tests/routes/<resource>.test.js`).
