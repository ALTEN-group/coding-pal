---
name: meeting-pack
description: 'Structure, validate, and hand off persistent Meeting Packs from client meeting transcripts: normalize a plain-text transcript, build a pack (summary, terminology, candidate business needs with verbatim client quotes), validate it against the immutable transcript and the domain glossary, and emit backlog issues for Triage. Use when a Meeting Analyst agent or session processes a client meeting, when CI validates or confirms a pack, or when new client terminology must reach the glossary.'
license: MIT
---

# Meeting Pack

Produce deterministic, immutable meeting records so that every later stage can be checked against what the client actually said. AI structures the dialogue; people verify and confirm.

## When to Use This Skill

- A plain-text transcript from the sanctioned meeting tool must become a normalized `transcript.md`.
- A transcript must become a Meeting Pack: executive summary, domain terminology, and candidate business needs with verbatim, client-attributed quotes.
- CI must gate a pack (`draft`) or confirm it after human verification (`confirmed`).
- A confirmed pack must become backlog issues for Triage, and new terms must be staged for the glossary.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/meeting-pack/` or `.claude/skills/meeting-pack/`, use that base path.

## Workflow

1. **Read `references/meeting-pack-contract.md` now.** It is the authoritative source for file layout, headings, fields, stages, the glossary, and the Triage handoff. Scope and judgement are owned by the calling `Meeting Analyst` agent or session.
2. Normalize the plain-text export once. The result is immutable:

```bash
node scripts/normalize-transcript.mjs --input exports/call.txt --roster roster.json \
  --title "Acme discovery call" --date 2026-09-24 --tool "<meeting tool>" \
  --consent "Yes - announced at the start of the call" \
  --output meetings/2026-09-24-acme-discovery/transcript.md
```

3. Draft `pack.md` from the transcript and `docs/glossary.md`. Copy quotes character for character. Leave every confirmation `Pending`. Record the transcript's SHA-256 (printed by the script).
4. Validate with the deterministic script. Treat a nonzero exit as invalid output and fix the file. To prove the transcript came from a sanctioned tool, add `--sanctioned docs/governance/sanctioned-tools.md` (a Markdown bullet list, or one tool per line; headings, `#` comments, and prose around the bullets are ignored): the transcript header `Tool` must appear on it, case-insensitively.

```bash
# AI output gate
node scripts/validate-meeting.mjs --dir meetings/2026-09-24-acme-discovery --glossary docs/glossary.md

# Exit gate, after people verified speakers, read back, sent the summary, and the client confirmed
node scripts/validate-meeting.mjs --dir meetings/2026-09-24-acme-discovery --glossary docs/glossary.md --stage confirmed
```

5. Run the `secret-guard` skill on the meeting files before committing.
6. After confirmation, hand off to Triage:

```bash
node scripts/emit-candidates.mjs --dir meetings/2026-09-24-acme-discovery --out build/candidates --glossary docs/glossary.md
```

In CI, create one issue per `candidate-N<k>.md` (title and labels from `candidates.json`), skipping any whose `meeting-candidate` marker already exists. Open a pull request with `glossary-additions.md` merged into `docs/glossary.md`.

## Done When

- `normalize-transcript.mjs` wrote `transcript.md` (never overwritten once confirmed).
- `validate-meeting.mjs` accepts the pack for the requested stage with exit code 0.
- No confirmation was set by the AI, and no transcript line was altered.
- For emission, only a confirmed pack produced issue bodies.
