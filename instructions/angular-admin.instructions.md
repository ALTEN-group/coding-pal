---
description: "Angular pattern for building a standalone, ACL-protected admin CRUD app on top of @dwtechs/crud-builder + PrimeNG: feature-sliced entity folders, centralized app-config registries, permission-aware field configs, and lazy-loaded routes with resolvers. Use when working on an Angular admin app."
applyTo: "admin/src/**/*.ts"
---

# Angular Admin CRUD Pattern

Target: `<app>/src/app/`. One "domain" folder per business area (e.g. `<domainA>/`, `<domainB>/`), each split into `data-access/` and `features/`, each of those split again by entity (`data-access/<entity>/`, `features/<entity>/`).

## 1. Bootstrap conventions (`main.ts`, `angular.json`)

- Zoneless: `provideZonelessChangeDetection()` + `importProvidersFrom(BrowserModule)` **first** in the providers array, then animations, then PrimeNG.
- PrimeNG themed via `providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: ".dark" } } })`.
- Global providers always present: `MessageService`, `ConfirmationService`, `DialogService` (PrimeNG), plus app's own `provideAppConfig()`.
- `angular.json` schematics defaults: components are `standalone: true`, `changeDetection: "OnPush"`, `style: "scss"`, `skipTests: true` for component/class/directive/pipe/service generation — every generated file must follow these without repeating the flags manually.
- Path aliases declared in `tsconfig.json` (`baseUrl: "./src"`): `@core/*` → `app/core/*`. Non-aliased app code is imported via the bare `app/...` path (relative to `src`), not relative `../../`.
- `$localize` is used for all user-facing strings, with a systematic message id: `` $localize`:@@<Area>_<Key>:<Default text>` `` (e.g. `@@Admin_<Entity>Nav`, `@@TableLabels_<Entity>`, `@@Validators_<RuleName>`).

## 2. Central app-config registries (`core/app-config/`)

Single source of truth files, extended once per new entity — never scatter entity lists across the codebase:

- `app.entities.ts`: `ADMIN_ENTITIES` — `as const` string array of every administrable entity name, plus derived `AdminEntity` union type. Everything else (ACLs, routes, sidenav, tables) types against this union.
- `app.acls.ts`: `ENTITY_ROUTE_MAPPING: EntityRouteMapping` — maps each `AdminEntity` to the numeric backend **route id** for each CRUD operation it supports (`get`, `getHistory`, `create`, `update`, `archive`, ...). These ids must match the backend's own route/endpoint ids; only declare the operations the entity's backend route actually exposes (e.g. a read/update-only entity only has `get`/`update`; a junction-style entity may skip `restore`).
- `app.sidenav.ts`: `SIDENAV: MenuItem[]` (PrimeNG) — nested menu built from `AppPaths`, each leaf/group item carries `data: { functionality: <AdminEntity> }` so the ACL directive/guard can gate visibility.
- `app.tables.ts`: `TABLES: Record<AdminEntity, TableInfo>` — per-entity display metadata consumed by the generic table component (`label`, `title`, `entityId`, `editionDialogSize`, `filterLevel`, `isPreferencesModeEnabled`, `isExcelExportEnabled`, `excelExportMode`, `additionalReadonlyProperties`).
- `app.config.ts`: builds the `CONFIG: AppConfig` object (title, appKey, storage keys, sidenav, API prefixes) and exposes `provideAppConfig()` (`makeEnvironmentProviders`) wiring: an app initializer that calls `authService.refreshToken()` then redirects to login on failure, `LOCALE_ID`, `APP_CONFIG` + crud-builder's own `APP_CONFIG`/`APP_FORM_CONFIG`/`HISTORY_MAPPER` tokens, `provideCrudLabels(...)`, and a custom `TitleStrategy`.
- `app-config.token.ts`: `APP_CONFIG` `InjectionToken<AppConfig>` with a safe empty-object factory default (`providedIn: "root"`) so it's always injectable even without explicit provider (tests, lazy contexts).
- `crud-labels.ts`: `CRUD_LABELS_CONFIG: Partial<CrudLabels>` — all crud-builder UI strings (checkbox, table, archived, audit, dialogs, form, toolbar) overridden in one place, in plain English/French text (not `$localize`, since it's fed straight into the library's label token).
- `custom-title-strategy.service.ts`: extends `TitleStrategy`, prefixes every route title with `APP_CONFIG.title`.

