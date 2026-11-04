---
name: demo-videos
description: "Record Playwright demo videos of user journeys and encode them as MP4 for a website. Use when the user wants product demo or walkthrough videos."
agent: Demo Videos
argument-hint: "journeys and output folder, e.g. login, edit policy -> website/docs/public/videos"
---

Slash command for the **Demo Videos** agent.

## Resolve the inputs

1. **Journeys**: the user flows named in this message. If none, ask which to film, after proposing a few from the app's routes. Do not guess.
2. **Output folder**: a path in this message, or the `public/videos` folder of the docs site the user names. If neither is given, ask.
3. **App**: the folder holding the e2e suite (`e2e/` + `playwright.config.ts`) of the app to film. Ask if several match.

## Run

Hand the journeys, app folder and output folder to Demo Videos. Filming, encoding rules, and templates are owned by the installed `playwright-demo-videos` skill — do not restate or override them.
