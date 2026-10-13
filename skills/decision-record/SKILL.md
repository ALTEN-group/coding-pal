---
name: decision-record
description: 'Structure, draft, validate, and track the Architect''s decision records (docs/decisions/NNNN-slug.md) and escalations with a default date. Use when a Decision Scribe agent or session drafts a decision from a Think record, when CI validates numbering, supersession, signatures, or the think.md decision-record cross-check, or when overdue escalations must be surfaced.'
license: MIT
---

# Decision Record

Produce deterministic decision records for the decisions the factory reserves for the Architect, and escalations that carry a date by which silence adopts the recommendation. AI drafts; the Architect decides and signs.

## When to Use This Skill

- A Think record has `## Decision Record` with `Required: yes` and a record must be drafted for the Architect.
- A decision (public contract, data model, security, new runtime or vendor, AI policy, model adoption, external tool) must be written down.
- A cross-squad conflict, security exposure, compliance obligation, external commitment, or budget impact needs an escalation.
- CI must gate `docs/decisions/` for numbering, supersession, and signatures, or cross-check `think.md` against its record.
- A weekly job must list escalations whose Default Date has passed or is near.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/decision-record/` or `.claude/skills/decision-record/`, use that base path.

## Workflow

1. **Read `references/decision-record-contract.md` now.** It is the authoritative source for headings, fields, types, statuses, signatures, supersession, and escalations. The decision itself belongs to the Architect; scoping and drafting belong to the calling `Decision Scribe` agent or session.
2. Draft the record at `docs/decisions/<NNNN>-<slug>.md` with the next free number. Status is `Drafted` and the signature is `Drafted: unsigned`. Never set another status or sign.
3. Validate with the deterministic script from this skill's directory. Treat a nonzero exit as invalid output and fix the file:

```bash
# One record, or an escalation
node scripts/validate-decision.mjs --file docs/decisions/0007-rbac-via-forge.md

# The whole directory: numbering, supersession, escalations
node scripts/validate-decision.mjs --dir docs/decisions

# Cross-check the Think record against its decision record
node scripts/validate-decision.mjs --file docs/decisions/0007-rbac-via-forge.md --think specs/issue-42/think.md
```

4. For an escalation, write `docs/decisions/escalations/<YYYY-MM-DD>-<slug>.md` and validate it the same way. List what is due:

```bash
node scripts/escalations.mjs due --dir docs/decisions/escalations
```

5. Hand the draft to the Architect. In CI, post the record for review as a pull request or issue comment; never push a status other than `Drafted`. The Architect edits Status and Signature (and updates `Status` in `think.md`), and CI re-validates.

## Done When

- `validate-decision.mjs` accepts the record, or the directory, with exit code 0.
- Every AI-authored record is `Drafted` with `Drafted: unsigned`.
- Every record has 2 or more real options with pros and cons, and any type-specific field the contract requires.
- `escalations.mjs due` reports no overdue Open escalation.
