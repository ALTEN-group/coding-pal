---
name: meet
description: "Turn a client meeting transcript into a normalized transcript.md and a validated Meeting Pack with candidate business needs."
agent: Meeting Analyst
argument-hint: "transcript export or meeting directory, e.g. exports/acme-call.txt or meetings/2026-09-24-acme-discovery"
---

Slash command for the **Meeting Analyst** agent.

## Resolve The Target

Use the first argument as the source: a plain-text transcript export, or an existing meeting directory under `meetings/`. Fall back to the active editor file when it is a transcript. If the target is unclear, ask which meeting to process. Do not guess.

For a plain-text export, you also need the meeting title, date, tool, the recording consent statement, and a roster of every speaker with role and side (`client` or `internal`). Ask for anything missing. Never invent consent or roles.

## Run

Hand the resolved source to Meeting Analyst in pack mode. Write `transcript.md` once through the normalizer, then `pack.md`, and validate with the `meeting-pack` skill at the `draft` stage with `docs/glossary.md`. Do not confirm anything. Report the candidate needs and the terms staged for the glossary, and remind the user that the Product Owner reads the needs back to the client next.
