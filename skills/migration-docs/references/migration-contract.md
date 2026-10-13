# Migration Documentation Contract

Normative structure for the three migration records. The validator `scripts/validate-migration.mjs` enforces it. Files live together in one directory, default `docs/migration/<migration-name>/`.

| File | Question it answers | Written when |
|---|---|---|
| `assessment.md` | What do we have, where does each piece go, and what must change in the application? | First |
| `migration-plan.md` | In which order, with which data movement, validation, and rollback? | After a validated `assessment.md` |
| `runbook.md` | Which exact steps does the cutover team execute? | After a validated `migration-plan.md` |

Each record is derived from the previous one. A later record never re-opens a decision of an earlier record.

## Conventions

- Component IDs are `S-<n>` (source inventory), change IDs are `C-<n>`, risk IDs are `R-<n>`, check IDs are `V-<n>`. IDs are unique and never reused.
- Tables use the exact column names below. A section that has nothing to say contains `_None._` where the section allows it.
- No placeholders (`TBD`, `N/A`, `...`, `<...>`).
- Never write secret values, keys, tokens, or credentials. Record the secret's name and where it lives.
- Every claim about the current state cites evidence: a repository path, a manifest, a command output reference, or `Interview: <role>`.

## Application Change Policy

The migration moves infrastructure. The application stays as it is unless a change is unavoidable. The assessment declares one **Change Budget**:

| Budget | Allowed application impact |
|---|---|
| `none` | Nothing. The register is `_None._`. |
| `config-only` | `Config` changes only: environment variables, connection strings, endpoints, feature flags, deployment descriptors. |
| `minimal-code` | `Config`, `Build`, and `Code`. Every `Code` change needs a reason an infrastructure-side option cannot cover. |

Resolve a gap in this order and stop at the first option that works:

1. Infrastructure side: network route, DNS, proxy, VPN or private link, compatible managed service, sidecar, adapter.
2. Configuration: externalized settings, secrets reference, environment variables.
3. Build and packaging: base image, runtime version, container manifest, CI target.
4. Code: the smallest change that closes the gap.

## `assessment.md`

Level-one heading: `# Migration Assessment: <name>`. Exactly these level-two headings, in order.

### `## Scope & Principles`

Bulleted fields, each once, in this form `- **Field:** value`:

- `Source`: the current hosting, such as `On-premise VMware cluster, datacenter A`.
- `Target`: the destination, such as `Azure, West Europe landing zone`. The target is not required to be a cloud.
- `Driver`: why the migration happens.
- `Change Budget`: `none`, `config-only`, or `minimal-code`.
- `Out of Scope`: what the migration does not touch. `_None._` is allowed.

### `## Source Inventory`

Columns: `ID | Component | Type | Runtime | Data | Depends On | Evidence`

- `Type`: `Compute`, `Database`, `Storage`, `Queue`, `Network`, `Identity`, `Secret`, `Scheduler`, `Integration`, `Observability`.
- `Data`: the data held, its approximate size, and its sensitivity, or `-` when stateless.
- `Depends On`: comma-separated `S-<n>` IDs, or `-`. Every ID must exist and no component may depend on itself.
- `Evidence`: never empty.

### `## Target Mapping`

Columns: `Component | Strategy | Target Service | Application Impact | Rationale`

- `Component`: an `S-<n>` ID. Every inventory component appears exactly once.
- `Strategy`: `Rehost`, `Replatform`, `Relocate`, `Retain`, `Retire`, or `Refactor`. Prefer `Rehost` and `Relocate`; use `Replatform` when a managed equivalent removes operations work without code change. `Refactor` needs a drafted decision record named in the Rationale.
- `Target Service`: the concrete destination, or `-` for `Retire`.
- `Application Impact`: `None`, `Config`, `Build`, or `Code`: the highest change class the component needs.
- `Rationale`: why this strategy and why this impact.

### `## Application Change Register`

Columns: `ID | Component | Type | Change | Why Not Infrastructure-Side | Owner`

- `Type`: `Config`, `Build`, or `Code`.
- Every mapping row with `Application Impact` other than `None` has at least one change, and the highest change `Type` of a component equals its declared impact.
- A `Retain` or `Retire` component has no change.
- The Change Budget bounds the types: `none` forbids all changes, `config-only` forbids `Build` and `Code`.
- `Why Not Infrastructure-Side` is never empty.
- `_None._` is allowed only when every mapping impact is `None`.

### `## Risks`

Columns: `ID | Risk | Likelihood | Impact | Mitigation`. `Likelihood` and `Impact` are `Low`, `Medium`, or `High`. Every risk has a mitigation.

### `## Ambiguities & Open Questions`

A bulleted list, or `_None._`. Unstated facts go here. Never invent them.

## `migration-plan.md`

Level-one heading: `# Migration Plan: <name>`. Exactly these level-two headings, in order.

### `## Prerequisites & Context`

- `Assessment`: the relative path of the source `assessment.md`. Required.

### `## Waves`

Columns: `Wave | Components | Depends On | Cutover Window | Downtime Budget`

- `Wave`: consecutive integers from 1.
- `Components`: comma-separated `S-<n>` IDs. Every component whose strategy is `Rehost`, `Replatform`, `Relocate`, or `Refactor` appears in exactly one wave. `Retain` and `Retire` components appear in none.
- `Depends On`: `-` or lower wave numbers only.
- A migrated component never sits in an earlier wave than a migrated component it depends on.
- `Downtime Budget`: a duration such as `0m`, `30m`, `4h`.

### `## Data Migration`

Columns: `Component | Method | Sync | Integrity Check`

- Every migrated component of type `Database` or `Storage` has exactly one row. `Sync` is `Bulk`, `Continuous`, or `Final Delta`. `_None._` is allowed only when no such component is migrated.

### `## Connectivity & Identity`

Fields: `Network`, `DNS Cutover`, `Identity`, `Secrets`, `Certificates`. Each is non-empty.

### `## Validation`

Columns: `ID | Check | Wave | Success Criterion`. Every wave has at least one check. The criterion is observable without judgement.

### `## Rollback`

Columns: `Wave | Trigger | Rollback Action | Data Reconciliation`. Every wave has exactly one row. Field `Point of No Return` names the step after which rollback is no longer possible, or `None`.

### `## Decommission`

Columns: `Component | Condition`, or `_None._`. Every `Retire` component appears here.

### `## Open Questions & Assumptions`

A bulleted list, or `_None._`. A draft plan may keep open questions only with `--allow-open-questions`.

## `runbook.md`

Level-one heading: `# Migration Runbook: <name>`. Level-two headings, in order: `## Prerequisites & Context`, `## Go/No-Go Criteria`, one `## Wave <n>: <title>` per plan wave in order, `## Post-Cutover`.

- `Prerequisites & Context`: field `Plan` with the relative path of `migration-plan.md`.
- `Go/No-Go Criteria`: at least three checklist items `- [ ] ...`.
- Each wave section holds `### Step <wave>.<n>: <title>` steps, numbered consecutively from 1. Every step has the fields `Owner`, `Action`, `Verification`, `Rollback`, and `Duration`. A step's `Action` may contain commands in backticks. `Rollback` is `_None._` only when the plan declares a `Point of No Return` other than `None`.
- `Post-Cutover`: fields `Hypercare`, `Handover`.

## Cross-checks

When several records are validated together:

- Wave numbers in `migration-plan.md` equal the wave sections of `runbook.md`.
- Every plan component and validation check is addressed by at least one step of its wave (its ID appears in the step's `Action` or `Verification`).
- Plan `Assessment` and runbook `Plan` paths resolve to the sibling files.
