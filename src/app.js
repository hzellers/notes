import {
  addCapture,
  listInbox,
  archiveItem,
  deleteItem,
  requestPersistence,
  exportAllItems,
  updateItem,
} from "./storage/db.js";
import { scheduleBackup, formatRelative } from "./backup.js";
import { APP_VERSION } from "./version.js";
import { openForPromotion, openForEdit } from "./editor.js";
import { downloadBlob, sketchFilename } from "./download.js";
import "./settings-panel.js";

const captureInput = document.getElementById("capture-input");
const saveTextBtn = document.getElementById("save-text-btn");
const toggleInkBtn = document.getElementById("toggle-ink-btn");
const inkPanel = document.getElementById("ink-panel");
const inkCanvas = document.getElementById("ink-canvas");
const saveInkBtn = document.getElementById("save-ink-btn");
const clearInkBtn = document.getElementById("clear-ink-btn");
const cancelInkBtn = document.getElementById("cancel-ink-btn");
const inboxList = document.getElementById("inbox-list");
const inboxHeading = document.getElementById("inbox-heading");
const captureError = document.getElementById("capture-error");
const staleBanner = document.getElementById("stale-banner");
const updateOverlay = document.getElementById("update-overlay");

if (captureInput) {
  captureInput.focus();
}

if (staleBanner) {
  staleBanner.addEventListener("click", () => window.location.reload());
}
document.addEventListener("notepad:db-stale", () => {
  if (staleBanner) staleBanner.hidden = false;
});

function showCaptureError(err) {
  console.error("Capture save failed:", err);
  if (captureError) {
    captureError.textContent = `Couldn't save: ${err && err.message ? err.message : err}`;
    captureError.hidden = false;
  }
}

function clearCaptureError() {
  if (captureError) {
    captureError.hidden = true;
    captureError.textContent = "";
  }
}

// --- ink capture ---

let ctx = null;
let drawing = false;
let lastPoint = null;

function setupCanvas() {
  const rect = inkCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  inkCanvas.width = rect.width * dpr;
  inkCanvas.height = rect.height * dpr;
  ctx = inkCanvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#1f2a22";
}

function clearCanvas() {
  if (!ctx) return;
  ctx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
}

function pointFromEvent(evt) {
  const rect = inkCanvas.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

function isCanvasBlank() {
  if (!ctx) return true;
  const data = ctx.getImageData(0, 0, inkCanvas.width, inkCanvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

function stopDrawing() {
  drawing = false;
  lastPoint = null;
}

inkCanvas.addEventListener("pointerdown", (evt) => {
  drawing = true;
  lastPoint = pointFromEvent(evt);
  inkCanvas.setPointerCapture(evt.pointerId);
});

inkCanvas.addEventListener("pointermove", (evt) => {
  if (!drawing || !ctx) return;
  const point = pointFromEvent(evt);
  ctx.beginPath();
  ctx.moveTo(lastPoint.x, lastPoint.y);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  lastPoint = point;
});

inkCanvas.addEventListener("pointerup", stopDrawing);
inkCanvas.addEventListener("pointercancel", stopDrawing);

function openInkPanel() {
  inkPanel.hidden = false;
  toggleInkBtn.hidden = true;
  requestAnimationFrame(setupCanvas);
}

function closeInkPanel() {
  clearCanvas();
  inkPanel.hidden = true;
  toggleInkBtn.hidden = false;
}

toggleInkBtn.addEventListener("click", openInkPanel);
cancelInkBtn.addEventListener("click", closeInkPanel);
clearInkBtn.addEventListener("click", clearCanvas);

saveInkBtn.addEventListener("click", async () => {
  if (isCanvasBlank()) return;
  clearCaptureError();
  try {
    const blob = await new Promise((resolve) =>
      inkCanvas.toBlob(resolve, "image/png")
    );
    if (!blob) return;
    await addCapture({ ink: blob });
    closeInkPanel();
    await renderInbox();
    scheduleBackup();
  } catch (err) {
    showCaptureError(err);
  }
});

// --- text capture ---

async function saveText() {
  const text = captureInput.value.trim();
  if (!text) return;
  clearCaptureError();
  try {
    await addCapture({ body: text });
    captureInput.value = "";
    captureInput.focus();
    await renderInbox();
    scheduleBackup();
  } catch (err) {
    showCaptureError(err);
  }
}

saveTextBtn.addEventListener("click", saveText);
captureInput.addEventListener("keydown", (evt) => {
  if (evt.key === "Enter" && !evt.shiftKey) {
    evt.preventDefault();
    saveText();
  }
});

// --- shared sketch thumbnail (tap to download/share as an image) ---

function buildSketchThumb(item, blob, urlSet, thumbClass) {
  const url = URL.createObjectURL(blob);
  urlSet.add(url);

  const thumbWrap = document.createElement("div");
  thumbWrap.className = "thumb-wrap";
  thumbWrap.setAttribute("role", "button");
  thumbWrap.tabIndex = 0;
  thumbWrap.setAttribute("aria-label", "Download sketch image");

  const img = document.createElement("img");
  img.src = url;
  img.alt = "sketch";
  img.className = thumbClass;
  thumbWrap.appendChild(img);

  const hint = document.createElement("span");
  hint.className = "thumb-download-hint";
  hint.textContent = "⬇";
  hint.setAttribute("aria-hidden", "true");
  thumbWrap.appendChild(hint);

  const download = (evt) => {
    evt.stopPropagation();
    downloadBlob(blob, sketchFilename(item));
  };
  thumbWrap.addEventListener("click", download);
  thumbWrap.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" || evt.key === " ") {
      evt.preventDefault();
      download(evt);
    }
  });

  return thumbWrap;
}

