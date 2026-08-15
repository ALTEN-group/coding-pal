# Node.js / Express — Examples

Companion samples for the `node-express` instruction, shipped by the `node-express-examples` skill. Normative rules live in the instruction; use these templates only when scaffolding.

## Route (`src/routes/<resource>.js`)

```js
// @ts-check
import express from "express";
const router = express.Router();

import rEnt from "../entities/resource.js";
import history from "../middlewares/history.js";
import schema from "../middlewares/schema.js";

router.post("/search", rEnt.get);
router.get("/:id/history", history.get("resource"));
router.post("/", rEnt.addArraySubstack);
router.put("/", rEnt.updateArraySubstack);
router.post("/archive", rEnt.archive);
router.get("/schema", schema.get(rEnt));

export default router;
```

Cache-after-mutation sub-stack:

```js
const add = [rEnt.addArraySubstack, addToCache];
router.post("/", add);
```

## Entity (`src/entities/<resource>.js`)

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
]);
```

## Service (`src/services/<resource>.js`)

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

## Middleware signature

```js
// @ts-check
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function myMiddleware(req, res, next) {
  next();
}
```

## Response middlewares

```js
function send(_req, res) {
  res.status(200).json({ rows: res.locals.rows, total: res.locals.total });
}

function send204(_req, res, _next) {
  res.status(204).send();
}
```

## Outbound HTTP

```js
import http from "../../utils/http.js";

http.query("POST", url, undefined, { filters }, req.additionalHeaders)
  .then((r) => { next(); })
  .catch((err) => next(err));
```

## Logging

```js
import { log } from "@dwtechs/winstan";

log.debug(() => `myFn(param=${safeValue})`);
log.info("Job started");
log.error(`Failed: ${err.message}`);
```

## Scheduled job

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
