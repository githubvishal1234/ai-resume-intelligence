// Builders and career intelligence, end to end against the real API and database: a cover letter
// drafted from a job, the CV Builder, the 6-second scan, an application feeding Callback Insights,
// the Market Map and the Proof Board.
import { expect, test } from "@playwright/test";
import { analyzeJob, expectPdf, importMaster, signUp, watchConsole } from "./helpers";

test("cover letter, CV, scan, insights, market map and proof board", async ({ page }) => {
  const consoleErrors = watchConsole(page);
  await signUp(page);
  const masterUrl = await importMaster(page);
  const jobUrl = await analyzeJob(page);

  await test.step("draft a cover letter from the job page, edit, save and download it", async () => {
    const card = page.getByRole("region", { name: "Cover letters" });
    await card.getByRole("button", { name: /Draft a cover letter/ }).click();
    await expect(page).toHaveURL(/\/cover-letters\/[0-9a-f-]{36}$/);
    // Every claim is a quoted resume line.
    await expect(page.getByRole("heading", { name: "Evidence in this draft" })).toBeVisible();
    await expect(page.getByLabel("Letter", { exact: true })).toHaveValue(/I'm writing to apply for the Senior Backend Engineer role/);
    await page.getByLabel("Hiring manager").fill("Dana Lee");
    await expect(page.getByRole("img", { name: /Cover letter preview/ })).toContainText("Dear Dana Lee,");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expectPdf(page, await page.getByRole("link", { name: /Download PDF/ }).getAttribute("href"));
  });

  await test.step("redraft from the resume, keeping the hiring manager", async () => {
    await page.getByRole("button", { name: /Redraft from my resume/ }).click();
    await page.getByRole("button", { name: "Redraft", exact: true }).click();
    await expect(page.getByText("Replace the letter text with a fresh draft?")).toBeHidden();
    await expect(page.getByLabel("Hiring manager")).toHaveValue("Dana Lee");
  });

  await test.step("the job page lists the letter", async () => {
    await page.goto(jobUrl);
    await expect(page.getByRole("region", { name: "Cover letters" }).getByRole("link", { name: /Cover letter: Senior Backend Engineer/ })).toBeVisible();
  });

  await test.step("download an academic CV", async () => {
    await page.goto("/cv-builder");
    await expect(page.getByRole("heading", { name: "CV Builder" })).toBeVisible();
    await expect(page.getByRole("img", { name: /ATS checks: \d+ out of 100/ })).toBeVisible();
    const href = await page.getByRole("link", { name: /Download PDF/ }).getAttribute("href");
    expect(href).toContain("template=cv-academic");
    await expectPdf(page, href);
  });

  await test.step("the resume page shows the recruiter 6-second scan", async () => {
    await page.goto(masterUrl);
    await expect(page.getByRole("heading", { name: "Recruiter 6-second scan" })).toBeVisible();
    await expect(page.getByRole("img", { name: /Six-second scan: \d+ out of 100/ })).toBeVisible();
  });

  await test.step("track an application that reached screening, and see it in Callback Insights", async () => {
    await page.goto(jobUrl);
    await page.getByRole("link", { name: /Track application/ }).click();
    await page.getByLabel("Company").fill("Northwind"); // the fixture posting names no company
    await page.getByLabel("Status").selectOption("screening");
    await page.getByLabel("Resume sent (optional)").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Save application" }).click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}$/);

    await page.goto("/insights");
    await expect(page.getByRole("heading", { name: "Callback Insights" })).toBeVisible();
    await expect(page.getByText("1 reached screening")).toBeVisible();
    await expect(page.getByRole("heading", { name: "By resume version" })).toBeVisible();
  });

  await test.step("the Market Map checks demand against the master resume", async () => {
    await page.goto("/market");
    await expect(page.getByRole("img", { name: /Market coverage: \d+ out of 100/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Skill demand" })).toBeVisible();
  });

  await test.step("plan a proof and move it along the board", async () => {
    await page.goto("/proofs");
    await page.getByLabel("Plan a proof for a skill").fill("Terraform");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const todo = page.getByRole("region", { name: "To do" });
    await expect(todo.getByText("Terraform", { exact: true })).toBeVisible();
    await todo.getByRole("button", { name: /Move to Doing/ }).click();
    await expect(page.getByRole("region", { name: "Doing" }).getByText("Terraform", { exact: true })).toBeVisible();
  });

  expect(consoleErrors).toEqual([]);
});
