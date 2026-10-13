---
description: "Normative standards for decision records and escalations. Applies when authoring, reviewing, or consuming files under docs/decisions/."
applyTo: "**/docs/decisions/**"
---

# Decision Record Standards

When authoring or validating a decision record or escalation, follow the installed `decision-record` skill (read its `references/decision-record-contract.md`).

## Roles

- **AI drafts.** **The Architect decides and signs.** An AI-authored record is `Status: Drafted` with `Signature: Drafted: unsigned`.
- Never set `Accepted`, `Rejected`, or `Superseded`, and never write a signature. Never list an AI under `Deciders`.
- The squad decides everything the governance decision table does not assign to a named role. Do not write a decision record for a squad decision.

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
