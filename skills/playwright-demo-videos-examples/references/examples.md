# Playwright Demo Videos — Examples

Companion samples for the `playwright-demo-videos` instruction, which owns the rules these templates satisfy. Substitute `<app>`, `<product>`, `<base-url>`, `<base-url-env>` and `<output-dir>` everywhere they appear.

## `<app>/package.json` script

```json
{
  "scripts": {
    "demos": "playwright test --config=demos/playwright.config.ts && node demos/to-mp4.mjs <output-dir>"
  }
}
```

`<output-dir>` is relative to `<app>`, e.g. `../website/docs/public/videos`.

## `<app>/.gitignore`

```gitignore
/demos/videos/
/demos/.playwright/
```

## `demos/playwright.config.ts`

```ts
import { defineConfig, devices } from "@playwright/test";

/** Video format: the viewport is filmed as is, without scaling. */
const DEMO_SIZE = { width: 1440, height: 900 };

/** Filmed scenarios for the website, not tests: run against the dev stack, like the e2e suite. */
const baseURL = (process.env.<base-url-env> ?? "<base-url>").replace(/\/?$/, "/");

export default defineConfig({
  testDir: "./scenarios",
  testMatch: "**/*.demo.ts",
  outputDir: "./.playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: DEMO_SIZE,
    deviceScaleFactor: 1,
    video: { mode: "on", size: DEMO_SIZE },
  },
});
```

## `demos/support/director.ts`

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext, Locator, Page } from "@playwright/test";

export const VIDEOS_DIR = join(__dirname, "..", "videos");

/** Playwright videos do not film the mouse: this cursor follows `page.mouse` events and rings each click. */
const CURSOR_SCRIPT = `
window.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = \`
    #demo-cursor { position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;
      width: 28px; height: 28px; transform: translate(-4px, -2px);
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)); }
    .demo-click { position: fixed; z-index: 2147483646; pointer-events: none; width: 44px; height: 44px;
      margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid #f97316;
      animation: demo-click 500ms ease-out forwards; }
    @keyframes demo-click { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }
  \`;
  document.head.append(style);
  const cursor = document.createElement("div");
  cursor.id = "demo-cursor";
  cursor.style.left = "-100px";
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.4-6.9L4 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.append(cursor);
  document.addEventListener("mousemove", (e) => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";
  }, true);
  document.addEventListener("mousedown", (e) => {
    const ring = document.createElement("div");
    ring.className = "demo-click";
    ring.style.left = e.clientX + "px";
    ring.style.top = e.clientY + "px";
    document.body.append(ring);
    setTimeout(() => ring.remove(), 600);
  }, true);
});
`;

/** Drives a filmed scenario: slow gestures, pauses, and an edit point. */
export class Director {
  private x: number;
  private y: number;
  private readonly openedAt = Date.now();
  /** Seconds since the page opened: everything before is cut when encoding. */
  private start = 0;

  private constructor(private readonly page: Page) {
    const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
    this.x = viewport.width / 2;
    this.y = viewport.height / 2;
  }

  /** Call before the first navigation: the cursor is injected on every page of the context. */
  static async on(context: BrowserContext, page: Page): Promise<Director> {
    await context.addInitScript(CURSOR_SCRIPT);
    return new Director(page);
  }

  async action(): Promise<void> {
    await this.page.mouse.move(this.x, this.y);
    await this.pause(300);
    this.start = (Date.now() - this.openedAt) / 1000;
  }

  pause(ms: number): Promise<void> {
    return this.page.waitForTimeout(ms);
  }

  /** Human-speed move: duration follows distance. */
  async moveTo(x: number, y: number): Promise<void> {
    const distance = Math.hypot(x - this.x, y - this.y);
    const steps = Math.max(8, Math.round(distance / 12));
    await this.page.mouse.move(x, y, { steps });
    this.x = x;
    this.y = y;
  }

  async hover(target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("Element not displayed");
    await this.moveTo(box.x + box.width / 2, box.y + box.height / 2);
  }

