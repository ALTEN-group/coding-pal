---
name: context-review
description: "Prepare the weekly Persistent Context & Controls review pack: context lint report, proposed artifacts from repeated corrections, and control signal-to-noise findings you supply."
agent: Learn Analyst
argument-hint: "repository root and optional notes, e.g. . or . notes/control-noise.md"
---

Slash command for the **Learn Analyst** agent.

## Resolve The Target

Use the first argument as the repository root (default `.`). Use any further argument as a file holding control signal-to-noise findings: for each Deterministic Control, how often it fires and how often it is bypassed or overridden. If none is given, ask whether the user has such findings. If not, say so in the pack. Do not invent numbers.

## Run

Hand the root to Learn Analyst in context mode. Run `context-lint.mjs` (with `context-baseline.json` when it exists) and `context-corrections.mjs propose` on the corrections log (`specs/learn/corrections.jsonl` unless the user names another). Present errors, warnings, the instruction count against the baseline, the topics that earned an artifact, the supplied control findings, and the controls hardened from incidents. Write nothing: the Architect and Developer decide, and changes arrive by pull request.
