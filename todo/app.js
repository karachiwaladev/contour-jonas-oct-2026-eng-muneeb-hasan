import { addTask, deleteTask, getAllTasks, updateTask } from "./db.js";

const form = document.querySelector("#new-task");
const input = document.querySelector("#new-task-title");
const list = document.querySelector("#tasks");
const empty = document.querySelector("#empty");
const count = document.querySelector("#count");

function renderTask(task) {
  const item = document.createElement("li");
  item.className = task.done ? "task done" : "task";

  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.done;
  checkbox.addEventListener("change", async () => {
    await updateTask({ ...task, done: checkbox.checked });
    await render();
  });
  const title = document.createElement("span");
  title.textContent = task.title;
  label.append(checkbox, title);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete";
  remove.textContent = "Delete";
  remove.setAttribute("aria-label", `Delete "${task.title}"`);
  remove.addEventListener("click", async () => {
    await deleteTask(task.id);
    await render();
  });

  item.append(label, remove);
  return item;
}

async function render() {
  const tasks = await getAllTasks();
  list.replaceChildren(...tasks.map(renderTask));
  empty.hidden = tasks.length > 0;
  const remaining = tasks.filter((t) => !t.done).length;
  count.textContent = tasks.length ? `${remaining} of ${tasks.length} left` : "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  await addTask(title);
  input.value = "";
  await render();
});

render();
