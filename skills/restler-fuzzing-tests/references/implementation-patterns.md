# RESTler Fuzzing Scaffolding Examples

These examples provide file shapes only. The installed `restler-fuzzing-tests` instruction is authoritative for behavior and quality rules. Replace angle-bracket placeholders with values established from the target repository.

## Suggested Files

```text
.github/workflows/restler.yml
docker/docker-compose.restler.yml
docker/restler/
  Dockerfile
  entrypoint.sh
  auth/
    refresh-token.sh
  config/
    .gitkeep            # engine_settings.json override goes here if needed
scripts/run-restler.sh
tests/restler/
  results/              # gitignored
```

## Dockerfile Shape

```dockerfile
# Extracts architecture-independent managed binaries and Python engine from the
# upstream image, and runs them on a native runtime to avoid emulation crashes
# on non-amd64 hosts.
FROM --platform=linux/amd64 mcr.microsoft.com/restlerfuzzer/restler:<pinned-version> AS upstream

FROM <native-runtime-base-image>

ARG UID=1000
ARG GID=1000

RUN <install-python3-and-deps>

RUN <create-unprivileged-user-matching-UID-GID>

COPY --from=upstream /RESTler /RESTler
RUN chmod -R a+rX /RESTler

ENV DOTNET_ROLL_FORWARD=Major \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true

RUN printf '#!/bin/sh\nexec dotnet /RESTler/restler/Restler.dll "$@"\n' > /usr/local/bin/restler && \
    chmod +x /usr/local/bin/restler

USER user
WORKDIR /work
```

Verify the exact binary path inside the pinned upstream image before hardcoding it; RESTler's internal layout has shifted across releases. Fall back to locating a `restler` executable or `Restler.dll` at container start if the path is not stable.

## Entrypoint Shape

```sh
#!/bin/sh
# Compiles the mounted OpenAPI spec into a RESTler grammar, then runs the
# requested task (test | fuzz-lean | fuzz) against the target service through
# its gateway, authenticating via the mounted token-refresh script.
set -e

MODE="${RESTLER_MODE:-test}"
SPEC="/opt/restler/spec/<service>.openapi.json"
WORK_DIR="/work"
COMPILE_DIR="${WORK_DIR}/Compile"
CUSTOM_SETTINGS="/opt/restler/config/engine_settings.json"

case "$MODE" in
  test|fuzz-lean|fuzz) ;;
  *) echo "Unknown RESTLER_MODE: $MODE (expected test|fuzz-lean|fuzz)" >&2; exit 1 ;;
esac

# Resolve the restler command: prefer PATH, then a discovered executable or
# Restler.dll under the extracted /RESTler tree, invoked via `dotnet` if needed.

cd "$WORK_DIR"

echo "== RESTler compile =="
$RESTLER_CMD compile --api_spec "$SPEC"

SETTINGS_ARGS=""
[ -f "$CUSTOM_SETTINGS" ] && SETTINGS_ARGS="--settings $CUSTOM_SETTINGS"

echo "== RESTler ${MODE} =="
set +e
$RESTLER_CMD "$MODE" \
  --grammar_file "${COMPILE_DIR}/grammar.py" \
  --dictionary_file "${COMPILE_DIR}/dict.json" \
  $SETTINGS_ARGS \
  --target_ip "$RESTLER_TARGET_HOST" \
  --target_port "${RESTLER_TARGET_PORT:-80}" \
  --no_ssl \
  --token_refresh_command /opt/restler/auth/refresh-token.sh \
  --token_refresh_interval <seconds-below-token-lifetime> \
  $( [ "$MODE" = "fuzz" ] && printf -- '--time_budget %s' "${RESTLER_TIME_BUDGET:-1}" )
RESTLER_EXIT=$?
set -e

# Inspect bug_buckets.txt and speccov.json under $WORK_DIR to decide the
# final exit code per the installed instruction's gating rules.
exit $RESTLER_EXIT
```

## Token-Refresh Auth Shape

```sh
#!/bin/sh
# Logs in as $RESTLER_PERSONA (an example credential in the mounted OpenAPI
# spec, or another discovered fixture source) and prints the header RESTler
# injects into every fuzzed request via --token_refresh_command.
set -e

SPEC_FILE="${RESTLER_SPEC_FILE:-/opt/restler/spec/<service>.openapi.json}"
TARGET_HOST="${RESTLER_TARGET_HOST:?RESTLER_TARGET_HOST not set}"
TARGET_PORT="${RESTLER_TARGET_PORT:-80}"
PERSONA="${RESTLER_PERSONA:-<least-privileged-full-coverage-persona>}"

TOKEN=$(python3 - "$SPEC_FILE" "$TARGET_HOST" "$TARGET_PORT" "$PERSONA" <<'PY'
import json, sys, urllib.request

spec_file, host, port, persona = sys.argv[1:5]
with open(spec_file) as f:
    spec = json.load(f)
examples = spec["components"]["schemas"]["<credential-schema>"]["examples"]
value = examples[persona]["value"]
body = json.dumps({"<email-field>": value["<email-field>"], "<password-field>": value["<password-field>"]}).encode()

req = urllib.request.Request(
    f"http://{host}:{port}/<login-route>",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    data = json.load(resp)
print(data["<token-field>"])
PY
)

echo "{}"
echo "<Header-Name>: <token-prefix>${TOKEN}"
```

