---
description: "Playwright end-to-end conventions for the Angular admin app: e2e/ specs, stack baseURL, shared login helpers, in-app navigation."
applyTo: "**/e2e/**/*.ts"
---

# Angular E2E Testing Instructions

How the admin app is structured is owned by the installed Angular admin instructions. Unit specs are owned by the Angular unit-test instructions (Vitest). This file owns **Playwright** tests under `e2e/` only.

## Path convention

- Specs: `e2e/<area>.spec.ts`.
- Shared helpers: `e2e/helpers/` (login, credentials, navigation). Do not duplicate login or sidenav clicks in every spec.
- Do not put Playwright tests next to `src/` as `*.spec.ts` — those files are Vitest.

## Tools (match Gatelin admin)

- Runner: **Playwright** (`@playwright/test`). Import `test` and `expect` from `@playwright/test` (not Vitest globals, not `vi`).
- Config: existing `playwright.config.ts` (`testDir: ./e2e`, Chromium, `baseURL`).
- Scripts: `npm run e2e` → `playwright test`; UI mode `e2e:ui`; browsers `e2e:install`.
- Do not add Cypress, Protractor, or a second Playwright project unless the repo already has one.

## Stack and base URL

- Admin is served from the Docker/Traefik stack. Start that stack before e2e (project `start-dev` / compose), unless `playwright.config.ts` starts the app itself.
- `baseURL` comes from `E2E_BASE_URL` or the config default. Keep a trailing slash. Do not hardcode a host in spec files.

## Auth and navigation

- Log in through a shared helper (e.g. `loginAs`). Credentials from `E2E_EMAIL` / `E2E_PASSWORD` or the project's existing fixture — never commit passwords.
- Prefer **in-app sidenav navigation** for authenticated routes. Avoid `page.goto` per entity: a full reload re-runs token refresh and can hit `/sessions` rate limits.
- Wait on the login HTTP response when submitting the form; fail clearly on non-OK (including 429).

## What to assert

- User-visible chrome: login form, toolbar titles, ACL-gated pages, not-found.
- Use roles and labels (`getByRole`, `getByText`) where stable; locators for app-specific ids (`#emailInput`, `#table-toolbar`) when that is what the DOM uses.
- Do not assert PrimeNG/crud-builder internals. One login per describe when several pages share a session.

## Execution

- Run `npx playwright test` (or `npm run e2e`) with the **narrowest** file filter for the spec you changed.
- Run from the admin app directory against the stack `baseURL`, not a random host URL.
