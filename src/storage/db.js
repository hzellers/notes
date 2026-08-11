const DB_NAME = "notepad";
const DB_VERSION = 2;
const STORE_NAME = "items";
const SETTINGS_STORE = "settings";
const SETTINGS_KEY = "config";

const DEFAULT_SETTINGS = {
  id: SETTINGS_KEY,
  githubPat: null,
  dataRepo: null,
  tokenExpiry: null,
  lastBackupAt: null,
  lastBackupError: null,
};

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
          store.createIndex("archived", "archived");
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
        }
      };
      req.onblocked = () => {
        console.warn(
          "IndexedDB open blocked by another open tab/window on an older version."
        );
      };
      req.onsuccess = () => {
        const db = req.result;
        // If another tab opens a newer version later, release this
        // connection instead of blocking it forever.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
          document.dispatchEvent(new CustomEvent("notepad:db-stale"));
        };
        resolve(db);
      };
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

export async function getItem(id) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const item = await requestify(tx.objectStore(STORE_NAME).get(id));
  await txDone(tx);
  return item;
}

export async function createItem({
  kind,
  title = "",
  body = null,
  ink = null,
  sketchOf = null,
} = {}) {
  const db = await openDb();
  const now = Date.now();
  const item = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    kind,
    title,
    body,
    ink,
    sketchOf,
    pinned: false,
    pinnedAt: null,
    archived: false,
  };
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).add(item);
  await txDone(tx);
  return item;
}

export async function updateItem(id, patch) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const item = await requestify(store.get(id));
  if (item) {
    Object.assign(item, patch, { updatedAt: Date.now() });
    store.put(item);
  }
  await txDone(tx);
  return item;
}

// Creates the formalized item and archives the source capture in a single
// transaction, so promotion can never half-complete (a new item with no
// archived capture, or an archived capture with no new item). The capture's
// ink is copied onto the new item rather than referenced -- deleteItem()
// doesn't guard against deleting an archived capture, and a copy means that
// can never silently blank a live artifact's sketch.
export async function promoteCapture(captureId, { kind, title = "", body = null } = {}) {
  const db = await openDb();
  const now = Date.now();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const capture = await requestify(store.get(captureId));
  if (!capture) {
    await txDone(tx);
    throw new Error("Capture not found");
  }
  const item = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    kind,
    title,
    body,
    ink: capture.ink || null,
    sketchOf: captureId,
    pinned: false,
    pinnedAt: null,
    archived: false,
  };
  store.add(item);
  capture.archived = true;
  capture.updatedAt = now;
  store.put(capture);
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

export async function getSettings() {
  const db = await openDb();
  const tx = db.transaction(SETTINGS_STORE, "readonly");
  const record = await requestify(tx.objectStore(SETTINGS_STORE).get(SETTINGS_KEY));
  await txDone(tx);
  return record || { ...DEFAULT_SETTINGS };
}

export async function saveSettings(patch) {
  const db = await openDb();
  const tx = db.transaction(SETTINGS_STORE, "readwrite");
  const store = tx.objectStore(SETTINGS_STORE);
  const existing = (await requestify(store.get(SETTINGS_KEY))) || { ...DEFAULT_SETTINGS };
  const next = { ...existing, ...patch, id: SETTINGS_KEY };
  store.put(next);
  await txDone(tx);
  return next;
}

export async function recordBackupSuccess(timestamp) {
  return saveSettings({ lastBackupAt: timestamp, lastBackupError: null });
}

export async function recordBackupFailure(message) {
  return saveSettings({ lastBackupError: message });
}

export async function exportAllItems() {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const items = await requestify(tx.objectStore(STORE_NAME).getAll());
  await txDone(tx);
  return items;
}

export async function importItems(items) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const item of items) {
    store.put(item);
  }
  await txDone(tx);
}
