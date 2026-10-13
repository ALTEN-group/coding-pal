# Triage Specification Contract

Triage turns one candidate business need into one evidence-linked backlog issue with a prefilled scorecard and a proposed decision. The result is a persistent `triage.md` artifact that the Product Owner can review in minutes and the Think phase can consume without re-discovery.

AI enriches, scores, and proposes. **The Product Owner decides.** The contract encodes that split: the AI-produced file may never carry a final decision, and a final-stage file is only valid once a human has set one.

---

## 1. Directory & Naming

- Issue-driven work: `specs/issue-<number>/triage.md`, next to `think.md` and `plan.md`, on branch `specs/issue-<number>`.
- Persistent triage memory (optional but recommended): `specs/triage/ledger.md`.
- Strategic weights (optional, owned by the Product Owner): `specs/triage/weights.json`.
- File name is exactly `triage.md` (lowercase ASCII). UTF-8 without BOM.

---

## 2. `triage.md` Structure

### Required Document Structure (In Exact Order)

1. `# Triage: <Need in one sentence>`
2. `## Backlog Issue`
3. `## Evidence`
4. `## System Mapping & Early Risk`
5. `## Scorecard`
6. `## Decision`
7. `## Ambiguities & Open Questions`

No other level-2 headings. No production code. No task checklist.

### `## Backlog Issue`

Bullets, each as `- **<Label>:** <value>`:

| Label | Content |
|---|---|
| `Title` | The business need in one sentence, in the client's words where possible |
| `Problem Statement` | Who is blocked, and what it costs them |
| `Source` | The meeting, ticket, audit, or signal it came from |
| `Hypothesis` | A measurable expected outcome and its metric, or `_None._` |

### `## Evidence`

A Markdown table with exactly these columns:

```markdown
| ID | Type | Reference | Quote or Count |
|---|---|---|---|
| E1 | transcript-quote | meetings/2026-09-24-acme-discovery/transcript.md#15:14:32 | "Our regional managers spend 45 minutes every morning cross-referencing CSV exports." |
| E2 | ticket-cluster | support/2026-09-export.csv | 14 tickets |
```

- `ID`: unique (`E1`, `E2`, ...).
- `Type`: `transcript-quote`, `ticket-cluster`, `audit-finding`, `incident`, `telemetry`, `hypothesis-verdict`, or `field-note`.
- `Reference`: a link or workspace path (with an anchor or timestamp where possible). Never empty or a placeholder.
- `Quote or Count`:
  - `transcript-quote` and `field-note`: a **verbatim** quote wrapped in double quotes. No paraphrase, no ellipsis.
  - `ticket-cluster`: an integer count of at least 2 (for example `14 tickets`).
  - `audit-finding`, `incident`, `telemetry`, and `hypothesis-verdict`: the finding, incident, anomaly, or ledger identifier, or a one-line factual description. Learn emits the last three.
- At least one row must be **non-anecdotal**: `transcript-quote`, `ticket-cluster`, `audit-finding`, `incident`, `telemetry`, or `hypothesis-verdict`. A `field-note` alone is anecdotal.
- Needs that come from a Meeting Pack arrive with ready evidence rows (reference `meetings/<date>-<slug>/transcript.md#HH:MM:SS (Name, Role)`). Reuse them, and pass the transcript as `--source`.

### `## System Mapping & Early Risk`

Bullets, each as `- **<Label>:** <value>` (value or `_None._` where allowed):

| Label | Content |
|---|---|
| `Capabilities & Specs` | Existing capabilities, specifications, and architecture boundaries the need maps to (cite `docs/specs/...` paths where they exist), or `_None._` for a genuinely new capability |
| `Domain Concepts` | Glossary terms from Persistent Context the need uses, and any new term to propose |
| `Affected Systems` | Systems, services, schemas, or consumers likely touched (must not be empty) |
| `Early Risk` | Early risk that helps ranking |
| `Unknowns` | What the scan could not establish, or `_None._` |

The blast radius tier is set later, in Think. A `blast radius: <tier>` assignment anywhere in `triage.md` (outside quoted evidence) is invalid.

### `## Scorecard`

A Markdown table with exactly these columns and exactly these five rows (in any order):

```markdown
| Field | Score | Rationale |
|---|---|---|
| Customer value | 4 | Directly quoted by the Operations Director (E1). |
| Business value | Pending PO | Product Owner decides. |
| Effort | 3 | Touches the export service and one schema. |
| Risk | 2 | No auth or payment boundary involved. |
| Confidence | Medium | One direct quote, no corroborating tickets. |
```

- `Customer value`, `Effort`, `Risk`: integers 1 to 5.
- `Business value`: Product Owner-owned. In the `proposed` stage it must be exactly `Pending PO`; an integer 1 to 5 is valid only in the `final` stage.
- `Confidence`: `Low`, `Medium`, or `High`.
- Every row has a non-empty rationale.
- The scale is deliberately coarse. Do not add decimals or sub-scores.

