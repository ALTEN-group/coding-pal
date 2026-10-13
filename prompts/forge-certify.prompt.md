---
name: forge-certify
description: "Evaluate a proposed asset repository against the Forge certification checklist and draft its catalog entry for a pull request."
agent: Forge Curator
argument-hint: "repository URL or path of the proposed asset"
---

Slash command for the **Forge Curator** agent in certify mode.

## Resolve The Target

Use the first argument as the proposed asset: a repository URL or a local path. If none is given, use the active workspace folder when it is an asset repository. If the target is unclear, ask which repository to evaluate. Do not guess.

Use the catalog from `FORGE_CATALOG` when set, otherwise the one shipped with the `forge` skill, to check `composesWith` ids and for the draft validation.

## Run

Hand the repository to Forge Curator in certify mode. Return the checklist table with evidence per item, the draft catalog entry, the validation result, and the open questions. The entry goes to the Architect as a pull request to the catalog. Do not edit the catalog, and do not mark the asset certified.
