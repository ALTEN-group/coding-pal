---
name: flow-metrics
description: 'Record and compute the Agentic Software Factory metrics from an append-only event log (metrics/events.jsonl): validate and append events, then print a Markdown or JSON report of flow, per-stage, AI-leverage, and outcome metrics with targets and ok/warn/unknown status. Use when a pipeline must emit a delivery event, when preparing the monthly operating-model retrospective, or when checking lead time, first-pass green rate, fix loops, change failure rate, or cost per merged change.'
license: MIT
---

# Flow Metrics

Compute the factory's small, deliberate set of metrics from timestamps the pipeline already records. Nothing is timed by hand, and the same log always gives the same report.

## When to Use This Skill

- A pipeline step (meeting transcribed, issue ranked, first Code run, first CI run, merge, release, incident, hypothesis closed) must record an event.
- The monthly operating-model retrospective, or the weekly review, needs lead time, deployment frequency, change failure rate, time to restore, and the per-stage metrics.
- A metric must be checked against the factory's target before a decision depends on it.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/flow-metrics/` or `.claude/skills/flow-metrics/`, use that base path.

## Workflow

1. **Read `references/metrics-contract.md` now.** It is the authoritative source for event types, fields, formulas, thresholds, and what is deliberately not measured.
2. Emit events from the pipeline. The script validates the shape and appends one line to the log:

```bash
node scripts/emit-event.mjs --log metrics/events.jsonl --type code.first_run --id issue-42 --field green=true
node scripts/emit-event.mjs --log metrics/events.jsonl --type release.production --id issue-42 --field percent=100
node scripts/emit-event.mjs --log metrics/events.jsonl --type ai.cost --id issue-42 \
  --field usd=1.25 --field stage=code --field change=issue-42
node scripts/emit-event.mjs --log metrics/events.jsonl --type pr.authorship --id issue-42 --field ai_lines=240 --field human_lines=0
node scripts/emit-event.mjs --log metrics/events.jsonl --type usecase.run --id issue-42 --field usecase=automated-test-creation \
  --field minutes=22 --field iterations=2 --field usd=0.4 --field human_intervention=false --field first_pass=true
```

3. Compute the report. A line that is not a valid event stops the run; fix it rather than skipping it:

```bash
node scripts/flow-metrics.mjs --events metrics/events.jsonl --since 2026-09-01 --until 2026-09-30
node scripts/flow-metrics.mjs --events metrics/events.jsonl --json
```

4. Read the report by stage. `warn` names a metric that misses its factory target; `unknown` means no events yet; trend-only metrics never warn. Act on a `warn` by improving Persistent Context, controls, or Plan quality, not by pressing people.
5. Never add lines of code, story points, or editor suggestion acceptance. They are deliberately not measured.

## Done When

- Every emitted event passed `emit-event.mjs` with exit code 0.
- `flow-metrics.mjs` produced the report with exit code 0 on the whole log, including an empty one.
- No metric was computed by hand or taken from outside the event log.
