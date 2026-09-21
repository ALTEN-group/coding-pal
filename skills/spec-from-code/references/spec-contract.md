# Spec Document Contract

Specifications are UTF-8 Markdown files. The calling agent owns what to examine. This contract owns file layout and section shape.

## Location and naming

- Write files under a single directory (default `docs/specs/` in the consumer repo). Create it if needed.
- One file per top-level area: `<area>.md` (e.g. `routes-auth.md`).
- Filenames are lowercase kebab-case ASCII: `^[a-z0-9]+(?:-[a-z0-9]+)*\.md$`.
- Split into another area file before a single file exceeds 400 lines.
- Do not put specification content only in chat. Files are the deliverable.

## File shape

Each file contains, in order:

1. A single level-one heading (`# …`) naming the area.
2. One or more component sections.
3. Exactly one `## Ambiguous or undocumented` section, last.

No other level-two headings.

## Component

Each component is a level-three heading (the component name) followed by these fields in order:

```markdown
### componentName
- **Purpose:** What it does, from the code.
- **Inputs:** Arguments, payloads, or dependencies the code uses.
- **Outputs:** Return values, HTTP responses, or written state.
- **Side effects:** I/O, mutations, or process behavior visible in the code.
- **Tests:** Existing tests that cover it, or `none`.
```

Requirements:

- Document only behavior the code explicitly contains. Do not infer from domain instructions.
- A field may continue on following nonblank lines. Headings and field labels may not appear in field content.
- Purpose, Inputs, Outputs, Side effects, and Tests are each at most 2,000 characters.
- Component names in headings are at most 160 characters.
- `## Ambiguous or undocumented` lists gaps and what is needed to clarify them, or the exact text `_None._`.
