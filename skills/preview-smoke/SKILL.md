---
name: preview-smoke
description: 'Probe a running preview environment: wait for the application to answer, then assert status codes, JSON fields, and response times on a list of routes. Use in CI after the preview stack is started, before fuzz and end-to-end tests.'
license: MIT
---

# Preview Smoke

Deterministic Preview Smoke Tests probe. It proves the application starts, routes traffic, and answers health checks on the ephemeral preview, before slower probes run.

## When to Use This Skill

- CI started the application (for example with `docker compose up --wait`) and must confirm it is alive.
- A route list with expected status, JSON fields, and time limits must be checked against a preview URL.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`). If the skill was installed under `.agents/skills/preview-smoke/` or `.claude/skills/preview-smoke/`, use that base path.

## Workflow

1. **Read `references/preview-smoke-contract.md`** for the routes format, the retry rules, and the output.
2. Write `preview-routes.json` (without it, only `GET /health` is expected to answer 200):

```json
[
  { "path": "/health", "status": 200, "jsonPath": "status", "equals": "ok", "maxMs": 1000 },
  { "path": "/api/orders", "status": 200 }
]
```

3. Run the probe against the preview URL:

```bash
node scripts/preview-smoke.mjs --url http://localhost:3000 --routes preview-routes.json \
  --timeout-ms 5000 --retries 3 --retry-delay-ms 1000
```

4. Treat a nonzero exit as a failure. Read the per-route lines, fix the application, and run the probe again. Never loosen a route's assertions to get a pass.

## Done When

- `scripts/preview-smoke.mjs` exits with code 0 against the running preview.
- Every route in `preview-routes.json` passed its assertions, and none was removed or loosened to pass.
