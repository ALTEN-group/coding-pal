---
description: "Use when working on Node.js Express service. Covers file structure, coding conventions, library usage, flow, caching, error handling and security patterns."
applyTo: "src/**/*.js"
---

# Node.js / Express Coding Instructions

Services always run in Docker. Execute service commands in the container (`npm run lint`, `npm run build`, start/dev). How tests are run is owned by the installed Node.js unit-test instructions.
When scaffolding a resource or matching a full template, follow the installed `node-express-examples` skill (read its `references/examples.md`).

## Module System & Type Checking

- Use **ESM** (`import` / `export`) throughout and start every file with `// @ts-check`.
- Use named exports for functions; use a default export object for service modules.
- Use `@dwtechs/checkard` for **all** runtime type checks — never `typeof`, `instanceof`, `Array.isArray()`, or manual `null`/`undefined` guards.

## Folder Structure

Do not introduce folders outside this template:

```
src/
├── app.js                  ← Builds and exports the Express app (no bootstrap/listen)
├── server.js               ← Entry point: inits caches, cron jobs, then listen(app)
├── conf/                   ← Configuration middleware factories (CORS, security headers, …)
├── controllers/            ← Rare terminal handlers owning full req/res (e.g. proxy forward)
├── entities/               ← SQLEntity field-schema definitions for @dwtechs/antity-pgsql
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

## App vs Entry Point

- `src/app.js`: build Express app, register global middleware and routes, then `errorHandler(app)` from `@dwtechs/errandler-express` **after** routes. `export default app;` — no cache init, no cron jobs, no `listen()`.
- `src/server.js`: import `app`, `Promise.all([svc.init(), ...])`, start cron jobs, then `listen(app)`.
- Point `package.json` `main`/`start`/`dev` at `src/server.js`.

## Routes (`src/routes/<resource>.js`)

- `POST /search` for queries (not `GET` with query params).
- `POST /archive` for soft-delete (never `DELETE` on the collection); `router.delete("/", rEnt.delete)` only for CRON hard-deletes.
- `GET /:id/history` via `history.get("resourceName")` for audited resources; `GET /schema` via `schema.get(rEnt)`.
- After mutations that refresh cache, build a sub-stack in `middlewares/cache/<resource>.js` and wire it on the route.

## Entities (`src/entities/<resource>.js`)

Use `@dwtechs/antity-pgsql` `SQLEntity` for **all** entities. Field rules:
- `type`: `"integer"`, `"string"`, `"boolean"`, `"date"`, `"email"`, `"password"`, `"jwt"`, `"array"`, `"object"`, …
- `operations`: `"SELECT"` | `"INSERT"` | `"UPDATE"` — SQL statements that include the field.
- `requiredFor`: HTTP methods requiring the field — e.g. `["POST"]`, `["POST", "PUT"]`, or `[]`.
- `isFilterable: true` (usable in search `filters`); `isPrivate: true` (hidden from external responses).
- `normalizer` / `sanitizer` / `validator`: custom transforms (`null` for library defaults); `min` / `max`: bounds (`null` = unconstrained).

## Services & Caching (`src/services/<resource>.js`)

- Own the in-memory `Map` cache (indexed by most-used lookup key) and DB helpers.
- Export `init()`, `getOne()`, `deleteArchived(date)`, and cache mutators (`addToCache`, `updateCache`, `deleteFromCache`).
- Load reference data into `Map`s in `init()` (registered from `server.js` only).
- Cache middlewares in `middlewares/cache/<resource>.js` call the matching service mutator after insert/update/archive/delete.

## Middlewares, Response Envelopes & Error Handling

- Pass data downstream via `res.locals`. Use `req.body.rows` as the standard insert/update array payload (and `req.body.rows[0].id` after DB insert to update cache).
- Prefer mapper middlewares writing to `res.locals.rows` and `res.locals.total`; let terminal `send` (registered at `app.use(...)` level when possible) return `{ rows: res.locals.rows, total: res.locals.total }` (or `send204` with empty body).
- Use `src/controllers/` only when a terminal handler must own the full req/res lifecycle (e.g. gateway proxy forward); never put ordinary CRUD there.
- **Errors**: Always `next(err)` — never throw or send error responses directly from middleware. `@dwtechs/errandler-express` formats errors as `{ statusCode: number, message: string }` without exposing stack traces or internal details.

## HTTP Calls, Logging, Jobs & Database

- **HTTP Calls**: All outbound HTTP via `src/utils/http.js` (never `axios` or other HTTP libs) with URLs from `process.env` (e.g. `USER_SEARCH_URL`).
- **Logging**: Use `@dwtechs/winstan`. Prefer lazy `log.debug(() => ...)` strings and sanitize dynamic values (strip `\r\n\t`).
- **Scheduled Jobs (`src/jobs/`)**: Use `scheduleDailyAt(utcHour, fn)` (no external cron libs), registered from `server.js` only. Every archivable service must expose `deleteArchived(date)`.
- **Database**: Follow installed PostgreSQL / Liquibase instructions for views, `log.history`, and retention deletes.

## Adding a New Resource — Checklist

1. **Entity** (`src/entities/<resource>.js`) & **Service** (`src/services/<resource>.js`)
2. **Router** (`src/routes/<resource>.js`) & **Cache middlewares** (`src/middlewares/cache/<resource>.js`)
3. **Register** router in `app.js`; register `svc.init()`, cron jobs, and `deleteArchived` retention in `server.js` / `src/jobs/`
