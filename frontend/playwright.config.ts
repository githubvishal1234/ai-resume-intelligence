// End-to-end tests: a real browser against the real API and database (no mocks).
// Run with `npm run e2e`. It starts the API (after migrating the database) and the Vite dev
// server unless they are already running. The API reads backend/.env, or the environment in CI.
import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const root = import.meta.dirname;
const backend = path.resolve(root, "../backend");
const venvPython = path.resolve(root, process.platform === "win32" ? "../.venv/Scripts/python.exe" : "../.venv/bin/python");
const python = process.env.PYTHON ?? (existsSync(venvPython) ? `"${venvPython}"` : "python");

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts", // not *.test.ts, so Vitest never picks these up
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `${python} -m alembic upgrade head && ${python} -m uvicorn app.main:app --port 8000`,
      cwd: backend,
      url: "http://localhost:8000/api/v1/health/live",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      cwd: root,
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
