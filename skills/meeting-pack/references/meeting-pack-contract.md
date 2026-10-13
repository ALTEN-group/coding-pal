# Meeting Pack Contract

The Meet stage turns a client conversation into an **immutable Meeting Pack** that every later stage can be checked against. This contract follows the Agentic Software Factory's [0 — Meet](https://alten-group.github.io/agentic-software-factory/guide/stage-meet) stage.

Recording and speech-to-text belong to the sanctioned meeting intelligence tool. These primitives start from its **plain-text transcript**, normalize it, structure it into a pack, and validate it. AI structures the dialogue. People verify the speakers, read the needs back, and confirm them with the client.

---

## 1. Directory & Naming

Meetings live in the application repository:

```
meetings/<YYYY-MM-DD>-<slug>/
├── transcript.md   # immutable, normalized transcript
└── pack.md         # the Meeting Pack
```

- `<YYYY-MM-DD>` is the meeting date and must equal the transcript's `Date`. `<slug>` is lowercase kebab-case.
- The glossary is `docs/glossary.md`.
- File names are lowercase ASCII, UTF-8 without BOM.

Fields are written as bullets: `- **<Label>:** <value>`. Continuation lines (tables, sub-bullets) belong to the preceding field. Where a section may be empty, write the exact literal `_None._`.

---

## 2. `transcript.md`

```markdown
# Transcript: Acme discovery call

- **Date:** 2026-09-24
- **Tool:** <sanctioned meeting tool>
- **Source File:** acme-call.txt
- **Recording Consent:** Yes - announced at the start of the call, all participants agreed
- **Duration:** 00:42:10

## Speakers
| Name | Role | Side |
|---|---|---|
| Sam Lee | Product Owner | internal |
| Dana Moreau | Operations Director | client |

## Transcript
[00:00:05] Sam Lee: Thanks for joining.
[00:15:32] Dana Moreau: Our regional managers spend 45 minutes every morning...
```

Rules:
- Exactly two level-two headings: `## Speakers`, then `## Transcript`.
- `Date` is a valid ISO date. `Recording Consent` starts with `Yes` and says how consent was given. `Duration` is `HH:MM:SS`.
- Every speaker has a name (no colon), a role, and a side (`client` or `internal`). At least one speaker is client-side.
- Every body line is `[HH:MM:SS] Name: text` with a declared speaker. Timestamps never go backwards and never exceed `Duration`.
- The transcript is **immutable**. Never edit it. Term corrections live in the pack.
- A `- **Label:**` field appears once per header; a duplicate is rejected rather than silently taking the last value. The same holds for the pack's `## Meeting`, `## Executive Summary`, `## Confirmation` sections and each need's fields.

Produce it from a plain-text export with `scripts/normalize-transcript.mjs`. It refuses to overwrite an existing transcript without `--force`, and refuses `--force` entirely once a sibling `pack.md` exists, because the pack records the transcript's SHA-256.

---

## 3. `pack.md`

### Required Document Structure (In Exact Order)

1. `# Meeting Pack: <Meeting title>`
2. `## Meeting`
3. `## Executive Summary`
4. `## Domain Concepts & Terminology`
5. `## Candidate Business Needs`
6. `## Confirmation`
7. `## Ambiguities & Open Questions`

### `## Meeting`
- `Date`: equals the transcript's date.
- `Transcript`: the path to `transcript.md` in backticks.
- `SHA-256`: the digest of `transcript.md`. The validator recomputes it, so any edit to the transcript is caught.
- `Participants`: a table with columns `Name | Role | Side`. It includes every speaker, exactly as in the transcript, and may include silent attendees. A Product Owner and a Developer should attend; their absence is a warning.

### `## Executive Summary`
One page at most (350 words across the three fields):
- `Business Drivers`
- `Urgency`
- `Core Challenges`

### `## Domain Concepts & Terminology`
`_None._`, or a table with exactly these columns:

```markdown
| Term | Heard As | Definition | Status | Timestamp |
|---|---|---|---|---|
| Dispatch window | dispatch slot | Same concept, spoken differently. | correction | 00:16:10 |
| SOH dump | SOH dump | The stock-on-hand export from SAP. | new | 00:30:55 |
```

- `Status`: `known` (already in the glossary), `new` (staged for the glossary), or `correction` (the client used a variant of a glossary term).
- `Heard As` must appear in the transcript line at `Timestamp`. It equals `Term` for `known` and `new`, and differs for `correction`.
- With `--glossary`: `known` and `correction` terms must exist in the glossary, and `new` terms must not.
- The raw transcript is never changed. The table is the correction record.