## 3. ACL system (`core/acl/`)

Permission model is **route-id based**, not entity-based: the backend grants access per numeric route id, and the frontend maps entity+operation → route id via `ENTITY_ROUTE_MAPPING` to know if the user can `get`/`create`/`update`/`archive` a given `AdminEntity`.

- `acls.model.ts`: `Acls` (per-entity: `{ [operation]: { allowed, operations: number[], fields: string[] } }`) and `AclsMapping` (`Record<AdminEntity, Acls>`).
- `acl.service.ts` (signals-based, `providedIn: "root"`):
  - `storeAccessLevels(userPermissions)` builds `AclsMapping` from the raw permission list returned by login/refresh, by walking `ENTITY_ROUTE_MAPPING` and checking whether each route id appears in `userPermissions`.
  - `hasAccess(functionality, operation)` — defaults to `true` when `functionality` is undefined (unprotected route), `false` when ACLs aren't resolved yet.
  - `enrichAclWithSchema(functionality)` — merges the ACL's field allowlist (from permissions) with the DB schema's writable columns (from `SchemaService`, `INSERT`/`UPDATE` ops): permission fields win when non-empty, otherwise schema fields are the baseline. Call this once per route activation (from the guard), not on every field render.
  - `updateFieldsForRoute(routeId, fields)` — live-patches the fields allowlist for whichever entity/operation owns that route id (used when the backend pushes a permission update for the current session).
- `acl.guard.ts` (`aclGuard(): CanActivateFn`): rejects unauthenticated users to `/login`; otherwise calls `enrichAclWithSchema` then checks `hasAccess(functionality, "get")`, redirecting to `/unauthorized` on failure. `functionality` comes from `route.data.functionality`.
- `protect-feature.directive.ts` / `.pipe.ts`: `[protectFeature]="entity" [operation]="op"` — toggles a `p-disabled` class via an `effect()` reacting to a `computed` access signal; use on buttons/menu items whose action maps to a specific `AdminEntity`+operation rather than the whole route.

## 4. Per-entity CRUD slice (`data-access/<entity>/`)

Three files per entity, always the same shape:

1. `<entity>.model.ts` — `interface X extends ArchiveInfo { id: number | null; ...fields }` (from `@dwtechs/crud-builder`) plus a pure factory `xFactory = (): X => ({ id: null, ...defaults, ...new ArchiveInfo() })`. No classes, no methods on the model.
2. `<entity>.conf.ts` — exports `X_COLUMNS: (payload: ActivatedRouteSnapshot, acls: Acls | undefined) => StrictCrudItemOptions<X>[]`, built from crud-builder primitives (`CONTROL_TYPES`, `INPUT_TYPES`, `ID_CONFIG`, validators `required`/`min`/`minlength`/`maxlength`). Always end the array with the shared trailer configs (`buildArchivedConfig()`, and `buildAuditConfig()` when the entity shows audit columns), and always wrap the whole array in `withAclConditions(columns, acls)` last so ACL-driven `disabled` state composes with any pre-existing per-field condition instead of overriding it.
3. `<entity>s.service.ts` — `@Injectable({ providedIn: "root" })`, holds: `private crud = new CrudRepository<X>().with({ endpoint: <entityConst> })`, a `computed()` acls getter via `AclService.getEntityAcls(entity)`, a `httpCalls: Calls<X>` object listing only the CRUD methods this entity actually supports (mirrors `ENTITY_ROUTE_MAPPING` — e.g. read-only entities expose only `get`+`getHistory`), `config = (payload) => X_COLUMNS(payload, this.acls())`, `entityFactory = xFactory`. Lookup-style entities referenced by other entities (e.g. a `<lookupEntity>` list referenced by an `<entity>` form) additionally expose `getAndCacheAll(): Observable<X[]>` delegating to `crud.getAndCacheAll()` for use in resolvers.

