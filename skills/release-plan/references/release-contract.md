# Release Specification Contract

A release is the decision to switch a change on for users, and a plan for doing it gradually and reversibly. The result is a persistent `release.md` declared **per change, before deployment**. It fixes the rollout stages, the thresholds that promote or roll back, the rollback mechanisms, and the outcome metric handed to Learn.

AI drafts. **DevOps approves.** The rollout itself runs on standard deployment tooling: promotion and rollback follow thresholds declared in advance, evaluated by a deterministic script. No AI is involved in a rollout decision, and no AI holds production credentials.

---

## 1. Directory & Naming

- `specs/issue-<number>/release.md`, next to `triage.md`, `think.md`, `plan.md`, and `progress.json`.
- File name is exactly `release.md` (lowercase ASCII). UTF-8 without BOM.
- **One issue per release.** Batching changes into one release multiplies blast radius and is an anti-pattern: the `Issue` field holds exactly one `#<n>`.
- Trunk-based: a tag `v<version>` on `main` triggers the release pipeline (`references/release.yml`). The tag message names the one issue (`Issue: #<n>`).

---

## 2. `release.md` Structure

### Required Document Structure (In Exact Order)

1. `# Release: <name>`
2. `## Release`
3. `## Rollout Stages`
4. `## Thresholds`
5. `## Rollback`
6. `## Outcome Metric`
7. `## Changelog`
8. `## Ambiguities & Open Questions`

No other level-2 headings. No code blocks.

### `## Release`

Bullets, each as `- **<Label>:** <value>`:

| Label | Content |
|---|---|
| `Issue` | One or more issue references (e.g. `#42` or `#42, #43`). The first issue serves as the primary tracking issue for the Learn hypothesis |
| `Tier` | `Low`, `Medium`, `High`, or `Critical`: the blast radius tier set in Think (or raised in Plan) |
| `Version` | Semantic version. `1.2.3` and `v1.2.3` are both accepted and compared without the `v` |
| `Artifact` | Immutable image or package reference. Must carry the version (`registry/app:1.2.3`) or a digest (`@sha256:<64 hex>`). `latest` is rejected. No embedded credentials |
| `Flag` | The release decision flag: `enable` or `<feature>.enable` (lowercase) |
| `Owner` | `DevOps` |
| `Customer Commitment` | `yes` or `no`. A change that fulfils something promised to a customer is `yes` |

### `## Rollout Stages`

```markdown
| Stage | Traffic | Watch Window | Promotion |
|---|---|---|---|
| staging | 0% | 15m | automatic on green window |
| canary-5 | 5% | 30m | automatic on green window |
| progressive-25 | 25% | 30m | automatic on green window |
| progressive-50 | 50% | 30m | automatic on green window |
| full-100 | 100% | 1h | automatic on green window |
```

The example is the **Critical** ladder, the factory's full rollout: staging, canary 5%, progressive 25%, 50%, 100%.

- `Stage`: unique lowercase kebab-case names. The first stage is `staging`: 0% of production traffic, smoke and QA tests. It is always present, whatever the tier.
- `Traffic`: a percentage. The production stages that follow strictly increase and end at 100%.
- `Watch Window`: a positive duration (`30m`, `2h`, `1d`) on every stage. Promotion needs the whole window observed green. For a **Critical** change, each production stage's window must be at least as long as the previous production stage's.
- `Promotion`: always `automatic on green window`. Promotion is never a person's judgement call in the moment.
- The production ladder rises with the tier. The shape is exact: fewer stages, extra stages, or another shape are rejected.

| Tier | Production stages | Required shape |
|---|---|---|
| Low | 1 | 100% |
| Medium | 2 | Canary 5%, then 100% |
| High | 3 | Canary 5%, exactly one intermediate step above 5% and at most 50%, then 100% |
| Critical | 4 | 5%, 25%, 50%, 100% (the factory ladder) |

- The tier that decides the ladder is the effective tier. With `--think` or `--plan`, `Tier` must equal the tier they give (a tier raised in Plan wins), so the ladder checked is the one for the raised tier.
- The stage names are free kebab-case, and `evaluate-rollout.mjs` decides each one by its name from this table, for every ladder.

### `## Thresholds`

```markdown
| Metric | Kind | Comparator | Limit | Rollback |
|---|---|---|---|---|
| error_rate | health | <= | 1 | Traffic shift back |
| latency_p95_ms | health | <= | 300 | Traffic shift back |
| cpu_saturation_pct | health | <= | 80 | Redeploy previous artifact |
| role_assignment_success_rate | business | >= | 95 | Feature flag off |
```

