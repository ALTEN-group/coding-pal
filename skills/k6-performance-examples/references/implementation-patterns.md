# K6 Performance-Test Scaffolding Examples

These examples provide file shapes only. The installed `k6-performance-tests` instruction is authoritative for behavior and quality rules. Replace angle-bracket placeholders with values established from the target repository.

## Suggested Files

```text
.github/workflows/perf.yml
docker/docker-compose.perf.yml
scripts/run-perf.sh
tests/perf/
  results/
  scripts/
    common.js
    health.js
    login.js
    authenticated-read.js
    to-benchmark.js
```

Rename or omit scenario files when the discovered API surface calls for a different split.

## Shared Module Shape

```js
import http from "k6/http";
import { check } from "k6";

const host = __ENV.K6_TARGET_HOST || "localhost";
const port = __ENV.K6_TARGET_PORT || "80";
const basePath = __ENV.K6_BASE_PATH || "/api";
const servicePath = __ENV.K6_SERVICE_PATH || "";

export const BASE_URL = `http://${host}:${port}${basePath}${servicePath}`;

export const CREDENTIALS = {
  email: __ENV.K6_EMAIL || "",
  pwd: __ENV.K6_PWD || "",
};

export function login() {
  const response = http.post(
    `${BASE_URL}/<session-route>`,
    JSON.stringify(CREDENTIALS),
    {
      headers: { "Content-Type": "application/json" },
      tags: { name: "login" },
    },
  );

  check(response, { "login succeeds": (result) => result.status === <status> });
  const accessToken = response.json("<token-field>");
  if (!accessToken) throw new Error(`login failed: status=${response.status}`);
  return accessToken;
}

export function authHeaders(accessToken) {
  return {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  };
}
```

Adapt the credential fields, session route, expected status, token location, and header scheme to the discovered authentication contract.

## Scenario Shape

```js
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL } from "./common.js";

export const options = {
  vus: Number(__ENV.K6_VUS) || <default-vus>,
  duration: __ENV.K6_DURATION || "<default-duration>",
  thresholds: {
    http_req_duration: ["p(95)<<p95-ms>"],
    http_req_failed: ["rate<<failure-ratio>"],
  },
};

export default function () {
  const response = http.get(`${BASE_URL}/<route>`, {
    tags: { name: "<operation>" },
  });
  check(response, { "<operation> succeeds": (result) => result.status === <status> });
  sleep(<pacing-seconds>);
}
```

An authenticated read scenario can acquire shared setup data with this shape when the instruction's shared-session condition is met:

```js
import { authHeaders, login } from "./common.js";

export function setup() {
  return { accessToken: login() };
}

export default function (data) {
  const params = authHeaders(data.accessToken);
  // Perform and check the discovered business requests with stable tags.
}
```

Implement cookie, CSRF, logout, and per-VU session handling from the target auth contract rather than extending this generic sample by assumption.

## Compose Shape

```yaml
name: ${APP_NAME}-perf

services:
  k6:
    image: grafana/k6:<pinned-version>
    container_name: ${APP_NAME}-k6-${ENV_NAME}
    hostname: ${APP_NAME}-k6-${ENV_NAME}
    entrypoint: ["k6"]
    working_dir: /scripts
    environment:
      K6_TARGET_HOST: ${TRAEFIK_HOST}
      K6_TARGET_PORT: "80"
      K6_BASE_PATH: ${K6_BASE_PATH:-/api}
      K6_SERVICE_PATH: ${K6_SERVICE_PATH:-}
      K6_VUS: ${K6_VUS:-10}
      K6_DURATION: ${K6_DURATION:-30s}
      K6_EMAIL: ${K6_EMAIL:-}
      K6_PWD: ${K6_PWD:-}
    volumes:
      - ${PWD}/tests/perf/scripts:/scripts:ro
      - ${PWD}/tests/perf/results:/results
    networks:
      - internal