## 5. Feature component (`features/<entity>/`)

Thin wrapper only — all logic lives in the service/conf above:
```ts
@Component({ selector: "<prefix>-<entity>", templateUrl: "./<entity>.component.html", imports: [TableComponent], providers: [ConfigHelper], changeDetection: ChangeDetectionStrategy.OnPush })
export class XComponent {
  private readonly xService = inject(XService);
  private readonly configHelper = inject(ConfigHelper<XService>);
  public readonly config = this.configHelper.getConfig(this.xService);
  public readonly entityFactory = this.xService.entityFactory;
  public readonly httpCalls = this.xService.httpCalls;
  public readonly tableInformation = TABLES.<entity>;
}
```
Template is a single `<tbl-table>` element bound entirely from `tableInformation` (from `app.tables.ts`) plus `config`/`httpCalls`/`entityFactory` — never hardcode table options in the template.

## 6. Field-config composition helpers (`core/utils/field-config/`)

Reusable, composable column-config fragments consumed by every `<entity>.conf.ts` — build new ones here instead of duplicating logic per entity:

- `withAclConditions()` (described above, §3) is always the last wrap.
- `buildArchivedConfig()` / `buildAuditConfig()` — inject `CRUD_LABELS` and call the matching crud-builder factory (`createArchivedConfig`/`createAuditConfig`); customize rendering (icons, widths) by mapping over the returned columns and patching the one with the matching `key`.
- `CORE_CONFIG`/`PROTECTED_CONFIG` — static, reusable `StrictCrudItemOptions` fragments for the `core`/`protected` boolean columns (locked/system rows), each with a `customCellRenderer`/`customHeaderRenderer` from `core/utils/renderers/`. Spread these into an entity's column array where relevant instead of redefining them.
- `on-select-action.config.ts` (`buildIdNameAction`/`buildIdsNamesAction`) — factories for crud-builder's `FormFieldInteractionEvent` handlers that auto-populate a denormalized `<x>Name`/`<x>Names` field when a select/multiselect `<x>Id`/`<x>Ids` field changes, looking the label up from an already-loaded reference list (typically the resolver-provided data).

## 7. Routing (`app.routes.ts` + per-domain `data-access/<entity>/<entity>.resolver.ts`)

- `AppPaths` const = `{ LOGIN, NOT_FOUND, UNAUTHORIZED, ...ENTITY_PATHS }` where `ENTITY_PATHS` is derived (`Object.fromEntries`) from `ADMIN_ENTITIES` uppercased — every entity path is generated, never hand-typed twice.
- Every protected route: `loadComponent: () => import(...).then((m) => m.XComponent)`, `canActivate: [aclGuard()]`, `data: { breadcrumb: $localize\`...\`, functionality: AppPaths.X }`.
- Reference/lookup data needed by a feature's column config (e.g. a lookup list for a multiselect field) is loaded via a route `resolve` entry, not fetched inside the component: `resolve: { <lookupEntity>: <lookupEntity>Resolver }`. Resolver = one-liner: `inject(XService).getAndCacheAll()`.
- `app.routes.ts` is also where `EntityPaths` mapped type + `AppPaths` are defined — `SIDENAV`, guards, and resolvers all import `AppPaths`/`AdminEntity` from here, keeping route path strings in exactly one place.

## 8. Auth/session (`core/auth/`)

- `AuthenticationService` (signals `_isAuthenticated`, `_user`): `login()`/`refreshToken()` both save tokens via `TokenService`, flip `_isAuthenticated`, then call `aclService.storeAccessLevels(permissions)` — ACLs are always refreshed together with the token, never independently.
- `TokenService` only wraps `LocalStorageService` with the two key names read from `APP_CONFIG.storageKeys` — no token logic (decoding/expiry) here, that's the backend's job via `refreshToken`.
- `getUserBasics()` returns an RxJS `pipe(switchMap(() => getAccount()))` meant to be chained after a successful token refresh (see app initializer in `app.config.ts` and `login()`).
