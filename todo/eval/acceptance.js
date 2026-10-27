// Acceptance eval for the todo app, tickets #3–#5.
// Each scenario comes from a ticket requirement or the plan agreed on that ticket. It drives the
// real app (../index.html) in an iframe, checks what is shown, and reads IndexedDB directly to
// check what was stored. "Reload" means loading a fresh copy of the app against the same storage.
// Waits are always for a condition (a re-render or a stored value), never a fixed delay.
import { nextDueDate } from "../recurrence.js";

const DB = "todo-app";
const STORE = "tasks";
const FILTERS_KEY = "todo-filters";
const TIMEOUT_MS = 4000;
const TICKET_URL = "https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/";

// ---------- assertions ----------

class Fail extends Error {}
function ok(cond, msg) {
  if (!cond) throw new Fail(msg);
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Fail(`${label}: expected ${e}, got ${a}`);
}

function withTimeout(promise, what, ms = TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Fail(`timed out waiting for ${what}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Polls a condition until it holds. Used only where there is no event to listen for.
async function waitFor(cond, what, ms = TIMEOUT_MS) {
  const start = performance.now();
  for (;;) {
    let value = false;
    try {
      value = await cond();
    } catch {}
    if (value) return value;
    if (performance.now() - start > ms) throw new Fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ---------- dates (worked out independently of the app's recurrence.js) ----------

const pad = (n) => String(n).padStart(2, "0");
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymdOf(d);
}
const daysIn = (y, m) => new Date(y, m, 0).getDate(); // m is 1-12
// Adds whole months, clamping to the month's last day. `anchor` is the day of month to aim for.
function addMonths(date, months, anchor) {
  const [y, m, d] = date.split("-").map(Number);
  const t = m - 1 + months;
  const ny = y + Math.floor(t / 12);
  const nm = (((t % 12) + 12) % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(anchor ?? d, daysIn(ny, nm)))}`;
}
const dueLabel = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

// ---------- storage ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true }).createIndex("createdAt", "createdAt");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAll() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const q = db.transaction(STORE).objectStore(STORE).getAll();
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
  } finally {
    db.close();
  }
}

async function dbSeed(records) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      records.forEach((r, i) => tx.objectStore(STORE).add({ createdAt: i + 1, ...r }));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Resolves once the database is gone. "blocked" just means a connection is still closing.
function deleteDb() {
  return withTimeout(
    new Promise((resolve, reject) => {
      const q = indexedDB.deleteDatabase(DB);
      q.onsuccess = () => resolve();
      q.onerror = () => reject(q.error);
    }),
    "the database to be deleted"
  );
}

// ---------- the app under test ----------

const host = document.querySelector("#frame-host");
let frame = null;
let doc = null;
let frameErrors = [];

function unloadApp() {
  frame?.remove();
  frame = null;
  doc = null;
}

const $ = (s) => doc.querySelector(s);
const $$ = (s) => [...doc.querySelectorAll(s)];
const rows = () => $$("#tasks > li");
const titles = () => $$("#tasks .title").map((e) => e.textContent);
const rowOf = (title) => rows().find((li) => li.querySelector(".title")?.textContent === title);
const countOf = (status) => Number($(`#status-filter [data-status="${status}"] .n`).textContent);
const tagRow = () => $$("#tag-filter .tag").map((c) => c.textContent);
const visible = (node) => !node.hidden;

async function loadApp({ waitRender = true } = {}) {
  unloadApp();
  frame = document.createElement("iframe");
  const loaded = new Promise((r) => frame.addEventListener("load", r, { once: true }));
  frame.src = "../index.html";
  host.append(frame);
  await withTimeout(loaded, "the app to load");
  doc = frame.contentDocument;
  const win = frame.contentWindow;
  win.addEventListener("error", (e) => frameErrors.push(e.message));
  win.addEventListener("unhandledrejection", (e) => frameErrors.push(String(e.reason?.message || e.reason)));
  const consoleError = win.console.error.bind(win.console);
  win.console.error = (...args) => {
    frameErrors.push(args.map(String).join(" "));
    consoleError(...args);
  };
  if (waitRender) await waitFor(shownMatchesStored, "the app's first render");
  return doc;
}

