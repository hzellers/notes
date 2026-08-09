const DB_NAME = "notepad";
const DB_VERSION = 1;
const STORE_NAME = "items";

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("archived", "archived");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function requestify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function addCapture({ body = null, ink = null } = {}) {
  const db = await openDb();
  const now = Date.now();
  const item = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    kind: "capture",
    title: "",
    body,
    ink,
    sketchOf: null,
    pinned: false,
    pinnedAt: null,
    archived: false,
  };
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).add(item);
  await txDone(tx);
  return item;
}

export async function listInbox() {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const items = await requestify(tx.objectStore(STORE_NAME).getAll());
  await txDone(tx);
  return items
    .filter((item) => item.kind === "capture" && !item.archived)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function archiveItem(id) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const item = await requestify(store.get(id));
  if (item) {
    item.archived = true;
    item.updatedAt = Date.now();
    store.put(item);
  }
  await txDone(tx);
}

export async function deleteItem(id) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  await txDone(tx);
}

export async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}
