---
name: forge-search
description: "Search the Forge catalog for reusable assets that cover a need, and produce the options and Forge asset bindings evidence for Think."
agent: Forge Curator
argument-hint: "the need in a sentence"
---

Slash command for the **Forge Curator** agent in discover mode.

## Resolve The Target

Use the arguments as the need, in one sentence. If none are given, use the Problem Statement of the open `specs/issue-<number>/think.md` or the selected text when it holds a need. If the need is still unclear, ask what the work must achieve. Do not guess.

Use the catalog from `FORGE_CATALOG` when set, otherwise the one shipped with the `forge` skill.

## Run

Hand the need to Forge Curator in discover mode. Report the candidate assets with version, maturity, status, matching capabilities, gaps, and how each would be composed, or state what was searched when nothing fits. Draft the `## Forge Asset Bindings` lines and validate them with `bindings-check.mjs` when a `think.md` exists. Do not edit the catalog.