  async click(target: Locator, pauseAfter = 700): Promise<void> {
    await this.hover(target);
    await this.pause(250);
    await this.page.mouse.down();
    await this.page.mouse.up();
    await this.pause(pauseAfter);
  }

  /** Clicks the field, clears it, then types at human speed. */
  async type(target: Locator, text: string, pauseAfter = 500): Promise<void> {
    await this.click(target, 200);
    await target.press("ControlOrMeta+a");
    await target.pressSequentially(text, { delay: 80 });
    await this.pause(pauseAfter);
  }

  /** Closes the page to finalize the video: `videos/<name>.webm` plus its cut in `<name>.json`. */
  async save(name: string): Promise<void> {
    const video = this.page.video();
    await this.page.close();
    if (!video) throw new Error("Video recording is off");
    await mkdir(VIDEOS_DIR, { recursive: true });
    await video.saveAs(join(VIDEOS_DIR, `${name}.webm`));
    await writeFile(join(VIDEOS_DIR, `${name}.json`), JSON.stringify({ start: this.start }));
  }
}
```

Multi-tab journeys (the app opens a popup): keep one `{ page, openedAt, start, end }` segment per tab, save one WebM per segment, and concatenate them in the encoder with ffmpeg `trim` + `concat` filters.

## `demos/scenarios/<journey>.demo.ts`

Sign-in journey: the login itself is filmed.

```ts
import { expect, test } from "@playwright/test";
import { getCredentials } from "../../e2e/helpers/<credentials-helper>";
import { Director } from "../support/director";

test("sign in", async ({ context, page }) => {
  const { email, password } = getCredentials();
  const director = await Director.on(context, page);
  await page.goto("login");
  await expect(page.getByLabel("<email label>")).toBeVisible();
  await director.action();
  await director.pause(1000);

  await director.type(page.getByLabel("<email label>"), email);
  await director.type(page.getByLabel("<password label>"), password, 800);
  await director.click(page.getByRole("button", { name: "<submit label>" }), 0);
  await expect(page).toHaveURL(/<landing route>/, { timeout: 30_000 });
  await director.pause(2500);

  await director.save("<product>-login");
});
```

Editing journey: login and reset happen off camera, before `action()`.

```ts
import { expect, type Page, test } from "@playwright/test";
import { loginAs, openEntity } from "../../e2e/helpers/<auth-helper>";
import { Director } from "../support/director";

const SEED = "<seeded value>";
const EDITED = "<edited value>";

const field = (page: Page) => page.getByRole("dialog").getByLabel("<field label>");