// The page is settled when what it shows matches what's stored: the counts, the tag chips, the
// pressed filters, and one row per visible task with the right title and done state. This is the
// expected behaviour from #3–#5 written independently of the app, so it doubles as an oracle: if
// the app filters or renders wrongly the wait times out and the scenario fails.
async function shownMatchesStored() {
  const tasks = (await dbAll()).sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  let f = { status: "all", tag: null };
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY));
    if (saved && ["all", "incomplete", "completed"].includes(saved.status)) f = { status: saved.status, tag: saved.tag || null };
  } catch {}
  const allTags = [...new Set(tasks.flatMap((t) => t.tags || []))].sort();
  if (f.tag && !allTags.includes(f.tag)) f.tag = null;
  const shown = tasks.filter((t) => (f.status === "all" || (f.status === "completed") === Boolean(t.done)) && (!f.tag || (t.tags || []).includes(f.tag)));

  if (countOf("all") !== tasks.length) return false;
  if ($(`#status-filter [data-status="${f.status}"]`).getAttribute("aria-pressed") !== "true") return false;
  if (JSON.stringify(tagRow()) !== JSON.stringify(allTags)) return false;
  if (JSON.stringify($$('#tag-filter .tag[aria-pressed="true"]').map((c) => c.textContent)) !== JSON.stringify(f.tag ? [f.tag] : [])) return false;
  const list = rows();
  if (list.length !== shown.length) return false;
  return list.every((li, i) => {
    if (li.classList.contains("editing")) return true;
    const t = shown[i];
    return li.querySelector(".title")?.textContent === t.title && li.classList.contains("done") === Boolean(t.done) && li.querySelector('input[type="checkbox"]').checked === Boolean(t.done);
  });
}

const reload = () => loadApp();

// A fresh app: empty database, no saved filters, optional seeded tasks and saved filters.
async function reset({ seed = [], filters } = {}) {
  unloadApp();
  await deleteDb();
  localStorage.removeItem(FILTERS_KEY);
  if (filters !== undefined) localStorage.setItem(FILTERS_KEY, typeof filters === "string" ? filters : JSON.stringify(filters));
  if (seed.length) await dbSeed(seed);
  return loadApp();
}

// Runs a UI action, then waits until the page shows what's stored (and `until`, if given, holds).
async function act(fn, what, until = () => true) {
  fn();
  await waitFor(async () => (await until()) && (await shownMatchesStored()), `the page to settle after ${what}`);
}

async function add(title, { due = "", tags = "", repeat = "none" } = {}) {
  const before = (await dbAll()).length;
  $("#new-task-title").value = title;
  $("#new-task-due").value = due;
  $("#new-task-tags").value = tags;
  $("#new-task-repeat").value = repeat;
  await act(() => $("#new-task").requestSubmit(), `adding "${title}"`, async () => (await dbAll()).length === before + 1);
}

function needRow(title) {
  const row = rowOf(title);
  ok(row, `task "${title}" is not in the list (shown: ${JSON.stringify(titles())})`);
  return row;
}

// Ticks or unticks a row's checkbox and waits until the stored done state has flipped.
async function clickCheckbox(row, what) {
  const before = JSON.stringify(await dbAll());
  await act(() => row.querySelector('input[type="checkbox"]').click(), what, async () => JSON.stringify(await dbAll()) !== before);
}
const toggle = (title) => clickCheckbox(needRow(title), `ticking "${title}"`);
async function removeRow(row, what) {
  const before = (await dbAll()).length;
  await act(() => row.querySelector(".delete").click(), what, async () => (await dbAll()).length === before - 1);
}
const remove = (title) => removeRow(needRow(title), `deleting "${title}"`);
const showStatus = (status) => act(() => $(`#status-filter [data-status="${status}"]`).click(), `choosing ${status}`);
function clickTagFilter(tag) {
  const chip = $$("#tag-filter .tag").find((c) => c.textContent === tag);
  ok(chip, `tag filter chip "${tag}" not shown (shown: ${JSON.stringify(tagRow())})`);
  return act(() => chip.click(), `the "${tag}" tag filter`);
}

const editorOpen = () => $("#tasks li.editing form");
const editorClosed = () => !editorOpen();

async function openEditor(title) {
  await act(() => needRow(title).querySelector(".edit").click(), `opening the editor for "${title}"`, editorOpen);
  return editorOpen();
}

async function edit(title, changes) {
  const editor = await openEditor(title);
  const field = { title: ".edit-title", due: ".edit-due", tags: ".edit-tags", repeat: ".edit-repeat" };
  for (const [key, value] of Object.entries(changes)) editor.querySelector(field[key]).value = value;
  await act(() => editor.requestSubmit(), `saving "${title}"`, editorClosed);
}

const byTitle = (tasks, title) => tasks.filter((t) => t.title === title);

// ---------- scenarios ----------

const scenarios = [];
function scenario(id, ticket, kind, name, fn, opts = {}) {
  scenarios.push({ id, ticket, kind, name, fn, ...opts });
}
const unclear = (detail) => ({ status: "UNCLEAR", detail });
const skip = (detail) => ({ status: "SKIP", detail });

// ===== #3: create, mark done, delete, client-side DB =====

scenario("3.1", "#3", "requirement", "Creating a task shows it in the list and stores it in IndexedDB", async () => {
  await reset();
  await add("Buy milk");
  eq(titles(), ["Buy milk"], "list");
  eq($("#count").textContent, "1 of 1 left", "remaining count");
  const [task] = await dbAll();
  eq({ title: task.title, done: task.done }, { title: "Buy milk", done: false }, "stored task");
});

