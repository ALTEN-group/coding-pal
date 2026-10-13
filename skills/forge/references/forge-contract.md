# Forge Contract

Authoritative contract for the Forge catalog and for Forge asset bindings in Think records. The Forge is the organization's catalog of certified, reusable building blocks (shared services, reusable code, in-context templates, interface contracts). The Architect owns it. AI discovers, binds, and drafts catalog entries. A human certifies and merges.

---

## 1. Rules

1. **Compose before you build.** A custom implementation of something the Forge offers needs a recorded reason in the Think record.
2. **One fix, every consumer.** Fixes land in the asset, not in copies.
3. **Certified before listed.** An asset enters the catalog only with an owner, a versioned interface, tests, and documentation.
4. **Deprecate explicitly.** A retired asset carries a replacement and a removal date. Once the removal date has passed it is `removed` and cannot be bound.

---

## 2. Catalog Resolution

Every script resolves the catalog in this order:

1. `--catalog <path>`
2. the environment variable `FORGE_CATALOG`
3. `catalog.json` in the skill folder (the seed shipped with this skill: `.agents/skills/forge/catalog.json`)

An organization points `FORGE_CATALOG` (or `--catalog`) at its own catalog, for example `forge-catalog.json` in a catalog repository. Changing a catalog is a pull request reviewed by the Architect.

---

## 3. Catalog File

```json
{
  "version": 1,
  "assets": [ { "id": "gatelin", "...": "..." } ]
}
```

`version` is `1`. `assets` is a list of asset objects. Unknown fields are errors, so the schema cannot drift silently.

### Asset fields

| Field | Rule |
|---|---|
| `id` | Unique. Lowercase letters, digits, hyphens. Used in bindings as `forge/<id>@<version>` |
| `name` | Display name |
| `kind` | `shared-service`, `library`, `template`, or `contract` |
| `summary` | One or two sentences: what it is and what it is not |
| `capabilities` | Non-empty list of capability statements |
| `keywords` | Non-empty list of search terms (what a consumer would say) |
| `owner` | Accountable team or organization. Required |
| `version` | Semantic version, prerelease allowed (`1.2.0`, `0.1.0-alpha.9`) |
| `maturity` | `alpha`, `beta`, or `stable`. `stable` needs `1.0.0` or above without a prerelease tag |
| `status` | `active`, `deprecated`, or `removed` |
| `releasedAt` | ISO date `YYYY-MM-DD` of `version`. Not in the future |
| `interface` | `type` (for example `REST`), `docs` (https URL), `contract` (where the versioned contract lives), optional `integrationGuide` and `frontendGuide` (https URLs) |
| `artifacts` | Non-empty list of `{ "type", "ref" }`. Types: `docker-image`, `npm-package`, `pypi-package`, `maven-package`, `nuget-package`, `git-repository`, `openapi-spec` |
| `docs` | https URL |
| `repository` | https URL |
| `license` | License identifier |
| `tests` | `ci` (https URL of the workflow) and/or `coverage` (where coverage is published). At least one |
| `composesWith` | Ids of assets this one is designed to work with. Empty list when none. Ids must exist |
| `replacement` | `null`, or the id of the asset that replaces it |
| `removalDate` | `null`, or an ISO date |

### Certification checklist

An asset with status `active` or `deprecated` is listed only if all of these hold. `validate-forge.mjs` enforces them:

- [ ] **Owner**: a named, accountable owner.
- [ ] **Versioned interface**: `interface.type`, `interface.docs`, `interface.contract`, and a semantic `version`.
- [ ] **Tests**: `tests.ci` or `tests.coverage` points to where the asset is tested.
- [ ] **Documentation**: `docs` and `interface.docs` are https URLs (an `integrationGuide` is expected and flagged when missing).
- [ ] **Consumable artifact**: at least one `artifacts` entry.
- [ ] **License** and **repository** are stated.

The checklist proves the asset is listed with the facts a consumer needs. It does not judge quality. The Architect certifies the asset by merging the pull request that adds it.

