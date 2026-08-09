import {
  addCapture,
  listInbox,
  archiveItem,
  deleteItem,
  requestPersistence,
} from "./storage/db.js";

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

if (captureInput) {
  captureInput.focus();
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
  const blob = await new Promise((resolve) =>
    inkCanvas.toBlob(resolve, "image/png")
  );
  if (!blob) return;
  await addCapture({ ink: blob });
  closeInkPanel();
  await renderInbox();
});

// --- text capture ---

async function saveText() {
  const text = captureInput.value.trim();
  if (!text) return;
  await addCapture({ body: text });
  captureInput.value = "";
  captureInput.focus();
  await renderInbox();
}

saveTextBtn.addEventListener("click", saveText);
captureInput.addEventListener("keydown", (evt) => {
  if (evt.key === "Enter" && !evt.shiftKey) {
    evt.preventDefault();
    saveText();
  }
});

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
    if (item.ink) {
      const url = URL.createObjectURL(item.ink);
      objectUrls.add(url);
      const img = document.createElement("img");
      img.src = url;
      img.alt = "sketch";
      img.className = "inbox-thumb";
      preview.appendChild(img);
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
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      if (confirm("Delete this capture? This cannot be undone.")) {
        await deleteItem(item.id);
        await renderInbox();
      }
    });

    actions.appendChild(archiveBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(actions);

    inboxList.appendChild(li);
  }
}

renderInbox();
requestPersistence();

// --- service worker + debug console ---

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
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
      indicator.textContent = "debug console active";
    }
  };
  document.body.appendChild(script);
}
