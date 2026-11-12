---
name: web-footprint-audit
description: "Audit the built output of a website or web app for transfer weight, request count, third-party calls, media, caching, and eco-design practices (RGESN, GR491) and report measured findings."
---

1. Build the project with its documented build command, then measure the produced output (not the source): total size, per-page HTML, JS, CSS, image, and font bytes (raw and gzip or brotli), request count per representative page, and every request to a third-party origin. Record the exact commands used.
2. Compare against the budgets declared in the project (for example in its docs, Lighthouse CI config, or `performance` instructions). When none are declared, report the measured values and propose budgets instead of failing them.
3. Flag measurable defects: third-party fonts, scripts, analytics, or CDNs; fonts loaded without subsetting or `font-display`; images without modern format, dimensions, or lazy loading; JS or CSS loaded on pages that do not use it; large libraries bundled for a small feature; missing cache-friendly hashed asset names; animation or video that autoplays or runs when off-screen; missing dark-mode or reduced-motion handling that increases energy use.
4. Consolidate findings that share the same asset or origin into one finding. Skip any asset already tracked by an open issue.
5. Do not modify source, test, or documentation files, and do not commit build output.
6. Write `audit-findings.json` at the repository root as a JSON array where each element represents one consolidated finding with fields:
   - `"title"`: concise `perf(<scope>): <summary>` issue title
   - `"priority"`: GitHub issue priority (`"Urgent"`, `"High"`, `"Medium"`, or `"Low"`)
   - `"model"`: recommended Copilot model for remediation (`"claude-sonnet-5.5"`, `"claude-opus-5.5"`, `"claude-haiku-5.5"`, `"gpt-6.1-sol"`, `"gpt-6.1-terra"`, `"gpt-6-luna"`, `"gpt-5.3-codex"`, `"gemini-4-argon"`, `"gemini-3.8-flash"`, or `"auto"`) based on finding complexity
   - `"effort"`: recommended thinking effort (`"Low"`, `"Medium"`, `"High"`, or `"Max"`) based on reasoning depth required
   - `"problem"`: clear explanation of the issue, with measured evidence (file path, size, count, or rule id)
   - `"affectedFiles"`: array of affected file paths
   - `"suggestedFix"`: concrete remediation steps
   - `"acceptanceCriteria"`: array of testable `AC-<n>` criteria strings (e.g. `["- **AC-1:** ..."]`), each re-measurable with the same command or rule
   - `"body"`: multi-line Markdown specification (using `\n\n` between sections and `\n` after every `##` heading) with `## Problem`, `## Affected Files`, `## Suggested Fix`, and `## Acceptance Criteria` (`- **AC-1:** ...`).
