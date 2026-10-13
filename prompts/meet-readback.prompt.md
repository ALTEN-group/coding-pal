---
name: meet-readback
description: "Prepare the Product Owner's read-back list from a meeting transcript, so the client can confirm the captured needs before the meeting ends."
agent: Meeting Analyst
argument-hint: "transcript file, e.g. exports/acme-call.txt or meetings/2026-09-24-acme-discovery/transcript.md"
---

Slash command for the **Meeting Analyst** agent.

## Resolve The Target

Use the first argument as the transcript file (plain text or `transcript.md`). Fall back to the active editor file. If the target is unclear, ask. Do not guess.

## Run

Hand the transcript to Meeting Analyst in read-back mode. Write no files. Present a short list for the Product Owner to read aloud:

- each candidate need as one sentence in the client's words, with its best verbatim quote, speaker as `Name (Role)`, and timestamp,
- terms that need confirming against `docs/glossary.md`,
- open questions to ask before the meeting ends.

Confirm nothing, and do not edit the transcript.
