---
name: dead-code
description: "Identify unused internal exports, dead state properties, and orphaned helpers/assets and report them as structured findings."
---

1. Scan the requested scope for unused internal exports, orphaned helpers, write-only state fields, unused constants/assets, and unreachable branches.
2. Keep findings focused on a cohesive module or concern (do not bundle unrelated dead exports across disparate modules into a single catch-all issue), but **merge closely related findings**—such as multiple unused exports, dead state properties, or orphaned helpers within the same file/module or paired source/test files, or dead symbols coupled to the same feature—into a single consolidated finding before writing `audit-findings.json`. Skip any symbol or file already tracked by an open issue.
3. Do not modify source, test, or documentation files.
4. Write `audit-findings.json` at the repository root as a JSON array where each element represents one distinct finding with fields:
   - `"title"`: concise `chore(<scope>): <summary>` issue title
   - `"priority"`: GitHub issue priority (`"Urgent"`, `"High"`, `"Medium"`, or `"Low"`)
   - `"model"`: recommended Copilot model for remediation (`"claude-sonnet-5.5"`, `"claude-opus-5.5"`, `"claude-haiku-5.5"`, `"gpt-6.1-sol"`, `"gpt-6.1-terra"`, `"gpt-6-luna"`, `"gpt-5.3-codex"`, `"gemini-4-argon"`, `"gemini-3.8-flash"`, or `"auto"`) based on finding complexity
   - `"effort"`: recommended thinking effort (`"Low"`, `"Medium"`, `"High"`, or `"Max"`) based on reasoning depth required
   - `"problem"`: clear explanation of the unused export, dead state property, or orphaned helper/asset
   - `"affectedFiles"`: array of affected file paths (e.g. `["src/foo.js"]`)
   - `"suggestedFix"`: concrete remediation steps
   - `"acceptanceCriteria"`: array of testable `AC-<n>` criteria strings (e.g. `["- **AC-1:** ..."]`)
   - `"body"`: multi-line Markdown specification (using `\n\n` between sections and `\n` after every `##` heading) with `## Problem`, `## Affected Files`, `## Suggested Fix`, and `## Acceptance Criteria` (`- **AC-1:** ...`).
