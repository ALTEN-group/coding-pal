---
name: hypothesis-ledger
description: 'Maintain and validate the Learn hypothesis ledger (specs/learn/hypotheses.md): add Open hypotheses, list reviews and feature deletions that are due, compute a deterministic proposed verdict from the observed metric, and report the validation and deletion rates. Use when preparing the weekly Outcome review, when a Triage issue names an outcome metric, or when CI validates the ledger. AI proposes; the Product Owner decides every verdict.'
license: MIT
---

# Hypothesis Ledger

Keep a ledger of every outcome bet and review it after its watch window. The script computes a proposed verdict with its maths. It never writes a verdict: **the Product Owner decides**, and an invalidated feature is deleted.

## When to Use This Skill

- A backlog issue names an outcome metric and the work item ships: add an `Open` row.
- The weekly Outcome review needs the hypotheses due for a verdict and the invalidated features still waiting for deletion.
- Someone has the observed metric and wants the proposed verdict with its maths before the review.
- CI validates `specs/learn/hypotheses.md` on a pull request.
- The monthly retrospective needs the hypothesis validation rate and the feature deletion rate.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/hypothesis-ledger/` or `.claude/skills/hypothesis-ledger/`, use that base path.

## Workflow

1. **Read `references/hypothesis-ledger-contract.md` now.** It is the authoritative source for columns, verdicts, actions, and the proposal maths.
2. Register a hypothesis when the work item ships (the row starts `Open`):

```bash
node scripts/ledger.mjs add --file specs/learn/hypotheses.md --issue 42 \
  --hypothesis "Order templates shorten order entry" --metric "Minutes per order" \
  --baseline 6 --target 3 --direction down --watch-ends 2026-11-30
```

3. Before the Outcome review, list what is due and propose verdicts from the observed numbers:

```bash
node scripts/ledger.mjs due --file specs/learn/hypotheses.md --today 2026-12-01
node scripts/ledger.mjs propose --file specs/learn/hypotheses.md --issue 42 --observed 3.4
node scripts/ledger.mjs stats --file specs/learn/hypotheses.md
```

4. Present each proposed verdict with its maths and suggested actions. **Do not edit the `Verdict`, `Action`, or `Decided` cells.** The Product Owner records them, as `<name> (Product Owner) on YYYY-MM-DD`, in a pull request.
5. Validate the ledger after every human edit and in CI:

```bash
node scripts/ledger.mjs validate --file specs/learn/hypotheses.md
```

6. Hand invalidated, not-yet-deleted features and other Learn outputs to the `learn-signals` skill so they become Triage backlog issues.

Treat a nonzero exit as an invalid ledger and fix the file or the command. The script is the enforcement gate.

## Done When

- `ledger.mjs validate` exits 0 on `specs/learn/hypotheses.md`.
- Every proposed verdict was presented with its maths and none was written by AI.
- Every `Invalidated` row is either deleted (`Delete feature (Deleted <date>)`) or listed by `due` and emitted as a Triage issue.
