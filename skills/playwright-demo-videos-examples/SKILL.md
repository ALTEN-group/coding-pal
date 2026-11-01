---
name: playwright-demo-videos-examples
description: 'Scaffold or match Playwright demo-video recording (demos/ config, Director with fake cursor and human-speed gestures, filmed scenario with off-camera reset, ffmpeg MP4 + poster encoder, VitePress video section). Use when producing product demo videos of user journeys for a website.'
license: MIT
---

# Playwright Demo Videos Examples

On-demand templates for the `playwright-demo-videos` instruction. Normative rules stay in that instruction; this skill owns scaffolding templates only.

## When to Use This Skill

- Recording the first demo videos of an app (creates `demos/`).
- Adding a journey to an existing `demos/` folder.
- Embedding the encoded videos in a VitePress home page or guide.

## Path Resolution

Resolve `references/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`).

Templates use `<app>` (app folder holding `demos/`), `<product>` (video name prefix), `<base-url>` (dev URL with trailing slash), `<base-url-env>` (env variable already used by the e2e config) and `<output-dir>` (usually `<docs-root>/docs/public/videos`). Substitute them before copying.

## Workflow

1. Follow the installed `playwright-demo-videos` instruction for layout, filming and reset rules.
2. **Read `references/examples.md` now** before scaffolding.
3. Copy the config, director and encoder once; write one scenario per journey from the scenario template.
4. Run `npm run demos`, then check durations with `ffprobe` and look at extracted frames.

## Done When

- Copied files match these templates with every placeholder substituted.
- Each scenario passes twice in a row against the same database, and its MP4 + JPG exist in `<output-dir>`.
