# Preview Smoke Contract

`preview-smoke.mjs` is the **Preview Smoke Tests** probe of the Prove stage. It makes plain HTTP `GET` requests to a running application, using the global `fetch` of Node 22. It has no dependencies.

---

## 1. Usage

```text
node preview-smoke.mjs --url <base> [--routes routes.json] [--timeout-ms 5000] [--retries 3] [--retry-delay-ms 1000]
```

| Flag | Meaning | Default |
|---|---|---|
| `--url` | Base URL of the preview (`http` or `https`) | required |
| `--routes` | Routes file | a single route: `/health` with status 200 |
| `--timeout-ms` | Time allowed for one request | 5000 |
| `--retries` | Extra attempts while the app is not answering | 3 (so up to 4 requests per route) |
| `--retry-delay-ms` | Wait between attempts | 1000 |

---

## 2. Routes File

A non-empty JSON array. Unknown keys are an error.

```json
[
  { "path": "/health", "status": 200, "jsonPath": "status", "equals": "ok", "maxMs": 1000 }
]
```

| Key | Required | Meaning |
|---|---|---|
| `path` | yes | Starts with `/`. Appended to `--url` |
| `status` | no | Expected HTTP status, default 200 |
| `jsonPath` | no | A field of the JSON body: `status`, `data.items[0].id`, or `data.items.0.id`. It must exist |
| `equals` | no | Expected value at `jsonPath` (strict, JSON comparison). Needs `jsonPath` |
| `maxMs` | no | Maximum response time in milliseconds |

Redirects are not followed, so a route can assert a `301` or `302`.

---

## 3. Retry Rules

Applications need a moment to start. The probe retries **only while the app is not answering**:

- a connection error or a timeout, or
- a `5xx` status that the route does not expect.

A `4xx`, or any response the route expects, is never retried. After the last attempt, the assertions are evaluated **once**, on the final response. A route that never answered fails with `app not answering`.

---

## 4. Output

One line per route, with the failures indented, then a summary. Exit 0 = every route passed, 1 = at least one failed or the input is invalid.

```text
PASS GET /health 200 14 ms
FAIL GET /api/orders 500 (4 attempts)
  - expected status 200, got 500
FAIL: 1/2 routes passed
```

---

## 5. Anti-Patterns

1. **No health check that only proves the process runs.** Route assertions should prove a dependency or a core route answers.
2. **No loosening to pass.** Removing a route, relaxing `equals`, or raising `maxMs` to make a failure go away is weakening a control.
3. **No production URL.** The probe runs against the ephemeral preview only.
