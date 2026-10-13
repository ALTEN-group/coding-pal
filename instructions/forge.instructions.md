---
description: "Normative standards for the Forge catalog and its entries (certification, deprecation, versioning, ownership). Applies only to catalog files: a catalog under docs/forge, a forge-catalog.json, and the seed catalog of the forge skill. It does not apply to the forge skill's scripts or references, and it does not cover Forge bindings in think.md and plan.md (owned by the think-plan instruction and the forge contract)."
applyTo: "**/docs/forge/**,**/forge-catalog.json,**/skills/forge/catalog.json"
---

# Forge Standards

When authoring or reviewing a catalog entry, follow the installed `forge` skill (read its `references/forge-contract.md`).

## Roles

- **AI drafts catalog entries.** The Architect owns the Forge, certifies assets, and merges catalog changes through pull requests.
- **AI never certifies an asset** and never edits the catalog outside a pull request.

## Catalog Integrity

- Only assets listed in the catalog exist. Never invent an asset, a version, a URL, or a capability.
- An asset is listed only with an owner, a versioned interface, tests, and documentation. Validate every change with `node .agents/skills/forge/scripts/validate-forge.mjs --catalog <file>`.
- State unknown facts as unknown. Never fill a field to make the validator pass.

## Catalog Entries

- **Owner**: every entry names an accountable owner. An entry without one is not listed.
- **Certification**: list an entry only when the certification checklist of the contract holds. The Architect certifies by merging.
- **Versioning**: `version` is semantic and `releasedAt` is the date of that version. `stable` maturity needs `1.0.0` or above without a prerelease tag. A new release updates both fields together.
- **Deprecation**: deprecate with a `replacement` that exists and is active, and a future `removalDate`. A past `removalDate` means `removed`.
- **Compose before you build**: before drafting an entry, search the catalog for an asset that already covers the capability. Compose it (`composesWith`) rather than listing a duplicate.
