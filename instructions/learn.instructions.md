---
description: "Normative standards for Learn artifacts: incident records and the hypothesis ledger. Applies when authoring, reviewing, or consuming files under incidents/ and specs/learn/."
applyTo: "**/incidents/**,**/specs/learn/**"
---

# Learn Standards

When authoring or validating a Learn artifact, follow the installed `incident-record` and `hypothesis-ledger` skills (read their `references/` contracts).

## Roles

- **AI proposes and drafts. Humans decide.** The QA and maintainer confirms causes and decides mitigation. The Product Owner decides every hypothesis verdict. The agent never writes a verdict, never concludes a cause, and never acts in production.
- Record who decided as `<name> (<role>)`. A decision without a named person is invalid.

## Incident Records

- File: `docs/incidents/<YYYY-MM-DD>-<slug>.md` with the exact sections of the contract. Validate with `validate-incident.mjs`.
- **Mitigation precedes diagnosis.** Flag off, roll back, or fix forward first. `Diagnosis Started At` is not before `Mitigated At`.
- Diagnose from correlated logs, traces, deploys, and diffs. State the evidence. A person concludes.
- **Repair with a failing test first.** Commit a test that reproduces the defect, confirm it fails, then commit the fix and confirm it passes. The test commit precedes the fix commit.
- Review each incident on the schedule the `incident-record` contract sets. Never put credentials, tokens, or customer data in a record. Run `secret-guard` first.

## Hardening Controls

- Ask of every defect, rollback, or near-miss: what reached production that a control should have caught? Record typed items: **guard**, **gate**, **contract**, or **probe**, or `None: <reason>`.
- A signal that arrived too late becomes an earlier **probe**.
- A loss without hardening needs its reason in writing.

## Hypothesis Ledger

- File: `specs/learn/hypotheses.md`, one row per backlog issue that named an outcome metric. Never change `Baseline`, `Target`, or `Watch Ends` after shipping. Add a new hypothesis instead.
- The script proposes verdicts and the Product Owner records them (verdict, action, evidence, and who decided), as the `hypothesis-ledger` contract defines. Never write a verdict yourself.
- **Delete invalidated features.** A dead feature is the most expensive technical debt in an AI-accelerated codebase. Record the deletion within one cycle, as the `hypothesis-ledger` contract defines.
- A validation rate close to 100% is a warning: the team only tests safe bets.

## Closing The Loop

- Losses and early warnings become Triage backlog issues: control hardening items, invalidated features, and `high` telemetry findings (`learn-signals`). The loop closes when each has an issue.
- Monitoring informs and humans act. Telemetry scans read exports and hold no production credentials.
