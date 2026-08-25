---
description: "Use when working on Node.js Express service. Covers file structure, coding conventions, library usage, flow, caching, error handling and security patterns."
applyTo: "src/**/*.js"
---

# Node.js / Express Coding Instructions

Services always run in Docker. Execute service commands in the container (`npm run lint`, `npm run build`, start/dev). How tests are run is owned by the installed Node.js unit-test instructions.

When scaffolding a resource or matching a full template, follow the installed `node-express-examples` skill (read its `references/examples.md`).

## Module System

- Use **ESM** (`import` / `export`) throughout.
- Start every file with `// @ts-check`.
- Use named exports for functions; use a default export object for service modules.

## Folder structure

Do not introduce folders outside this template:

```
src/
├── app.js                  ← Builds and exports the Express app (no bootstrap/listen)
├── server.js               ← Entry point: inits caches, cron jobs, then listen(app)
├── conf/                   ← Configuration middleware factories (CORS, security headers, …)
├── controllers/            ← Rare terminal handlers to use when they can own the full req/res lifecycle (e.g. proxy forward). Prefer mappers + res/ in most cases.
├── entities/               ← SQLEntity field-schema definitions for @dwtechs/antity-pgsql, one file per table
├── jobs/                   ← Scheduled/cron tasks
├── middlewares/
│   ├── cache/              ← Access in-memory service caches
│   ├── filters/            ← Add filter objects for next requests
│   ├── http/               ← Outbound HTTP calls to other services
│   ├── mappers/            ← Data-transformation middlewares (shape/enrich req or res data)
│   ├── res/                ← Terminal response middlewares (send JSON, 204, cookies, …)
│   ├── validators/         ← Guards for data validation
│   ├── history.js          ← GET /:id/history factory (`history.get("resourceName")`)
│   └── schema.js           ← GET /schema factory (`schema.get(rEnt)`)
├── routes/                 ← One express.Router() per resource — wiring only, no logic
├── services/               ← In-memory caches and database helpers using @dwtechs/antity-pgsql
└── utils/                  ← Pure, stateless helper functions
```

## Type Checking

Use `@dwtechs/checkard` for **all** runtime type checks — never `typeof`, `instanceof`, `Array.isArray()`, or manual `null`/`undefined` guards.

## App vs Entry Point

Split assembly from bootstrap.

- `src/app.js`: build Express app, register global middleware and routes, then `errorHandler(app)` from `@dwtechs/errandler-express` **after** routes. `export default app;` — no cache init, no cron jobs, no `listen()`.
- `src/server.js`: import `app`, `Promise.all([svc.init(), ...])`, start cron jobs, then `listen(app)`.
- Point `package.json` `main`/`start`/`dev` at `src/server.js`.

## Routes (`src/routes/<resource>.js`)

- `POST /search` for queries (not `GET` with query params).
- `POST /archive` for soft-delete (never `DELETE` on the collection).
- Hard-delete: `router.delete("/", rEnt.delete)` only for CRON tasks.
- `GET /:id/history` via `history.get("resourceName")` for every audited resource.
- `GET /schema` via `schema.get(rEnt)`.
- After mutations that must refresh cache, build a local sub-stack in `middlewares/cache/<resource>.js` and wire it on the route.

## Entities (`src/entities/<resource>.js`)

Use `@dwtechs/antity-pgsql` `SQLEntity` for **all** entities.

Field rules:

- `type`: `"integer"`, `"string"`, `"boolean"`, `"date"`, `"email"`, `"password"`, `"jwt"`, `"array"`, `"object"`, …
- `operations`: `"SELECT"` | `"INSERT"` | `"UPDATE"` — which SQL statements include the field.
- `requiredFor`: HTTP methods that require the field — e.g. `["POST"]`, `["POST", "PUT"]`, or `[]`.
- `isFilterable: true` → usable in search `filters`.
- `isPrivate: true` → hidden from external responses.
- `normalizer` / `sanitizer` / `validator`: custom transforms; `null` for library defaults.
- `min` / `max`: bounds; `null` = unconstrained.

## Services (`src/services/<resource>.js`)

- Own the in-memory `Map` cache and DB helpers.
- Export `init()`, `getOne()`, `deleteArchived(date)`, and cache mutators as needed.
- Index `Map` by the most-used lookup key.
- Register `init()` from `server.js` only — see App vs Entry Point.

## Middlewares

- Prefer mapper middlewares writing to `res.locals.rows`; let terminal `send` format the response.
- Use `src/controllers/` only when a handler must own the full request/response itself — outbound call plus `res.status(...).send(...)` — because the mapper → `send` pipeline cannot express it (e.g. gateway proxy forward). Controllers are terminal Express handlers, not multi-step orchestrators; do not put ordinary CRUD there.
- Pass data downstream via `res.locals`.
- Use `req.body.rows` as the standard insert/update array payload.
- After DB insert, use the generated `id` on `req.body.rows[0]` to update cache.
- Register `send` at `app.use(...)` level when possible.
- Errors: see Error Handling.

## Caching

- Load reference data into `Map`s in `init()` (see App vs Entry Point).
- After insert → `addToCache`; update → `updateCache`; archive/delete → `deleteFromCache`.
- Cache middlewares live in `middlewares/cache/<resource>.js` and call the matching service method.

## HTTP Calls

- All outbound HTTP via `src/utils/http.js` — never `axios` or other HTTP libs.
- External URLs from `process.env` (e.g. `USER_SEARCH_URL`).

## Error Handling

- Always `next(err)` — never throw or send responses from middleware.
- Shape: `{ statusCode: number, message: string }` (`@dwtechs/errandler-express`).
- Never expose stack traces or internal details.

## Logging

Use `@dwtechs/winstan`. Prefer lazy `log.debug(() => ...)` strings. Sanitize dynamic values (strip `\r\n\t`) before logging.

## Scheduled Jobs (`src/jobs/`)

- Use `scheduleDailyAt(utcHour, fn)` — no external cron libraries.
- Register jobs from `server.js` only — see App vs Entry Point.
- Every archivable service must expose `deleteArchived(date)`.

## Database consumption

Follow the installed PostgreSQL / Liquibase instructions for views, `log.history`, and retention deletes. From the service, consume those objects. History HTTP wiring is in Routes.

## Adding a New Resource — Checklist

1. **Entity** → `src/entities/<resource>.js`
2. **Service** → `src/services/<resource>.js` (exports per Services)
3. **Router** → `src/routes/<resource>.js` (verbs per Routes)
4. **Cache middlewares** → `src/middlewares/cache/<resource>.js` when mutations must refresh cache
5. **Register** the router in `app.js`; register `svc.init()` and any jobs per App vs Entry Point
6. **Retention** — add the service to the delete-archived job if it is archivable
