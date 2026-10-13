# Telemetry Scan Contract

Predictive monitoring watches production telemetry before customers notice: it compares live signals with a baseline and with thresholds, and flags anomalies, adverse trends, and breaches. The scan is **deterministic**: the same files give the same findings. It reads exported telemetry. It never queries a production system, and it never holds production credentials.

Monitoring informs; humans act. The scan mitigates nothing. The rollback thresholds in Release still trigger automatic rollback on their own.

| Step | What happens | Who decides |
|---|---|---|
| **Detect** | The scan flags an anomaly, a trend, or a breach | AI proposes |
| **Explain** | The scan lists the deploys shortly before the first anomalous point; the agent correlates logs and diffs | QA and maintainer confirms |
| **Act** | Mitigate early, and open a Triage issue to tighten the control that should have caught it | QA and maintainer decides |

---

## 1. Inputs

All files are JSON. Timestamps are ISO 8601 UTC (`2026-10-13T09:30:00Z`).

### `series.json` (required)

```json
{ "error_rate": [ { "t": "2026-10-13T08:00:00Z", "v": 0.28 }, { "t": "2026-10-13T08:05:00Z", "v": 0.32 } ] }
```

- Keys are metric names. Points are strictly ascending in time and `v` is a finite number.
- At least 5 points per metric (10 when the baseline is computed).

### `baseline.json` (optional)

```json
{ "error_rate": { "mean": 0.3, "std": 0.05 } }
```

- When a metric has no baseline, it is computed from the **first 60%** of its series (population standard deviation).
- A key that matches no metric in the series is an error.

### `thresholds.json` (optional)

```json
{ "error_rate": { "max": 1.0 } }
```

- `max`, `min`, or both (`min < max`). A key that matches no metric in the series is an error.

### `deploys.json` (optional)

```json
[ { "t": "2026-10-13T09:10:00Z", "version": "v2.0.0", "diff": "new order-total calculation" } ]
```

---

## 2. Findings

| Kind | Rule | Severity |
|---|---|---|
| `anomaly` | The last 3 points all have \|z\| >= 3, where `z = (v - mean) / std` against the baseline | `high` when the smallest \|z\| of the last 3 is 5 or more, otherwise `medium` |
| `breach` | The last value is beyond a threshold | `high` |
| `trend` | The least-squares slope over the last 10 points heads toward a threshold (`r2 >= 0.6`), and the ETA to breach is within `--horizon-minutes` (default 120) | `high` when the ETA is within half the horizon, otherwise `medium` |

- `ETA (minutes) = (threshold - current) / slope`, with the slope in units per minute. A metric already beyond its threshold is a `breach`, not a trend.
- A baseline with a standard deviation of 0 uses a tiny floor so a jump from a flat baseline is still an anomaly.
- Each finding carries `id` (`<metric>-<kind>-<onset date>`), `metric`, `kind`, `severity`, `onset` (the first point of the run: the start of the anomalous or breaching run, or the start of the trend window), `evidence` (the numbers), `summary`, and `deploys`.
- With `--deploys`, `deploys` lists the deploys within **60 minutes before the onset** (the onset included).
- Findings are ordered by severity, then metric, then kind.

---

## 3. Output & Exit Codes

```bash
node scripts/telemetry-scan.mjs --series series.json [--baseline baseline.json] [--thresholds thresholds.json] \
  [--horizon-minutes 120] [--deploys deploys.json] [--json]
```

- Text by default. `--json` prints `{ "horizonMinutes", "metrics", "findings" }`, the input of `learn-signals` (`--findings`).

| Exit code | Meaning |
|---|---|
| `0` | Scanned. Findings of severity `medium` do not change the exit code: monitoring informs, humans act |
| `1` | Invalid input (unreadable or malformed file, unknown metric key, too few points) |
| `3` | At least one finding of severity `high`: CI can alert on it |

CI treats exit code `3` as an alert, not as a broken build: it pages or comments, and it does not block unrelated work.

---

## 4. Anti-Patterns & Prohibitions

1. **No production access.** The scan reads exports. The agent holds no production credentials.
2. **No automatic mitigation.** Mitigation is a human decision (QA and maintainer).
3. **No hidden baselines.** Say which baseline was used (supplied or computed from the first 60%). The report prints it.
4. **No alert fatigue.** Tune thresholds through a pull request. A scan that always exits `3` is fixed or removed.
5. **A missed signal becomes a stricter control.** A `high` finding emitted by `learn-signals` becomes a Triage issue.
