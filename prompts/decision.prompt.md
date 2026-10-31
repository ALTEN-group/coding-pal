---
name: decision
description: "Record an autonomous architectural decision with explicit Automation attribution, or an escalation, from Think or a described decision."
agent: Decision Scribe
argument-hint: "the decision to record, or a path to think.md"
---

Slash command for the **Decision Scribe** agent.

## Resolve The Target

Use the first argument as the decision: a path to a `think.md` (for example `specs/issue-42/think.md`), an issue number, or a short description of the decision. Treat any remaining arguments as extra context.

If no argument is given, use the active editor file when it is a `think.md` or a decision record. If the target is still unclear, ask which decision to record. Do not guess.

## Run

Hand the resolved decision to Decision Scribe. Write `docs/decisions/<NNNN>-<slug>.md` (or an escalation under `docs/decisions/escalations/`) and validate it with the `decision-record` skill. Completed automated decisions use Accepted, an Automation decider, and `Automated by <identity> on YYYY-MM-DD`; incomplete decisions stay Drafted and unsigned. Never invent human approval.
