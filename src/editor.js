import { promoteCapture, updateItem, getItem } from "./storage/db.js";
import { scheduleBackup } from "./backup.js";
import { renderTable } from "./table.js";
import { renderMermaid } from "./diagram.js";
import { downloadBlob, sketchFilename } from "./download.js";

const panel = document.getElementById("editor-panel");
const heading = document.getElementById("editor-heading");
const sketchDetails = document.getElementById("editor-sketch-details");
const sketchContent = document.getElementById("editor-sketch-content");
const titleInput = document.getElementById("editor-title-input");
const bodyLabel = document.getElementById("editor-body-label");
const bodyInput = document.getElementById("editor-body-input");
const previewWrap = document.getElementById("editor-preview-wrap");
const preview = document.getElementById("editor-preview");
const errorEl = document.getElementById("editor-error");
const statusEl = document.getElementById("editor-status");
const saveBtn = document.getElementById("editor-save-btn");
const cancelBtn = document.getElementById("editor-cancel-btn");

const KIND_LABELS = { note: "note", table: "table", diagram: "diagram" };
const BODY_LABELS = {
  note: "Note",
  table: "Table source (one row per line, comma-separated)",
  diagram: "Mermaid source",
};

let mode = null; // "promote" | "edit"
let currentCapture = null;
let currentItem = null;
let currentKind = null;
let previewDebounce = null;
let sketchObjectUrl = null;

function revokeSketchUrl() {
  if (sketchObjectUrl) {
    URL.revokeObjectURL(sketchObjectUrl);
    sketchObjectUrl = null;
  }
}

function renderSketch(source) {
  sketchContent.innerHTML = "";
  revokeSketchUrl();
  if (!source) {
    sketchDetails.hidden = true;
    return;
  }
  sketchDetails.hidden = false;
  sketchDetails.open = false;
  if (source.ink instanceof Blob) {
    sketchObjectUrl = URL.createObjectURL(source.ink);
    const img = document.createElement("img");
    img.src = sketchObjectUrl;
    img.alt = "original sketch";
    img.className = "editor-sketch-img";
    sketchContent.appendChild(img);

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "sketch-download-btn";
    downloadBtn.textContent = "Download image";
    downloadBtn.addEventListener("click", () => {
      downloadBlob(source.ink, sketchFilename(source));
    });
    sketchContent.appendChild(downloadBtn);
  } else if (source.body) {
    const p = document.createElement("p");
    p.textContent = source.body;
    sketchContent.appendChild(p);
  } else {
    sketchDetails.hidden = true;
  }
}

function updatePreview() {
  if (currentKind === "table") {
    previewWrap.hidden = false;
    errorEl.hidden = true;
    renderTable(bodyInput.value, preview);
  } else if (currentKind === "diagram") {
    previewWrap.hidden = false;
    if (previewDebounce) clearTimeout(previewDebounce);
    previewDebounce = setTimeout(() => {
      renderMermaid(bodyInput.value, preview, errorEl);
    }, 400);
  } else {
    previewWrap.hidden = true;
    preview.innerHTML = "";
    errorEl.hidden = true;
  }
}

function resetForm(kind) {
  currentKind = kind;
  heading.textContent =
    mode === "promote" ? `New ${KIND_LABELS[kind]}` : `Edit ${KIND_LABELS[kind]}`;
  bodyLabel.textContent = BODY_LABELS[kind];
  statusEl.textContent = "";
  errorEl.hidden = true;
  preview.innerHTML = "";
}

export function openForPromotion(capture, kind) {
  mode = "promote";
  currentCapture = capture;
  currentItem = null;
  resetForm(kind);
  renderSketch(capture);
  titleInput.value = "";
  bodyInput.value = kind === "note" ? capture.body || "" : "";
  updatePreview();
  openPanel();
}

export async function openForEdit(item) {
  mode = "edit";
  currentItem = item;
  currentCapture = null;
  resetForm(item.kind);
  // The item carries its own copy of ink (see promoteCapture), so a sketch
  // that was originally a drawing is always available here even if the
  // source capture is long gone. A text sketch isn't duplicated onto the
  // item (its body field means something different -- the formalized
  // content, not the original scrawl) so that case still looks it up via
  // sketchOf, on a best-effort basis.
  if (item.ink instanceof Blob) {
    renderSketch(item);
  } else if (item.sketchOf) {
    currentCapture = await getItem(item.sketchOf);
    renderSketch(currentCapture);
  } else {
    renderSketch(null);
  }
  titleInput.value = item.title || "";
  bodyInput.value = item.body || "";
  updatePreview();
  openPanel();
}

function openPanel() {
  panel.classList.add("show");
}

function closePanel() {
  panel.classList.remove("show");
  revokeSketchUrl();
}

bodyInput.addEventListener("input", updatePreview);

saveBtn.addEventListener("click", async () => {
  const title = titleInput.value.trim();
  const body = bodyInput.value;
  saveBtn.disabled = true;
  statusEl.textContent = "Saving…";
  try {
    if (mode === "promote") {
      await promoteCapture(currentCapture.id, { kind: currentKind, title, body });
    } else {
      await updateItem(currentItem.id, { title, body });
    }
    document.dispatchEvent(new CustomEvent("notepad:items-changed"));
    scheduleBackup();
    closePanel();
  } catch (err) {
    console.error("Save failed:", err);
    statusEl.textContent = `Couldn't save: ${err.message}`;
  } finally {
    saveBtn.disabled = false;
  }
});

cancelBtn.addEventListener("click", closePanel);
