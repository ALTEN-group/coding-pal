---
description: "Use when working on Node.js Express service. Covers file structure, coding conventions, library usage, flow, caching, error handling and security patterns."
applyTo: "src/**/*.js"
---

# Node.js / Express Coding Instructions

Services always run in Docker. Use Docker when you need to execute something in the service context (e.g., `npm run test`, `npm run lint`, `npm run build`).

## Module System

- Use **ESM** (`import` / `export`) throughout.
- Start every file with `// @ts-check`.
- Use named exports for functions; use a default export object for service modules.

## Folder structure template

Every Node.js service **must** follow this structure — do not introduce folders outside this template.

```
src/
├── app.js                  ← Entry point
├── conf/                   ← Configuration middleware factories (CORS, security headers, …)
├── controllers/            ← Orchestration logic in multi-step operations. Favor mapper middlewares instead of controllers.
├── entities/               ← SQLEntity field-schema definitions for @dwtechs/antity-pgsql, one file per table
├── jobs/                   ← Scheduled/cron tasks
├── middlewares/
│   ├── cache/              ← Access in-memory service caches
│   ├── filters/            ← Add filter objects for next requests
│   ├── http/               ← Outbound HTTP calls to other services
│   ├── mappers/            ← Data-transformation middlewares (shape/enrich req or res data)
│   ├── res/                ← Terminal response middlewares (send JSON, 204, cookies, …)
│   └── validators/         ← Guards for data validation
├── routes/                 ← One express.Router() per resource — wiring only, no logic
├── services/               ← In-memory caches and database helpers using @dwtechs/antity-pgsql, one file per resource
└── utils/                  ← Pure, stateless helper functions
```


---

## Type Checking

