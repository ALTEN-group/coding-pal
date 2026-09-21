---
description: "Normative standards for persistent specification primitives (think.md and plan.md) derived from business needs. Applies when authoring, reviewing, or implementing from think.md and plan.md."
applyTo: "**/think.md,**/plan.md,**/specs/**,**/.specs/**"
---

# Specification Standards: Think & Plan

When authoring or validating specifications, follow the installed `think-plan` skill (read its `references/think-plan-contract.md`).

## Phase Separation

- **Clean context separation**: Think, Plan, and Build run in separate sessions with clean context to prevent token depletion and error compounding.
- **Specification invariant**: Neither `think.md` nor `plan.md` contains source code implementations. Code is written only during the Build phase.
- **Strict sequence**: Never create `plan.md` without a validated `think.md`. Never begin coding without a validated `plan.md`.
- **`plan.md` is strictly the result of `think.md`**: The Plan phase takes `think.md` as its primary input. Every file declared in `think.md`'s `Minimal Change Scope` must be mapped to implementation steps in `plan.md`, and all invariants established in `think.md` must be respected. Never author `plan.md` directly from ungrounded business prompts.

## `think.md` Standards

- **Ground in reality**: Trace requests through actual codebase components and layers (routers, controllers, services, database models). Never hallucinate nonexistent layers.
- **Single responsibility mapping**: Map each affected component to its exact responsibility in the proposed feature.
- **Preserve invariants**: Explicitly identify rules that must never break: authorization checks, audit triggers, transaction boundaries, response envelopes, and performance limits.
- **Minimal surgical footprint**: List the exact minimal set of files to add and modify. Explicitly state out-of-scope files to prevent agents from refactoring adjacent code.
- **Structure**: Must follow the exact 5 level-2 headings defined in the `think-plan` contract.

## `plan.md` Standards

- **Derived from `think.md`**: `plan.md` must explicitly reference the source `think.md` location in its `## Prerequisites & Context` section.
- **Numbered, atomic steps**: Every task must be an atomic step (`### Step 1: ...`, `### Step 2: ...`) ordered strictly by dependency.
- **Preserve bootability**: Every step must ensure the application remains bootable upon completion. A step that leaves the application unable to boot is invalid.
- **Required step metadata**: Every step must contain four explicit fields in order:
  - `- **Files:**` Exact workspace-relative file paths.
  - `- **Action:**` Surgical description of the change.
  - `- **Verification:**` The narrowest runnable test, lint, or inspection command.
  - `- **Bootable Check:**` Command or health assertion verifying process startup.

## Downstream Build Rules

When an AI agent implements functionality from `plan.md`:

- **One step at a time**: Execute exactly one step per prompt/turn. Never attempt multiple steps in a single turn.
- **Verify before advancing**: Run the step's `Verification` and `Bootable Check` commands. If either fails, fix the failure immediately before moving forward.
- **Strict boundary adherence**: Edit only the files declared in that step's `Files:` list. Do not modify unlisted files or perform unrequested cleanup.
- **Mark completion**: Update `plan.md` checklist item when verified.

## Storage & Issue Integration

- **Filesystem location**: Store files under `specs/` (default) or `specs/issue-<number>/` when tracking a specific issue.
- **Issue attachment**: In autonomous CI/CD pipelines, attach generated specifications to the triggering issue as an **Issue Comment** with collapsible `<details>` blocks rather than overwriting the issue description. Keep the branch link clear for downstream build agents.
