---
description: "Supertest HTTP API route test conventions for Express services under tests/routes/: endpoint contracts, request/response assertions, status codes, and boundary mocking."
applyTo: "tests/routes/**/*.js,tests/api/**/*.js"
---

# Node.js HTTP API Testing Instructions

How the service is structured is owned by the installed Node.js Express instructions. This file owns Supertest HTTP API test files under `tests/routes/` and `tests/api/`.

## Shared Conventions

- Start every test file with the `/** @jest-environment node */` docblock.
- Use native ESM (`import` / `export`). Relative imports **MUST** include the `.js` extension.
- Source at `src/routes/<resource>.js` → test at `tests/routes/<resource>.test.js`. Mirror `src/routes/`; do not invent a parallel layout.
- Run tests in the service container (same as `npm test` / project test script), not against a host-only Node that lacks service dependencies.
- Group tests in `describe` blocks per endpoint (`describe("POST /api/<resource>/search", ...)`). Use `it("should ...")`.
- Reset mocks in `beforeEach` (`jest.clearAllMocks()` or `jest.resetAllMocks()`).
- Never perform real network I/O or live database connections.

## HTTP API Route Test Conventions

- **Use Supertest**: Drive endpoints with `supertest(app)` plus Jest assertions.
- **Import App, Not Server**: Import `src/app.js` (the assembled Express app, no `listen()`), never `src/server.js`.
- **Drive the Full Stack**: Test complete request flows over HTTP (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`). Do not invoke route handlers or middlewares directly as JS functions.
- **Assert Envelopes & Headers**:
  - Assert HTTP status code (`expect(res.status).toBe(...)`).
  - Assert Content-Type (`expect(res.headers["content-type"]).toMatch(/json/)`).
  - Assert JSON response body envelopes: `{ data }` on success, `{ error }` on failures.
- **Route Conventions**:
  - `POST /search` for query operations.
  - `POST /archive` for soft deletion.
  - `DELETE /` for administrative or hard deletion.
- **Boundary Mocking**:
  - Mock database operations (`@dwtechs/antity-pgsql` or repository helpers) and external HTTP clients (`middlewares/http/`) at the boundary.
  - **Do NOT** mock the router module itself, `src/app.js`, or middlewares wired directly into the route (e.g. validators, mappers, security headers).
- **Coverage Contract**:
  - Cover happy paths (200 / 201 / 204).
  - Cover validation failures (400 responses with invalid payloads).
  - Cover authentication and ACL permission denials (401 / 403).
  - Cover resource not found (404) and upstream/boundary errors (500 error envelope).
