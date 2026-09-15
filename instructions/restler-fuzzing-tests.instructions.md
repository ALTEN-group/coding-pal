---
description: "RESTler API fuzzing conventions: spec-driven grammar compilation, authentication, Docker execution, reports, and CI gating."
applyTo: "**/tests/restler/**,**/docker/docker-compose.restler.yml,**/docker/restler/**,**/scripts/run-restler.sh,**/.github/workflows/restler.yml"
---

# RESTler Fuzzing Test Instructions

This instruction owns [RESTler](https://github.com/microsoft/restler-fuzzer) API fuzzing suites for containerized services with an OpenAPI/Swagger spec. Use the installed `restler-fuzzing-examples` skill for implementation patterns and scaffolding shapes.

## Architecture

- Drive RESTler entirely from the service's existing OpenAPI/Swagger document. Do not hand-write a grammar; let RESTler compile the spec into `grammar.py`, `dict.json`, and `dependencies.json` at run time.
- Run RESTler from a container joined to the running stack's internal Docker network. Exercise the same gateway route (e.g. reverse proxy) used by real clients; do not bypass it with a host-only shortcut.
- Package the fuzzer in a dedicated Dockerfile that extracts the architecture-independent managed binaries and Python engine from the upstream `mcr.microsoft.com/restlerfuzzer/restler` image and runs them on a native runtime matching the host toolchain, to avoid emulation crashes on non-amd64 hosts.
- Provide `scripts/run-restler.sh` as the local and CI entry point, accepting a mode argument (`test`, `fuzz-lean`, `fuzz`). It must verify the target service is healthy, run RESTler compile followed by the requested task, preserve RESTler's exit code, and write results to the host.
- Keep target host, network name, credential source, and cleanup commands derived from the target repository. Do not copy identifiers from another service.

## Test Modes

- **test** (default): smoketest — verifies every endpoint can be reached at least once. Safe to run on every relevant pull request.
- **fuzz-lean**: fuzzes each endpoint once with the default checkers. Suitable for a scheduled run (e.g. weekly), offset from other scheduled jobs.
- **fuzz**: full fuzzing run bounded by a time budget (hours), configurable via an environment variable with a small conservative default (e.g. 1 hour). Reserve for manual dispatch or long-lived branches.

## Authentication

- Authenticate through RESTler's `--token_refresh_command` mechanism: a script that logs in as a configured persona and prints the header RESTler injects into every fuzzed request, followed by a refresh interval shorter than the token's lifetime.
- Resolve persona credentials from the service's existing seeded fixtures or spec examples (e.g. named example payloads on the user/account schema). Do not hardcode credentials in the refresh script; read them from the mounted spec or environment at run time.
- Match the service's real login route, request body, and token field. Do not infer an auth contract from another service.
- Default to the least-privileged persona that still exercises the full endpoint surface, and allow overriding the persona via an environment variable for targeted runs.

## Data Safety

- Treat fuzzing as destructive: RESTler sends bulk-update, delete, and garbage-value mutations to every discovered endpoint. Never point a run at a shared or production-like database.
- After a local run, reset the database or fixtures to a clean state automatically, unless the caller explicitly opts out (e.g. a `--no-reset` flag) to inspect mutated data.
- In CI, skip the intermediate reset and instead tear down the entire stack in an always-run step at the end of the job.

## Reports And Gating

- Write all artifacts to an ignored results directory (e.g. `tests/restler/results/`) and upload them as a CI artifact even on failure.
- Gate the run on two independent signals: spec coverage percentage (fail below a configurable minimum) and reported bugs (5xx responses or checker violations, from the bug-buckets report). Make both gates independently toggleable through environment variables, and be explicit in code/comments about which gates are actually enforced versus only logged.
- Preserve RESTler's own process exit code as the primary failure signal; only add a stricter local check on top of it (e.g. failing when bugs were found even if RESTler exited zero).

## CI And Validation

- Support manual dispatch with a mode selector, a pull-request trigger restricted to paths that affect the API surface (spec, routes, entities, and the RESTler Docker/workflow files themselves) running in `test` mode, and a scheduled `fuzz-lean` run offset from other scheduled jobs.
- Dump stack logs on failure and always stop the stack in a final step, matching the project's other Dockerized test workflows.
- Validate the compile step and a short `test`-mode run locally before relying on `fuzz-lean` or `fuzz` in CI. A suite is incomplete if compilation succeeds but no results, coverage, or bug-bucket files are produced.
