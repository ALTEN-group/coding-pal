---
name: performance-tests
description: "Design, scaffold, adapt, or extend a performance-test suite for a named service or application."
agent: Performance Tester
argument-hint: "application root and optional scenario, e.g. services/my-api login"
---

Slash command for the **Performance Tester** agent.

## Resolve The Target

Use the first argument as the application root. Treat any remaining argument as an optional scenario to add or update.

If no application root is named and the current workspace contains more than one target, ask which target to test. Do not infer it from another application's implementation.

## Run

Hand the resolved application root and optional scenario to Performance Tester. Implement the complete suite when no scenario is specified. Select the applicable tool-specific instruction and skill; the current k6 implementation uses `k6-performance-tests` and `k6-performance-examples`.