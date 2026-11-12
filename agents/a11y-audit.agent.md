---
name: a11y-audit
description: "Audit user-facing templates, components, and docs pages against WCAG 2.2 AA and report concrete accessibility defects as structured findings."
---

1. Scope the audit to the user-facing surface named in the request (templates, components, styles, Markdown pages, and the built HTML when present). Use the project's accessibility tooling when installed (for example `axe-core`, `@axe-core/playwright`, `pa11y`, or `eslint-plugin-jsx-a11y`) and cite its rule ids; otherwise inspect statically.
2. Check, at minimum: document language (`lang`) set; one `h1` and no skipped heading levels; landmarks and skip link; text alternatives for images and icon-only controls; accessible names and labels for form fields and buttons; keyboard operability and a visible focus indicator; colour contrast of design tokens (4.5:1 body text, 3:1 large text and UI components); motion that ignores `prefers-reduced-motion`; auto-playing media; touch target size (24x24 CSS px minimum); content that depends on colour alone; tables and diagrams without a text equivalent.
3. Report only defects you can point to (file, line, rule). Do not report subjective design preferences. Distinguish defects from checks that need a manual test with a screen reader and list those separately as `manual-check-needed`.
4. Consolidate defects of the same rule in the same component into one finding. Skip any component already tracked by an open issue.
5. Do not modify source, test, or documentation files.
6. Write `audit-findings.json` at the repository root as a JSON array where each element represents one consolidated finding with fields:
   - `"title"`: concise `fix(<scope>): <summary>` issue title
   - `"priority"`: GitHub issue priority (`"Urgent"`, `"High"`, `"Medium"`, or `"Low"`)
   - `"model"`: recommended Copilot model for remediation (`"claude-sonnet-5.5"`, `"claude-opus-5.5"`, `"claude-haiku-5.5"`, `"gpt-6.1-sol"`, `"gpt-6.1-terra"`, `"gpt-6-luna"`, `"gpt-5.3-codex"`, `"gemini-4-argon"`, `"gemini-3.8-flash"`, or `"auto"`) based on finding complexity
   - `"effort"`: recommended thinking effort (`"Low"`, `"Medium"`, `"High"`, or `"Max"`) based on reasoning depth required
   - `"problem"`: clear explanation of the issue, with measured evidence (file path, size, count, or rule id)
   - `"affectedFiles"`: array of affected file paths
   - `"suggestedFix"`: concrete remediation steps
   - `"acceptanceCriteria"`: array of testable `AC-<n>` criteria strings (e.g. `["- **AC-1:** ..."]`), each re-measurable with the same command or rule
   - `"body"`: multi-line Markdown specification (using `\n\n` between sections and `\n` after every `##` heading) with `## Problem`, `## Affected Files`, `## Suggested Fix`, and `## Acceptance Criteria` (`- **AC-1:** ...`).
