---
name: incident-record
description: 'Author and validate incident records (docs/incidents/<date>-<slug>.md): detect, mitigate first, diagnose with correlated evidence, repair with a failing test first, and learn within five working days, ending in control hardening and a Triage issue. Use when drafting a postmortem from timeline notes, when CI validates an incident record, or when computing time to restore. AI drafts and correlates; humans conclude and decide.'
license: MIT
---

# Incident Record

Turn a production incident into a validated record that proves the factory's incident rules: mitigation precedes diagnosis, humans conclude the cause, the repair starts with a failing test, the review happens within five working days, and every loss hardens a control or says why not.

## When to Use This Skill

- An incident was mitigated and the timeline needs to become `docs/incidents/<YYYY-MM-DD>-<slug>.md`.
- CI must gate an incident record on a pull request.
- The monthly retrospective needs time to restore for an incident.
- A defect, rollback, or near-miss raises the question: what reached production that a control should have caught?

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/incident-record/` or `.claude/skills/incident-record/`, use that base path.

## Workflow

1. **Read `references/incident-record-contract.md` now.** It is the authoritative source for headings, fields, timestamps, and rules.
2. Draft the record from the timeline notes, alerts, deploy history, and diffs the user supplies. Use real timestamps and commit ids. Never invent them. Leave a question under `## Ambiguities & Open Questions` instead of guessing.
3. Do not conclude the cause. Present the correlated evidence and a proposed cause, and leave `Concluded By` and `Rollback Decided By` for the named humans to fill in.
4. Validate with the script from this skill's directory:

```bash
node scripts/validate-incident.mjs --file docs/incidents/2026-10-13-checkout-5xx.md --tests-dir tests
```

Use `--stage draft` while the Triage issue number is not known yet. CI runs the default `final` stage.

5. Read the printed **time to restore** and compare it with the target of under 15 minutes.
6. Hand the validated record to the `learn-signals` skill so each control hardening item becomes a Triage backlog issue, then put the issue number in `Triage Issue`.

Treat a nonzero exit as an invalid record and fix the file. Model compliance is advisory; the script is the enforcement gate.

## Done When

- `validate-incident.mjs` exits 0 (stage `final`) with `--tests-dir` pointing at the test directory.
- The cause and the rollback decision each name a person and a role.
- Control hardening is listed as typed items, or `None` with a reason, and the Triage issue matches.
- No credentials, tokens, or customer data appear in the record.