RESTler's `token_refresh_cmd` contract expects a metadata line followed by one `<header-name>: <value>` line per app; adapt the header name and token prefix to the discovered auth scheme (bearer, cookie, custom header).

## Compose Shape

```yaml
name: ${APP_NAME}-restler

# Joins the network created by the main stack's Compose file, so the main dev
# stack must already be up and healthy — see scripts/run-restler.sh.
services:

  restler:
    build:
      context: ../
      dockerfile: docker/restler/Dockerfile
      args:
        UID: ${UID:-1000}
        GID: ${GID:-1000}
    image: ${APP_NAME}-restler:${ENV_NAME}
    container_name: ${APP_NAME}-restler-${ENV_NAME}
    hostname: ${APP_NAME}-restler-${ENV_NAME}
    user: "${UID}:${GID}"
    entrypoint: ["/bin/sh", "/opt/restler/entrypoint.sh"]
    working_dir: /work
    environment:
      RESTLER_MODE: ${RESTLER_MODE:-test}
      RESTLER_TARGET_HOST: ${TRAEFIK_HOST}
      RESTLER_TARGET_PORT: "80"
      RESTLER_PERSONA: ${RESTLER_PERSONA:-<default-persona>}
      RESTLER_TIME_BUDGET: ${RESTLER_TIME_BUDGET:-1}
      RESTLER_MIN_COVERAGE: ${RESTLER_MIN_COVERAGE:-50}
      RESTLER_FAIL_ON_BUGS: ${RESTLER_FAIL_ON_BUGS:-true}
    volumes:
      - ${PWD}/docker/restler/auth:/opt/restler/auth:ro
      - ${PWD}/docker/restler/config:/opt/restler/config:ro
      - ${PWD}/docker/restler/entrypoint.sh:/opt/restler/entrypoint.sh:ro
      - ${PWD}/<spec-path>:/opt/restler/spec/<service>.openapi.json:ro
      - ${PWD}/tests/restler/results:/work
    networks:
      - internal

networks:
  internal:
    name: ${APP_NAME}-internal-${ENV_NAME}
    external: true
```

## Runner Shape

```bash
#!/bin/bash
# Usage: ./scripts/run-restler.sh [test|fuzz-lean|fuzz] [--no-reset] [--reset-db]
set -e

MODE="test"
NO_RESET=false

for arg in "$@"; do
  case "$arg" in
    test|fuzz-lean|fuzz) MODE="$arg" ;;
    --no-reset) NO_RESET=true ;;
  esac
done

# Verify the dev stack is running and healthy.
# Ensure any seeded credentials referenced by the auth script exist in the spec.

mkdir -p tests/restler/results

set +e
RESTLER_MODE="$MODE" docker compose -f docker/docker-compose.restler.yml --env-file "$ENV_FILE" \
  up --build --abort-on-container-exit --exit-code-from restler
RESTLER_EXIT=$?
set -e
docker compose -f docker/docker-compose.restler.yml --env-file "$ENV_FILE" down

# Locally (not in CI) and unless --no-reset was passed, reset fixtures/database
# to clean up mutated rows from fuzzing while leaving the stack running.
if [[ -z "${CI:-}" ]] && [[ "$NO_RESET" != true ]]; then
  ./scripts/reset-db.sh
fi

# Surface runSummary.json, speccov.json, coverage_failures_to_investigate.txt,
# and bug_buckets.txt paths from tests/restler/results/ for quick inspection.
exit $RESTLER_EXIT
```

## Workflow Shape

```yaml
name: RESTler API Fuzzing

on:
  workflow_dispatch:
    inputs:
      mode:
        description: RESTler task to run
        type: choice
        options: [test, fuzz-lean, fuzz]
        default: test
  pull_request:
    branches: [main]
    paths:
      - '<spec-path>/**'
      - '<routes-path>/**'
      - '<entities-path>/**'
      - 'docker/docker-compose.restler.yml'
      - 'docker/restler/**'
      - '.github/workflows/restler.yml'
  schedule:
    - cron: '<weekly-schedule-offset-from-other-jobs>'

concurrency:
  group: restler-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  restler:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      # Resolve mode: dispatch input, "fuzz-lean" on schedule, "test" on PR.
      # Configure env and start the target stack.
      - name: Run RESTler
        run: ./scripts/run-restler.sh ${{ steps.mode.outputs.mode }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: restler-results-${{ steps.mode.outputs.mode }}
          path: tests/restler/results/
          retention-days: <days>
      # Dump stack logs on failure and always stop the stack.
```

## Report Artifact Shapes

- `tests/restler/results/<Mode>/ResponseBuckets/runSummary.json` — executed requests, status code breakdown, error buckets, total bug count.
- `tests/restler/results/<Mode>/RestlerResults/experiment*/logs/speccov.json` — per-path/method/parameter spec coverage; summarized in `testing_summary.json`.
- `tests/restler/results/<Mode>/coverage_failures_to_investigate.txt` — failing requests sorted by blocked-dependency count, with payloads and responses.
- `tests/restler/results/<Mode>/RestlerResults/experiment*/logs/bug_buckets.txt` — distinct bugs grouped by hash with reproduction sequences (absent or empty when no bugs found).
- `tests/restler/results/<Mode>/RestlerResults/experiment*/logs/network.testing.*.txt` — full raw HTTP trace.
- `tests/restler/results/Compile/` — compiled `grammar.py`, `dict.json`, `dependencies.json`.