### Lifecycle

| Status | `replacement` | `removalDate` | Bindable |
|---|---|---|---|
| `active` | `null` | `null` | Yes |
| `deprecated` | An existing, active asset id | A date after today and after `releasedAt` | No: Think must bind the replacement |
| `removed` | Optional | A date on or before today | No |

A `deprecated` asset whose `removalDate` has passed is invalid: set its status to `removed`. Consumers reading the catalog treat any asset whose `removalDate` has passed as removed, whatever its status field says.

---

## 4. Forge Asset Bindings in `think.md`

Think records the chosen assets under `## Forge Asset Bindings`, one bullet per asset:

```markdown
## Forge Asset Bindings
- **forge/gatelin@0.1.0-alpha.9:** Fronts the API for JWT sessions and RBAC
- **forge/foxnox@0.1.0-alpha.3:** Stores credentials and TOTP behind Gatelin
```

- The label is `forge/<id>@<version>`. The text says how the asset is composed.
- Bind the **current catalog version**. Pinning an older version is a warning (stale binding). A version newer than the catalog is an error.
- A custom build states `- **None:** <reason>`. `None` cannot be combined with real bindings.
- A `Forge reuse` or `Hybrid` selection must have at least one binding.
- Binding to a `deprecated` asset is an error naming the replacement. A `removed` asset cannot be bound.
- An `alpha` or `beta` asset is a warning until the `Reasoning` of the Chosen Approach acknowledges that maturity (the word `alpha` or `beta`).
- A `Custom build` carries a `Custom Build Reason` that names what was searched in the Forge. `bindings-check.mjs` lists the Forge assets that match the Problem Statement and the option's Approach so the reason can be challenged.
- The Plan composes the bindings: every bound asset appears in the `Action` or `New Code` of at least one step. Code imports, calls, or deploys the bound asset by its documented interface and does not re-implement it.
- Code follows the asset's integration guide. A gap in the asset is raised with its owner, not patched locally.
- Validate with `bindings-check.mjs --think specs/issue-<n>/think.md`, and add `--plan specs/issue-<n>/plan.md` once the Plan exists. Answer each Forge match it prints in `Reasoning` or `Custom Build Reason`.

---

## 5. Discovery

`discover.mjs` ranks assets for a need with a deterministic, field-weighted BM25:

- Tokens are lowercase letters and digits, stopwords removed, with a light plural stem.
- Field weights: `name` 4, `keywords` 3, `capabilities` 2, `summary` 1. `k1` 1.2, `b` 0.75.
- Ties are broken by id. The same catalog and need give the same ranking.
- `removed` assets are excluded. `deprecated` assets are listed with their replacement and removal date.

The ranking is the deterministic baseline and the record of what was searched. The agent also searches semantically and decides which candidates fit.

---

## 6. Health Signals

`forge-health.mjs` reads the catalog and every `specs/issue-<n>/think.md`:

| Signal | Healthy | Warning |
|---|---|---|
| Share of work items binding at least one Forge asset | Rising (compare reports) | Flat or falling |
| Assets without an owner | None | Any |
| Assets whose latest release is older than `--stale-days` (default 180) | None | Any |
| Bindings pinned to a non-current version | None | Any |
| Bindings to deprecated or removed assets | None | Any |
| Custom builds with an empty Custom Build Reason | None | Any |

The report does not measure duplicate logic that a Forge asset covers. Run `discover.mjs` on custom builds and review the matches.

---

## 7. Anti-Patterns & Prohibitions

1. **No invented assets.** Bind only what the catalog lists. Never infer an asset from a name or a URL.
2. **No unrecorded custom build.** Searching the Forge is part of Think.
3. **No AI-certified assets.** AI drafts a catalog entry. The Architect certifies it by merging.
4. **No direct catalog edits.** Catalog changes go through a pull request.
5. **No binding to a retired asset.** Deprecated and removed assets are replaced, not bound.
6. **No copying instead of composing.** One fix reaches every consumer only when consumers call the asset.