scenario("3.2", "#3", "persistence", "A created task is still there after a reload", async () => {
  await reset();
  await add("Buy milk");
  await add("Walk dog");
  await reload();
  eq(titles(), ["Buy milk", "Walk dog"], "list after reload (oldest first)");
});

scenario("3.3", "#3", "requirement", "Ticking a task marks it done", async () => {
  await reset();
  await add("A");
  await add("B");
  await toggle("A");
  const row = needRow("A");
  ok(row.classList.contains("done"), 'row "A" is not styled as done');
  ok(row.querySelector('input[type="checkbox"]').checked, 'checkbox for "A" is not ticked');
  eq($("#count").textContent, "1 of 2 left", "remaining count");
  eq(byTitle(await dbAll(), "A")[0].done, true, "stored done flag");
});

scenario("3.4", "#3", "persistence", "Done state is still there after a reload", async () => {
  await reset();
  await add("A");
  await toggle("A");
  await reload();
  ok(needRow("A").querySelector('input[type="checkbox"]').checked, '"A" is no longer done after reload');
});

scenario("3.5", "#3", "edge", "Unticking a done task makes it incomplete again (and it persists)", async () => {
  await reset();
  await add("A");
  await toggle("A");
  await toggle("A");
  ok(!needRow("A").classList.contains("done"), '"A" is still styled as done');
  await reload();
  ok(!needRow("A").querySelector('input[type="checkbox"]').checked, '"A" is done again after reload');
});

scenario("3.6", "#3", "requirement", "Deleting a task removes only that task", async () => {
  await reset();
  await add("A");
  await add("B");
  await remove("A");
  eq(titles(), ["B"], "list");
  eq((await dbAll()).map((t) => t.title), ["B"], "stored tasks");
});

scenario("3.7", "#3", "persistence", "A deleted task stays deleted after a reload", async () => {
  await reset();
  await add("A");
  await add("B");
  await remove("B");
  await reload();
  eq(titles(), ["A"], "list after reload");
});

scenario("3.8", "#3", "failure", "A blank or whitespace-only title is not added", async () => {
  await reset();
  $("#new-task-title").value = "";
  $("#new-task").requestSubmit(); // blocked by the required attribute
  $("#new-task-title").value = "    ";
  $("#new-task").requestSubmit(); // reaches the app, which trims it and ignores it (synchronously)
  eq((await dbAll()).length, 0, "stored tasks");
  eq(titles(), [], "list");
  ok(visible($("#empty")), "empty-state message is hidden");
});

scenario("3.9", "#3", "failure", "HTML in a title is shown as text, not run or rendered", async () => {
  await reset();
  const nasty = '<img src=x onerror="window.__pwned=1"><b>bold</b>';
  await add(nasty);
  eq(titles(), [nasty], "title text");
  eq($$("#tasks img, #tasks b").length, 0, "injected elements in the list");
  ok(frame.contentWindow.__pwned === undefined, "injected script ran");
});

scenario("3.10", "#3", "edge", "Titles are trimmed, and long titles are kept in full", async () => {
  await reset();
  await add("   Spaces around   ");
  const long = "x".repeat(500);
  await add(long);
  eq(titles(), ["Spaces around", long], "titles");
});

scenario("3.11", "#3 #5", "requirement", "Everything runs client-side: no request leaves the page's origin", async () => {
  await reset();
  await add("A", { due: dayOffset(1), tags: "work", repeat: "daily" });
  await toggle("A");
  const origin = location.origin;
  const requests = frame.contentWindow.performance.getEntriesByType("resource").map((e) => e.name);
  const external = requests.filter((url) => !url.startsWith(origin));
  eq(external, [], "requests to other origins");
  return { status: "PASS", detail: `${requests.length} requests, all to ${origin} (the app's own files)` };
});

scenario("3.12", "#3", "edge", "The empty-state message shows with no tasks and comes back after the last delete", async () => {
  await reset();
  ok(visible($("#empty")), "empty-state message hidden on a fresh app");
  eq($("#empty").textContent, "No tasks yet. Add one above.", "empty-state text");
  await add("A");
  ok(!visible($("#empty")), "empty-state message shown alongside a task");
  await remove("A");
  ok(visible($("#empty")), "empty-state message not back after deleting the last task");
});

// Decision (27 Oct): interface simplicity is reviewed by a person, not scored here.
scenario("3.13", "#3", "manual", 'The interface is simple (manual review)', async () =>
  skip('Decided: reviewed by a person rather than automated. Check the screenshots in todo/screenshots against "a simple interface" (#3).'));

