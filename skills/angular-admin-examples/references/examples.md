# Angular Admin — Examples

Companion samples for the `angular-admin` instruction, shipped by the `angular-admin-examples` skill. Normative rules live in the instruction; use these templates only when scaffolding.

## Bootstrap (`main.ts`) — one-time, global setup

Run once when the admin app itself is created. Never repeat this per entity; sections below (feature component, data-access trio, routes) are the per-entity work.

```ts
bootstrapApplication(AppComponent, {
  providers: [
    // Leave this one first
    importProvidersFrom(BrowserModule),
    provideZonelessChangeDetection(),
    provideAnimations(),
    provideAnimationsAsync(),
    provideOptimus({
      theme: { preset: Aura, options: { darkModeSelector: ".dark" } },
    }),
    provideAppConfig(),
    provideHttpClient(
      withInterceptorsFromDi(),
      withInterceptors([
        authInterceptor,
        preferencesInterceptor,
        errorInterceptor,
        locationInterceptor,
      ]),
      withXsrfConfiguration({
        cookieName: "csrfToken",
        headerName: "X-CSRF-Token",
      }),
    ),
    provideRouter(ROUTES),
    MessageService,
    ConfirmationService,
    DialogService,
  ],
}).catch((err) => console.log(err));
```

`cookieName`/`headerName` must match the backend's CSRF cookie/header names. The interceptor list and provider order are fixed by the instruction — don't reorder or drop entries when copying this.

### `provideAppConfig()` (`app.config.ts`)

Wires the crud-builder into the app — this is the central point where `@dwtechs/ngx-crud-builder` gets configured, so it belongs with bootstrap, not with per-entity work:

```ts
export function provideAppConfig() {
  return makeEnvironmentProviders([
    // refreshes the access token + ACLs before the app renders
    provideAppInitializer(() => {
      const authService = inject(AuthenticationService);
      return checkToken(authService);
    }),
    provideCrudRenderer("optimus-ui"), // tells crud-builder which UI kit renders its tables/forms
    { provide: LOCALE_ID, useValue: "fr" },
    { provide: APP_CONFIG, useValue: CONFIG }, // app-wide config: title, appKey, storageKeys, sidenav, env
    {
      provide: CRUD_APP_CONFIG, // crud-builder's own app config token (title/appKey/storageKeys/apiPrefix)
      useValue: {
        title: CONFIG.title,
        appKey: CONFIG.appKey,
        storageKeys: CONFIG.storageKeys,
        apiPrefix: environment.apiGateway,
      },
    },
    provideCrudLabels(CRUD_LABELS_CONFIG, PrimeNgTranslations), // plain-text label overrides, not $localize
    { provide: APP_FORM_CONFIG, useValue: FORM_CONFIG }, // custom validator error messages
    { provide: TitleStrategy, useClass: CustomTitleStrategyService },
    {
      provide: HISTORY_MAPPER, // maps backend audit-history payloads to crud-builder's expected shape
      useFactory: () => (raw: unknown) => ({ /* ... */ }),
    },
  ]);
}
```

`provideCrudRenderer`, `CRUD_APP_CONFIG`, `provideCrudLabels`, `APP_FORM_CONFIG`, and `HISTORY_MAPPER` all come from `@dwtechs/ngx-crud-builder` — every data-access/field-config piece built per entity (sections below) depends on this provider having run. Set it up once here; never re-provide these tokens in a feature/entity file.

## Central app-config registrations (per entity)

Every new entity extends these four files — never a new file, never a scattered local list.

`app.entities.ts`:

```ts
export const ADMIN_ENTITIES = [
  // ...existing entities
  "<entity>",
] as const;
```

`app.acls.ts` — only the CRUD ops the backend actually exposes for this entity; ids come from the backend route table, never invented:

```ts
export const ENTITY_ROUTE_MAPPING: EntityRouteMapping = {
  // ...existing entries
  <entity>: {
    get: 56, // search<Entity>
    getHistory: 57,
    create: 58,
    update: 59,
    archive: 60,
  },
};
```

`app.sidenav.ts` — `data.functionality` must match the `ENTITY_ROUTE_MAPPING` key so ACL gating works:

```ts
export const SIDENAV: MenuItem[] = [
  // ...existing items
  {
    id: "<entity>",
    label: $localize`:@@Admin_<Entity>Nav:<Entity label>`,
    routerLink: `/${AppPaths.<ENTITY>}`,
    icon: "pi pi-<icon>",
    data: { functionality: "<entity>" },
  },
];
```

`app.tables.ts`:

```ts
export const TABLES: Record<AdminEntity, TableInfo> = {
  // ...existing entries
  <entity>: {
    label: $localize`:@@TableLabels_<Entity>:<Entity singular>`,
    title: $localize`:@@TableLabels_<Entity>s:<Entity plural>`,
    entityId: "<entity>",
    editionDialogSize: "s",
    filterLevel: "advanced",
    isPreferencesModeEnabled: true,
    shouldSyncIdWithUrl: true,
    shouldSyncPageWithUrl: true,
    isExcelExportEnabled: true,
    excelExportMode: "local",
    additionalReadonlyProperties: { core: true },
  },
};
```

Not touched per entity: `app.config.ts`, `app-config.token.ts`, `crud-labels.ts`, `custom-title-strategy.service.ts` — global wiring set up once during bootstrap.

## Feature component (thin wrapper)

```ts
@Component({
  selector: "<prefix>-<entity>",
  templateUrl: "./<entity>.component.html",
  imports: [TableComponent],
  providers: [ConfigHelper],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XComponent {
  private readonly xService = inject(XService);
  private readonly configHelper = inject(ConfigHelper<XService>);
  public readonly config = this.configHelper.getConfig(this.xService);
  public readonly entityFactory = this.xService.entityFactory;
  public readonly httpCalls = this.xService.httpCalls;
  public readonly tableInformation = TABLES.<entity>;
}
```

Template: a single `<tbl-table>` bound from `tableInformation` + `config` / `httpCalls` / `entityFactory`.

## `$localize` message ids

```ts
$localize`:@@Admin_<Entity>Nav:Entities`
$localize`:@@TableLabels_<Entity>:Entity`
$localize`:@@Validators_<RuleName>:Invalid value`
```

## Per-entity data-access trio

1. `<entity>.model.ts` — `interface X extends ArchiveInfo { ... }` + `xFactory = (): X => ({ ... })`
2. `<entity>.conf.ts` — `X_COLUMNS(payload, acls) => StrictCrudItemOptions<X>[]`, end with `buildArchivedConfig()` / `buildAuditConfig()`, wrap last with `withAclConditions(columns, acls)`
3. `<entity>s.service.ts` — `CrudRepository`, ACL getter, `httpCalls`, `config`, `entityFactory`; lookup entities also expose `getAndCacheAll()`

## Protected route shape

```ts
{
  path: AppPaths.X,
  loadComponent: () => import("...").then((m) => m.XComponent),
  canActivate: [aclGuard()],
  data: { breadcrumb: $localize`...`, functionality: AppPaths.X },
  resolve: { <lookupEntity>: <lookupEntity>Resolver },
}
```

Resolver: `inject(XService).getAndCacheAll()`.
