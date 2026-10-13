# Learn Signals Contract

The Learn stage closes the loop of the operating model: **the loop closes when a Learn output has become a new backlog issue in Triage.** `emit-learn-issues.mjs` turns validated Learn outputs into issue bodies that the Triage Analyst can pick up.

Only validated inputs are emitted. An invalid incident record, ledger, or findings file stops the run and writes nothing.

---

## 1. Inputs

| Input | Option | Validated by |
|---|---|---|
| Incident record (repeatable) | `--incident docs/incidents/<date>-<slug>.md` | The `incident-record` rules at the `draft` stage, so `Triage Issue: Pending` is accepted |
| Hypothesis ledger | `--ledger specs/learn/hypotheses.md` | The `hypothesis-ledger` rules |
| Telemetry findings | `--findings findings.json` | The `--json` output of `telemetry-scan` |

The incident and ledger parsers are copies of the owning skills' modules in `scripts/vendor/`, because skills do not import across each other. The tests fail when a copy drifts from its original (when both are present).

---

## 2. What Becomes an Issue

| Source | Rule | Marker id |
|---|---|---|
| Incident | One issue per `Control Hardening` item (a control to tighten), plus one repair follow-up when the mitigation was `flag off` or `rollback` (lift the mitigation on the fixed code). Nothing for `None: <reason>` or a forward fix | `<date>-<slug>-control-<k>`, `<date>-<slug>-repair` |
| Hypothesis | A row `Invalidated` whose action is `Delete feature (Pending)`: an issue to delete the feature | the issue number, for example `15` |
| Telemetry | A finding of severity `high`. `medium` findings stay in the weekly review | the finding id, for example `error_rate-anomaly-2026-10-13` |

---

## 3. Issue Body

Each body is a candidate need in the Triage intake format:

```markdown
<!-- learn-signal: incident:2026-10-13-checkout-5xx-control-1 -->
## Problem Statement
...

## Evidence
| ID | Type | Reference | Quote or Count |
|---|---|---|---|
| E1 | incident | docs/incidents/2026-10-13-checkout-5xx.md | Incident 2026-10-13-checkout-5xx: SEV2, tier High, ... |

## Draft Acceptance Criteria
- Given ..., then ...

## Source
...
```

- Marker: `<!-- learn-signal: <incident|hypothesis|telemetry>:<id> -->` as the first line. A runner opens an issue only when none with the same marker exists, so emitting twice never duplicates.
- Evidence type: `incident`, `hypothesis-verdict`, or `telemetry`. All three are accepted by Triage as non-anecdotal evidence. The reference is a workspace path (with an anchor where one exists) and the last column is a one-line factual description.
- Problem Statement, criteria, and source are drafts. The Triage Analyst enriches them. The Product Owner decides.

---

## 4. Outputs

`emit-learn-issues.mjs --out <dir>` writes:

- `signal-<kind>-<id>.md`: one issue body per signal.
- `signals.json`: an array of `{ kind, title, labels, marker, bodyFile }`. Labels are always `needs:triage` and `source:learn`.

Exit code `0` emitted (zero signals is valid), `1` invalid input or arguments.

---

## 5. Storage & Issue Creation Pattern

In CI (the weekly Outcome review or the end of an incident review):

1. Run the emitter on the validated inputs.
2. For each entry in `signals.json`, search open and closed issues for the `marker`. Create the issue from `bodyFile` with the `labels` only when none exists.
3. Put the number of the created issue in the incident record's `Triage Issue` field (a pull request, validated at the `final` stage).
4. The Triage workflow picks the issue up through the `needs:triage` label.

---

## 6. Anti-Patterns & Prohibitions

1. **No AI decisions.** The emitter drafts issues. Triage proposes and the Product Owner decides.
2. **No unvalidated inputs.** Fix the record, the ledger, or the findings first.
3. **No silent losses.** A `high` signal, a control hardening item, and an invalidated feature each end as an issue. Only an explicit `None: <reason>` or a deleted feature closes without one.
4. **No duplicates.** The marker is the key.
