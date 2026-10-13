---
name: fix-gates
description: "Diagnose and fix a failing deterministic gate on a pull request without weakening any control, within the fix-loop limit."
agent: Gate Fixer
argument-hint: "path to failing gate output or pull request number"
---

Slash command for the **Gate Fixer** agent.

## Resolve The Target

Use the first argument as the failing gate output: a path to a log or report file, or a pull request number (use its failed checks). Resolve the work item from the branch name (`feature|fix|chore/issue-<n>-<slug>`), which gives `specs/issue-<n>/plan.md` and the current Plan step.

If no argument is given, use the active editor file when it holds gate output, or the pull request of the current branch. If the target or the work item is still unclear, ask. Do not guess.

## Run

Hand the failing output and the work item to Gate Fixer. Verify with the failed control and the installed `control-guard` skill, per the installed `prove-controls` instructions. Gate Fixer stops at the fix-loop limit for the Developer.
