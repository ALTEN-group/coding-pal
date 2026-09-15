---
name: restler-fuzzing-tests
description: "Scaffold, adapt, or extend a Dockerized RESTler API fuzzing suite for a named service."
agent: RESTler Fuzz Tester
argument-hint: "service root and optional mode, e.g. services/my-api fuzz-lean"
---

Slash command for the **RESTler Fuzz Tester** agent.

## Resolve The Target

Use the first argument as the service root. Treat any remaining argument as an optional RESTler mode (`test`, `fuzz-lean`, `fuzz`) to scaffold or verify.

If no service root is named and the current workspace contains more than one service, ask which service to target. Do not infer it from another service's implementation.

## Run

Hand the resolved service root and optional mode to RESTler Fuzz Tester. Implement the complete suite (Dockerfile, entrypoint, auth script, Compose, runner, workflow) when no mode is specified. The installed RESTler fuzzing instruction owns standards, and the installed `restler-fuzzing-examples` skill owns reusable implementation patterns; do not restate them here.