- `Metric`: a unique snake_case key. It is the key the rollout reads from `metrics.json`.
- `Kind`: `health` or `business`.
- `Comparator` and `Limit` state the **healthy** condition: the metric must satisfy `metric <comparator> limit`. Anything else is a breach. Comparators: `<`, `<=`, `>`, `>=`. The limit is a number.
- `Rollback`: the mechanism applied when this threshold is breached. One of `Feature flag off`, `Traffic shift back`, `Redeploy previous artifact`, and also listed in `## Rollback`. `Forward fix` is not automatic and is rejected here.
- Health thresholds are mandatory for **error rate**, **latency**, and **saturation**. They are matched on whole snake_case words of the metric name, not on substrings:

| Health metric | Name contains the word |
|---|---|
| Error rate | `error` or `errors` |
| Latency | `latency`, `latencies`, `response_time`, or `duration` |
| Saturation | `saturation`, `cpu`, `memory`, `utilization`, `utilisation`, `queue`, `connection_pool`, or `disk` |

- A name that also holds an inverse word (`free`, `success`, `successful`, `ok`, `healthy`, `available`, `availability`, `headroom`, `without`) measures the opposite, where higher is healthier. `error_free_rate` and `memory_free_pct` are **business** metrics only: they never satisfy a required health threshold, and declaring them `health` is rejected. A name that merely holds the letters (`terror_rate`, `cpuset_pct`) is not matched either.
- Every health threshold on those three metrics must be **non-vacuous**. These metrics are bad when high, so the healthy condition is bounded from above and a breach is a value above the limit:
  - `Comparator` is `<` or `<=` (a `>` or `>=` healthy condition, such as `error_rate >= 0`, can never fail).
  - `Limit` is greater than 0 (a zero or negative limit is breached by normal operation).
  - An error rate or saturation metric expressed as a percentage (its name has `rate`, `pct`, `percent`, or `percentage`) has a `Limit` of at most 100, and `<= 100` is rejected as it can never be breached.
- Any threshold on a rate or percentage metric (a name with `rate`, `pct`, `percent`, or `percentage`), business or health, must separate healthy from unhealthy values. Rejected on a 0 to 100 value: never breached (`>= 0`, `> -1`, `<= 100`, `< 101`) and always breached (`< 0`, `<= -1`, `> 100`, `>= 101`). Business thresholds may otherwise use any comparator, and their limit must be a number.
- When `## Outcome Metric` names a metric, at least one `business` threshold is required.
- No threshold is optional and none is disabled at rollout time. Changing a threshold means changing `release.md` before deployment.
- Starting points the `Release Planner` proposes, which DevOps tunes against the service's real baseline:

| Tier | `error_rate` (%) | `latency_p95_ms` | Saturation (%) | Business threshold |
|---|---|---|---|---|
| Low | <= 2 | <= 1.2 x baseline p95 | <= 85 | Not worse than baseline |
| Medium | <= 1 | <= 1.2 x baseline p95 | <= 80 | Not worse than baseline |
| High | <= 0.5 | <= 1.1 x baseline p95 | <= 80 | Not worse than baseline |
| Critical | <= 0.1 | <= 1.05 x baseline p95 | <= 75 | Not worse than baseline |

### `## Rollback`

Bullets of mechanisms, each as `- <mechanism>: <how>`, followed by two or three fields:

| Mechanism | Time to effect | Used for |
|---|---|---|
| `Feature flag off` | Seconds | Behavior regressions |
| `Traffic shift back` | Under 1 minute | Deployment-level failures |
| `Redeploy previous artifact` | Minutes | Config or runtime issues |
| `Forward fix` | Hours | Data-affecting issues where rollback is unsafe |

| Label | Content |
|---|---|
| `Primary` | The mechanism to try first. Must name one of the listed mechanisms |
| `Decided By` | `DevOps` or `QA and maintainer`: who decides to roll back when a human decision is needed |
| `Data-Affecting` | Optional, `yes` or `no` (default `no`). `Forward fix` may only be listed when `yes` |

- For **High** and **Critical** changes the `Primary` text must contain the rollback declared in `think.md` (`## Blast Radius`, `Rollback`), and that rollback must exist. A change with no rollback path is not deployed.
- Because every threshold names an automatic mechanism, `Forward fix` can never be the only mechanism.

### `## Outcome Metric`

The handoff to Learn. Reuse the metric already committed in the Triage backlog issue; do not invent a new one.

| Label | Content |
|---|---|
| `Metric` | The outcome metric, or `_None._` |
| `Baseline` | Current value, starting with a number (`45`, `45 minutes`) |
| `Target` | Target value, starting with a number. Must be below the baseline when `Direction` is `down`, above it when `up` |
| `Direction` | `up` or `down` |
| `Watch Window Days` | Positive integer: how long Learn watches before judging the hypothesis |
| `Hypothesis Ledger Entry` | `<workspace-relative path>#<row>` in the hypothesis ledger (`specs/learn/hypotheses.md#42`), where `<row>` is this release's own `Issue` number, or `_None._ <reason>` |

With no outcome metric, every field is `_None._` and the ledger field is `_None._` followed by the reason (for example `_None._ Internal refactor with no measurable outcome.`).

### `## Changelog`

