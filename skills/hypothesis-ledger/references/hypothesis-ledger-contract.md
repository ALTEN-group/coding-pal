# Hypothesis Ledger Contract

The hypothesis ledger is the Learn stage's memory of bets. Every work item that named an outcome metric in its [Triage](../../triage/references/triage-contract.md) backlog issue gets one row, reviewed after its watch window. The ledger decides whether a feature stays, grows, or is deleted.

AI proposes a verdict with its maths. **The Product Owner decides.** The contract encodes that split: the script never writes a verdict, and a row with a verdict is only valid when a named Product Owner decided it.

---

## 1. Directory & Naming

- File: `specs/learn/hypotheses.md`. UTF-8 without BOM.
- One row per backlog issue. `add` creates the file when it is missing.
- The Weekly Outcome review reads the ledger. The agent never edits a verdict, an action, or a decision.

---

## 2. Structure

```markdown
# Hypothesis Ledger

| Issue | Hypothesis | Metric | Baseline | Target | Direction | Watch Ends | Verdict | Evidence | Action | Decided |
|---|---|---|---|---|---|---|---|---|---|---|
| #12 | Automatic reconciliation cuts the morning dispatch delay | Median minutes from dispatch window open to first truck out | 45 | 10 | down | 2026-09-30 | Validated | Observed 8 on 2026-10-02 (dashboards/dispatch-delay.png) | Remove flag | Sam Lee (Product Owner) on 2026-10-05 |
| #21 | Saved filters raise weekly active planners | Weekly active planners | 200 | 260 | up | 2026-10-31 | Open | _None._ | _None._ | _None._ |
```

- First non-blank line is `# Hypothesis Ledger`. One contiguous table with exactly the columns above. Text outside the table is allowed. Cells cannot contain `|`.
- `Issue`: `#<number>` without leading zeros, unique in the file.
- `Hypothesis`, `Metric`: non-empty text. `Metric` carries the unit.
- `Baseline`, `Target`: plain numbers (`45`, `0.35`, `-2`). They differ.
- `Direction`: `up` or `down`. It must agree with the numbers: `up` means `Target > Baseline`, `down` means `Target < Baseline`.
- `Watch Ends`: ISO date `YYYY-MM-DD`.
- `Verdict`: `Open`, `Validated`, `Inconclusive`, or `Invalidated`.
- `Evidence`: non-empty. `_None._` only while the row is `Open`. Otherwise the observed number and where it came from.
- `Action` and `Decided`: `_None._` while `Open`.

---

## 3. Verdicts, Actions, and Decisions

| Verdict | Meaning | Allowed `Action` |
|---|---|---|
| `Open` | Watch window running or review pending | `_None._` |
| `Validated` | Metric moved as predicted | `Remove flag`, `Invest further` |
| `Inconclusive` | No detectable movement | `Iterate once`, `Remove` |
| `Invalidated` | Metric did not move, or moved against us | `Delete feature (Pending)` or `Delete feature (Deleted YYYY-MM-DD)` |

- `Decided` is `<name> (Product Owner) on YYYY-MM-DD` for every non-`Open` verdict. The date is on or after `Watch Ends`. The name must be a named person: AI and bot names (`copilot`, `claude`, `gpt`, `gemini`, `bot`, `agent`, `dependabot`, `renovate`, `github-actions`, `ai`, `llm`, and similar, matched case-insensitively) and placeholders (`x`, `tbd`, `<name>`, a bare role) are rejected.
- Features that are invalidated are **deleted**. The deletion date cannot precede the verdict.
- The Product Owner decides. A developer, an agent, or a missing name is invalid.

---

## 4. Commands (`scripts/ledger.mjs`)

| Command | Purpose |
|---|---|
| `validate --file <ledger>` | Enforces everything above |
| `add --file <ledger> --issue <n> --hypothesis "<text>" --metric "<text>" --baseline <n> --target <n> --direction up\|down --watch-ends <date>` | Appends an `Open` row. Rejects duplicates and rows that would make the ledger invalid |
| `due --file <ledger> [--today <date>] [--cycle-days 14]` | Lists `Open` rows whose watch window ended before today, and `Invalidated` rows not deleted within the cycle after the verdict |
| `propose --file <ledger> --issue <n> --observed <number> [--tolerance 0.05] [--today <date>]` | Prints a proposed verdict with the maths. Writes nothing |
| `stats --file <ledger> [--cycle-days 14]` | Hypothesis validation rate and feature deletion rate |

### The proposal maths

```
progress = (observed - baseline) / (target - baseline)
```

Because `Direction` always agrees with the numbers, positive progress means the metric moved toward the target in either direction.

| Condition | Proposed verdict | Suggested actions |
|---|---|---|
| `progress >= 1` | `Validated` | `Remove flag`, `Invest further` |
| `progress < -tolerance` (moved against us) | `Invalidated` | `Delete feature` |
| otherwise (no movement, or short of the target) | `Inconclusive` | `Iterate once`, `Remove` |

`propose` applies to `Open` rows only. It warns when the watch window has not ended.

### The metrics

- **Hypothesis validation rate** = Validated / closed (every non-`Open` row). A rate close to 100% (90% or more, with at least 3 closed) prints a warning: the team only tests safe bets.
- **Feature deletion rate** = Invalidated features deleted within `--cycle-days` of the verdict / all Invalidated features.

---

## 5. Anti-Patterns & Prohibitions

1. **No AI verdicts.** `propose` prints. A person writes the row.
2. **No carried dead features.** An `Invalidated` row with `Delete feature (Pending)` past the cycle shows up in `due` until it is deleted.
3. **No moving targets.** Never edit `Baseline`, `Target`, or `Watch Ends` after the work item ships. Add a new hypothesis instead.
4. **No verdict without evidence.** The observed number and its source go in `Evidence`.
5. **Losses become Triage issues.** An `Invalidated` row whose feature is not deleted is emitted by `learn-signals` as a backlog issue.

---

## 6. Exit Codes

`0` valid or listed; `1` invalid ledger, invalid arguments, or a rejected `add`/`propose`.
