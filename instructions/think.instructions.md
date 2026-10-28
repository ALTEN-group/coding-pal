---
description: "Normative standards for the Think record (think.md) derived from backlog issues. Applies when authoring, reviewing, or exploring options in think.md."
applyTo: "**/think.md"
---

# Specification Standards: Think

When authoring or validating the Think record, follow the installed `think` skill (read its `references/think-contract.md`).

## Phase Separation

- **Clean context separation**: Triage, Think, Plan, and Code run in separate sessions with clean context to prevent token depletion and error compounding.
- **Strict sequence**: Never create `plan.md` without a validated `think.md`. Never begin coding without a validated `plan.md`.
- **Triage input**: When `triage.md` exists for the work item, Think starts only from a Product Owner decision of `todo` and reuses its evidence and system mapping rather than re-deriving them. Think owns the blast radius tier, which Triage never sets.
- **Where code lives**: `think.md` contains **no source code**. Code appears only in `plan.md`.

## `think.md` Standards

- **Options, not conclusions**: Record 2 to 4 credible options with trade-offs, cost, and risk, including Forge reuse versus custom build, then the chosen approach with its reasoning.
- **Compose before you build**: Bind pre-approved Forge assets. A custom build needs a recorded reason and a note of what the Forge catalog was searched for.
- **Bind Forge assets as `forge/<id>@<version>`** (checked with the `forge` skill when installed), or state `- **None:** <reason>` for a custom build.
- **Ground in reality**: Trace requests through actual codebase components and layers. Never hallucinate nonexistent layers or Forge assets.
- **Respect Persistent Context**: Read instructions, specifications, and decision records, and list the ones that bound the solution.
- **Blast radius is set here, once**: Classify the tier from the affected APIs, schemas, queues, and consumers. Name the rollback mechanism for High and Critical.
- **Decision records**: A public API change, schema change, or boundary shift needs a drafted decision record. AI drafts, the Architect signs. Never mark a record as signed.
- **Approval is recorded by people**: Leave `Approved By` as `Pending`; the Developer and the Architect record their own approval.
