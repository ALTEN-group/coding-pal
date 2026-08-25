---
description: "Unit testing conventions for Angular admin specs: colocated src/**/*.spec.ts, Vitest globals, TestBed, and HttpTestingController."
applyTo: "**/src/**/*.spec.ts"
---

# Angular Unit Testing Instructions

How the admin app is structured is owned by the installed Angular admin instructions. This file owns **unit** specs under `src/` only. Playwright under `e2e/` is owned by the installed Angular e2e instructions.

## Path convention

- Colocate with source: `<name>.ts` → `<name>.spec.ts` in the same folder.
- `tsconfig.spec.json` includes `src/**/*.spec.ts`. Do not put unit specs under `e2e/` or a parallel `tests/` tree.

## Tools (match Gatelin admin)

- Runner: **Vitest** via Angular `ng test` (`@angular/build:unit-test`, `runnerConfig: vitest.config.ts`).
- Scripts: `npm test` → `ng test`; CI/coverage → `npm run test:ci` or `npm run test:coverage` (`ng test --no-watch --coverage`).
- Assertions and spies: Vitest **globals** (`describe`, `it`, `expect`, `beforeEach`, `vi`). Do not import `vitest`. Use `vi.fn()` (not `jest.fn()`). Do not add Karma or Jasmine.
- `tsconfig.spec.json` `types` include `"vitest/globals"` (and `@angular/localize` when the app uses `$localize`).

## TestBed

- Services, guards, interceptors, pipes: `TestBed.configureTestingModule` and `TestBed.inject`.
- HTTP: `provideHttpClient` + `provideHttpClientTesting` and `HttpTestingController`. Never hit a live API.
- Guards that are functional: `TestBed.runInInjectionContext`.
- Provide stubs with `useValue` and `vi.fn()`; reset in `beforeEach`.

## What to test

- Prefer services, interceptors, guards, validators, and field/ACL helpers.
- Keep feature-component specs thin. Do not re-test crud-builder / PrimeNG / Optimus internals.

## Execution

- Run `ng test` (or the project `test` script) with the **narrowest** file filter that covers the spec you changed.
- If the admin app runs in Docker, execute that script in the **admin** container.
