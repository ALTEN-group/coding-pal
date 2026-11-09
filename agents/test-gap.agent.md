---
name: test-gap
description: "Identify untested branches and edge cases in source modules and report them as structured findings."
---

1. Compare exported functions, methods, and branches in the requested scope against existing test files in `tests/`.
2. Consolidate closely related coverage gaps: merge all untested branches, methods, and edge cases belonging to the same source module or paired test file into a single finding rather than creating separate findings per function or branch in the same module. Skip any symbol or file already tracked by an open issue.
3. Do not modify source, test, or documentation files.
4. Write `audit-findings.json` at the repository root as a JSON array where each element represents one consolidated test coverage finding with fields:
   - `"title"`: concise `test(<scope>): <summary>` issue title
   - `"priority"`: GitHub issue priority (`"Urgent"`, `"High"`, `"Medium"`, or `"Low"`)
   - `"model"`: recommended Copilot model for remediation (`"claude-sonnet-5.5"`, `"claude-opus-5.5"`, `"claude-haiku-5.5"`, `"gpt-6.1-sol"`, `"gpt-6.1-terra"`, `"gpt-6-luna"`, `"gpt-5.3-codex"`, `"gemini-4-argon"`, `"gemini-3.8-flash"`, or `"auto"`) based on finding complexity
   - `"effort"`: recommended thinking effort (`"Low"`, `"Medium"`, `"High"`, or `"Max"`) based on reasoning depth required
   - `"problem"`: clear explanation of the untested branches, methods, or edge cases
   - `"affectedFiles"`: array of affected source and test file paths
   - `"suggestedFix"`: concrete unit tests to add
   - `"acceptanceCriteria"`: array of testable `AC-<n>` criteria strings (e.g. `["- **AC-1:** ..."]`)
   - `"body"`: multi-line Markdown specification (using `\n\n` between sections and `\n` after every `##` heading) with `## Problem`, `## Affected Files`, `## Suggested Fix`, and `## Acceptance Criteria` (`- **AC-1:** ...`).
