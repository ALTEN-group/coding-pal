---
description: "Unit testing conventions and formatting rules for Node.js / Jest test files."
applyTo: "tests/**/*.js"
---

# Node.js Unit Testing Instructions

## Environment & Docblocks

- Start all unit test files with the `/** @jest-environment node */` docblock at top of the file.

## Module System & Imports

- Use native ES Module syntax (`import` / `export`).
- All relative imports **MUST** explicitly include the `.js` file extension (e.g. `import { myFunction } from "../../src/utils/myUtils.js";`).

## Path convention

- Source at `src/<path>/<filename>.js` → test at `tests/<path>/<filename>.test.js`.
- Mirror the `src/` folder structure under `tests/`; do not invent a parallel layout.

## Framework & Stack

- Use **Jest** (`describe`, `it`, `expect`, `jest.fn()`, `jest.spyOn()`) for middlewares and functions.
- Use **Supertest** (`supertest(app)`) for Express routes — import the side-effect-free `src/app.js`, not `src/server.js`.

## Execution

- Services run in Docker. Run tests in the service container (same as `npm test` / project test script), not against a host-only Node that lacks service deps.

## Structure & Formatting

- Group tests into logical `describe` blocks corresponding to exported functions, classes, or routes.
- Write clear, intent-revealing descriptions using `it("should ...")`.
- Keep assertions specific — prefer `toEqual()` / `toStrictEqual()` over loose assertions.

## Isolation & Mocking

- Mock all external dependencies, network calls, and database operations.
- Maintain clean state before each test (`beforeEach` with `jest.clearAllMocks()` or `jest.resetAllMocks()`).
- Never perform real network I/O or live database connections in unit tests.
