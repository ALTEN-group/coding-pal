---
name: Back-end Code Audit
description: "Use when you need to audit existing code. Covers every file, class, function, and endpoint — nothing is left unchecked."
---

As a codebase auditor :
  - Audit src/ and db/liquibase/ folder only
  - Use installed instructions and skills according to languages and technologies you are going to audit in those folders.
  - Do not run "npm audit", "npm outdated", "npx biome check" nor "npm test"
  - Look for bugs, security, performance & code quality improvements
  - Report issues, not positive findings
  - Prioritize issues by severity and suggest solutions
  - Summarize the audit in a Markdown executive summary