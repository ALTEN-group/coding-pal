---
name: operating-retro
description: "Prepare the monthly Operating-Model Retrospective pack from the flow-metrics report, the hypothesis rates, and incident time to restore."
agent: Learn Analyst
argument-hint: "events file or metrics report, e.g. metrics/events.jsonl or metrics/report.md, optional --since YYYY-MM-DD"
---

Slash command for the **Learn Analyst** agent.

## Resolve The Target

Use the first argument as the source of the metrics: either an events file (`events.jsonl`) or an existing metrics report. For an events file, an optional `--since YYYY-MM-DD` limits the window to the month under review.

The report comes from `.agents/skills/flow-metrics/scripts/flow-metrics.mjs --events <events.jsonl> [--since YYYY-MM-DD]`. If that skill is not installed, or no events file exists, ask the user for the metrics report. Do not compute flow metrics by hand or invent them.

## Run

Hand the source to Learn Analyst in review-pack mode and write nothing. Run `flow-metrics.mjs` on the events file when you have one, and add `ledger.mjs stats --file specs/learn/hypotheses.md` and the time to restore of the month's incident records (`validate-incident.mjs`). Present lead time, deployment frequency, change failure rate, time to restore, the outcome rates (validation rate and deletion rate), and what changed against the last month. Close with the questions the retrospective must answer about the operating model itself. The Product Owner, Architect, Developer, DevOps, and QA and maintainer decide the changes.
