import { NAMESPACE, PRIORITIES, addTask, completeAndSpawn, deleteTask, getAllTasks, updateTask } from "./db.js";
import { REPEATS, REPEAT_LABELS, dayOf, nextDueDate } from "./recurrence.js";

const FILTERS_KEY = NAMESPACE ? `todo-filters-${NAMESPACE}` : "todo-filters";
const STATUSES = ["all", "incomplete", "completed"];
const PRIORITY_FILTERS = ["all", ...PRIORITIES];
const PRIORITY_LABELS = { high: "High", medium: "Medium", low: "Low" };

const form = document.querySelector("#new-task");
const titleInput = document.querySelector("#new-task-title");
const dueInput = document.querySelector("#new-task-due");
const tagsInput = document.querySelector("#new-task-tags");
const repeatInput = document.querySelector("#new-task-repeat");
const priorityInput = document.querySelector("#new-task-priority");
const statusFilter = document.querySelector("#status-filter");
const priorityFilter = document.querySelector("#priority-filter");
const tagFilter = document.querySelector("#tag-filter");
const list = document.querySelector("#tasks");
const empty = document.querySelector("#empty");
const count = document.querySelector("#count");
const errorBox = document.querySelector("#error");

const SAVE_FAILED = "Couldn't save your change. Your browser may be blocking storage or be out of space. Nothing you typed was lost, so try again.";
const LOAD_FAILED = "Couldn't load your tasks. Your browser may be blocking storage. Reload the page to try again.";

let filters = loadFilters();
let editingId = null;
let renders = 0;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

// Runs a storage write. On failure it shows an error and returns false, so callers keep
// what the user typed and the list keeps showing what is actually saved.
async function save(write) {
  try {
    await write();
    clearError();
    return true;
  } catch (error) {
    console.error("Saving failed:", error);
    showError(SAVE_FAILED);
    return false;
  }
}

function loadFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY));
    if (saved && STATUSES.includes(saved.status)) {
      const priority = PRIORITY_FILTERS.includes(saved.priority) ? saved.priority : "all";
      return { status: saved.status, tag: saved.tag || null, priority };
    }
  } catch {}
  return { status: "all", tag: null, priority: "all" };
}

function saveFilters() {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch {}
}

function setFilters(change) {
  filters = { ...filters, ...change };
  saveFilters();
  render();
}

// "work, Urgent ,work" -> ["work", "urgent"]
function parseTags(text) {
  const tags = text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  return [...new Set(tags)];
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isOverdue(task) {
  return !task.done && task.dueDate !== null && task.dueDate < today();
}

function formatDue(dueDate) {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function matchesFilters(task) {
  if (filters.status === "incomplete" && task.done) return false;
  if (filters.status === "completed" && !task.done) return false;
  if (filters.priority !== "all" && task.priority !== filters.priority) return false;
  return !filters.tag || task.tags.includes(filters.tag);
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Fields for a task's schedule. A repeating task needs a date to repeat from, so it
// defaults to today. repeatDay remembers the day of month the series is anchored to.
function schedule(dueDate, repeat, previous = null) {
  const date = dueDate || (repeat !== "none" ? today() : null);
  const keepAnchor = previous && previous.dueDate === date && previous.repeatDay;
  return { dueDate: date, repeat, repeatDay: date ? (keepAnchor ? previous.repeatDay : dayOf(date)) : null };
}

async function setDone(task, done) {
  await save(() => {
    if (done && task.repeat !== "none" && !task.spawned) {
      const anchor = task.repeatDay || dayOf(task.dueDate);
      const dueDate = nextDueDate(task.dueDate, task.repeat, today(), anchor);
      const next = { title: task.title, tags: task.tags, repeat: task.repeat, repeatDay: anchor, priority: task.priority, dueDate };
      return completeAndSpawn(task, next);
    }
    return updateTask({ ...task, done });
  });
  // Re-render either way: after a failure this puts the checkbox back to the saved state.
  await render();
}

function choiceSelect(values, labels, value, props) {
  const select = el("select", props, values.map((v) => el("option", { value: v, textContent: labels[v] })));
  select.value = value;
  return select;
}

function tagChip(tag, onClick) {
  const chip = el("button", { type: "button", className: "tag", textContent: tag });
  chip.addEventListener("click", onClick);
  return chip;
}

function renderTask(task) {
  if (task.id === editingId) return renderEditor(task);

  const overdue = isOverdue(task);
  const item = el("li", { className: ["task", task.done && "done", overdue && "overdue"].filter(Boolean).join(" ") });

  const checkbox = el("input", { type: "checkbox", checked: task.done });
  checkbox.setAttribute("aria-label", `Mark "${task.title}" done`);
  checkbox.addEventListener("change", () => setDone(task, checkbox.checked));

  const meta = el("div", { className: "meta" }, [
    el("span", { className: `priority priority-${task.priority}`, textContent: PRIORITY_LABELS[task.priority], title: "Priority" }),
  ]);
  if (task.dueDate) {
    const due = el("span", { className: overdue ? "due overdue" : "due" });
    due.textContent = overdue ? `Overdue · ${formatDue(task.dueDate)}` : `Due ${formatDue(task.dueDate)}`;
    meta.append(due);
  }
  if (task.repeat !== "none") {
    meta.append(el("span", { className: "repeat", textContent: `↻ ${REPEAT_LABELS[task.repeat]}`, title: "Repeats" }));
  }
  for (const tag of task.tags) meta.append(tagChip(tag, () => setFilters({ tag })));

  const body = el("div", { className: "body" }, [el("span", { className: "title", textContent: task.title }), meta]);

  const edit = el("button", { type: "button", className: "secondary edit", textContent: "Edit" });
  edit.setAttribute("aria-label", `Edit "${task.title}"`);
  edit.addEventListener("click", () => {
    editingId = task.id;
    render();
  });

  const remove = el("button", { type: "button", className: "secondary delete", textContent: "Delete" });
  remove.setAttribute("aria-label", `Delete "${task.title}"`);
  remove.addEventListener("click", async () => {
    if (await save(() => deleteTask(task.id))) await render();
  });

  item.append(checkbox, body, el("div", { className: "actions" }, [edit, remove]));
  return item;
}

function renderEditor(task) {
  const title = el("input", { type: "text", value: task.title, required: true, name: "title", className: "edit-title" });
  title.setAttribute("aria-label", "Title");
  const due = el("input", { type: "date", value: task.dueDate || "", name: "dueDate", className: "edit-due" });
  due.setAttribute("aria-label", "Due date");
  const tags = el("input", { type: "text", value: task.tags.join(", "), placeholder: "Tags, comma-separated", name: "tags", className: "edit-tags" });
  tags.setAttribute("aria-label", "Tags");
  const repeat = choiceSelect(REPEATS, REPEAT_LABELS, task.repeat, { name: "repeat", className: "edit-repeat" });
  repeat.setAttribute("aria-label", "Repeat");
  const priority = choiceSelect(PRIORITIES, PRIORITY_LABELS, task.priority, { name: "priority", className: "edit-priority" });
  priority.setAttribute("aria-label", "Priority");

  const saveButton = el("button", { type: "submit", textContent: "Save" });
  const cancel = el("button", { type: "button", className: "secondary", textContent: "Cancel" });
  const stopEditing = () => {
    editingId = null;
    render();
  };
  cancel.addEventListener("click", stopEditing);

  const editor = el("form", { className: "editor" }, [title, due, repeat, priority, tags, el("div", { className: "actions" }, [saveButton, cancel])]);
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Escape") stopEditing();
  });
  editor.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newTitle = title.value.trim();
    if (!newTitle) {
      title.value = "";
      title.reportValidity();
      return;
    }
    const fields = { title: newTitle, tags: parseTags(tags.value), priority: priority.value, ...schedule(due.value || null, repeat.value, task) };
    // On failure the editor stays open with the new values, so Save can be pressed again.
    if (!(await save(() => updateTask({ ...task, ...fields })))) return;
    editingId = null;
    await render();
  });

  queueMicrotask(() => title.focus());
  return el("li", { className: "task editing" }, [editor]);
}