// --- inbox list ---

const objectUrls = new Set();

function revokeObjectUrls() {
  for (const url of objectUrls) {
    URL.revokeObjectURL(url);
  }
  objectUrls.clear();
}

async function renderInbox() {
  const items = await listInbox();
  inboxHeading.textContent = `Inbox (${items.length})`;
  revokeObjectUrls();
  inboxList.innerHTML = "";

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "inbox-item";

    const preview = document.createElement("div");
    preview.className = "inbox-item-preview";
    if (item.ink instanceof Blob) {
      preview.appendChild(buildSketchThumb(item, item.ink, objectUrls, "inbox-thumb"));
    } else if (item.ink) {
      // Non-Blob ink data shouldn't normally happen, but a single malformed
      // item (e.g. from a corrupted import) must never blank the whole list.
      const span = document.createElement("span");
      span.textContent = "(sketch couldn't be loaded)";
      preview.appendChild(span);
    } else {
      const span = document.createElement("span");
      span.textContent = item.body || "";
      preview.appendChild(span);
    }
    li.appendChild(preview);

    const actions = document.createElement("div");
    actions.className = "inbox-item-actions";

    const archiveBtn = document.createElement("button");
    archiveBtn.type = "button";
    archiveBtn.textContent = "Archive";
    archiveBtn.addEventListener("click", async () => {
      await archiveItem(item.id);
      await renderInbox();
      scheduleBackup();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      if (confirm("Delete this capture? This cannot be undone.")) {
        await deleteItem(item.id);
        await renderInbox();
        scheduleBackup();
      }
    });

    // The kind-chooser replaces the actions row rather than appearing
    // alongside it -- showing both rows stacked at once (Promote/Archive/
    // Delete plus Note/Table/Diagram) is what made this look overloaded.
    const kindChooser = document.createElement("div");
    kindChooser.className = "kind-chooser";
    kindChooser.hidden = true;
    for (const kind of ["note", "table", "diagram"]) {
      const kindBtn = document.createElement("button");
      kindBtn.type = "button";
      kindBtn.textContent = kind[0].toUpperCase() + kind.slice(1);
      kindBtn.addEventListener("click", () => {
        openForPromotion(item, kind);
      });
      kindChooser.appendChild(kindBtn);
    }
    const cancelChooserBtn = document.createElement("button");
    cancelChooserBtn.type = "button";
    cancelChooserBtn.className = "kind-chooser-cancel";
    cancelChooserBtn.textContent = "Cancel";
    cancelChooserBtn.addEventListener("click", () => {
      kindChooser.hidden = true;
      actions.hidden = false;
    });
    kindChooser.appendChild(cancelChooserBtn);

    const promoteBtn = document.createElement("button");
    promoteBtn.type = "button";
    promoteBtn.textContent = "Promote";
    promoteBtn.addEventListener("click", () => {
      actions.hidden = true;
      kindChooser.hidden = false;
    });

    actions.appendChild(promoteBtn);
    actions.appendChild(archiveBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(actions);
    li.appendChild(kindChooser);

    inboxList.appendChild(li);
  }
}

// --- everything list (notes, tables, diagrams): search + pinned workbench ---

const pinnedSection = document.getElementById("pinned-section");
const pinnedList = document.getElementById("pinned-list");
const everythingList = document.getElementById("everything-list");
const everythingHeading = document.getElementById("everything-heading");
const searchInput = document.getElementById("search-input");

let searchQuery = "";
const everythingObjectUrls = new Set();

function revokeEverythingObjectUrls() {
  for (const url of everythingObjectUrls) {
    URL.revokeObjectURL(url);
  }
  everythingObjectUrls.clear();
}

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = `${item.title || ""}\n${item.body || ""}`.toLowerCase();
  return haystack.includes(query);
}

