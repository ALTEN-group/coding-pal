# Flow Metrics Specification Contract

The Agentic Software Factory is steered by a deliberately small set of metrics, each of which a decision depends on (see the factory's [metrics page](https://alten-group.github.io/agentic-software-factory/guide/metrics)). This contract defines the event log those metrics are computed from, the exact formula and threshold of each metric, and what is deliberately not measured.

Metrics are computed from timestamps that pipelines already record. Nobody times anything by hand, and the computation is deterministic: the same log and the same period always produce the same report.

---

## 1. Event Log

- Path: `metrics/events.jsonl`. One JSON object per line, appended only. Never rewrite history; a wrong event is countered by a later one or removed through review.
- Every line is an event: `{ "t": "<ISO 8601 UTC>", "type": "<event type>", "id": "<id>", ...fields }`.
- `t` is `YYYY-MM-DDTHH:MM:SSZ` (milliseconds optional). `id` is lowercase `[a-z0-9._-]`, at most 80 characters: a work item (`issue-42`), a meeting (`2026-09-24-acme-discovery`), an incident (`incident-3`), or a defect (`defect-9`).
- Unknown fields are rejected. A log with one invalid line produces no report: fix the line.
- `scripts/emit-event.mjs` validates and appends. Pipelines call it; people do not edit the file.

### Event Types

| Type | `id` is | Required fields | Optional fields | Emitted when |
|---|---|---|---|---|
| `meeting.ended` | meeting | none | none | The client meeting ends |
| `meeting.transcribed` | meeting | none | none | The transcript is available |
| `issue.created` | work item | none | `meeting` (meeting id) | The backlog issue is created |
| `issue.ranked` | work item | none | `meeting` | The issue is ranked in the backlog |
| `code.first_run` | work item | `green` (bool) | none | The agent's first automated check run in Code ends |
| `code.fix_loop` | work item | `count` (integer) | none | Code finishes with this many fix loops (the latest event counts) |
| `pr.opened` | work item | none | none | The pull request is opened |
| `ci.first_run` | work item | `green` (bool) | none | The first CI run on the pull request ends |
| `pr.human_edit` | work item | none | none | A person altered code syntax in the pull request |
| `pr.validated` | work item | `tier` (`Low`, `Medium`, `High`, `Critical`) | `ci_green_at` (timestamp) | A person completes Minimum Human Validation |
| `pr.merged` | work item | none | none | The pull request is merged |
| `pr.reworked` | work item | none | none | Merged output had to be corrected |
| `release.production` | work item | `percent` (0 to 100) | none | Production exposure changes |
| `release.rollback` | work item | none | none | A release is rolled back or its flag shut off |
| `incident.opened` | incident | none | `change` (work item that caused it) | A production fault is detected |
| `incident.mitigated` | incident | none | none | The fault is mitigated |
| `defect.production` | defect | `escaped` (bool) | none | A defect is found; `escaped` is true when found in production |
| `hypothesis.closed` | work item | `verdict` (`validated`, `invalidated`, `inconclusive`) | none | The Outcome review closes a hypothesis |
| `feature.deleted` | work item | none | none | The feature behind the hypothesis is removed |
| `evidence.first_signal` | work item | none | none | The first real usage signal arrives |
| `ai.cost` | work item | `usd` (number), `stage`, `change` (work item id) | none | A workflow's model spend is recorded |
| `stage.assisted` | work item | `stage`, `share` (0 to 1) | none | The share of a stage's output produced with AI is recorded |
| `context.session` | work item | `hit` (bool) | none | An agent session ends; `hit` is true when committed Persistent Context was sufficient |
| `pr.authorship` | work item | `ai_lines` (integer >= 0), `human_lines` (integer >= 0), at least one positive | none | The pull request is merged and the lines of code, tests, and docs are attributed to AI or to a person (from the commit trailers or the authoring tool) |
| `usecase.run` | work item | `usecase` (slug), `minutes` (number >= 0), `iterations` (integer >= 1), `usd` (number >= 0), `human_intervention` (bool), `first_pass` (bool) | none | One run of an AI use case for the work item ends |

`stage` is one of `meet`, `triage`, `think`, `plan`, `code`, `prove`, `release`, `learn`. `usecase` is a lowercase slug (`[a-z][a-z0-9-]*`, at most 60 characters). The factory names `automated-test-creation`, `fix-loop`, `backlog-issue-creation`, `controls-first-run`, and `time-to-restore`; any other slug is reported without a target. `minutes` come from pipeline timestamps, and `human_intervention` is true when a person had to step in.

### Linking Meetings to Work Items

Meeting events carry the meeting directory name as `id`. `issue.created` and `issue.ranked` carry `meeting=<that name>`. When no link exists, a meeting event with the same `id` as the work item is used.

---

## 2. Period

`--since` and `--until` (inclusive ISO dates) select the period. **The outcome event decides whether a work item is in the period**: a lead time belongs to the period in which the 100% release happened, even though the meeting was earlier. Start events are read from the whole log.

Without a period the whole log is used. `--cycle-days` (default 14, the same cycle `hypothesis-ledger due` uses) is the cycle for feature deletion.

---

## 3. Metrics

Status is `ok` (meets the target, or the metric is trend-only), `warn` (misses it), or `unknown` (no events). Trend-only metrics never warn: the factory states a direction, not a threshold. Medians average the two middle values on an even count. Values are rounded to one decimal, and the status is computed from that rounded value: 79.96% is shown as 80.0 and meets an 80 target.

### Flow

| Metric | Formula | Target |
|---|---|---|
| Meeting-to-Production lead time | Median hours from `meeting.transcribed` to the first `release.production` with `percent` 100, per work item | `< 48` ok |
| Deployment frequency | `release.production` events with `percent` 100, per week of the period (at least 1 week; the period defaults to the span of the log) | `>= 14` per week ok. The factory target is "multiple daily deployments"; this contract interprets it as at least 2 production deployments per day on average over the report period |
| Change failure rate | Work items with a `release.production` event that later have a `release.rollback`, or an `incident.opened` whose `change` (or `id`) is that work item, over work items with a release | `< 1%` ok |
| Time to restore | Median minutes from `incident.opened` to `incident.mitigated`, per incident id | `< 15` ok |

### Meet & Triage

| Metric | Formula | Target |
|---|---|---|
| Hours from meeting end to ranked backlog issue | Median hours from `meeting.ended` to the first `issue.ranked` of the work item | `<= 8` ok |

### Code

| Metric | Formula | Target |
|---|---|---|
| First-pass green rate in Code | First `code.first_run` per work item with `green` true / work items | `>= 80%` ok |
| Fix-loop count | Mean of the latest `code.fix_loop` `count` per work item | `<= 3` ok; above 3 the Plan was too big or too vague |

### Prove

| Metric | Formula | Target |
|---|---|---|
| Deterministic control pass rate on first CI run | First `ci.first_run` per work item with `green` true / work items | `>= 80%` ok |
| Human rework rate | Merged work items with a `pr.human_edit` / merged work items | `0%` ok. Fixes belong in context, not code |
| Acceptance rate | Settled merged changes with no `pr.human_edit` and no `pr.reworked` within 14 days / settled merged changes | trend |
| Rework rate (14 days) | Settled merged changes with a `pr.reworked` within 14 days of `pr.merged` / settled merged changes | trend |
| Minimum human validation turnaround | Median hours from CI green (`ci_green_at`, else the first green `ci.first_run`) to `pr.validated`, also broken down by `tier` | trend |

A merged change is **settled** when its 14-day window has ended (relative to `--until`, or the last event in the log), or it already has a `pr.human_edit` or `pr.reworked`. Unsettled changes are excluded and counted in a note.

### Release

| Metric | Formula |
|---|---|
| Work items released to production | Distinct work items with any `release.production` event |
| Rollbacks | `release.rollback` events |

### Learn

| Metric | Formula | Target |
|---|---|---|
| Escaped defect rate | `defect.production` events with `escaped` true / all `defect.production` events | trend |
| Hypothesis validation rate | `verdict` `validated` / `hypothesis.closed` events | `< 95%` ok. A rate of 95% or more with at least 5 closed hypotheses warns: the factory says a rate "close to 100%" is a warning, not a success (the team tests only bets it is sure of). The 95% and 5 are this contract's interpretation of "close to 100%" |
| Feature deletion rate | Invalidated hypotheses whose `feature.deleted` came within `--cycle-days` / invalidated hypotheses whose cycle has ended (or that were deleted) | `100%` ok |
| Time to evidence | Median hours from `issue.created` to `evidence.first_signal`, per work item | trend |

### AI autonomy & leverage

| Metric | Formula | Target |
|---|---|---|
| Assisted share per stage | Mean `share` of `stage.assisted` events, per stage | trend. `warn` for `code` when it is the only stage with a share above 0 |
| AI code generation share | Sum of `pr.authorship` `ai_lines` / (sum of `ai_lines` + sum of `human_lines`) | `100%` ok (zero human syntax typing), `warn` below. Lines are summed across pull requests, not averaged per pull request |
| Context hit rate | `context.session` events with `hit` true / all | trend. Falling means artifacts are missing or stale |
| Cost per merged change | Sum of `ai.cost` `usd` / merged work items, with a per-stage breakdown | trend. Watch for spikes without a matching lead time reduction |

### Per Use Case

A **use case** is one AI-assisted task inside a stage. For every `usecase` slug the report prints one row from the `usecase.run` events in the period:

| Column | Formula |
|---|---|
| Runs | `usecase.run` events |
| Median minutes | Median of `minutes` (time spent) |
| Mean iterations | Mean of `iterations` |
| Mean USD | Mean of `usd` (cost), rounded to cents |
| Human intervention | `human_intervention` true / runs |
| First-pass success | `first_pass` true / runs |

The five use cases the factory names are always listed, and their status is `unknown` when no run was recorded. Any other slug found in the log is added. The only targets are the ones the factory's metrics page states for a use case; every other row is trend-only and never warns:

| Use case | Target |
|---|---|
| `automated-test-creation` | Median minutes `<= 30` |
| `fix-loop` | Mean iterations `<= 3` |
| `backlog-issue-creation` | Median minutes `<= 480` (8 hours) |
| `controls-first-run` | First-pass success `>= 80%` |
| `time-to-restore` | Median minutes `< 15` |

---

## 4. Deliberately Not Measured

| Not measured | Why |
|---|---|
| Lines of code | AI makes it meaningless and perverse |
| Story points velocity | Measures estimation, not value |
| Assistant suggestion acceptance in the editor | Correlates with nothing that matters |

`emit-event.mjs` has no event type for them and `flow-metrics.mjs` never computes them. A request to add one is a request to change the contract, reviewed in the monthly operating-model retrospective. `pr.authorship` counts lines only to attribute them to AI or to a person; the report prints the share, never a line count.

Not computed from events: cost per squad (the platform cost dashboard), coverage on changed lines (the pipeline's coverage gate), and review depth (the pull request record). Run the report once per squad log with `--since` set four weeks back to get the factory's per-squad rolling four-week window.

---

## 5. Anti-Patterns & Prohibitions

1. **No hand-timed metrics.** Events come from pipeline timestamps.
2. **No vanity output.** Never add lines of code, pull request counts, or suggestion acceptance.
3. **No history edits.** The log is append-only. Counter a wrong event with a later one.
4. **No unreviewed metrics.** A metric that has not driven a decision in two quarters is removed from the contract.
5. **No false comfort.** A validation rate close to 100% is a warning, not a success.
6. **No hand-counted authorship.** `pr.authorship` line counts come from the commit trailers or the authoring tool, never from a person's recollection.
