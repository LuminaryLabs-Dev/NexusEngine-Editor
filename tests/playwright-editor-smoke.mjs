import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = resolve(process.cwd());
const executablePath = existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined;
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox", "--disable-web-security", "--allow-file-access-from-files"]
});
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve(root, "index.html")).href);
  await assert.doesNotReject(() => page.locator("text=Full Game Viewport").waitFor({ timeout: 5000 }));
  await page.click("#toggle-kits");
  await assert.doesNotReject(() => page.locator('[data-domain-path="n:editor:dock:kits"] >> text=Viewport').first().waitFor({ timeout: 5000 }));
  await page.click('[data-select="n:editor:viewport"]');
  await assert.doesNotReject(() => page.locator('[data-domain-path="n:editor:dock:inspector"] >> text=n:editor:viewport').first().waitFor({ timeout: 5000 }));
  await page.click("#play");
  await assert.doesNotReject(() => page.locator(".status.playing").waitFor({ timeout: 5000 }));
  await page.click("#build");
  await assert.doesNotReject(() => page.locator("text=n-game-starter.html").first().waitFor({ timeout: 5000 }));
  await page.click("#toggle-proof");
  await assert.doesNotReject(() => page.locator('[data-domain-path="n:editor:dock:proof"] >> text=editor.build.html.ready').first().waitFor({ timeout: 5000 }));
  console.log("editor playwright smoke passed");
} finally {
  await browser.close();
}
