// Shared helpers for running the todo app's browser pages in headless Chrome, used by
// coverage.mjs (test.html) and eval/run.mjs (eval/acceptance.html). No dependencies: needs
// Node 22+ (built-in WebSocket) and Chrome or Edge. Set CHROME_PATH to use a browser that
// isn't in the default install location.
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

export function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error("No Chrome or Edge found. Set CHROME_PATH.");
  return found;
}

// Serves a folder so ES modules and IndexedDB work (they don't from file://).
export function serve(root) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    if (path.includes("..")) return res.writeHead(400).end();
    try {
      const body = await readFile(join(root, path));
      res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function launch(browserPath, profileDir) {
  const proc = spawn(browserPath, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profileDir}`,
    "--no-first-run", "--no-default-browser-check",
    // CI runners (e.g. GitHub's Ubuntu images) don't allow Chrome's sandbox.
    ...(process.env.CI ? ["--no-sandbox"] : []),
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = new Promise((resolve, reject) => {
    let err = "";
    proc.stderr.on("data", (chunk) => {
      err += chunk;
      const match = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    proc.on("exit", (code) => reject(new Error(`Browser exited (${code}) before DevTools was ready:\n${err}`)));
  });
  return { proc, wsUrl };
}

// Minimal DevTools protocol client over the browser's WebSocket.
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return { send, close: () => ws.close() };
}

// Serves `root`, starts headless Chrome with a throwaway profile (so it never touches your
// todo data), opens a blank page and calls `fn({ origin, send })`, where `send` talks to that
// page over the DevTools protocol. Cleans everything up afterwards, even if `fn` throws.
export async function withPage(root, profilePrefix, fn) {
  const server = await serve(root);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profileDir = await mkdtemp(join(tmpdir(), profilePrefix));
  const { proc, wsUrl } = launch(findBrowser(), profileDir);
  let cdp;
  try {
    cdp = await connect(await wsUrl);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    return await fn({ origin, send: (method, params) => cdp.send(method, params, sessionId) });
  } finally {
    cdp?.close();
    proc.kill();
    server.close();
    await new Promise((r) => setTimeout(r, 500)); // let the browser release the profile folder
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Reads a value from the page by evaluating a JS expression.
export async function read(send, expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}
