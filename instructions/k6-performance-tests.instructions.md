---
description: "K6 API performance-test conventions: scenarios, thresholds, authentication, Docker execution, reports, and CI benchmarks."
applyTo: "**/tests/perf/**/*.js,**/docker/docker-compose.perf.yml,**/scripts/run-perf.sh,**/.github/workflows/perf.yml"
---

# K6 Performance Test Instructions

This instruction owns k6 performance suites for containerized API services. Use the installed `k6-performance-examples` skill for implementation patterns and scaffolding shapes.

## Architecture

- Keep scenario code under `tests/perf/scripts/` and generated artifacts under ignored `tests/perf/results/`.
- Run k6 from a pinned `grafana/k6` container joined to the running stack's internal Docker network. Exercise the same Traefik route used by integrated clients; do not bypass the gateway with a host-only shortcut.
- Provide `scripts/run-perf.sh` as the local and CI entry point. It must verify the target service is healthy, run one named scenario or all scenarios, preserve each k6 exit code, and write HTML and JSON results to the host.
- Keep routes, Compose names, credential sources, and cleanup commands derived from the target repository. Do not copy identifiers from another service.

## Scenarios

- Cover three distinct costs when the service exposes them: an unauthenticated health baseline, the authentication lifecycle, and a representative authenticated business read flow.
- Put each scenario in its own file with `options`, thresholds, a default function, checks, stable request tags, and realistic pacing.
- Centralize the base URL, credentials, login helper, and authenticated headers in `common.js`.
- Read load shape and connection settings from `K6_*` environment variables with conservative local defaults. Never commit a password or token.
- Use `check` for expected response assertions. Throw only when setup cannot produce data required by the rest of the test, such as an access token.
- Remember that k6 `setup()` runs once per test and shares serialized data with all VUs. Use it only when a shared token is valid; authenticate in VU code when the service requires independent sessions.

## Thresholds And Metrics

- Gate every scenario on p95 request duration and request failure rate. Establish service-specific latency thresholds from repeatable baseline runs; do not copy values from another service.
- Tag requests by stable operation name so reports remain comparable when URLs contain parameters.
- Keep functional checks and threshold gates distinct: checks describe correctness, while thresholds determine the process exit status.
- Export `<scenario>.summary.json` and `<scenario>.report.html`. Convert summaries into a deterministic `benchmark.json` containing p95 latency in milliseconds and failure rate in percent for each scenario.

## Authentication And State

- Source credentials from the service's existing seeded fixtures or environment setup. Pass them to the container through `K6_EMAIL` and `K6_PWD` (or clearly documented service equivalents).
- Match the service's real login, bearer-token, cookie, CSRF, and logout behavior. Do not infer an auth contract from another service.
- Classify scenarios that create sessions or other records as stateful. Reset local fixtures after those runs unless the user opts out; let CI keep the stack until all scenarios finish and clean it up in an always-run step.

## CI And Validation

- Support manual and scheduled CI runs, upload raw reports even on failure, and publish benchmark history only from the intended long-lived branch.
- Use `benchmark-action/github-action-benchmark` with `customSmallerIsBetter` for the flattened benchmark file. Treat regression limits as policy and set them explicitly.
- Validate the narrowest scenario locally first, then run the summary converter and Compose configuration check. A suite is incomplete if thresholds pass but reports or benchmark data are missing.