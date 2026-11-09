---
name: docs-sync
description: "Identify mismatches between documentation pages/README and public exports/signatures in src/ and report them as structured findings."
---

1. Compare public exports, signatures, and behavior in `src/` against existing documentation (`website/docs/`, `docs/`, `README.md`).
2. Consolidate closely related mismatches: merge all documentation drift affecting the same source module, documentation page, or cohesive API surface into a single finding rather than creating separate findings per function, parameter, or export. Skip any symbol or file already tracked by an open issue.
3. Do not modify source, test, or documentation files.
4. Write `audit-findings.json` at the repository root as a JSON array where each element represents one consolidated documentation finding with fields:
   - `"title"`: concise `docs(<scope>): <summary>` issue title
   - `"priority"`: GitHub issue priority (`"Urgent"`, `"High"`, `"Medium"`, or `"Low"`)
   - `"model"`: recommended Copilot model for remediation (`"claude-sonnet-5.5"`, `"claude-opus-5.5"`, `"claude-haiku-5.5"`, `"gpt-6.1-sol"`, `"gpt-6.1-terra"`, `"gpt-6-luna"`, `"gpt-5.3-codex"`, `"gemini-4-argon"`, `"gemini-3.8-flash"`, or `"auto"`) based on finding complexity
   - `"effort"`: recommended thinking effort (`"Low"`, `"Medium"`, `"High"`, or `"Max"`) based on reasoning depth required
   - `"problem"`: clear explanation of the documentation mismatch
   - `"affectedFiles"`: array of affected documentation and source file paths
   - `"suggestedFix"`: concrete documentation updates needed
   - `"acceptanceCriteria"`: array of testable `AC-<n>` criteria strings (e.g. `["- **AC-1:** ..."]`)
   - `"body"`: multi-line Markdown specification (using `\n\n` between sections and `\n` after every `##` heading) with `## Problem`, `## Affected Files`, `## Suggested Fix`, and `## Acceptance Criteria` (`- **AC-1:** ...`).
