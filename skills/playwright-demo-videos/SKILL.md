---
name: playwright-demo-videos
description: 'Record or edit Playwright product demo videos of user journeys under demos/ (fake cursor, human-speed gestures, off-camera reset, ffmpeg MP4 + poster encoder, VitePress video embedding). Use when producing product demo videos of user journeys for a website.'
license: MIT
---

# Playwright Demo Videos

Demo videos are **filmed scenarios, not tests**: they show a user journey slowly, for a product website. When scaffolding or matching full files, read `references/examples.md` relative to this skill's install directory.

## When to Use This Skill

- Recording the first demo videos of an app (creates `demos/`).
- Adding or updating a journey in an existing `demos/` folder.
- Embedding the encoded videos in a VitePress home page or guide.

## Path Resolution

Resolve `references/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`).

Templates use `<app>` (app folder holding `demos/`), `<product>` (video name prefix), `<base-url>` (dev URL with trailing slash), `<base-url-env>` (env variable already used by the e2e config) and `<output-dir>` (usually `<docs-root>/docs/public/videos`). Substitute them before copying.

## Layout

```
<app>/demos/
  playwright.config.ts       # own config, never the e2e one
  support/director.ts        # fake cursor, gestures, edit point, save
  scenarios/<journey>.demo.ts
  to-mp4.mjs                 # WebM -> MP4 + JPG poster
  videos/                    # raw output, gitignored
  .playwright/               # Playwright output, gitignored
```

- One scenario per journey, one `test()` per file, named `<journey>.demo.ts`. Output name `<product>-<journey>` in kebab-case.
- Script: `"demos": "playwright test --config=demos/playwright.config.ts && node demos/to-mp4.mjs <output-dir>"`.
- Gitignore `demos/videos/` and `demos/.playwright/`. Commit only the encoded MP4 + JPG in the website.

## Config

- `testMatch: "**/*.demo.ts"`, `workers: 1`, `retries: 0`, `timeout` ≥ 180 s.
- Fixed `viewport` and `video.size` (default 1440×900), `deviceScaleFactor: 1`, `video: { mode: "on" }`.
- `baseURL` from the same env variable and default as the e2e config. Use the running dev stack; start a `webServer` only when the app has no stack.

## Filming

- Playwright does not film the mouse: inject the fake cursor with `context.addInitScript` before the first navigation.
- Every on-camera gesture goes through the director (`click`, `hover`, `type`, `pause`). Never call `locator.click()` / `fill()` on camera: they teleport.
- Type at human speed (`pressSequentially`, ~80 ms per key). Pause 600–1500 ms after each visible outcome, 2–3 s on the final frame.
- Call `director.action()` once the first screen is stable: everything before (blank page, app boot, login, setup) is cut.
- Off-camera setup (login, navigation, reset) uses plain Playwright calls and shared e2e helpers. Do not duplicate login or navigation helpers.
- Assert each step with `expect` so a broken journey fails instead of filming an error.

## Repeatable Runs

- A scenario must be re-runnable on the same database. Reset what it changes **off camera, before `action()`**: put seeded values back, delete objects created by a previous run.
- Avoid on-camera actions with accumulating side effects (duplicates, clones, history spam) unless the reset removes them.
- Workarounds for UI defects (e.g. `dispatchEvent("click")` on a covered button) are allowed off camera only. Report the defect; never film it.
- Mind auth rate limits: one login per scenario. Never loop logins to retry.

## Encoding

- `ffmpeg` is required on the host. Encode H.264 `yuv420p`, `-movflags +faststart`, CRF 18–23, no audio, trimmed at the recorded `start`.
- Write `<name>.mp4` and a `<name>.jpg` poster into the output directory given as argument (usually `<docs-root>/docs/public/videos/`). Never default it.
- Check durations (`ffprobe`) and inspect a few extracted frames before handing over.

## Website Embedding

- `<video muted loop playsinline controls preload="none">` with `poster` and an `aria-label`.
- Play only while visible (`IntersectionObserver`, threshold ~0.4); do not autoplay under `prefers-reduced-motion: reduce`.
- In VitePress, resolve `src`/`poster` with `withBase`. Describe only what the video shows.

## Workflow

1. Follow the layout, filming, reset, and encoding rules above.
2. **Read `references/examples.md` now** before scaffolding.
3. Copy the config, director, and encoder once; write one scenario per journey from the scenario template.
4. Run `npm run demos`, then check durations with `ffprobe` and inspect extracted frames.

## Done When

- Copied files match `references/examples.md` templates with every placeholder substituted.
- Each scenario passes twice in a row against the same database, and its MP4 + JPG exist in `<output-dir>`.