### `## Candidate Business Needs`
`_None._`, or needs formatted `### N<k>: <Need in one sentence>` (sequential from `N1`), each with:
- `Problem Statement`: who is blocked, and what it costs them.
- `Evidence`: a table with columns `ID | Timestamp | Speaker | Quote`:
  - `Speaker` is `Name (Role)` and matches the transcript's Speakers table.
  - `Quote` is a **verbatim** substring of that speaker's line at that timestamp, in double quotes, at least 10 characters, with no ellipsis.
  - At least one quote comes from a **client-side** speaker.
- `Draft Acceptance Criteria`: `_None._`, or up to 8 sub-bullets of the form `Given ..., then ...`, with at least 3 words after `then`. The Plan later turns them into its acceptance criteria.
- `Concepts`: comma-separated terms from the terminology table or the glossary, or `_None._`.

### `## Confirmation`
Four fields. All are `Pending` in the `draft` stage. AI never confirms.

| Field | Completed form (`confirmed` stage) |
|---|---|
| `Speaker Verification` | `Verified by <participant> on YYYY-MM-DD` |
| `Client Read-Back` | `Done by <Product Owner> on YYYY-MM-DD` |
| `Written Summary Sent` | `Sent to <client participant> on YYYY-MM-DD` |
| `Client Confirmation` | `Confirmed by <client participant> on YYYY-MM-DD`, or `Corrected by ...` when the client corrected the pack |

Names must be participants and people, never an AI or automation (a notetaker bot is not a person): verification by any participant, read-back by a Product Owner, the summary sent to a client-side participant, and confirmation by a client-side participant. Dates are valid and on or after the meeting date.

### `## Ambiguities & Open Questions`
Unresolved questions, or `_None._`.

---

## 4. Stages

| Stage | Used by | Rules |
|---|---|---|
| `draft` (default) | Meeting Analyst output gate | Structure, quotes, terms, and the digest are valid. Every confirmation is `Pending`. |
| `confirmed` | CI exit gate | All four confirmations are completed by named people. |

Once confirmed, the transcript and the pack are **frozen**. CI should reject later edits to `meetings/*/transcript.md` and `meetings/*/pack.md`. Corrections go in a new meeting pack or a follow-up. `validate-meeting.mjs --dir` needs both files and rejects unknown flags; use `--transcript` to check a transcript alone.

---

## 5. Glossary: `docs/glossary.md`

Persistent Context owned by the Architect and changed by pull request.

```markdown
# Glossary

| Term | Definition | Aliases | Source |
|---|---|---|---|
| Dispatch window | The daily time slot during which trucks may leave the depot. | dispatch slot | docs/specs/dispatch.md |
```

Terms and aliases are unique (case-insensitive). `Aliases` is a comma-separated list or `_None._`. Every row has a definition and a source. The agent reads the glossary and never edits it. `emit-candidates.mjs` stages new terms and aliases in `glossary-additions.md` for a pull request.

---

## 6. Handoff to Triage

`scripts/emit-candidates.mjs --dir <meeting dir> --out <dir>` turns a **confirmed** pack into:
- `candidate-N<k>.md`: a backlog issue body. It starts with `<!-- meeting-candidate: <dir>#N<k> -->`, so CI can skip duplicates. `<dir>` is the `--dir` path relative to the git repository root (the current directory outside a git repository), so the marker is stable wherever the script runs. Stale `candidate-N*.md` files in the output directory are deleted before writing. It carries the problem, an evidence table in the Triage contract's format (reference `<dir>/transcript.md#HH:MM:SS (Name, Role)`), the draft acceptance criteria, and the confirmation line.
- `candidates.json`: title, labels (`needs:triage`, `source:meeting`), marker, and body file per need.
- `glossary-additions.md`: new terms and aliases to merge into `docs/glossary.md`.

Triage reuses the evidence rows and uses the transcript as `--source`. Draft acceptance criteria travel with the issue to Plan.

---

## 7. Anti-Patterns & Prohibitions

1. **No editing the transcript.** Corrections are recorded, never applied.
2. **No fabricated or paraphrased quotes.** Every quote is verbatim from a real line.
3. **No AI confirmations.** Only people verify speakers, read back, send, and confirm.
4. **No internal-only evidence.** A candidate need must be anchored in at least one client quote.
5. **No secrets, and no unconsented recordings.** Run `secret-guard` on meeting files, and record consent.
6. **No unconfirmed pack in the backlog.** Emission requires the `confirmed` stage.
7. **No summary essays.** The executive summary is one page.
