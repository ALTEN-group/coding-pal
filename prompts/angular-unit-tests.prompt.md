---
name: angular-unit-tests
description: "Generate or update a Vitest Angular unit spec (src/**/*.spec.ts). Use when the user wants tests for an open admin file, a selection, or a src/app path."
agent: Unit Tester
argument-hint: "optional path, e.g. src/app/features/user/user.component.ts"
---

Slash command for the **Unit Tester** agent on one Angular `src/` module (Vitest unit spec, not Playwright e2e).

## Resolve the target

Use the first that is a source module (not `*.spec.ts`, not `e2e/`):

1. A `**/src/**/*.ts` path in this message
2. The current selection
3. The currently open file

If none of those is source under `src/`, ask which file to test. Do not guess.

Map `<name>.ts` → `<name>.spec.ts` in the same folder. Path layout, runner, and execution are owned by the installed Angular unit-test instructions — follow them; do not restate or override them.

## Run

Hand the resolved source and mapped spec path to Unit Tester. Verify with the **narrowest** project test command, executed per those instructions.