// Decision (27 Oct): a storage failure must show the user a visible error.
scenario(
  "3.14",
  "#3",
  "failure",
  "When storage can't be opened, the user sees a visible error and the task isn't shown as saved",
  async () => {
    unloadApp();
    await deleteDb();
    localStorage.removeItem(FILTERS_KEY);
    // A newer database version makes the app's open(…, 1) fail with a VersionError.
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    try {
      await loadApp({ waitRender: false });
      $("#new-task-title").value = "Will this save?";
      $("#new-task").requestSubmit();
      await waitFor(() => frameErrors.length > 0, "the storage failure to happen");
      const errorShown = () =>
        $$('[role="alert"]').some((e) => !e.hidden && e.textContent.trim()) ||
        /could not|couldn't|failed|unavailable|blocking storage/i.test(doc.body.innerText);
      let visibleError = true;
      try {
        await waitFor(errorShown, "a visible error message", 2000);
      } catch {
        visibleError = false;
      }
      ok(!titles().includes("Will this save?"), "the unsaved task is shown as if it had been saved");
      ok(visibleError, `no visible error is shown to the user (the page only raised ${frameErrors.length} uncaught error(s), first: "${frameErrors[0]}")`);
      const text = $$('[role="alert"]').find((e) => !e.hidden)?.textContent.trim();
      return { status: "PASS", detail: text ? `Shown: "${text}"` : "" };
    } finally {
      unloadApp();
      await deleteDb();
    }
  },
  { allowErrors: true }
);

// ===== #4: status filter, due dates, tags, tag filter, editing =====

async function threeTasks() {
  await reset();
  await add("A", { tags: "work" });
  await add("B", { tags: "home" });
  await add("C", { tags: "work" });
  await toggle("B");
}

scenario("4.1", "#4", "requirement", "Completed filter shows only completed tasks", async () => {
  await threeTasks();
  await showStatus("completed");
  eq(titles(), ["B"], "list");
  eq($('[data-status="completed"]').getAttribute("aria-pressed"), "true", "Completed button pressed");
});

scenario("4.2", "#4", "requirement", "Incomplete filter shows only incomplete tasks", async () => {
  await threeTasks();
  await showStatus("incomplete");
  eq(titles(), ["A", "C"], "list");
});

scenario("4.3", "#4", "requirement", "All filter shows every task, with correct counts on each button", async () => {
  await threeTasks();
  await showStatus("completed");
  await showStatus("all");
  eq(titles(), ["A", "B", "C"], "list");
  eq([countOf("all"), countOf("incomplete"), countOf("completed")], [3, 2, 1], "counts (all, incomplete, completed)");
});

scenario("4.4", "#4", "persistence", "The chosen status filter is remembered after a reload", async () => {
  await threeTasks();
  await showStatus("incomplete");
  await reload();
  eq(titles(), ["A", "C"], "list after reload");
  eq($('[data-status="incomplete"]').getAttribute("aria-pressed"), "true", "Incomplete still pressed");
});

scenario("4.5", "#4", "requirement", "A task can have a due date, shown as a badge and stored as YYYY-MM-DD", async () => {
  await reset();
  const due = dayOffset(3);
  await add("Report", { due });
  eq(needRow("Report").querySelector(".due")?.textContent, `Due ${dueLabel(due)}`, "due badge");
  eq(byTitle(await dbAll(), "Report")[0].dueDate, due, "stored due date");
});

scenario("4.6", "#4", "requirement", "An incomplete task past its due date is highlighted as overdue", async () => {
  await reset();
  await add("Late", { due: dayOffset(-1) });
  const row = needRow("Late");
  ok(row.classList.contains("overdue"), "row not marked overdue");
  ok(row.querySelector(".due.overdue")?.textContent.startsWith("Overdue"), "badge does not say Overdue");
});

scenario("4.7", "#4", "edge", "A task due today is not overdue", async () => {
  await reset();
  await add("Today", { due: dayOffset(0) });
  ok(!needRow("Today").classList.contains("overdue"), "due-today task is marked overdue");
});

scenario("4.8", "#4", "edge", "A completed task past its due date is not highlighted", async () => {
  await reset();
  await add("Late", { due: dayOffset(-2) });
  await toggle("Late");
  ok(!needRow("Late").classList.contains("overdue"), "completed task still marked overdue");
});

scenario("4.9", "#4", "persistence", "Due dates are still there after a reload", async () => {
  await reset();
  const due = dayOffset(5);
  await add("Report", { due });
  await add("No date");
  await reload();
  eq(needRow("Report").querySelector(".due")?.textContent, `Due ${dueLabel(due)}`, "due badge after reload");
  ok(!needRow("No date").querySelector(".due"), "task without a date shows a due badge");
});

scenario("4.10", "#4", "requirement", "Tags are trimmed, lowercased and de-duplicated", async () => {
  await reset();
  await add("Tagged", { tags: " Work, URGENT ,work,, " });
  eq([...needRow("Tagged").querySelectorAll(".meta .tag")].map((c) => c.textContent), ["work", "urgent"], "chips on the task");
  eq(byTitle(await dbAll(), "Tagged")[0].tags, ["work", "urgent"], "stored tags");
});

