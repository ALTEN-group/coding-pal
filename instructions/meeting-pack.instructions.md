---
description: "Normative standards for client meeting records: transcript.md, pack.md, and the domain glossary. Applies when authoring, reviewing, or consuming files under meetings/ and docs/glossary.md."
applyTo: "**/meetings/**,**/docs/glossary.md"
---

# Meeting Pack Standards

When authoring or validating meeting records, follow the installed `meeting-pack` skill (read its `references/meeting-pack-contract.md`).

## Roles

- **AI structures the dialogue.** The Product Owner reads the needs back and the client confirms them. People verify speaker accuracy.
- **AI never confirms.** Leave all four `Confirmation` fields as `Pending`.
- The sanctioned meeting tool records and transcribes. These primitives start from its plain-text transcript.

## Transcript Integrity

- `transcript.md` is immutable. Never edit, reorder, trim, or "clean up" a line. Record term corrections in the pack's terminology table instead.
- Record the transcript's SHA-256 in the pack. Never recompute it after someone has edited the transcript.
- Record recording consent in the transcript header. Without consent, stop.
- Never put credentials, tokens, or other secrets in a meeting file. Run `secret-guard` before committing.

## Evidence

- Quote clients **verbatim**, with the timestamp and the speaker as `Name (Role)`. Never paraphrase inside a quote, never merge two lines into one quote, and never use an ellipsis.
- A candidate need needs at least one verbatim quote from a client-side speaker. Internal staff paraphrasing a need is not evidence.
- Stay on what was said. Do not add requirements, solutions, or priorities the client did not state. Put gaps under `## Ambiguities & Open Questions`.

## Structure

- Keep the executive summary to one page. Its fields and word limit are defined only in the installed `meeting-pack` skill's `references/meeting-pack-contract.md`.
- One candidate need is one problem in the client's words, with its evidence. Split unrelated problems into separate needs.
- Draft acceptance criteria are observable statements in the contract's format and count. Do not design the solution.
- Do not score, rank, or decide. That is Triage and the Product Owner.

## Glossary

- Read `docs/glossary.md` before writing the pack, so terms are named correctly.
- Mark a term `known` when it is in the glossary, `correction` when the client used a variant of a glossary term, and `new` when it is not there. Never edit the glossary in a meeting run. New terms and aliases are staged by `emit-candidates.mjs` for a pull request owned by the Architect.
- Keep definitions in the client's words, short, and specific.

## Scope

- Write only `pack.md` in the meeting's directory (and `transcript.md` through the normalizer, once). Do not modify code, the glossary, or other meetings.
- A confirmed pack is frozen. Corrections go in a new pack or a follow-up, not in place.
- One meeting per run. Do not carry context from another meeting.
