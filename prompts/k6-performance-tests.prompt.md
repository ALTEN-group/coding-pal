---
name: k6-performance-tests
description: "Scaffold, adapt, or extend a Dockerized k6 API performance-test suite for a named service."
agent: K6 Performance Tester
argument-hint: "service root and optional scenario, e.g. services/my-api login"
---

Slash command for the **K6 Performance Tester** agent.

## Resolve The Target

Use the first argument as the service root. Treat any remaining argument as an optional scenario to add or update.

If no service root is named and the current workspace contains more than one service, ask which service to target. Do not infer it from another service's implementation.

## Run

Hand the resolved service root and optional scenario to K6 Performance Tester. Implement the complete suite when no scenario is specified. The installed k6 instruction owns standards, and the installed `k6-performance-examples` skill owns reusable implementation patterns; do not restate them here.