scenario("4.11", "#4", "edge", "A tags field of only commas and spaces gives no tags", async () => {
  await reset();
  await add("Untagged", { tags: " , ,, " });
  eq(byTitle(await dbAll(), "Untagged")[0].tags, [], "stored tags");
  ok($("#tag-filter").hidden, "tag filter row shown with no tags in use");
});

scenario("4.12", "#4", "requirement", "The tag filter row lists every tag in use, and hides when there are none", async () => {
  await reset();
  ok($("#tag-filter").hidden, "tag filter row shown on an empty app");
  await add("A", { tags: "work, urgent" });
  await add("B", { tags: "home" });
  eq(tagRow(), ["home", "urgent", "work"], "tag chips (sorted)");
  await remove("B");
  eq(tagRow(), ["urgent", "work"], "tag chips after deleting the only 'home' task");
});

scenario("4.13", "#4", "requirement", "Clicking a tag shows only tasks with that tag; clicking it again clears the filter", async () => {
  await threeTasks();
  await clickTagFilter("work");
  eq(titles(), ["A", "C"], "list with 'work'");
  await clickTagFilter("work");
  eq(titles(), ["A", "B", "C"], "list after clearing");
});

scenario("4.14", "#4", "requirement", "The tag filter combines with the status filter", async () => {
  await reset();
  await add("A", { tags: "work" });
  await add("B", { tags: "work" });
  await add("C", { tags: "home" });
  await toggle("B");
  await showStatus("incomplete");
  await clickTagFilter("work");
  eq(titles(), ["A"], "Incomplete + work");
});

scenario("4.15", "#4", "requirement", "Clicking a tag chip on a task applies that tag filter", async () => {
  await threeTasks();
  const chip = needRow("B").querySelector(".meta .tag");
  await act(() => chip.click(), "clicking B's tag");
  eq(titles(), ["B"], "list");
  eq($$('#tag-filter .tag[aria-pressed="true"]').map((c) => c.textContent), ["home"], "pressed filter chip");
});

scenario("4.16", "#4", "requirement", 'When filters hide every task, it says "No tasks match these filters."', async () => {
  await reset();
  await add("A");
  await showStatus("completed");
  ok(visible($("#empty")), "message hidden");
  eq($("#empty").textContent, "No tasks match these filters.", "message");
});

scenario("4.17", "#4", "persistence", "The chosen tag filter is remembered after a reload", async () => {
  await threeTasks();
  await clickTagFilter("home");
  await reload();
  eq(titles(), ["B"], "list after reload");
});

scenario("4.18", "#4", "edge", "A remembered tag filter is reset when no task has that tag any more", async () => {
  await threeTasks();
  await clickTagFilter("home");
  await remove("B");
  eq(titles(), ["A", "C"], "list after deleting the last 'home' task");
  eq(JSON.parse(localStorage.getItem(FILTERS_KEY)).tag, null, "saved tag filter");
});

scenario("4.19", "#4", "failure", "Corrupt or unknown saved filters fall back to All", async () => {
  await reset({ seed: [{ title: "A", done: false }], filters: "{not json" });
  eq(titles(), ["A"], "list with unparseable saved filters");
  await reset({ seed: [{ title: "A", done: true }], filters: { status: "archived", tag: null } });
  eq(titles(), ["A"], "list with an unknown saved status");
  eq($('[data-status="all"]').getAttribute("aria-pressed"), "true", "All pressed");
});

scenario("4.20", "#4", "requirement", "Editing changes a task's title, due date and tags, and the change persists", async () => {
  await reset();
  await add("Draft", { due: dayOffset(1), tags: "work" });
  const due = dayOffset(7);
  await edit("Draft", { title: "Final", due, tags: "Home, urgent" });
  const row = needRow("Final");
  eq(row.querySelector(".due")?.textContent, `Due ${dueLabel(due)}`, "due badge");
  await reload();
  const [task] = await dbAll();
  eq({ title: task.title, dueDate: task.dueDate, tags: task.tags }, { title: "Final", dueDate: due, tags: ["home", "urgent"] }, "stored task after reload");
  eq(titles(), ["Final"], "list after reload");
});

scenario("4.21", "#4", "edge", "Clearing the due date in the editor removes it", async () => {
  await reset();
  await add("Dated", { due: dayOffset(2) });
  await edit("Dated", { due: "" });
  ok(!needRow("Dated").querySelector(".due"), "due badge still shown");
  eq((await dbAll())[0].dueDate, null, "stored due date");
});

scenario("4.22", "#4", "requirement", "Escape and Cancel close the editor without saving", async () => {
  await reset();
  await add("Keep me");
  let editor = await openEditor("Keep me");
  editor.querySelector(".edit-title").value = "Changed";
  await act(() => editor.querySelector(".edit-title").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), "pressing Escape", editorClosed);
  eq(titles(), ["Keep me"], "list after Escape");
  editor = await openEditor("Keep me");
  editor.querySelector(".edit-title").value = "Changed";
  await act(() => [...editor.querySelectorAll("button")].find((b) => b.textContent === "Cancel").click(), "clicking Cancel", editorClosed);
  eq(titles(), ["Keep me"], "list after Cancel");
  eq((await dbAll())[0].title, "Keep me", "stored title");
});

