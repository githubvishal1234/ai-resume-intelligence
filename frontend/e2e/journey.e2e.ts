// The main journey, end to end against the real API and database: sign up, import a resume,
// analyze a job, match, tailor, and download an ATS-checked PDF. Fixtures are the backend tests' samples.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { expectPdf, importMaster, PASSWORD, watchConsole } from "./helpers";

const fixtures = path.join(import.meta.dirname, "fixtures");

test("sign up, import a resume, match and tailor for a job, download the PDF", async ({ page }) => {
  let masterUrl = "";
  const consoleErrors = watchConsole(page);

  await test.step("sign up from the product page", async () => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByRole("link", { name: /Build my resume/ }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await page.getByLabel("Name").fill("Priya Raman");
    await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Welcome, Priya" })).toBeVisible();
  });

  await test.step("import a resume and save it as the master", async () => {
    masterUrl = await importMaster(page);
  });

  await test.step("analyze a job posting", async () => {
    await page.goto("/jobs/new");
    await page.getByLabel("Job description").fill(readFileSync(path.join(fixtures, "job.txt"), "utf8"));
    await page.getByRole("button", { name: "Analyze job" }).click();
    await expect(page.getByRole("heading", { name: "Senior Backend Engineer" })).toBeVisible();
  });

  await test.step("match the resume to the job", async () => {
    await page.getByRole("link", { name: /Match my resume/ }).click();
    await page.getByRole("button", { name: /Match my resume/ }).click();
    await expect(page.getByRole("img", { name: /Match score: \d+ out of 100/ })).toBeVisible();
    await expect(page.getByText(/Python and FastAPI or Django/).first()).toBeVisible();
  });

  await test.step("tailor for the job without touching the master", async () => {
    await page.goto("/tailor");
    await page.getByRole("button", { name: /Propose changes/ }).click();
    await expect(page.getByRole("heading", { name: "Tailor for Senior Backend Engineer" })).toBeVisible();
    await page.getByRole("button", { name: "Accept", exact: true }).first().click();
    await expect(page.getByText("Accepted").first()).toBeVisible();
    await page.getByRole("button", { name: "Create tailored resume" }).click();
    await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]{36}$/);
    expect(page.url()).not.toBe(masterUrl);
  });

  await test.step("download a PDF that is really a PDF", async () => {
    await page.goto("/builder");
    await expect(page.getByRole("img", { name: /ATS checks: \d+ out of 100/ })).toBeVisible();
    await expectPdf(page, await page.getByRole("link", { name: /Download PDF/ }).getAttribute("href"));
  });

  expect(consoleErrors).toEqual([]);
});
