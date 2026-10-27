// Runs the acceptance eval (eval/acceptance.html) in headless Chrome and prints the results.
// Exits non-zero if any scenario fails, so CI can use it. Usage: node todo/eval/run.mjs
// Needs Node 22+ and Chrome or Edge (set CHROME_PATH if it isn't in the usual place). It uses a
// throwaway browser profile, so it never touches your todo data.
// With GITHUB_STEP_SUMMARY set (as in GitHub Actions), the full report is added to the job summary.
// `--markdown FILE` also writes the full report (every scenario, grouped by result) to FILE.
import { appendFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { read, withPage } from "../headless.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 180_000;
const flag = process.argv.indexOf("--markdown");
const markdownFile = flag > -1 ? process.argv[flag + 1] : null;

let exitCode = 0;
try {
  await withPage(ROOT, "todo-eval-", async ({ origin, send }) => {
    await send("Page.navigate", { url: `${origin}/eval/acceptance.html` });
    const deadline = Date.now() + TIMEOUT_MS;
    let report = null;
    while (Date.now() < deadline && !report) {
      report = await read(send, "window.__acceptance ?? null").catch(() => null);
      if (!report) await new Promise((r) => setTimeout(r, 250));
    }
    if (!report) {
      console.log(`The eval did not finish within ${TIMEOUT_MS / 1000}s.`);
      exitCode = 1;
      return;
    }
    const { summary, results, markdown } = report;
    console.log(`Acceptance eval: ${summary.PASS} passed, ${summary.FAIL} failed, ${summary.SKIP} skipped, ${summary.UNCLEAR} unclear (${results.length} scenarios)`);
    for (const r of results.filter((r) => r.status !== "PASS")) console.log(`  ${r.status} ${r.id} ${r.name}${r.detail ? ` :: ${r.detail}` : ""}`);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Acceptance eval\n\n${markdown}\n`);
    if (markdownFile) await writeFile(markdownFile, `${markdown}\n`);
    if (summary.FAIL) exitCode = 1;
  });
} catch (e) {
  console.error(e);
  exitCode = 1;
}
process.exit(exitCode);
