# Audit Report Contract

The report is UTF-8 Markdown bounded by these exact markers:

```text
<!-- AUDIT-REPORT:START -->
<!-- AUDIT-REPORT:END -->
```

No report content may appear outside the markers. Consumers may discard CLI diagnostics outside them.

## Structure

Inside the markers, provide these sections exactly once and in this order:

1. `## Executive Summary`
2. `## Critical`
3. `## Important`
4. `## Suggestions`

The executive summary is one to three short paragraphs and at most 1,200 characters. Describe the most consequential risks and immediate priorities without positive findings.

Each severity section contains findings or the exact text `_No findings._`. Never omit an empty section.

## Finding

Each finding uses a level-three heading followed by these fields in order:

```markdown
### Concise finding title
- **Location:** `src/example.js:42`
- **Category:** Security
- **Evidence:** Concrete behavior visible in the referenced code.
- **Impact:** Specific failure or risk caused by that behavior.
- **Recommendation:** Directly executable remediation.
```

Requirements:

- Severity is expressed by the containing section: `Critical`, `Important`, or `Suggestions`.
- Location is a repository-relative POSIX path, optionally followed by a positive line number. It must be within a scope configured by the consumer.
- Category is a concise classification such as `Security`, `Correctness`, `Performance`, or `Maintainability`.
- Evidence identifies concrete code behavior. Do not report speculation or generic advice.
- Impact states the practical consequence.
- Recommendation states what to change and where. Avoid vague wording such as "review this code".
- A field may continue on following nonblank lines, but headings and field labels may not appear in field content.
- Titles are at most 160 characters. Category is at most 80 characters. Each other field is at most 2,000 characters.
- A report contains at most 20 findings and is at most 60 KiB before normalization.
- Duplicate findings with the same severity, normalized location, and case-insensitive title should be merged.

## Canonicalization

The validator sorts findings by severity, location, then case-insensitive title. It assigns `AUDIT-001` identifiers in that order and adds derived counts to severity headings. Existing canonical identifiers and counts are accepted only to support idempotent revalidation; they are never trusted.