scenario("4.23", "#4", "failure", "Saving an edit with a blank title is refused", async () => {
  await reset();
  await add("Named");
  const editor = await openEditor("Named");
  editor.querySelector(".edit-title").value = "   ";
  editor.requestSubmit(); // the app rejects it synchronously, before touching storage
  ok($("#tasks li.editing form"), "editor closed after a blank title");
  eq((await dbAll())[0].title, "Named", "stored title");
});

scenario("4.24", "#4", "requirement", "Enter in the editor saves", async () =>
  skip("Can't be automated in this page: synthetic key events don't trigger a form's implicit submission. Saving through the form's submit is covered by 4.20; a real Enter key press is checked separately (see REPORT.md)."));

scenario("4.25", "#4", "edge", "A task saved before #4 (no due date or tags) still loads, filters and edits", async () => {
  await reset({ seed: [{ title: "Legacy", done: false }] });
  eq(titles(), ["Legacy"], "list");
  ok(!needRow("Legacy").querySelector(".due, .meta .tag"), "legacy task shows a due badge or tags");
  await showStatus("incomplete");
  eq(titles(), ["Legacy"], "incomplete list");
  await edit("Legacy", { tags: "old" });
  eq((await dbAll())[0].tags, ["old"], "stored tags after edit");
});

// Decision (27 Oct): adding a task leaves the chosen filters as they are.
scenario("4.26", "#4", "edge", "Adding a task while a filter hides it saves the task and leaves the filters unchanged", async () => {
  await reset();
  await add("Done one", { tags: "work" });
  await toggle("Done one");
  await showStatus("completed");
  await clickTagFilter("work");
  await add("New one", { tags: "home" });
  eq(byTitle(await dbAll(), "New one").length, 1, "stored copies of the new task");
  eq(JSON.parse(localStorage.getItem(FILTERS_KEY)), { status: "completed", tag: "work" }, "saved filters");
  eq($('[data-status="completed"]').getAttribute("aria-pressed"), "true", "Completed still pressed");
  eq(titles(), ["Done one"], "list (the new task stays hidden by the filters)");
  eq(countOf("all"), 2, "All count");
});

// ===== #5: recurring tasks =====

const REPEAT_OPTIONS = ["none", "daily", "weekly", "monthly", "yearly"];

scenario("5.1", "#5", "requirement", "The add and edit forms both offer Doesn't repeat / Daily / Weekly / Monthly / Yearly", async () => {
  await reset();
  eq([...$("#new-task-repeat").options].map((o) => o.value), REPEAT_OPTIONS, "add form options");
  await add("A");
  const editor = await openEditor("A");
  eq([...editor.querySelector(".edit-repeat").options].map((o) => o.value), REPEAT_OPTIONS, "edit form options");
});

scenario("5.2", "#5", "requirement", "A recurring task shows a ↻ badge naming its repeat", async () => {
  await reset();
  await add("Standup", { due: dayOffset(0), repeat: "weekly" });
  await add("One-off");
  eq(needRow("Standup").querySelector(".repeat")?.textContent, "↻ Weekly", "badge");
  ok(!needRow("One-off").querySelector(".repeat"), "non-recurring task shows a repeat badge");
});

// Completes a recurring task due today and checks the original and the new copy.
async function completesTo(repeat, expectedDue) {
  await reset();
  const due = dayOffset(0);
  await add("Water plants", { due, tags: "home, garden", repeat });
  await toggle("Water plants");
  const tasks = byTitle(await dbAll(), "Water plants");
  eq(tasks.length, 2, "tasks titled 'Water plants'");
  const [original, copy] = tasks;
  eq({ done: original.done, dueDate: original.dueDate }, { done: true, dueDate: due }, "original occurrence");
  eq({ done: copy.done, dueDate: copy.dueDate, tags: copy.tags, repeat: copy.repeat }, { done: false, dueDate: expectedDue, tags: ["home", "garden"], repeat }, "new occurrence");
  eq(rows().length, 2, "rows shown");
}

scenario("5.3", "#5", "requirement", "Ticking a daily task keeps it as completed and adds a copy due tomorrow", () => completesTo("daily", dayOffset(1)));
scenario("5.4", "#5", "requirement", "Ticking a weekly task adds a copy due in 7 days", () => completesTo("weekly", dayOffset(7)));
scenario("5.5", "#5", "requirement", "Ticking a monthly task adds a copy due the same day next month (clamped)", () => completesTo("monthly", addMonths(dayOffset(0), 1)));
scenario("5.6", "#5", "requirement", "Ticking a yearly task adds a copy due the same day next year (clamped)", () => completesTo("yearly", addMonths(dayOffset(0), 12)));

