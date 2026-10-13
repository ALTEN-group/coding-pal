---
name: forge
description: 'Search, bind, validate, and certify entries of the Forge, the catalog of certified reusable building blocks (shared services, libraries, templates, interface contracts). Ships a seed catalog with Gatelin and Foxnox. Use when Think looks for assets to reuse before a custom build, when CI checks Forge bindings in think.md and plan.md, when a proposed asset is added to the catalog, or when reporting Forge health.'
license: MIT
---

# Forge

Deterministic tooling around the Forge catalog: discover candidates for a need, validate the catalog against the certification rules, check Forge asset bindings in Think and Plan records, and report health signals. AI discovers and drafts. The Architect certifies and owns the Forge.

## When to Use This Skill

- Think must search for reusable assets before choosing a custom build, and record the chosen assets as bindings.
- CI must gate the bindings in `think.md` (and their use in `plan.md`) against the catalog.
- A new or changed asset is proposed for the catalog and must meet the certification checklist.
- The Architect wants Forge health signals across the work items.

## Path resolution

Resolve `references/`, `scripts/`, and `catalog.json` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/forge/` or `.claude/skills/forge/`, use that base path.

## Workflow

1. **Read `references/forge-contract.md` now.** It is the authoritative source for the catalog resolution order (`--catalog`, `FORGE_CATALOG`, then the seed `catalog.json`), the asset schema, certification checklist, lifecycle, binding format, and health signals. The seed lists **Gatelin** and **Foxnox**. An organization points `FORGE_CATALOG` at its own catalog.
2. **Discover** (Think). Search the catalog for the need, then judge the candidates semantically against their capabilities and interface docs:

```bash
node scripts/discover.mjs --need "users sign in with JWT sessions and role based access" [--kind shared-service] [--limit 5] [--json]
```

3. **Bind** in `think.md` under `## Forge Asset Bindings` as `- **forge/<id>@<version>:** <how it is composed>`. A custom build states `- **None:** <reason>` and a `Custom Build Reason` that names what was searched. Then check:

```bash
node scripts/bindings-check.mjs --think specs/issue-42/think.md
# after Plan: every bound asset must be composed by at least one step
node scripts/bindings-check.mjs --think specs/issue-42/think.md --plan specs/issue-42/plan.md
```

4. **Compose** in Plan and Code: the steps import, call, or deploy the bound asset, following its integration guide. Do not re-implement what it offers.
5. **Certify** a proposed asset (Architect decides): draft the catalog entry, then validate the catalog in the pull request:

```bash
node scripts/validate-forge.mjs --catalog forge-catalog.json
```

6. **Report health** (Architect, periodic):

```bash
node scripts/forge-health.mjs --catalog forge-catalog.json --specs specs [--stale-days 180]
```

Treat a nonzero exit as invalid output and fix the file rather than ignoring errors. Warnings (stale binding, alpha or beta maturity, a custom build that matches a Forge asset) need an answer in the Think record, not silence.

## Done When

- `bindings-check.mjs` exits 0 for the Think record, with every warning answered in `Reasoning` or `Custom Build Reason`.
- Every binding names an asset and version that exist in the catalog, and none is deprecated or removed.
- A catalog change passes `validate-forge.mjs` and is merged by the Architect through a pull request.
- No asset in the catalog or in a binding was invented.