/** Puts the seeded value back off camera, so the scenario can be filmed again. */
async function reset(page: Page): Promise<void> {
  await page.getByRole("cell", { name: "<row name>", exact: true }).click();
  if ((await field(page).inputValue()) !== SEED) {
    await field(page).fill(SEED);
    await page.getByRole("button", { name: "<submit label>" }).click();
  } else {
    await page.getByRole("button", { name: "<cancel label>" }).click();
  }
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("edit <entity>", async ({ context, page }) => {
  const director = await Director.on(context, page);
  await loginAs(page);
  await openEntity(page, "<entity>");
  await reset(page);
  await director.action();
  await director.pause(1000);

  await director.click(page.getByRole("cell", { name: "<row name>", exact: true }), 1200);
  await director.type(field(page), EDITED, 800);
  await director.click(page.getByRole("button", { name: "<submit label>" }), 0);
  await expect(page.getByRole("dialog")).toBeHidden();
  const cell = page.getByRole("cell", { name: EDITED, exact: true });
  await expect(cell).toBeVisible();
  await director.hover(cell);
  await director.pause(2500);

  await director.save("<product>-edit-<entity>");
});
```

## `demos/to-mp4.mjs`

```js
// Encodes raw Playwright WebM into streamable H.264 MP4 + JPG poster, trimmed at the start in `<name>.json`.
// Usage: node demos/to-mp4.mjs <output-dir>
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [outputArg] = process.argv.slice(2);
if (!outputArg) {
  console.error("Usage: node demos/to-mp4.mjs <output-dir>");
  process.exit(2);
}
const videos = join(dirname(fileURLToPath(import.meta.url)), "videos");
const output = resolve(outputArg);
if (!existsSync(videos)) process.exit(0);
mkdirSync(output, { recursive: true });

function ffmpeg(args) {
  const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (result.error) throw new Error(`ffmpeg not found: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const meta of readdirSync(videos).filter((f) => f.endsWith(".json"))) {
  const name = meta.replace(/\.json$/, "");
  const { start } = JSON.parse(readFileSync(join(videos, meta), "utf8"));
  const mp4 = join(output, `${name}.mp4`);
  ffmpeg([
    "-ss", String(start),
    "-i", join(videos, `${name}.webm`),
    "-an",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    mp4,
  ]);
  ffmpeg(["-ss", "1", "-i", mp4, "-frames:v", "1", "-q:v", "3", join(output, `${name}.jpg`)]);
  console.log(`✓ ${mp4}`);
}
```

## Review commands

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 <output-dir>/<name>.mp4
ffmpeg -y -loglevel error -ss 6 -i <output-dir>/<name>.mp4 -frames:v 1 /tmp/<name>-6.png
```

## VitePress home section: `docs/.vitepress/theme/DemoVideos.vue`

```vue
<script setup>
import { withBase } from "vitepress";
import { onBeforeUnmount, onMounted, ref } from "vue";

// One entry per encoded video; `name` matches `<output-dir>/<name>.mp4`.
const demos = [
  { name: "<product>-login", eyebrow: "<Step>", title: "<what the video shows>", details: "<one sentence>", link: "/guide/<page>" },
];

const videos = ref([]);
let observer = null;

// Plays only while on screen, never under reduced motion.
onMounted(() => {
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  observer = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) target.play().catch(() => undefined);
        else target.pause();
      }
    },
    { threshold: 0.4 },
  );
  for (const video of videos.value) observer.observe(video);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <section class="demos">
    <header class="intro">
      <h2>See it in action</h2>
    </header>
    <article v-for="(demo, index) in demos" :key="demo.name" class="demo" :class="{ reversed: index % 2 }">
      <div class="frame">
        <video
          ref="videos"
          :src="withBase(`/videos/${demo.name}.mp4`)"
          :poster="withBase(`/videos/${demo.name}.jpg`)"
          :aria-label="demo.title"
          muted
          loop
          playsinline
          controls
          preload="none"
        ></video>
      </div>
      <div class="text">
        <p class="eyebrow">{{ demo.eyebrow }}</p>
        <h3>{{ demo.title }}</h3>
        <p>{{ demo.details }}</p>
        <a :href="withBase(demo.link)">Learn more →</a>
      </div>
    </article>
  </section>
</template>

<style scoped>
.demos { max-width: 1152px; margin: 0 auto; padding: 64px 24px 96px; }
.intro { text-align: center; margin-bottom: 56px; }
.eyebrow { font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--vp-c-brand-1); }
.demo { display: grid; gap: 24px; align-items: center; }
.demo + .demo { margin-top: 72px; }
.frame { padding: 8px; border: 1px solid var(--vp-c-divider); border-radius: 16px; background: var(--vp-c-bg-soft); }
video { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; border-radius: 10px; }
@media (min-width: 960px) {
  .demo { grid-template-columns: 3fr 2fr; gap: 48px; }
  .demo.reversed { grid-template-columns: 2fr 3fr; }
  .demo.reversed .frame { order: 2; }
}
</style>
```

Register it below the home features in `docs/.vitepress/theme/index.js`:

```js
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import DemoVideos from "./DemoVideos.vue";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "home-features-after": () => h(DemoVideos),
    });
  },
};
```

In a guide page, a single video can be plain HTML when the site `base` is `/`; otherwise use the component so `withBase` resolves the paths:

```html
<video src="/videos/<name>.mp4" poster="/videos/<name>.jpg" muted loop playsinline controls preload="none"></video>
```
