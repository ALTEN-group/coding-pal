---
name: vitepress-docs
description: 'Scaffold, configure, or edit a VitePress product documentation site (user-supplied docs root, Markdown guides, Mermaid, Traefik /docs in dev, GitHub Pages in prod). Use when adding or updating documentation under a user-supplied docs root.'
license: MIT
---

# VitePress Documentation Site

Normative rules and on-demand scaffolding templates for a VitePress product documentation site. When scaffolding or matching full files, read `references/examples.md` relative to this skill's install directory.

## When to Use This Skill

- Creating a VitePress product documentation site from scratch.
- Adding or editing a guide page, sidebar group, Compose docs service, or GitHub Pages workflow.

## Path Resolution

Resolve `references/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`). Templates write `<docs-root>` wherever the site root appears; substitute the resolved root before copying.

## Docs Root

The site root is the folder named in the request. It is not fixed to `website/`. Every file below lives under that root; docs never spread outside it.

```
<docs-root>/
  package.json
  package-lock.json
  dockerfile                 # development image only
  docs/
    index.md
    guide/*.md
    public/logo.svg
    public/favicon.svg
    .vitepress/config.mjs
```

## Stack

- VitePress `1.6.x` (`vitepress dev|build|preview docs`). Dev script: `vitepress dev docs --host --port 5174`.
- Mermaid via `vitepress-plugin-mermaid` + `mermaid`. Pre-bundle `fastdom` and `fastdom/extensions/fastdom-promised.js` in `vite.optimizeDeps.include`.
- Package is `private`, MIT, with `author` set to the project owner/organization (default `ALTEN` when unspecified). `repository.directory` is the docs-root folder name the user gave.
- Dev: Compose service behind Traefik at `/docs`, port `5174`. Bind-mount `docs/` (and `package.json` / lockfile); named volume for `node_modules`; reinstall on start so lockfile edits apply. Container naming, secrets, and label syntax are owned by the Docker instruction.
- Prod: GitHub Pages from `docs/.vitepress/dist`. **No documentation Docker image in prod.**

## Branding

Use the default VitePress theme. Nav branding is `themeConfig.logo: '/logo.svg'` plus `siteTitle: false`, and the home hero image is that same static SVG. Ask the user for `logo.svg` and `favicon.svg`.

## `config.mjs`

- Wrap `defineConfig` with `withMermaid`.
- `base` = `process.env.VITEPRESS_BASE` or `'/'` in production and `'/docs/'` otherwise. Favicon `href` must use that `base`.
- `themeConfig.socialLinks: []`. Footer message: `Published and maintained by <project owner>` (or `Published and maintained by ALTEN` when unspecified).
- Sidebar is the source of truth for IA. Every `docs/guide/*.md` page is listed. Typical groups: Overview; Deployment (Compose, env, integration, troubleshooting); API Reference; domain-specific sections; Architecture.
- Nested sidebar groups use `collapsed: false`.

## Pages

- Home (`docs/index.md`): `layout: home`. Hero `text` + `tagline` describe the product; actions: Get Started → `/guide/overview`, plus an optional secondary action pointing to the project repository or support URL. Feature cards map to **real** capabilities, not slogans.
- Guide pages: one H1, then sections. Document only what the code and config do. Prefer tables, request/response fences, ASCII pipelines, and Mermaid sequence diagrams. Cross-link related pages.
- API pages: method + path, representative bodies, status tables, then behavior. Do not invent endpoints or fields.
- Register a new page in `sidebar` in the same change that adds the Markdown file.

## Ignore / CI

- Gitignore: `<docs-root>/node_modules/`, `docs/.vitepress/cache`, `docs/.vitepress/dist`.
- Pages workflow: path filter on the docs root; `working-directory` that root; upload `docs/.vitepress/dist`.
- Optional `docs/public/CNAME` only when the user names a custom domain.

## Workflow

1. Follow the layout, stack, branding, and sidebar rules above.
2. **Read `references/examples.md` now** before scaffolding.
3. Copy templates into the docs root and substitute `<docs-root>` everywhere.

## Done When

- Copied files match `references/examples.md` templates with `<docs-root>` substituted everywhere.
- Every guide page is registered in `sidebar`, and every claim traces to inspected code or config.
