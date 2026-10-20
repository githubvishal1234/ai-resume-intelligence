// Shared steps for the end-to-end specs. Each spec signs up its own user, so specs never share data.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

const fixtures = path.join(import.meta.dirname, "fixtures");
export const PASSWORD = "correct-horse-battery-staple";

/** Collects console errors, ignoring the expected 401 from /auth/me before sign-in. */
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("401")) errors.push(m.text());
  });
  return errors;
}

export async function signUp(page: Page, name = "Priya Raman") {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(`e2e-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: `Welcome, ${name.split(" ")[0]}` })).toBeVisible();
}

/** Imports the fixture resume and saves it as the master. Returns the master resume's URL. */
export async function importMaster(page: Page): Promise<string> {
  await page.goto("/resumes/upload");
  await page.getByLabel("Resume file").setInputFiles(path.join(fixtures, "resume.txt"));
  await expect(page.getByRole("heading", { name: "Review your resume" })).toBeVisible();
  await expect(page.getByLabel("Professional summary")).toHaveValue(/Backend engineer with 6 years/);
  await page.getByRole("button", { name: "Save as master resume" }).click();
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]{36}$/);
  return page.url();
}

/** Analyzes the fixture job posting and leaves the page on the job. Returns the job's URL. */
export async function analyzeJob(page: Page): Promise<string> {
  await page.goto("/jobs/new");
  await page.getByLabel("Job description").fill(readFileSync(path.join(fixtures, "job.txt"), "utf8"));
  await page.getByRole("button", { name: "Analyze job" }).click();
  await expect(page.getByRole("heading", { name: "Senior Backend Engineer" })).toBeVisible();
  return page.url();
}

/** Fetches a download link and checks the bytes really are a PDF. */
export async function expectPdf(page: Page, href: string | null) {
  expect(href).toBeTruthy();
  const pdf = await page.request.get(href!);
  expect(pdf.ok()).toBe(true);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
}
