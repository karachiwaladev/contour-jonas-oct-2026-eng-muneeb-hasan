// Runs test.html in headless Chrome and reports line and function coverage of the app's JS,
// using V8's built-in precise coverage over the DevTools protocol. No dependencies: needs
// Node 22+ (built-in WebSocket) and Chrome or Edge. Usage: node todo/coverage.mjs
// Set CHROME_PATH to use a browser that isn't in the default install location.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { read, withPage } from "./headless.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const FILES = ["app.js", "db.js", "recurrence.js"];
const TIMEOUT_MS = 60_000;

// Merges coverage snapshots per file: keeps the highest count seen for every character and
// whether each function ran. Taking a snapshot resets V8's counters, so "ever ran" is the max.
function accumulate(store, result, origin) {
  for (const script of result) {
    if (!script.url.startsWith(origin)) continue;
    const file = new URL(script.url).pathname.slice(1);
    if (!FILES.includes(file)) continue;
    const entry = (store[file] ??= { counts: null, functions: new Map() });
    const ranges = script.functions.flatMap((fn) => fn.ranges);
    const length = Math.max(...ranges.map((r) => r.endOffset));
    const counts = new Array(length).fill(0);
    // Outer ranges first, so the innermost range decides each character's count.
    ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
    for (const r of ranges) counts.fill(r.count, r.startOffset, r.endOffset);
    if (!entry.counts) entry.counts = counts;
    else for (let i = 0; i < counts.length; i++) entry.counts[i] = Math.max(entry.counts[i] ?? 0, counts[i]);
    for (const fn of script.functions) {
      const { startOffset, endOffset, count } = fn.ranges[0];
      if (startOffset === 0 && endOffset >= length) continue; // the module's top level
      const key = startOffset;
      const prev = entry.functions.get(key);
      entry.functions.set(key, { name: fn.functionName || "(anonymous)", start: startOffset, ran: (prev?.ran ?? false) || count > 0 });
    }
  }
}

function report(file, source, entry) {
  const lines = source.split("\n");
  let offset = 0, total = 0, covered = 0;
  const missed = [], partial = [];
  lines.forEach((line, i) => {
    const code = line.trim();
    const isCode = code && !code.startsWith("//") && !code.startsWith("*") && !code.startsWith("/*");
    if (isCode) {
      // A line counts as covered if any of it ran. "Partly run" means some of it didn't,
      // e.g. the right side of `a || b`, or a `catch {}` on the same line as the `try` body.
      let ran = 0, skipped = 0;
      for (let c = 0; c < line.length; c++) {
        if (!line[c].trim()) continue;
        (entry?.counts?.[offset + c] ?? 0) > 0 ? ran++ : skipped++;
      }
      total++;
      if (ran) covered++; else missed.push(i + 1);
      if (ran && skipped) partial.push(i + 1);
    }
    offset += line.length + 1;
  });
  const fns = [...(entry?.functions.values() ?? [])];
  const lineOf = (pos) => source.slice(0, pos).split("\n").length;
  return {
    file, total, covered, missed, partial,
    fnTotal: fns.length, fnCovered: fns.filter((f) => f.ran).length,
    fnMissed: fns.filter((f) => !f.ran).map((f) => `${f.name} (line ${lineOf(f.start)})`),
  };
}

// Collapses [3,4,5,9] into "3-5, 9".
function spans(nums) {
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (nums[j + 1] === nums[j] + 1) j++;
    out.push(i === j ? `${nums[i]}` : `${nums[i]}-${nums[j]}`);
    i = j;
  }
  return out.join(", ");
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "100.0") + "%";

let exitCode = 0;
try {
  await withPage(ROOT, "todo-coverage-", async ({ origin, send }) => {
    await send("Profiler.enable");
    await send("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    await send("Page.navigate", { url: `${origin}/test.html` });

    // Snapshot often: the test reloads its iframe, and a removed frame's scripts can be collected.
    const store = {};
    const deadline = Date.now() + TIMEOUT_MS;
    let output = "";
    while (Date.now() < deadline) {
      accumulate(store, (await send("Profiler.takePreciseCoverage")).result, origin);
      output = (await read(send, "document.querySelector('#out')?.textContent ?? ''")) || "";
      if (output.startsWith("DONE")) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    accumulate(store, (await send("Profiler.takePreciseCoverage")).result, origin);

    const results = output.split("\n").slice(1);
    const failed = results.filter((l) => l.startsWith("FAIL"));
    if (!output.startsWith("DONE")) {
      console.log(`Tests did not finish within ${TIMEOUT_MS / 1000}s.`);
      exitCode = 1;
    } else {
      console.log(`Tests: ${results.length - failed.length} passed, ${failed.length} failed`);
      failed.forEach((l) => console.log("  " + l));
      if (failed.length) exitCode = 1;
    }

    const rows = [];
    for (const file of FILES) rows.push(report(file, await readFile(join(ROOT, file), "utf8"), store[file]));
    const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
    console.log("\nFile            Lines              Functions");
    for (const r of [...rows, { file: "Total", total: sum("total"), covered: sum("covered"), fnTotal: sum("fnTotal"), fnCovered: sum("fnCovered") }]) {
      console.log(`${r.file.padEnd(15)} ${pct(r.covered, r.total).padStart(6)} (${r.covered}/${r.total})`.padEnd(35) +
        `${pct(r.fnCovered, r.fnTotal).padStart(6)} (${r.fnCovered}/${r.fnTotal})`);
    }
    for (const r of rows) {
      if (!r.missed.length && !r.partial.length && !r.fnMissed.length) continue;
      console.log(`\n${r.file}`);
      if (r.missed.length) console.log(`  lines not run:   ${spans(r.missed)}`);
      if (r.partial.length) console.log(`  lines partly run: ${spans(r.partial)}`);
      if (r.fnMissed.length) console.log(`  functions not run: ${r.fnMissed.join(", ")}`);
    }
  });
} catch (e) {
  console.error(e);
  exitCode = 1;
}
process.exit(exitCode);
