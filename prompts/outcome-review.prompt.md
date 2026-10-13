---
name: outcome-review
description: "Prepare the weekly Outcome review pack: hypotheses due for a verdict with proposed verdicts and their maths, validation and deletion rates, and new Triage candidates from Learn outputs."
agent: Learn Analyst
argument-hint: "ledger path and observed values, e.g. specs/learn/hypotheses.md #42=3.4 #43=118"
---

Slash command for the **Learn Analyst** agent.

## Resolve The Target

Use the first argument as the hypothesis ledger (default `specs/learn/hypotheses.md`). Treat each `#<issue>=<observed>` argument as the observed metric value for that hypothesis. Fall back to the active editor file when it is a ledger.

Ask for the observed value of every due hypothesis that has none. Do not guess a number.

## Run

Hand the ledger and the observed values to Learn Analyst in verdict mode. Run `ledger.mjs due` and `propose`, add `stats`, and list which Learn outputs still need a Triage issue: invalidated features awaiting deletion (the deletions in `due`), incident records whose `Triage Issue` is `Pending`, and `high` telemetry findings. To get ready issue bodies, run `emit-learn-issues.mjs` into a scratch output directory the user names; the runner skips any issue whose marker already exists. Present each proposed verdict with its maths and the suggested actions, the two rates, and the new Triage candidates. Write no verdict: the Product Owner decides at the review.
