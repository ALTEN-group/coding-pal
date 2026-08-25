---
description: "Angular pattern for building a standalone, ACL-protected admin CRUD app on top of @dwtechs/crud-builder + PrimeNG: feature-sliced entity folders, centralized app-config registries, permission-aware field configs, and lazy-loaded routes with resolvers. Use when working on an Angular admin app."
applyTo: "**/src/app/**/*.ts"
---

# Angular Admin CRUD Pattern

Target: `<app>/src/app/`. One domain folder per business area, each split into `data-access/` and `features/`, then by entity.

HTML/SCSS templates are thin wrappers around these TS conventions — edit them only to bind the table/component inputs defined here.

When scaffolding an entity slice, follow the installed `angular-admin-examples` skill (read its `references/examples.md`). How unit specs are written is owned by the Angular unit-test instructions; how browser tests are written is owned by the Angular e2e instructions.

## 1. Bootstrap (`main.ts`, `angular.json`)

- Zoneless: `provideZonelessChangeDetection()` + `importProvidersFrom(BrowserModule)` first, then animations, then PrimeNG.
- PrimeNG via `providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: ".dark" } } })`.
- `provideHttpClient` + `withXsrfConfiguration` matching backend CSRF cookie/header names — no custom XSRF interceptor.
- Global providers: `MessageService`, `ConfirmationService`, `DialogService`, `provideAppConfig()`.
- Schematics defaults: `standalone: true`, `OnPush`, `scss`, `skipTests: false`.
- Path aliases: `@core/*` → `app/core/*`; other app imports via bare `app/...` (not deep `../../`).
- All user-facing strings use `$localize` with ids `@@<Area>_<Key>`.

## 2. Central app-config (`core/app-config/`)

Single source of truth — extend once per entity; never scatter entity lists:

- `app.entities.ts`: `ADMIN_ENTITIES` + `AdminEntity` union.
- `app.acls.ts`: `ENTITY_ROUTE_MAPPING` — entity → numeric backend route ids per CRUD op actually exposed.
- `app.sidenav.ts`: `SIDENAV` with `data.functionality` for ACL gating.
- `app.tables.ts`: `TABLES: Record<AdminEntity, TableInfo>`.
- `app.config.ts`: `CONFIG` + `provideAppConfig()` (auth refresh initializer, locale, crud-builder tokens, labels, title strategy).
- `app-config.token.ts`: `APP_CONFIG` token with safe default.
- `crud-labels.ts`: plain-text label overrides for crud-builder (not `$localize`).
- `custom-title-strategy.service.ts`: prefix titles with `APP_CONFIG.title`.

## 3. ACL (`core/acl/`)

Permission model is **route-id based**, not entity-based.

- `acl.service.ts` (signals): build ACL map from login/refresh permissions via `ENTITY_ROUTE_MAPPING`; `hasAccess`; `enrichAclWithSchema` once per route activation; `updateFieldsForRoute` for live patches.
- `acl.guard.ts`: unauthenticated → `/login`; else enrich + require `get` access or `/unauthorized`.
- `protectFeature` directive/pipe: gate controls by entity+operation.

## 4. Per-entity data-access (`data-access/<entity>/`)

Always three files: model (interface + factory), conf (`*_COLUMNS` ending with archived/audit configs, wrapped last with `withAclConditions`), service (`CrudRepository`, ACL getter, `httpCalls` mirroring mapping, `config`, `entityFactory`; lookups also expose `getAndCacheAll()`).

## 5. Feature component (`features/<entity>/`)

Thin wrapper only — inject service + `ConfigHelper`, expose `config` / `entityFactory` / `httpCalls` / `tableInformation`. Template is a single `<tbl-table>`; never hardcode table options in the template.

## 6. Field-config helpers (`core/utils/field-config/`)

Reuse composable fragments (`withAclConditions` last, archived/audit builders, `CORE_CONFIG`/`PROTECTED_CONFIG`, select→name action factories). Do not duplicate per entity.

## 7. Routing

- `AppPaths` derived from `ADMIN_ENTITIES` — one source for path strings.
- Protected routes: lazy `loadComponent`, `aclGuard()`, `data.functionality`, optional `resolve` for lookup lists (resolver = `getAndCacheAll()`).
- Do not fetch reference lists inside the feature component.

## 8. Auth/session (`core/auth/`)

- Access token only in `TokenService` / local storage; refresh token is httpOnly cookie (backend) — never stored client-side.
- Login/refresh always refreshes ACLs together with the token.
- `getUserBasics()` chains after successful refresh (app initializer + login).