scenario("5.7", "#5", "requirement", "A long-overdue daily task creates one copy due today, not a backlog", async () => {
  await reset();
  await add("Overdue daily", { due: dayOffset(-5), repeat: "daily" });
  await toggle("Overdue daily");
  const open = byTitle(await dbAll(), "Overdue daily").filter((t) => !t.done);
  eq(open.map((t) => t.dueDate), [dayOffset(0)], "open occurrences");
});

scenario("5.8", "#5", "edge", "Completing early keeps the schedule (next date counts from the due date, not today)", async () => {
  await reset();
  await add("Early", { due: dayOffset(3), repeat: "weekly" });
  await toggle("Early");
  eq(byTitle(await dbAll(), "Early").find((t) => !t.done)?.dueDate, dayOffset(10), "next due date");
});

scenario("5.9", "#5", "requirement", "Choosing a repeat with no due date starts it today", async () => {
  await reset();
  await add("No date", { repeat: "daily" });
  eq((await dbAll())[0].dueDate, dayOffset(0), "stored due date");
});

scenario("5.10", "#5", "edge", "Unticking and re-ticking creates no duplicate, and unticking keeps the copy", async () => {
  await reset();
  await add("Gym", { due: dayOffset(0), repeat: "daily" });
  await toggle("Gym");
  const gymRows = () => rows().filter((li) => li.querySelector(".title").textContent === "Gym");
  // Untick the completed original (the first row), then tick it again.
  await clickCheckbox(gymRows()[0], "unticking the original");
  eq(byTitle(await dbAll(), "Gym").length, 2, "tasks after unticking");
  await clickCheckbox(gymRows()[0], "re-ticking the original");
  eq(byTitle(await dbAll(), "Gym").length, 2, "tasks after re-ticking");
});

scenario("5.11", "#5", "requirement", "Setting repeat to Doesn't repeat stops the series", async () => {
  await reset();
  await add("Series", { due: dayOffset(0), repeat: "weekly" });
  await edit("Series", { repeat: "none" });
  ok(!needRow("Series").querySelector(".repeat"), "repeat badge still shown");
  await toggle("Series");
  eq(byTitle(await dbAll(), "Series").length, 1, "tasks after ticking");
});

scenario("5.12", "#5", "requirement", "Deleting a completed occurrence removes only that occurrence", async () => {
  await reset();
  await add("Bins", { due: dayOffset(0), repeat: "weekly" });
  await toggle("Bins");
  const doneRow = rows().find((li) => li.classList.contains("done"));
  ok(doneRow, "no completed occurrence shown");
  await removeRow(doneRow, "deleting the completed occurrence");
  const left = byTitle(await dbAll(), "Bins");
  eq(left.map((t) => ({ done: t.done, dueDate: t.dueDate })), [{ done: false, dueDate: dayOffset(7) }], "remaining occurrences");
});

// Decision (27 Oct): deleting the open occurrence ends the series.
scenario("5.13", "#5", "requirement", "Deleting the only open occurrence ends the series (no next copy is created)", async () => {
  await reset();
  await add("Rent", { due: dayOffset(0), repeat: "monthly" });
  await remove("Rent");
  eq(byTitle(await dbAll(), "Rent").length, 0, "tasks titled 'Rent' after deleting");
  eq(titles(), [], "list");
});

scenario("5.14", "#5", "persistence", "A completed occurrence, its new copy and the repeat are still there after a reload", async () => {
  await reset();
  await add("Pay bills", { due: dayOffset(0), tags: "money", repeat: "monthly" });
  await toggle("Pay bills");
  await reload();
  const shown = rows().filter((li) => li.querySelector(".title").textContent === "Pay bills");
  eq(shown.map((li) => li.classList.contains("done")), [true, false], "done state of the two occurrences");
  eq(shown.map((li) => li.querySelector(".repeat")?.textContent), ["↻ Monthly", "↻ Monthly"], "repeat badges");
  // Re-ticking the reloaded original must still not create a duplicate (the spawned flag persisted).
  await clickCheckbox(shown[0], "unticking after reload");
  await clickCheckbox(rows().find((li) => li.querySelector(".title").textContent === "Pay bills"), "re-ticking after reload");
  eq(byTitle(await dbAll(), "Pay bills").length, 2, "tasks after re-ticking a reloaded occurrence");
});

scenario("5.15", "#5", "requirement", "A monthly series on the 31st clamps to shorter months and returns to the 31st (through the UI)", async () => {
  // Seeded in the past so the app has to step it forward to today or later. Expected date worked out here.
  const start = "2026-01-31";
  await reset({ seed: [{ title: "Month end", done: false, dueDate: start, tags: [], repeat: "monthly", repeatDay: 31, spawned: false }] });
  await toggle("Month end");
  let expected = start;
  for (let i = 1; expected <= start || expected < dayOffset(0); i++) expected = addMonths(start, i, 31);
  eq(byTitle(await dbAll(), "Month end").find((t) => !t.done)?.dueDate, expected, "next due date");
});