function renderFilters(tasks) {
  const counts = {
    all: tasks.length,
    incomplete: tasks.filter((t) => !t.done).length,
    completed: tasks.filter((t) => t.done).length,
  };
  for (const button of statusFilter.querySelectorAll("button")) {
    const status = button.dataset.status;
    button.setAttribute("aria-pressed", String(filters.status === status));
    button.querySelector(".n").textContent = counts[status];
  }

  for (const button of priorityFilter.querySelectorAll("button")) {
    const priority = button.dataset.priority;
    button.setAttribute("aria-pressed", String(filters.priority === priority));
    button.querySelector(".n").textContent = priority === "all" ? tasks.length : tasks.filter((t) => t.priority === priority).length;
  }

  const allTags = [...new Set(tasks.flatMap((t) => t.tags))].sort();
  tagFilter.replaceChildren(
    ...allTags.map((tag) => {
      const chip = tagChip(tag, () => setFilters({ tag: filters.tag === tag ? null : tag }));
      chip.setAttribute("aria-pressed", String(filters.tag === tag));
      return chip;
    })
  );
  tagFilter.hidden = allTags.length === 0;
}

async function render() {
  try {
    await renderTasks();
  } catch (error) {
    console.error("Loading failed:", error);
    showError(LOAD_FAILED);
  }
}

async function renderTasks() {
  const tasks = await getAllTasks();
  const allTags = new Set(tasks.flatMap((t) => t.tags));
  if (filters.tag && !allTags.has(filters.tag)) {
    filters.tag = null;
    saveFilters();
  }

  renderFilters(tasks);
  const visible = tasks.filter(matchesFilters);
  list.replaceChildren(...visible.map(renderTask));

  empty.hidden = visible.length > 0;
  empty.textContent = tasks.length ? "No tasks match these filters." : "No tasks yet. Add one above.";
  const remaining = tasks.filter((t) => !t.done).length;
  count.textContent = tasks.length ? `${remaining} of ${tasks.length} left` : "";
  // Lets the tests wait for a finished render instead of sleeping for a fixed time.
  document.body.dataset.renders = String(++renders);
}

statusFilter.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-status]");
  if (button) setFilters({ status: button.dataset.status });
});

priorityFilter.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-priority]");
  if (button) setFilters({ priority: button.dataset.priority });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  const fields = { title, tags: parseTags(tagsInput.value), priority: priorityInput.value, ...schedule(dueInput.value || null, repeatInput.value) };
  // On failure the form keeps what was typed, so Add can be pressed again.
  if (!(await save(() => addTask(fields)))) return;
  form.reset();
  titleInput.focus();
  await render();
});

render();
