export function sketchFilename(source) {
  const date = source && source.createdAt ? new Date(source.createdAt) : new Date();
  const stamp = date.toISOString().slice(0, 10);
  const idPart = source && source.id ? source.id.slice(0, 8) : "sketch";
  return `notepad-sketch-${stamp}-${idPart}.png`;
}

const TOAST_MS = 1800;
let toastTimer = null;

// A downloaded file gives no on-screen confirmation of its own -- without
// this, tapping again (because nothing seemed to happen) is what triggers
// Chrome's "download this file again?" prompt on the second, redundant tap.
function showDownloadToast(message) {
  const toast = document.getElementById("download-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), TOAST_MS);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showDownloadToast("Sketch downloaded");
}
