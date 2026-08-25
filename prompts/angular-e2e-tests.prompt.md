---
name: angular-e2e-tests
description: "Generate or update a Playwright e2e spec under e2e/ for the Angular admin app. Use when the user wants browser tests for a flow, page, or entity."
agent: Unit Tester
argument-hint: "optional flow, e.g. login or consumers table"
---

Slash command for the **Unit Tester** agent on one Angular admin **Playwright** flow (not Vitest `src/**/*.spec.ts`).

## Resolve the target

Use the first that names a user flow or page:

1. An `e2e/**/*.ts` path in this message
2. A route/entity/flow named in this message
3. The currently open `e2e/` file

If none of those is an e2e flow, ask which flow to cover. Do not guess. Do not write Playwright into `src/**/*.spec.ts`.

Map a new flow to `e2e/<area>.spec.ts`. Reuse `e2e/helpers/` for login and in-app navigation. Path layout, Playwright APIs, and stack `baseURL` are owned by the installed Angular e2e instructions — follow them; do not restate or override them.

## Run

Hand the resolved spec (and helpers if needed) to Unit Tester. Verify with the **narrowest** Playwright command, executed per those instructions.
