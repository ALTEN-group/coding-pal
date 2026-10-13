---
name: pre-read
description: "Draft the AI pre-read for a recurring meeting (triage-review, outcome-review, context-review, or operating-retro) from the relevant artifacts and metrics. Writes nothing."
agent: Learn Analyst
argument-hint: "triage-review | outcome-review | context-review | operating-retro"
---

Slash command for the **Learn Analyst** agent.

## Resolve The Target

Use the first argument as the meeting: `triage-review`, `outcome-review`, `context-review`, or `operating-retro`. If it is missing or none of these, ask which meeting. Do not guess. Meetings are for debate and decisions, so the pre-read is circulated ahead of time and nobody reads slides in the room.

## Run

Hand the meeting to Learn Analyst in review-pack mode. Collect only what the meeting needs, and write no files:

- `triage-review`: `node .agents/skills/triage/scripts/rank-backlog.mjs --dir specs --weights specs/triage/weights.json`. Report the ranking, needs awaiting a Business value score, ties, and `explore` needs.
- `outcome-review`: `ledger.mjs due`, `propose` (with observed values you ask the user for), and `stats`, plus the Learn outputs that still need a Triage issue (the deletions in `due`, and incident records whose `Triage Issue` is `Pending`).
- `context-review`: `context-lint.mjs`, `context-corrections.mjs propose`, and control signal-to-noise findings the user supplies.
- `operating-retro`: the metrics report (see `operating-retro`), the hypothesis rates from `ledger.mjs stats`, and the incident time to restore.

End the pre-read with the decisions the meeting must take and who takes them. Every number cites its command or file.
