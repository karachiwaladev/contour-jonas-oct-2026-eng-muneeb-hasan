// Client-side task storage backed by IndexedDB.
const DB_NAME = "todo-app";
const DB_VERSION = 1;
const STORE = "tasks";

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("createdAt", "createdAt");
      };
      request.onsuccess = () => resolve(request.result);
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

// Tasks saved before due dates and tags existed lack those fields.
function normalize(task) {
  return { ...task, dueDate: task.dueDate || null, tags: Array.isArray(task.tags) ? task.tags : [] };
}

export async function getAllTasks() {
  const tasks = await run("readonly", (store) => store.index("createdAt").getAll());
  return tasks.map(normalize);
}

export function addTask({ title, dueDate = null, tags = [] }) {
  return run("readwrite", (store) => store.add({ title, done: false, dueDate, tags, createdAt: Date.now() }));
}

export function updateTask(task) {
  return run("readwrite", (store) => store.put(task));
}

export function deleteTask(id) {
  return run("readwrite", (store) => store.delete(id));
}
