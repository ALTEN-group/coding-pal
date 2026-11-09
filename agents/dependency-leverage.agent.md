---
name: dependency-leverage
description: "Identify opportunities to delegate source modules directly to installed package.json dependencies and report them as structured findings."
---

1. Inspect `package.json`, installed dependency type definitions (`node_modules/<pkg>/**/*.d.ts`), and `.agents/skills/forge/catalog.json` (when present), and audit the requested scope for hand-rolled helpers or duplicated logic that can be delegated directly to an installed dependency.
2. Consolidate closely related findings: merge multiple hand-rolled helpers or delegation opportunities affecting the same file/module or targeting the same installed dependency within a module into a single finding, and merge upstream requests targeting the same catalog package into a single request entry. Skip any symbol or file already tracked by an open issue.
3. Do not modify source, test, or documentation files.
4. For duplicated or hand-rolled code that can be replaced with calls to installed `package.json` libraries, write `audit-findings.json` at the repository root as a JSON array where each element represents one consolidated finding with fields:
   - `"title"`: concise `refactor(<scope>): <summary>` issue title
   - `"priority"`: GitHub issue priority (`"Urgent"`, `"High"`, `"Medium"`, or `"Low"`)
   - `"model"`: recommended Copilot model for remediation (`"claude-sonnet-5.5"`, `"claude-opus-5.5"`, `"claude-haiku-5.5"`, `"gpt-6.1-sol"`, `"gpt-6.1-terra"`, `"gpt-6-luna"`, `"gpt-5.3-codex"`, `"gemini-4-argon"`, `"gemini-3.8-flash"`, or `"auto"`) based on finding complexity
   - `"effort"`: recommended thinking effort (`"Low"`, `"Medium"`, `"High"`, or `"Max"`) based on reasoning depth required
   - `"problem"`: clear explanation of the duplicated or hand-rolled logic
   - `"affectedFiles"`: array of affected file paths (e.g. `["src/foo.js"]`)
   - `"suggestedFix"`: concrete refactoring steps using the installed dependency
   - `"acceptanceCriteria"`: array of testable `AC-<n>` criteria strings (e.g. `["- **AC-1:** ..."]`)
   - `"body"`: multi-line Markdown specification (using `\n\n` between sections and `\n` after every `##` heading) with `## Problem`, `## Affected Files`, `## Suggested Fix`, and `## Acceptance Criteria` (`- **AC-1:** ...`).
5. If `.agents/skills/forge/catalog.json` (or an active ecosystem instruction) declares internal/shared libraries and you find generic domain logic in a consumer project that belongs in one of those installed libraries, but the installed version of that library does not yet export the needed API or overload, write `upstream-requests.json` at the repository root as a JSON array of objects (at most one consolidated entry per target library package) with fields:
   - `"package"`: npm package name from the catalog/dependencies
   - `"repo"`: GitHub `owner/repo` of the upstream library
   - `"priority"`: GitHub issue priority (`"Urgent"`, `"High"`, `"Medium"`, or `"Low"`)
   - `"model"`: recommended Copilot model (`"claude-sonnet-5.5"`, `"claude-opus-5.5"`, `"claude-haiku-5.5"`, `"gpt-6.1-sol"`, `"gpt-6.1-terra"`, `"gpt-6-luna"`, `"gpt-5.3-codex"`, `"gemini-4-argon"`, `"gemini-3.8-flash"`, or `"auto"`)
   - `"effort"`: recommended thinking effort (`"Low"`, `"Medium"`, `"High"`, or `"Max"`)
   - `"library_issue_title"`: concise feature/enhancement title for the upstream library
   - `"library_issue_body"`: multi-line Markdown specification (using `\n\n` between sections and `\n` after every `##` heading) with `## Problem`, `## Proposed API`, and `## Acceptance Criteria` (`- **AC-1:** ...`) for the library
   - `"consumer_issue_title"`: title for the blocked follow-up issue in the current repository
   - `"consumer_issue_body"`: multi-line Markdown specification (using `\n\n` between sections and `\n` after every `##` heading) with `## Problem`, `## Affected Files`, `## Suggested Fix`, and `## Acceptance Criteria` describing which files/functions in the current repository will be refactored once the new library version is released.
