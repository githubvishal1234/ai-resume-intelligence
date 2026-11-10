// Every screen, at phone and desktop width, in light and dark: it loads with a heading, logs no
// console error, makes no failing request and never scrolls sideways. Real API and database.
import { expect, test, type Page } from "@playwright/test";
import { analyzeJob, importMaster, signUp, watchConsole } from "./helpers";

const PUBLIC = ["/welcome", "/pricing", "/templates"];
const APP = [
  "/", "/resumes", "/resumes/upload", "/resumes/new", "/analysis", "/builder", "/cv-builder", "/profile-builder",
  "/jobs", "/jobs/new", "/match", "/skill-gaps", "/tailor", "/cover-letters", "/applications", "/applications/new",
  "/notifications", "/insights", "/market", "/proofs", "/stories", "/interview", "/settings", "/no-such-page",
];
const SIZES = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
];

const sideways: string[] = [];

async function check(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first(), `${path} shows a heading`).toBeVisible();
  await page.waitForLoadState("networkidle");
  const width = page.viewportSize()?.width ?? 0;
  const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, width);
  if (overflow > 0) sideways.push(`${path} is ${overflow}px too wide at ${width}px`);
}

test("every screen loads cleanly at phone and desktop width, light and dark", async ({ page }) => {
  test.setTimeout(600_000);
  const consoleErrors = watchConsole(page);
  const failed: string[] = [];
  page.on("response", (r) => {
    // 401 from /auth/me is how a signed-out visit looks; nothing else may fail.
    if (r.status() >= 400 && !(r.status() === 401 && r.url().endsWith("/auth/me"))) failed.push(`${r.status()} ${r.url()}`);
  });

  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const path of PUBLIC) await check(page, path);
  }

  await signUp(page);
  const master = await importMaster(page);
  const job = await analyzeJob(page);
  const routes = [...APP, new URL(master).pathname, `${new URL(master).pathname}/edit`, new URL(job).pathname, `${new URL(job).pathname}/match`, `${new URL(job).pathname}/gaps`];

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => localStorage.setItem("theme", t), theme);
    for (const size of SIZES) {
      await page.setViewportSize(size);
      for (const path of routes) await check(page, path);
    }
  }

  expect(sideways).toEqual([]);
  expect(failed).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