- `Customer Commitment` is `yes`: exactly one line, a customer-facing entry of at most 200 characters.
- `Customer Commitment` is `no`: exactly `_None._`.

Release notes and the changelog are drafted from merged pull requests during Code, and a person approves them. This section holds the one customer-facing line.

### `## Ambiguities & Open Questions`

Unresolved questions that need DevOps or the Product Owner, or the exact literal string `_None._`.

---

## 3. Cross-File Checks (`--think`, `--plan`, `--dir`)

| Flag | Check |
|---|---|
| `--think <think.md>` | The release `Tier` equals the tier in `think.md`. For High/Critical, `think.md` names a rollback and the release `Primary` contains it |
| `--plan <plan.md>` | The release `Tier` equals the tier in `plan.md`: `Tier from Think`, or the raised tier when `Still Holds` reads `Raised to <tier>`. `Tier from Think` must equal `think.md` when both are given |
| `--tag <tag>` | `Version` equals the tag, ignoring a leading `v` |
| `--dir <specs/issue-N>` | Uses `release.md`, plus `think.md` and `plan.md` when present, and requires `Issue` to equal `#N` |

---

## 4. Rollout Decision: `scripts/evaluate-rollout.mjs`

```bash
node scripts/evaluate-rollout.mjs --release specs/issue-42/release.md --stage canary-5 --metrics metrics.json
```

`metrics.json` is produced by the pipeline from the observability backend. `stage` is required and must equal `--stage`, so one stage's metrics can never promote another. Each metric carries its worst value over the observed window (highest for `<`/`<=` thresholds, lowest for `>`/`>=`), because a breach at any moment is a breach:

```json
{ "stage": "canary-5", "observedMinutes": 30, "metrics": { "error_rate": 0.4, "latency_p95_ms": 220 } }
```

Output: `{ "decision": "promote" | "hold" | "rollback", "stage": "...", "reasons": [...], "rollbackWith": "<mechanism>" | null }`.

| Order | Condition | Decision |
|---|---|---|
| 1 | Any threshold breached, at any time, even before the window ends | `rollback`, with the breached threshold's mechanism |
| 2 | A threshold metric is missing or not a number | `hold` |
| 3 | `observedMinutes` is below the stage's Watch Window | `hold` |
| 4 | Every threshold inside its limit and the window fully observed | `promote` |

- When several thresholds breach, `rollbackWith` is the broadest mechanism among them: `Redeploy previous artifact`, then `Traffic shift back`, then `Feature flag off`. All breaches are listed in `reasons`.
- Stage `staging` does not read the production thresholds. It needs `smoke_failures` and `qa_failures` (both numbers, 0 or more): any value above 0 is a `rollback` with `rollbackWith: null` (nothing is exposed in production); a missing, negative, or non-numeric value or an unfinished window is a `hold`.
- The decision is pure: the same release and metrics always give the same decision. There is no override flag.
- Exit codes: **0** promote, **2** hold, **1** rollback or error (unknown stage, missing or mismatched `stage` in `metrics.json`, malformed files, invalid `release.md`, unknown or valueless flags). A pipeline must treat anything other than 0 or 2 as rollback.
- `--list-stages` prints the production stage names in order, one per line, for the pipeline loop.

---

## 5. Pipeline: `references/release.yml`

A GitHub Actions template (tag `v*` on `main`), with every project-specific step marked `PLACEHOLDER`:

1. **declare**: tag is on `main`, the tag message names exactly one issue, `validate-release.mjs --dir --tag` passes.
2. **build**: immutable, versioned artifact; SBOM and signing placeholders; refuses to overwrite an existing version.
3. **staging**: deploy with the flag off, `preview-smoke`, QA, then the staging gate.
4. **rollout**: per production stage, apply traffic, collect metrics, call `evaluate-rollout.mjs`, and act on its exit code: promote moves on, hold waits (and rolls back after `MAX_HOLD_POLLS`), rollback records the mechanism.
5. **enable**: switch the `Flag` on for everyone (the release decision), confirm the change's dashboard is live in Learn (the factory's exit gate, a `PLACEHOLDER`), and hand the Outcome Metric to Learn.
6. **rollback**: applies the recorded mechanism, then fails the run.

Production access uses short-lived OIDC tokens bound to the `production` environment. No long-lived production secret exists in the repository, and no agent runs in this workflow.

---

## 6. Anti-Patterns & Prohibitions

1. **No batching.** One issue per release.
2. **No vibes-based rollout.** Thresholds and windows are declared before deployment. A person watching a dashboard and deciding by feel is not a gate.
3. **No mutable artifacts.** Never `latest`. A version is built once.
4. **No release without a named rollback.** Every threshold names its mechanism, and High/Critical match Think.
5. **No AI in the rollout and no AI sign-off.** AI drafts `release.md`; it never deploys, never holds production credentials, and never disables or loosens a threshold. DevOps approves.
6. **No deploy-equals-release.** The `enable` flag is the release decision. Code reaches production switched off.