networks:
  internal:
    name: ${APP_NAME}-internal-${ENV_NAME}
    external: true
```

## Runner Shape

```bash
SCENARIOS=()

# Parse <scenario>|all and reset flags.
# Verify the environment and target container health.
# Resolve runtime credentials for scenarios that need them.

OVERALL_EXIT=0
for SCENARIO in "${SCENARIOS[@]}"; do
  set +e
  docker compose -f "$PERF_COMPOSE" --env-file "$ENV_FILE" run --rm \
    -e K6_EMAIL -e K6_PWD \
    -e K6_WEB_DASHBOARD=true \
    -e K6_WEB_DASHBOARD_EXPORT="/results/${SCENARIO}.report.html" \
    k6 run --summary-export "/results/${SCENARIO}.summary.json" \
    "/scripts/${SCENARIO}.js"
  K6_EXIT=$?
  set -e
  [[ $K6_EXIT -ne 0 ]] && OVERALL_EXIT=$K6_EXIT
done

# Convert available summaries and perform repository-specific local cleanup.
exit $OVERALL_EXIT
```

## Benchmark Entry Shape

```json
[
  {
    "name": "<scenario>: http_req_duration p95",
    "unit": "ms",
    "value": 123.45
  },
  {
    "name": "<scenario>: http_req_failed rate",
    "unit": "%",
    "value": 0
  }
]
```

The converter reads values from either `summary.metrics.<metric>.values` or `summary.metrics.<metric>`, converts failure ratios to percentages, and keeps scenario order deterministic.

## Converter Shape

`tests/perf/scripts/to-benchmark.js`, invoked with Node against the results directory, turns every `*.summary.json` into the flattened `benchmark.json` consumed by `benchmark-action/github-action-benchmark`:

```js
const fs = require("fs");
const path = require("path");

const RESULTS_DIR = process.argv[2] || "tests/perf/results";

function metricValue(summary, metric, field) {
  const entry = summary.metrics?.[metric];
  if (!entry) return undefined;
  return entry.values ? entry.values[field] : entry[field];
}

const entries = fs
  .readdirSync(RESULTS_DIR)
  .filter((file) => file.endsWith(".summary.json"))
  .sort()
  .flatMap((file) => {
    const scenario = file.replace(".summary.json", "");
    const summary = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), "utf8"));
    const p95 = metricValue(summary, "http_req_duration", "p(95)");
    const failRate = metricValue(summary, "http_req_failed", "rate");
    return [
      { name: `${scenario}: http_req_duration p95`, unit: "ms", value: p95 ?? 0 },
      { name: `${scenario}: http_req_failed rate`, unit: "%", value: (failRate ?? 0) * 100 },
    ];
  });

fs.writeFileSync(path.join(RESULTS_DIR, "benchmark.json"), JSON.stringify(entries, null, 2));
```

Adapt the metric names and fields to whichever k6 metrics the instruction's thresholds actually gate, and fail loudly (non-zero exit) when no summary files are found rather than writing an empty benchmark.

## Workflow Shape

```yaml
name: Performance Tests

on:
  workflow_dispatch:
  schedule:
    - cron: '<schedule>'

concurrency:
  group: <benchmark-writer-group>
  cancel-in-progress: false

jobs:
  perf:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      # Configure and start the target stack.
      # Run each discovered scenario.
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: k6-results
          path: tests/perf/results/
          retention-days: <days>
      # Convert summaries before publishing the benchmark.
      - uses: benchmark-action/github-action-benchmark@v1
        if: always()
        with:
          tool: customSmallerIsBetter
          output-file-path: tests/perf/results/benchmark.json
          benchmark-data-dir-path: <history-path>
          gh-pages-branch: <history-branch>
          github-token: ${{ secrets.GITHUB_TOKEN }}
          auto-push: true
          alert-threshold: '<regression-threshold>'
          comment-on-alert: true
          fail-on-alert: true
      # Dump relevant logs on failure and always stop the stack.
```