function buildEverythingItem(item, { pinnedLabel = false } = {}) {
  const li = document.createElement("li");
  li.className = "everything-item";
  li.tabIndex = 0;

  // Type first, then the input value (sketch thumbnail or text), then title.
  const kindBadge = document.createElement("span");
  kindBadge.className = "kind-badge";
  kindBadge.textContent = item.kind;
  li.appendChild(kindBadge);

  if (item.ink instanceof Blob) {
    li.appendChild(buildSketchThumb(item, item.ink, everythingObjectUrls, "everything-thumb"));
  }

  const meta = document.createElement("div");
  meta.className = "everything-item-meta";

  const label = document.createElement("span");
  label.className = "everything-item-label";
  label.textContent = item.title || (item.body ? item.body.slice(0, 60) : "(untitled)");
  meta.appendChild(label);

  if (pinnedLabel) {
    const pinnedSince = document.createElement("span");
    pinnedSince.className = "everything-item-pinned-since";
    pinnedSince.textContent = `Pinned ${formatRelative(item.pinnedAt)}`;
    meta.appendChild(pinnedSince);
  }

  li.appendChild(meta);

  const pinBtn = document.createElement("button");
  pinBtn.type = "button";
  pinBtn.className = "pin-toggle";
  pinBtn.textContent = item.pinned ? "★ Unpin" : "☆ Pin";
  pinBtn.addEventListener("click", async (evt) => {
    evt.stopPropagation();
    await updateItem(item.id, item.pinned ? { pinned: false, pinnedAt: null } : { pinned: true, pinnedAt: Date.now() });
    await renderEverything();
  });
  li.appendChild(pinBtn);

  li.addEventListener("click", () => openForEdit(item));
  li.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" || evt.key === " ") {
      evt.preventDefault();
      openForEdit(item);
    }
  });

  return li;
}

async function renderEverything() {
  const all = await exportAllItems();
  const query = searchQuery.trim().toLowerCase();
  const nonArchived = all.filter((item) => item.kind !== "capture" && !item.archived);

  const pinned = nonArchived
    .filter((item) => item.pinned && matchesQuery(item, query))
    .sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
  const rest = nonArchived
    .filter((item) => !item.pinned && matchesQuery(item, query))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  revokeEverythingObjectUrls();

  pinnedSection.hidden = pinned.length === 0;
  pinnedList.innerHTML = "";
  for (const item of pinned) {
    pinnedList.appendChild(buildEverythingItem(item, { pinnedLabel: true }));
  }

  everythingHeading.textContent = `Notes & diagrams (${rest.length})`;
  everythingList.innerHTML = "";
  for (const item of rest) {
    everythingList.appendChild(buildEverythingItem(item));
  }
}

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  renderEverything();
});

renderInbox();
renderEverything();
requestPersistence();
document.addEventListener("notepad:items-changed", () => {
  renderInbox();
  renderEverything();
});

// --- service worker + debug console ---

const versionIndicator = document.getElementById("debug-indicator");
if (versionIndicator) {
  versionIndicator.textContent = `app ${APP_VERSION}`;
}

const UPDATE_NOTICE_MS = 800;

if ("serviceWorker" in navigator) {
  // controllerchange fires in two different situations: a genuine update
  // replacing an already-active worker, and a page's first-ever "claim" by
  // a freshly-activated worker on initial load. Only the first case means
  // there's new code to pick up -- the second is harmless but reloading
  // for it anyway would risk interrupting whatever the user's doing on a
  // plain fresh load, for no benefit (that page's resources were already
  // fetched normally, not through a stale worker).
  let hadController = Boolean(navigator.serviceWorker.controller);
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    // Reloading straight away can navigate before the overlay has had a
    // chance to paint, which is exactly the "did something just happen?"
    // flicker this is meant to remove. Show it, hold briefly so it's
    // actually on screen, then reload. Only ever runs on the update path,
    // never on a normal open.
    if (updateOverlay) {
      updateOverlay.hidden = false;
      setTimeout(() => window.location.reload(), UPDATE_NOTICE_MS);
      return;
    }
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { type: "module" })
      .then((registration) => registration.update())
      .catch((err) => {
        console.error("Service worker registration failed:", err);
      });
  });
}

const debugRequested = new URLSearchParams(location.search).has("debug");
if (debugRequested) {
  const script = document.createElement("script");
  script.src = "vendor/eruda/eruda.js";
  script.onload = () => {
    window.eruda.init();
    const indicator = document.getElementById("debug-indicator");
    if (indicator) {
      indicator.textContent = `app ${APP_VERSION} · debug console active`;
    }
  };
  document.body.appendChild(script);
}
