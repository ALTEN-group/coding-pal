---
name: alten-html-docs
description: Use when creating or editing any HTML documentation, report, guide, or standalone page in this repo. Enforces the ALTEN design system defined in alten-design-system.html (bundled in this skill folder).
---

# ALTEN HTML documentation

Every HTML doc MUST use the ALTEN design system. Single source of truth: `alten-design-system.html` (same folder as this SKILL.md; read via `skill://alten-html-docs/alten-design-system.html`) (tokens, CSS, component markup). Read it before writing; NEVER invent colors, fonts, spacing, or component styles.

## Workflow

1. Read `skill://alten-html-docs/alten-design-system.html` (at least the `<style>` block, lines ~10-301, and the section markup of components you need).
2. Create a standalone `.html` file (default location `docs/<name>.html`). Copy the entire `<style>` block and the Google Fonts `<link>`s verbatim from the design system into the new file. Do not link to or import the design-system file; do not edit it unless asked to extend the system.
3. Build the page from the existing classes only (see Components). Copy the markup shape from the design-system file.
4. Drop what you don't use from the page body, not from the CSS (keeps pages consistent and diffable against the system). Omit the swatch-copy `<script>`/`.toast` unless the page has `.swatch` elements.
5. Open the result in a browser (`browser` tool) and check it visually: navy text, no overflow, tables/cards render, 760px breakpoint OK.

## Page skeleton

```html
<!DOCTYPE html>
<html lang="fr"> <!-- match the doc's language -->
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Title — Planboard</title>
<!-- fonts <link>s + full <style> copied from alten-design-system.html -->
</head>
<body>
<section class="hero">…</section>          <!-- optional; reuse .door signature markup -->
<section>
  <div class="container">
    <span class="title-block">01 · Thème</span>
    <h2 class="title-highlight">Titre avec <em>mot clé</em></h2>
    <p class="section-intro">Une phrase d'introduction en gras.</p>
    <!-- content -->
  </div>
</section>
<footer><div class="container">…</div></footer>
</body>
</html>
```

Each section: `.title-block` (numbered label) → `h2.title-highlight` with one `<em>` → `p.section-intro` → content. Sub-headings: `h3.subtitle-2`.

## Components (use these classes; don't restyle)

| Need | Class / markup |
|---|---|
| Buttons | `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-cta` / `.btn-inverse` (on navy `.demo--dark`); `disabled` supported |
| Status / tag | `.badge` + `.badge-navy` / `-azure` / `-ochre` / `-grey` |
| Dark highlight card | `.cards` > `.card-pillar` (`h4` + `p`) |
| Light content card | `.cards` > `.card-light` (`h4` + `p`) |
| Inline emphasis | `<span class="hl">` |
| Do / don't callouts | `.rules` > `.rule` / `.rule.rule--dont` with `<strong>` |
| Form fields | `.form-demo` > `.field` (`label`, `input`/`select`, `.hint`) |
| Tables | plain `<table>` with `thead`/`tbody` (styled globally) |
| Charts | `.dataviz` > `.bar`; color order below |
| Inline code | `<code>` |
| Captions / secondary text | `.caption` |
| Preview boxes | `.demo` (bordered), `.demo--dark` |
| Spacing rows / swatches | `.space-row`, `.swatch-grid` > `.swatch` (only for design docs) |

If nothing fits, compose from tokens (`var(--…)`) in a small inline `style` or an extra rule appended after the copied `<style>`; never hard-code hex values when a token exists.

## Hard rules (from the brand book)

- Language: match the user's request or the audience; French is the default, not mandatory. Set `<html lang>` to the doc's language. In French, use French typography (espace avant `: ; ? !`, `57 700`, `15,4 %`). ALTEN always in capitals.
- Text color: navy (`--color-text-primary`) always. NEVER black `#000`, NEVER yellow text, NEVER pure red `#E30513` or pure yellow `#FEEB17` (logo-only).
- Roles: azure = action/links, navy = text and emphasis backgrounds, ochre = attention/CTA. Secondary text = `--alten-grey-500`; borders = `--color-border`.
- Font: `var(--font-family-base)` (Metropolis → Open Sans fallback). Hierarchy via weight (300–800) and the `--fs-*` scale; no other fonts.
- Spacing only from `--sp-1…9` (4 px base). Radius `--radius-sm/md` only (2/4 px; no pill or large rounding). Shadows `--shadow-sm/md` only.
- Max width: `.container` (1200 px). Body paragraphs ≤ 70ch (default `p`).
- Data-viz color order: azure-500 → navy-900 → ochre-500 → azure-300 → navy-400 → ochre-100. Do not add colors; add a label/legend instead of relying on color alone.
- Accessibility: `lang`, `alt`/`aria-label` on charts and images, visible `:focus-visible` (provided by `.btn`; keep for custom controls), honor `prefers-reduced-motion` (already in CSS).
- Standalone: one file, no frameworks, no build step; only the Google Fonts link may be external. Vanilla JS only, and only if needed.
- Triangle motif (`.btn::after`, `.card-pillar::after`, `.door`) is the brand signature: keep it, don't replace with other icons/arrows.

## Planboard-specific

- Business wording and rules: follow `docs/CONTRACT.md` (dates `YYYY-MM-DD`, months `YYYY-MM`; the French UI terms when writing in French).
- Screenshots live in `docs/screenshots/`; reference them with relative paths and a descriptive `alt`; wrap in a bordered `.demo` with a `.caption`.

## Done checklist

- [ ] `<style>` identical to the design system's (plus any appended rules)
- [ ] Only design-system classes/tokens; no raw `#000`, no off-palette hex
- [ ] Copy in the requested language, matching `<html lang>`, title set
- [ ] Rendered in browser and visually checked
