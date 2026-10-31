---
description: "Normative standards for the Plan record (plan.md) derived from think.md. Applies when authoring, reviewing, or breaking down steps in plan.md."
applyTo: "**/plan.md"
---

# Specification Standards: Plan

When authoring or validating the Plan record, follow the installed `plan` skill (read its `references/plan-contract.md`).

## Phase Separation

- **Clean context separation**: Triage, Think, Plan, and Code run in separate sessions with clean context to prevent token depletion and error compounding.
- **Strict sequence**: Never author `plan.md` directly from raw requirements. `plan.md` is derived strictly from a validated `think.md`.
- **`plan.md` is strictly the result of `think.md`**: The Plan reads the Forge bindings, constraints, and blast radius from Think. It never re-opens the options or the chosen approach.

## `plan.md` Standards

- **Derived from `think.md`**: Reference the source `think.md` in `## Prerequisites & Context`.
- **Explicit file scope**: Declare In Scope, Out of Scope, and Irreversible Changes. Every in-scope file is covered by a step. No step touches a file outside scope.
- **Observable acceptance criteria**: Statements a test can check without judgement. Format and count are in the contract.
- **Numbered, atomic steps**: `### Step 1: ...`, ordered strictly by dependency. Each step does one thing and depends only on earlier steps. Explicitly sequence test steps (testing acceptance criteria), core implementation steps, and documentation/contract steps as separate atomic steps rather than bundling them into a single step.
- **Preserve bootability**: Every step leaves the application bootable.
- **Step fields**: Every step carries the fields, in the order, that the contract requires (`Files`, `Action`, `New Code`, `Verification`, `Bootable Check`, `Serves`).
- **New Code**: The code for that step only, in a fenced block, composing the bound Forge assets and following repository conventions. Use `_None._` when the step writes no code. Split a step instead of pasting a large file.
- **Test plan**: Map each criterion to a test and to the step that creates it.
- **Reversibility**: A change a revert cannot undo, such as a data migration, gets its own reverse step.
- **Blast radius check**: Confirm the tier from Think still holds for the file scope, or raise it with a reason.
- **Autonomous approval**: After validating and cross-checking the plan, record `Approved By: Automated by <agent identity> on YYYY-MM-DD`. Continue to Code without mandatory human sign-off, at every blast radius. Never attribute an automated decision to a person; honor explicitly requested review checkpoints and escalate unresolved control failures.

## Downstream Code Rules

When an AI agent implements functionality from `plan.md`:

- **One step at a time**: Execute exactly one step per prompt/turn. Never attempt multiple steps in a single turn.
- **Apply the step's `New Code`**: Adjust it only as needed to fit the real repository, and report any divergence. Do not add behavior the step does not describe.
- **Verify before advancing**: Run the step's `Verification` and `Bootable Check` commands. If either fails, fix the failure immediately before moving forward.
- **Strict boundary adherence**: Edit only the files declared in that step's `Files:` list. Do not modify unlisted files or perform unrequested cleanup.
- **Mark completion**: Record completion with `code-loop` in `progress.json` (never edit `plan.md` after approval).
