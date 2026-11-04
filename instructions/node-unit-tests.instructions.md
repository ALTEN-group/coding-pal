---
description: "Conventions for Node.js module unit tests under tests/: isolated unit tests for services, utils, controllers, and middlewares with mocked collaborators."
applyTo: "tests/**/*.{js,mjs,ts}"
---

# Node.js Unit Testing Instructions

How the service is structured is owned by the installed Node.js Express instructions. This file owns module unit test files under `tests/` (excluding HTTP route tests, which are owned by `node-api-tests.instructions.md`).

## Shared Conventions

- Use the test runner configured in `package.json` (`node --test`, Vitest, or Jest). When the project uses Jest, start every test file with the `/** @jest-environment node */` docblock.
- Use native ESM (`import` / `export`). Relative imports **MUST** include the file extension (`.js` / `.mjs`).
- Source at `src/<path>/<filename>.js` → test at `tests/<path>/<filename>.test.js`. Mirror `src/`; do not invent a parallel layout.
- Run tests via the project's test script (`npm test`), not against an unconfigured environment that lacks project dependencies.
- Exclude `src/server.js` (not `src/app.js`) from coverage collection.
- Group tests in `describe` blocks (or `test` blocks in `node:test`). Prefer strict equality assertions (`toEqual()` / `toStrictEqual()` or `assert.deepStrictEqual()` / `assert.strictEqual()`).
- Never perform real network I/O or live database connections.
- Reset mocks before each test (`jest.clearAllMocks()`, `vi.clearAllMocks()`, or `mock.reset()`).
- **Acceptance-criteria traceability**: when the plan lists acceptance criteria (`AC-<n>`), include the criterion id in the test name or title, for example `it('AC-2: rejects viewers', ...)`, so Criteria Test Verification can map results to criteria.

## Scope & Routing Distinction

- `src/routes/**` (and matching `tests/routes/**`) → **HTTP API tests**. Governed by `node-api-tests.instructions.md` using Supertest.
- Every other `src/` module (services, utils, middlewares, entities, jobs, controllers) → **Unit tests**. Governed by this instruction.
- Do not mix styles in one file. Do not use Supertest outside `tests/routes/`. Do not test a router by importing its exports and calling them as functions.

## Unit Test Conventions

Apply to utils, services, middlewares, entities, jobs, controllers, and other non-route modules.

- Use the project's unit test runner (`node:test`, Vitest, or Jest) without importing `supertest` or `src/app.js`.
- Import the module under test and call its exports directly.
- Mock that module's external collaborators (other services, DB helpers, outbound HTTP, clocks). Do not mock the function you are asserting on.
- Assert return values, thrown errors, and calls into mocked collaborators.
- Validate all branching conditions: happy paths, empty arrays, null/undefined inputs, boundary numbers, and expected thrown errors.

