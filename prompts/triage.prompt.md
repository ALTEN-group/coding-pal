---
name: triage
description: "Triage a candidate business need or a batch of tickets into evidence-linked triage.md artifacts with a prefilled scorecard and a proposed decision."
agent: Triage Analyst
argument-hint: "issue number or source path, e.g. #42 or meetings/2026-09-24-acme-discovery/pack.md"
---

Slash command for the **Triage Analyst** agent.

## Resolve The Target

Use the first argument as the candidate need: an issue number or URL, or a path to a meeting pack, support-ticket export, audit report, or notes file. Treat any remaining arguments as extra source files for quote verification.

If no argument is given, use the active editor file or selection when it holds a candidate need. If the target is still unclear, or the input holds several unrelated needs and the user wants one, ask which need to triage. Do not guess.

## Run

Hand the resolved need and its sources to Triage Analyst. For a batch of tickets or notes, cluster first and triage each cluster. Write `triage.md` under `specs/issue-<number>/` and validate it with the `triage` skill at the `proposed` stage. Do not set a final decision.
