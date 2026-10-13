---
name: learn-signals
description: 'Close the Learn loop: turn validated incident records, invalidated hypotheses, and high severity telemetry findings into Triage backlog issue bodies (labels needs:triage and source:learn, marker comment learn-signal) so every loss and early warning reaches the Triage review. Use at the end of an incident review, at the weekly Outcome review, or after a telemetry scan. Only validated inputs are emitted.'
license: MIT
---

# Learn Signals

The Learn stage is finished when a Learn output has become a backlog issue in Triage. This skill emits those issues from inputs that already passed their own validators.

## When to Use This Skill

- An incident record is validated and its `Control Hardening` items must become backlog issues.
- The Outcome review invalidated a hypothesis and the feature must be deleted.
- A telemetry scan produced `high` findings.
- The weekly review wants every Learn output that still has no Triage issue.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/learn-signals/` or `.claude/skills/learn-signals/`, use that base path.

## Workflow

1. **Read `references/learn-signals-contract.md` now.** It defines what becomes an issue, the marker, and the body format.
2. Make sure every input is valid first (`incident-record`, `hypothesis-ledger`, `telemetry-scan --json`). The emitter validates again and refuses to emit from an invalid input.
3. Emit from this skill's directory:

```bash
node scripts/emit-learn-issues.mjs --out learn-signals \
  --incident docs/incidents/2026-10-13-checkout-5xx.md \
  --ledger specs/learn/hypotheses.md \
  --findings findings.json
```

4. Report the issues from `signals.json` (title, marker, labels). In CI, create an issue from each `bodyFile` with its labels only when no issue with the same `marker` exists. Do not overwrite or edit existing issues.
5. Put the new issue number in the incident record's `Triage Issue` field through a pull request.

Treat a nonzero exit as invalid input and fix the source file. The script is the enforcement gate.

## Done When

- The emitter exited 0 and `signals.json` lists every control hardening item, deletion, and `high` finding of the inputs.
- Each issue carries the labels `needs:triage` and `source:learn` and its `learn-signal` marker.
- No issue was decided, prioritised, or scored by AI.
