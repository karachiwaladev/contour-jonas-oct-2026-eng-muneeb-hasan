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

export function getAllTasks() {
  return run("readonly", (store) => store.index("createdAt").getAll());
}

export function addTask(title) {
  return run("readwrite", (store) => store.add({ title, done: false, createdAt: Date.now() }));
}

export function updateTask(task) {
  return run("readwrite", (store) => store.put(task));
}

export function deleteTask(id) {
  return run("readwrite", (store) => store.delete(id));
}
