// Generates src/types/api.d.ts from the backend's OpenAPI schema so API drift fails the build.
// Usage: npm run gen:api            (write)
//        npm run check:api          (fail if committed file is stale; used in CI)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const backend = path.resolve(root, "../backend");
const target = path.join(root, "src/types/api.d.ts");
const check = process.argv.includes("--check");

const isWindows = process.platform === "win32";
const venvPython = isWindows
  ? path.resolve(root, "../.venv/Scripts/python.exe")
  : path.resolve(root, "../.venv/bin/python");
const python = process.env.PYTHON ?? (existsSync(venvPython) ? venvPython : isWindows ? "python" : "python3");

const tmp = mkdtempSync(path.join(tmpdir(), "openapi-"));
const schemaFile = path.join(tmp, "openapi.json");
const outFile = path.join(tmp, "api.d.ts");
// Write to a file (not stdout): the app emits a JSON log line on startup.
execFileSync(
  python,
  [
    "-c",
    "import json, sys; from app.main import app; open(sys.argv[1], 'w').write(json.dumps(app.openapi()))",
    schemaFile,
  ],
  { cwd: backend, env: { ...process.env, APP_ENV: "test" }, stdio: ["ignore", "ignore", "inherit"] },
);
// Call the local CLI through node directly: avoids `npx`, which is `npx.cmd` on Windows.
const cli = path.join(root, "node_modules/openapi-typescript/bin/cli.js");
execFileSync(process.execPath, [cli, schemaFile, "-o", outFile], { cwd: root, stdio: "pipe" });

const generated = readFileSync(outFile, "utf8");
if (check) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current !== generated) {
    console.error("src/types/api.d.ts is out of date. Run `npm run gen:api` and commit.");
    process.exit(1);
  }
  console.log("API types are up to date.");
} else {
  writeFileSync(target, generated);
  console.log("Wrote src/types/api.d.ts");
}
