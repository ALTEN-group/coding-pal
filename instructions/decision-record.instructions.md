---
description: "Normative standards for decision records and escalations. Applies when authoring, reviewing, or consuming files under docs/decisions/."
applyTo: "**/docs/decisions/**"
---

# Decision Record Standards

When authoring or validating a decision record or escalation, follow the installed `decision-record` skill (read its `references/decision-record-contract.md`).

## Roles

- **AI decides autonomously.** After validation, an automated decision may be `Accepted`, `Rejected`, or `Superseded` with `Deciders: <identity> (Automation)` and `Signature: Automated by <identity> on YYYY-MM-DD`. Use `Drafted: unsigned` while incomplete.
- Never fabricate human sign-off or put an AI identity in a human Architect signature. Human review is an explicitly requested checkpoint, not a mandatory gate at any risk tier.
- Record public API, schema, and boundary decisions and every Critical change. Keep required evidence, rollback, migration, and staged rollout controls; escalate unresolved failures or exhausted retries rather than waiving them.

## Content

- 2 or more real options, each with honest pros and cons. A record with one option, or a `Cons: _None._`, is rejected.
- `## Decision` states the chosen option and why. `## Consequences` names what becomes harder and what to monitor.
- Reuse the Think record. Cite real paths only; do not describe components you did not read.
- `tooling` records prove that the capability cannot be met natively and how AI context is preserved. `data-model` records carry a migration plan. `model-adoption` records link an evaluation report that exists.

## Numbering and History

- Records are `docs/decisions/<NNNN>-<slug>.md`, numbered sequentially from `0001` with no gaps and no duplicates.
- Never edit an `Accepted` record to change the decision. Write a new record with `Supersedes: <NNNN>`; the old one becomes `Superseded`.

## Escalations

- Only for cross-squad conflict, security exposure, compliance obligation, external commitment, or budget impact.
- State the options, a recommendation, and the Default Date by which silence adopts the recommendation. When that date passes, set the status to `Adopted by default`.

## Scope

- **Zero code changes.** Write only under `docs/decisions/`, plus the `Status` line of `## Decision Record` in the linked `think.md`.
