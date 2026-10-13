---
description: "Normative standards for persistent triage artifacts (triage.md) and the triage ledger. Applies when authoring, reviewing, or consuming triage.md, specs/triage/ledger.md, or specs/triage/weights.json."
applyTo: "**/triage.md,**/specs/triage/**"
---

# Triage Standards

When authoring or validating a triage artifact, follow the installed `triage` skill (read its `references/triage-contract.md`).

## Roles

- **AI enriches, scores, and proposes.** The Product Owner validates, sets Business value, breaks ties, and makes the final decision.
- **AI never decides which client problem matters most.** Leave `Final (PO)` as `Pending`, `Decided By` as `Pending` or absent, and `Business value` as `Pending PO`.

## Clean Context

- Triage runs in its own session with clean context, one candidate need per run. Do not carry over another need's evidence, scores, or conclusions.
- Ground the run in Persistent Context: the domain glossary, existing specifications (for example `docs/specs/`), decision records, and `specs/triage/ledger.md`.

## Evidence Integrity

- A candidate need from a Meeting Pack (`meeting-candidate` marker) comes only from a **confirmed** pack. Reuse its verbatim, client-attributed evidence rows and keep their `<dir>/transcript.md#HH:MM:SS` references. Do not re-quote from memory, and validate with the transcript as `--source`.
- Every backlog issue links to real evidence. Quote clients **verbatim** with a link or timestamp. Never paraphrase inside a quote, and never invent one.
- A `field-note` alone is anecdotal. Add at least one transcript quote, ticket cluster, audit finding, incident, telemetry finding, or hypothesis verdict.
- A need from Learn (`learn-signal` marker) arrives with its evidence row (`incident`, `hypothesis-verdict`, or `telemetry`) and a reference to the incident record, ledger row, or findings file. Reuse it rather than describing the signal from memory.
- Cluster tickets only from the supplied export. State the count, not an impression.

## Enrichment

- Map the need to existing capabilities, specifications, domain concepts, and architecture boundaries by reading the repository. Cite paths. Do not describe components you did not find.
- Name affected systems and early risk. List unknowns instead of guessing.
- Do **not** assign a blast radius tier. Think sets it.

## Scoring

- Use the coarse 1 to 5 scale and a one-line rationale per score. Precision is false precision.
- Customer value comes from the evidence. Effort and Risk come from a code and Persistent Context scan. Confidence reflects how direct the client evidence is.
- Customer value 4 or 5 with Low confidence is proposed as `explore`, with the evidence to gather named.
- A `no` proposal carries its rationale. It becomes institutional memory.

## Memory

- Check the ledger before scoring. If the need was decided before, link the earlier issue. Only set `Reopens` with a stated reason when the circumstances changed.
- The agent never edits the ledger or the weights. CI or the Product Owner does, after the final decision.

## Scope

- **Zero code changes.** The codebase is read-only. Write only `triage.md` under `specs/issue-<number>/`.
- Never overwrite the human issue body. Publish by issue comment.
- Neither the `triage.md` nor the issue comment contains source code, a plan, or a design.
