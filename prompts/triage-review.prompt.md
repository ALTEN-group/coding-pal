---
name: triage-review
description: "Prepare the ranked backlog for the weekly Triage review from the scored triage.md files, using the strategic weights."
agent: Triage Analyst
argument-hint: "optional specs directory, e.g. specs"
---

Slash command for the **Triage Analyst** agent.

## Resolve The Target

Use the first argument as the specifications directory. Default to `specs/` when it exists. If neither is available, ask for the directory.

## Run

Hand the directory to Triage Analyst in review mode. Do not create or edit any `triage.md`, the ledger, or the weights. Run the `triage` skill's `scripts/rank-backlog.mjs --dir <specs> --weights <specs>/triage/weights.json` (omit `--weights` when the file does not exist) and present its ranked backlog.

Then list, for the Product Owner to act on: needs awaiting a Business value score, ties to break, any `triage.md` the script excluded as invalid, and the proposed `explore` needs with their evidence to gather. Make no decision.
