---
description: "Jest conventions for Node.js Express module unit tests under tests/: isolated unit tests for services, utils, controllers, and middlewares with mocked collaborators."
applyTo: "tests/**/*.js"
---

# Node.js Unit Testing Instructions

How the service is structured is owned by the installed Node.js Express instructions. This file owns Jest module unit test files under `tests/` (excluding HTTP route tests, which are owned by `node-api-tests.instructions.md`).

## Shared Conventions

- Start every test file with the `/** @jest-environment node */` docblock.
- Use native ESM (`import` / `export`). Relative imports **MUST** include the `.js` extension.
- Source at `src/<path>/<filename>.js` → test at `tests/<path>/<filename>.test.js`. Mirror `src/`; do not invent a parallel layout.
- Run tests in the service container (same as `npm test` / project test script), not against a host-only Node that lacks service deps.
- Exclude `src/server.js` (not `src/app.js`) from Jest `collectCoverageFrom`.
- Group tests in `describe` blocks. Use `it("should ...")`. Prefer `toEqual()` / `toStrictEqual()` over loose assertions.
- Never perform real network I/O or live database connections.
- Reset mocks in `beforeEach` (`jest.clearAllMocks()` or `jest.resetAllMocks()`).

## Scope & Routing Distinction

- `src/routes/**` (and matching `tests/routes/**`) → **HTTP API tests**. Governed by `node-api-tests.instructions.md` using Supertest.
- Every other `src/` module (services, utils, middlewares, entities, jobs, controllers) → **Unit tests**. Governed by this instruction using Jest.
- Do not mix styles in one file. Do not use Supertest outside `tests/routes/`. Do not test a router by importing its exports and calling them as functions.

## Unit Test Conventions

Apply to utils, services, middlewares, entities, jobs, controllers, and other non-route modules.

- Use **Jest** only (`describe`, `it`, `expect`, `jest.fn()`, `jest.spyOn()`). Do not import `supertest` or `src/app.js`.
- Import the module under test and call its exports directly.
- Mock that module's external collaborators (other services, DB helpers, outbound HTTP, clocks). Do not mock the function you are asserting on.
- Assert return values, thrown errors, and calls into mocked collaborators.
- Validate all branching conditions: happy paths, empty arrays, null/undefined inputs, boundary numbers, and expected thrown errors.

