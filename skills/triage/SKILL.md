---
name: triage
description: 'Structure, author, validate, and rank persistent triage artifacts (triage.md) that turn a candidate business need into an evidence-linked backlog issue with a prefilled scorecard and a proposed decision. Use when a Triage Analyst agent or session enriches a candidate need, when CI validates triage readiness on an issue, or when preparing the ranked backlog for the weekly Triage review.'
license: MIT
---

# Triage

Produce deterministic `triage.md` artifacts that a Product Owner can validate quickly and the Think phase can consume without re-discovery. AI enriches, scores, and proposes; the Product Owner decides.

## When to Use This Skill

- A candidate need (meeting pack item, support-ticket cluster, audit finding, Learn signal, field note) must become a backlog issue with evidence, a scorecard, and a proposed decision.
- CI must gate a `triage.md` before it is attached to an issue, or after the Product Owner has set the decision.
- The weekly Triage review needs a deterministic ranking of scored backlog issues.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/triage/` or `.claude/skills/triage/`, use that base path.

## Workflow

1. **Read `references/triage-contract.md` now.** It is the authoritative source for headings, fields, scales, decision rules, ledger format, and weights. Scope exploration and scoring judgement are owned by the calling `Triage Analyst` agent, planning session, or issue trigger.
2. Draft `triage.md` from the candidate need and its real evidence. Never invent or paraphrase a client quote.
3. Validate with the deterministic script from this skill's directory:

```bash
# AI output gate: Final (PO) must still be Pending
node scripts/validate-triage.mjs --triage specs/issue-42/triage.md --stage proposed \
  --source meetings/2026-09-24-acme-discovery/transcript.md --ledger specs/triage/ledger.md

# Exit gate after the Product Owner has decided
node scripts/validate-triage.mjs --dir specs/issue-42 --stage final
```

Treat a nonzero validator exit as invalid output and fix the file rather than ignoring errors. Model compliance is advisory; the script is the enforcement gate.

4. For the weekly review, rank the backlog deterministically:

```bash
node scripts/rank-backlog.mjs --dir specs --weights specs/triage/weights.json
```

5. When running in CI for an issue:
   - Commit `triage.md` to `specs/issue-<number>/` on branch `specs/issue-<number>`.
   - Post it as an **Issue Comment** (`gh issue comment`) in a collapsible `<details>` block per the contract. Never overwrite the issue body.
   - Apply `triage:proposed` and the proposed decision label. Do not apply a `decision:*` label: that belongs to the Product Owner.

## Done When

- The validator accepts `triage.md` for the requested stage with exit code 0.
- Every contract section is populated without placeholder text.
- No final decision was set by the AI, and no blast radius tier was assigned.
