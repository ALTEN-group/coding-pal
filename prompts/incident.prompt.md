---
name: incident
description: "Draft and validate an incident record (docs/incidents/<date>-<slug>.md) from timeline notes, with correlated evidence, a test-first repair, and control hardening for the Learn review."
agent: Learn Analyst
argument-hint: "timeline notes file or incident record, e.g. notes/checkout-outage.md or docs/incidents/2026-10-13-checkout-5xx.md"
---

Slash command for the **Learn Analyst** agent.

## Resolve The Target

Use the first argument as the source: a file of timeline notes (alerts, actions, deploys, commits), or an existing incident record to validate. Fall back to the active editor file when it holds one of those. Treat further arguments as extra evidence files (logs, traces, deploy lists, diffs).

You need the real detection, mitigation, and resolution timestamps, the mitigation mechanism, the reproducing test, and the test and fix commits. Ask for what is missing. Never invent a timestamp, a commit, or who decided.

## Run

Hand the source to Learn Analyst in incident mode. Draft `docs/incidents/<YYYY-MM-DD>-<slug>.md` per the `incident-record` contract and validate it with `validate-incident.mjs --tests-dir <tests>` (use `--stage draft` while the Triage issue is pending). Propose the cause and the control hardening, and leave `Concluded By` and `Rollback Decided By` for the named people. Report the time to restore against the target of under 15 minutes, and offer to emit the Triage issues with `emit-learn-issues.mjs`.