Use `@dwtechs/checkard` for **all** runtime type checks instead of `typeof`, `instanceof`, `Array.isArray()`, or manual `null`/`undefined` guards.
See the [full API](https://www.npmjs.com/package/@dwtechs/checkard) for available functions.

---

## App Entry Point (`src/app.js`)

- Register global middleware **before** routes.
- All service caches must be initialized at startup via `Promise.all([svc.init(), ...])`.
- Error handling: `errorHandler(app)` from `@dwtechs/errandler-express` — register **after** routes.

---

## Routes (`src/routes/<resource>.js`)

```js
// @ts-check
import express from "express";
const router = express.Router();

import rEnt from "../entities/resource.js";
import history from "../middlewares/history.js";
import schema from "../middlewares/schema.js";

// Search
router.post("/search", rEnt.get);
// History
router.get("/:id/history", history.get("resource"));
// Add
router.post("/", rEnt.addArraySubstack);
// Update
router.put("/", rEnt.updateArraySubstack);
// Archive (soft-delete)
router.post("/archive", rEnt.archive);
// Get entity schema
router.get("/schema", schema.get(rEnt));

export default router;
```

- Always use `POST /search` for queries (not `GET` with query params).
- Use `POST /archive` for soft-delete (never `DELETE` on the collection).
- Hard-delete (permanent) uses `router.delete("/", rEnt.delete)` only for CRON tasks.
- If cache must be updated after a mutation, build a local middleware sub-stack in /middlewares/cache/<resource>.js and add it to the route:
  ```js
  const add = [rEnt.addArraySubstack, addToCache];
  router.post("/", add);
  ```
- Add `router.get("/:id/history", history.get("resourceName"))` for every audited resource.

---

## Entities (`src/entities/<resource>.js`)

Use `@dwtechs/antity-pgsql` for **all** entities. It generates SQL queries, validates input, and sanitizes output. 

```js
// @ts-check
import { SQLEntity } from "@dwtechs/antity-pgsql";

export default new SQLEntity("table_name", [
  {
    key: "id",
    type: "integer",
    min: null,
    max: null,
    isTypeChecked: true,
    isFilterable: true,
    requiredFor: [],
    operations: ["SELECT"],
    isPrivate: false,
    sanitizer: null,
    normalizer: null,
    validator: null,
  },
  // ...more fields
]);
```

**Field configuration rules:**
- `type`: `"integer"`, `"string"`, `"boolean"`, `"date"`, `"email"`, `"password"`, `"jwt"`, `"array"`, `"object"`...
- `operations`: controls which SQL statements include the field — `"SELECT"`, `"INSERT"`, `"UPDATE"`.
- `requiredFor`: HTTP methods that require this field — e.g., `["POST"]`, `["POST", "PUT"]`, or `[]`.
- `isFilterable: true` means the field can be used in `filters` on search queries.
- `isPrivate: true` hides the field from external responses (use for tokens, internal IDs).
- `normalizer`: a transform function applied before persist — e.g., `JSON.stringify` for `object` fields.
- `sanitizer` / `validator`: custom sanitize/validate functions; `null` to use library defaults.
- `min` / `max`: string length or numeric bounds; `null` means unconstrained.

See the [full API](https://www.npmjs.com/package/@dwtechs/antity-pgsql) for more.

---

## Services (`src/services/<resource>.js`)

Services own the **in-memory cache** and database helper functions.

```js
// @ts-check
import { execute } from "@dwtechs/antity-pgsql";
import rEnt from "../entities/resource.js";

/** @type {Map<number, object>} id → resource */
let cache = new Map();

function init() {
  const filters = { archived: { value: false, matchMode: "equals" } };
  const { query, args } = rEnt.query.select(0, 0, "id", "ASC", filters);
  return execute(query, args, null).then((r) => {
    cache = new Map(r.rows.map((row) => [row.id, row]));
  });
}

function getOne(id) {
  return cache.get(id);
}

function deleteArchived(date) {
  const q = rEnt.query.deleteArchive();
  return execute(q, [date], null).then((r) => r.rowCount || 0);
}

export default { init, getOne, deleteArchived };
```

- Always export `deleteArchived(date)` — it is called by the cron job.
- Call `init()` from `app.js` `Promise.all([...])` at startup.
- Use `Map` for O(1) lookups; index by the most-used lookup key.

---

## Middlewares

### Mappers vs Controllers

- **Do not write terminal controllers if avoidable.** Instead, fetch/transform data in mapper middlewares and store them in `res.locals.rows`.
- Let the downstream terminal middleware `send` handle formatting the HTTP response payload.
- Only use `src/controllers/` for complex multi-endpoint orchestrations.


### Naming & Location

| Category | Folder | Purpose |
|----------|--------|---------|
| Validators | `middlewares/validators/` | Input validation, ACL, route checks |
| Cache | `middlewares/cache/` | Sync in-memory cache after DB mutations |
| HTTP | `middlewares/http/` | Calls to other microservices |
| Mappers | `middlewares/mappers/` | Transform `req.body` / `res.locals` |
| Response | `middlewares/res/` | Final JSON response senders |

### Middleware signature

```js
// @ts-check
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function myMiddleware(req, res, next) {
  // read from res.locals, write to res.locals or req.body
  next();
}
```

- Pass errors with `next({ statusCode: 4xx, message: "..." })` — never throw.
- Use `res.locals` to pass data **downstream** between middlewares.
- Use `req.body.rows` as the standard array payload for insert/update operations.
- After DB insert, the entity library adds the generated `id` back to `req.body.rows[0]`; use that to update the cache.

### Response middlewares

```js
// Standard paginated list
function send(_req, res) {
  res.status(200).json({ rows: res.locals.rows, total: res.locals.total });
}

// No-content (archive / delete)
function send204(_req, res, _next) {
  res.status(204).send();
}
```

- `send` is registered at the `app.use(...)` level if possible.


---

## Caching Strategy

- All reference data is loaded at startup into `Map` objects.
- After every **insert**, run an `addToCache` middleware.
- After every **update**, run an `updateCache` middleware.
- After every **archive/delete**, run a `deleteFromCache` middleware.
- Cache middlewares live in `middlewares/cache/<resource>.js` and call the corresponding service method.

---

## HTTP Calls to Other Microservices

Use `src/utils/http.js` for all outbound HTTP requests:

```js
import http from "../../utils/http.js";

http.query("POST", url, undefined, { filters }, req.additionalHeaders)
  .then((r) => { /* r.status, r.data */ next(); })
  .catch((err) => next(err));
```

- Never use `axios` or other HTTP libs — use the internal `http` utility.
- External service URLs come from `process.env` (e.g., `USER_SEARCH_URL`, `PWD_CHECK_URL`).

---

## Error Handling

- Always call `next(err)` rather than throwing or sending responses in middleware.
- Error shape: `{ statusCode: number, message: string }` (used by `@dwtechs/errandler-express`).
- Never expose stack traces or internal details in error messages.

---

## Logging

Use `@dwtechs/winstan`:

```js
import { log } from "@dwtechs/winstan";

log.debug(() => `myFn(param=${safeValue})`);
log.info("Job started");
log.error(`Failed: ${err.message}`);
```

- Favor lazy string building to avoid string interpolation cost in production.
- Sanitize dynamic values before logging (strip newlines: `.replace(/[\r\n\t]/g, "")`).

---

## Scheduled Jobs (`src/jobs/`)

```js
// @ts-check
import { log } from "@dwtechs/winstan";
import { scheduleDailyAt } from "./scheduler.js";
import mySvc from "../services/my-service.js";

export function startMyJob() {
  scheduleDailyAt(utcHour, async () => {
    try {
      const count = await mySvc.deleteArchived(new Date());
      log.info(`Deleted ${count} records`);
    } catch (err) {
      log.error(`Job failed: ${err.message}`);
    }
  });
  log.info("MyJob initialized");
}
```

- Use `scheduleDailyAt(utcHour, fn)` — do **not** use external cron libraries.
- Register new jobs in `app.js` alongside the existing `startDeleteArchivedEntitiesJob` and `startDeleteOldHistoryJob`.
- Every service that holds archivable data must expose `deleteArchived(date)`.

---

## Adding a New Resource — Checklist

1. **Entity** → `src/entities/<resource>.js` — define fields with correct `operations`, `requiredFor`, `isPrivate`.
2. **Service** → `src/services/<resource>.js` — add `init()`, `getOne()`, `deleteArchived()`, and any cache mutators.
3. **Router** → `src/routes/<resource>.js` — `POST /search`, `GET /:id/history`, `POST /`, `PUT /`, `POST /archive`.
4. **Cache middlewares** → `src/middlewares/cache/<resource>.js` — `addToCache`, `updateCache`, `deleteFromCache`.
5. **Register in `app.js`** — add `import`, add `app.use(...)` with `send`, add `svc.init()` to the startup `Promise.all`.
6. **Register in delete-archived job** — add the service to the `entities` array in `delete-archived-entities.js`.