scenario("5.16", "#5", "logic", "Month-end and leap-day dates (date maths with a fixed today)", async () => {
  const cases = [
    ["31 Jan -> 28 Feb", nextDueDate("2027-01-31", "monthly", "2027-01-31"), "2027-02-28"],
    ["28 Feb (anchored to 31) -> 31 Mar", nextDueDate("2027-02-28", "monthly", "2027-02-28", 31), "2027-03-31"],
    ["31 Jan -> 29 Feb in a leap year", nextDueDate("2028-01-31", "monthly", "2028-01-31"), "2028-02-29"],
    ["yearly 29 Feb -> 28 Feb", nextDueDate("2028-02-29", "yearly", "2028-02-29"), "2029-02-28"],
    ["yearly 28 Feb (anchored to 29) -> 29 Feb in 2032", nextDueDate("2031-02-28", "yearly", "2031-02-28", 29), "2032-02-29"],
  ];
  for (const [label, got, want] of cases) eq(got, want, label);
});

scenario("5.17", "#5", "edge", "Tasks saved before #5 are non-recurring: no badge, and ticking adds no copy", async () => {
  await reset({ seed: [{ title: "Old", done: false, dueDate: dayOffset(0), tags: [] }] });
  ok(!needRow("Old").querySelector(".repeat"), "legacy task shows a repeat badge");
  await toggle("Old");
  eq(byTitle(await dbAll(), "Old").length, 1, "tasks after ticking");
});

// ---------- runner and report ----------

const STATUSES = ["PASS", "FAIL", "SKIP", "UNCLEAR"];
const results = [];
const tbody = document.querySelector("#results tbody");

function addRow(r) {
  const tr = document.createElement("tr");
  for (const [text, cls] of [[r.id], [r.ticket], [r.kind], [r.name], [r.status, r.status], [r.detail]]) {
    const td = document.createElement("td");
    td.textContent = text;
    if (cls) td.className = cls;
    tr.append(td);
  }
  tbody.append(tr);
}

const cell = (text) => String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
const ticketLinks = (ticket) => ticket.replace(/#(\d+)/g, (m, n) => `[${m}](${TICKET_URL}${n})`);

function markdown(summary, startedAt, ms) {
  const titles = { PASS: "Passed", FAIL: "Failed", SKIP: "Skipped", UNCLEAR: "Unclear requirements (flagged, not scored)" };
  const lines = [
    `Run ${startedAt} in ${navigator.userAgent.match(/(Chrome|Edg|Firefox)\/[\d.]+/)?.[0] ?? "a browser"}, ${(ms / 1000).toFixed(1)} s.`,
    "",
    `**${summary.PASS} passed · ${summary.FAIL} failed · ${summary.SKIP} skipped · ${summary.UNCLEAR} unclear** (${results.length} scenarios)`,
  ];
  for (const status of STATUSES) {
    const group = results.filter((r) => r.status === status);
    lines.push("", `### ${titles[status]} (${group.length})`, "");
    if (!group.length) {
      lines.push("None.");
      continue;
    }
    lines.push("| ID | Ticket | Kind | Scenario | Detail |", "|---|---|---|---|---|");
    for (const r of group) lines.push(`| ${r.id} | ${ticketLinks(r.ticket)} | ${r.kind} | ${cell(r.name)} | ${cell(r.detail || "")} |`);
  }
  return lines.join("\n");
}

const startedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const t0 = performance.now();
for (const s of scenarios) {
  frameErrors = [];
  let status = "PASS";
  let detail = "";
  try {
    const r = await s.fn();
    if (r) ({ status, detail = "" } = r);
    if (status === "PASS" && frameErrors.length && !s.allowErrors) {
      status = "FAIL";
      detail = `the page raised errors: ${frameErrors.join("; ")}`;
    }
  } catch (e) {
    status = "FAIL";
    detail = e instanceof Fail ? e.message : `${e.name}: ${e.message}`;
  }
  const r = { id: s.id, ticket: s.ticket, kind: s.kind, name: s.name, status, detail };
  results.push(r);
  addRow(r);
}
const ms = performance.now() - t0;

// Leave the browser's todo data clean.
unloadApp();
await deleteDb();
localStorage.removeItem(FILTERS_KEY);

const summary = Object.fromEntries(STATUSES.map((s) => [s, results.filter((r) => r.status === s).length]));
document.querySelector("#summary").textContent = STATUSES.map((s) => `${s} ${summary[s]}`).join(" · ");
document.querySelector("#status").textContent = summary.FAIL ? "done, with failures" : "done";
window.__acceptance = { summary, results, markdown: markdown(summary, startedAt, ms) };