### `## Decision`

| Label | Content |
|---|---|
| `Proposed` | `todo`, `explore`, `later`, or `no`: the AI proposal |
| `Rationale` | Why this decision. Required for every decision, and the permanent record for `no` |
| `Evidence to Gather` | What would reduce uncertainty. Required for `explore`; otherwise `_None._` |
| `Reopens` | Optional. A ledger id (`issue-<n>`) of a previously decided need this one deliberately revisits |
| `Final (PO)` | `Pending` until the Product Owner decides, then `todo`, `explore`, `later`, or `no` |
| `Decided By` | `Pending` (or absent) until the Product Owner decides, then `<name> (Product Owner) on YYYY-MM-DD`. The name must be a person, never an AI or automation |
| `Override Rationale` | Required in the `final` stage when `Final (PO)` differs from `Proposed`, and whenever `Final (PO)` is `todo` for a need with `Customer value` 4 or 5 and `Low` confidence |

Decision rules:

- A need with `Customer value` of 4 or 5 and `Confidence` of `Low` **must** be proposed as `explore`.
- The AI must leave `Final (PO)` as `Pending`, and `Decided By` as `Pending` or absent.

### `## Ambiguities & Open Questions`

Unresolved questions that need human clarification, or the exact literal string `_None._`.

---

## 3. Validation Stages

| Stage | Used by | Additional requirements |
|---|---|---|
| `proposed` (default) | Triage agent output gate | `Final (PO)` is `Pending` and `Decided By` is `Pending` or absent. `Business value` is exactly `Pending PO`. |
| `final` | CI exit gate after the Product Owner sets the decision label | All five scores complete. `Final (PO)` is one of the four decisions. `Decided By` names the Product Owner. `Override Rationale` present when it differs from `Proposed`, or when a low-confidence, high-value need is decided `todo`. |

Optional deterministic checks:

- `--source <file>` (repeatable): every `transcript-quote` and `field-note` quote must appear verbatim (whitespace-normalized) in at least one source file.
- `--ledger <file>`: compares the title with prior decisions (see below).

---

## 4. Triage Ledger: `specs/triage/ledger.md`

Persistent institutional memory of decided needs. A Markdown table:

```markdown
# Triage Ledger

| Issue | Title | Decision | Date | Rationale |
|---|---|---|---|---|
| issue-12 | Export inventory to CSV | no | 2026-09-30 | Superseded by the SAP connector. |
```

- Updated by CI or the Product Owner after the final decision. The agent never writes it.
- Every row needs an `issue-<number>` id, a title, a valid date, and a rationale. A `no` is recorded with its rationale.
- A candidate whose title matches a prior entry exactly is an error, unless `Reopens` names that entry.
- A candidate similar to a prior `no` entry is an error unless `Reopens` names it. Similar matches on other decisions produce a warning.

---

## 5. Strategic Weights: `specs/triage/weights.json`

Optional. The Product Owner owns it, and it changes through a pull request. All keys are optional; defaults are shown. Unknown keys are rejected so a typo cannot silently change nothing.

```json
{
  "customerValue": 1,
  "businessValue": 1,
  "effort": 1,
  "risk": 1,
  "confidence": { "Low": 0.5, "Medium": 0.75, "High": 1 }
}
```

`scripts/rank-backlog.mjs` computes `score = (customerValue*C + businessValue*B) / (effort*E + risk*R) * confidence` and orders by it. Needs awaiting a Business value score are listed separately. Ties are reported for a human to break.

---

## 6. Anti-Patterns & Prohibitions

1. **No fabricated evidence.** Every quote comes from a real source. When in doubt, use `--source`.
2. **No AI final decisions.** AI never decides which client problem matters most.
3. **No blast radius tier.** That belongs to Think.
4. **No narrative PRD.** Fields are short and structured.
5. **No false precision.** Scores are integers from 1 to 5.
6. **No code and no overwriting the human issue body.** Publish by comment.

---

## 7. Storage & Issue Attachment Convention

In CI (for example an issue labelled `needs:triage`):

- Commit `triage.md` to `specs/issue-<number>/` on branch `specs/issue-<number>`.
- Post it as an **Issue Comment** inside `<details open><summary>🎯 <b>triage.md (Evidence, Scorecard &amp; Proposed Decision)</b></summary> ... </details>`.
- Apply `triage:proposed` and the proposed decision label (`proposed:todo`, `proposed:explore`, `proposed:later`, or `proposed:no`).
- The Product Owner sets `decision:todo`, `decision:explore`, `decision:later`, or `decision:no`. CI then runs the `final` stage, applies `triage:ready`, and appends the ledger row.
- Think starts from `decision:todo`.
