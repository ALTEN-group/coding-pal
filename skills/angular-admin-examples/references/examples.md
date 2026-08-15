# Angular Admin — Examples

Companion samples for the `angular-admin` instruction, shipped by the `angular-admin-examples` skill. Normative rules live in the instruction; use these templates only when scaffolding.

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
