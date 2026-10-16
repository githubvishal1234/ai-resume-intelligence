// The main journey, end to end against the real API and database: sign up, import a resume,
// analyze a job, match, tailor, and download an ATS-checked PDF. Fixtures are the backend tests' samples.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const fixtures = path.join(import.meta.dirname, "fixtures");
const PASSWORD = "correct-horse-battery-staple";

test("sign up, import a resume, match and tailor for a job, download the PDF", async ({ page }) => {
  let masterUrl = "";
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    // 401 from /auth/me before sign-up is the expected "signed out" answer.
    if (m.type() === "error" && !m.text().includes("401")) consoleErrors.push(m.text());
  });

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
    await page.goto("/resumes/upload");
    await page.getByLabel("Resume file").setInputFiles(path.join(fixtures, "resume.txt"));
    await expect(page.getByRole("heading", { name: "Review your resume" })).toBeVisible();
    await expect(page.getByLabel("Professional summary")).toHaveValue(/Backend engineer with 6 years/);
    await page.getByRole("button", { name: "Save as master resume" }).click();
    await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]{36}$/);
    masterUrl = page.url();
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
    const href = await page.getByRole("link", { name: /Download PDF/ }).getAttribute("href");
    expect(href).toBeTruthy();
    const pdf = await page.request.get(href!);
    expect(pdf.ok()).toBe(true);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  expect(consoleErrors).toEqual([]);
});
