// Client-side task storage backed by IndexedDB.

// Tests open the app as index.html?ns=test so they get their own database and saved
// filters, and never touch the real tasks.
export const NAMESPACE = new URLSearchParams(location.search).get("ns");
const DB_NAME = NAMESPACE ? `todo-app-${NAMESPACE}` : "todo-app";
const DB_VERSION = 1;
const STORE = "tasks";

export const PRIORITIES = ["high", "medium", "low"];

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("createdAt", "createdAt");
      };
      request.onsuccess = () => {
        // Let another tab or the tests delete or upgrade the database instead of blocking it.
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

// Tasks saved before due dates, tags (#4), repeats (#5) or priority (#8) existed lack
// those fields. A task without a known priority counts as medium.
function normalize(task) {
  return {
    ...task,
    dueDate: task.dueDate || null,
    tags: Array.isArray(task.tags) ? task.tags : [],
    repeat: task.repeat || "none",
    repeatDay: task.repeatDay || null,
    spawned: Boolean(task.spawned),
    priority: PRIORITIES.includes(task.priority) ? task.priority : "medium",
  };
}

function newTask({ title, dueDate = null, tags = [], repeat = "none", repeatDay = null, priority = "medium" }) {
  return { title, done: false, dueDate, tags, repeat, repeatDay, priority, spawned: false, createdAt: Date.now() };
}

export async function getAllTasks() {
  const tasks = await run("readonly", (store) => store.index("createdAt").getAll());
  return tasks.map(normalize);
}

export function addTask(fields) {
  return run("readwrite", (store) => store.add(newTask(fields)));
}

// Marks a recurring occurrence done and adds the next one in a single transaction,
// so a reload or error can never leave one without the other.
export function completeAndSpawn(task, next) {
  return run("readwrite", (store) => {
    store.put({ ...task, done: true, spawned: true });
    return store.add(newTask(next));
  });
}

export function updateTask(task) {
  return run("readwrite", (store) => store.put(task));
}

export function deleteTask(id) {
  return run("readwrite", (store) => store.delete(id));
}
