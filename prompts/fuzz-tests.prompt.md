---
name: fuzz-tests
description: "Design, scaffold, adapt, or extend a fuzz-testing suite for a named service or application."
agent: Fuzz Tester
argument-hint: "application root and optional mode, e.g. services/my-api fuzz-lean"
---

Slash command for the **Fuzz Tester** agent.

## Resolve The Target

Use the first argument as the application root. Treat any remaining argument as an optional tool-specific mode to scaffold or verify.

If no application root is named and the current workspace contains more than one target, ask which target to test. Do not infer it from another application's implementation.

## Run

Hand the resolved application root and optional mode to Fuzz Tester. Implement the complete suite when no mode is specified. Select the applicable tool-specific instruction and skill; the current RESTler implementation uses `restler-fuzzing-tests` and `restler-fuzzing-examples`.