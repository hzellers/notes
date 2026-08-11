// The suffix is derived from the moment of download (not the sketch's own
// createdAt), so tapping the same sketch twice in a row always produces a
// different filename. Without that, Chrome recognizes the repeat filename
// as one it already has and intercepts the second tap with its own
// "Download this file again?" dialog -- a dialog this page has no way to
// observe, so our toast would fire and claim success even if that dialog
// then got cancelled. A never-repeating filename removes the dialog
// entirely rather than trying (and failing) to detect it.
export function sketchFilename(source) {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10);
  const idPart = source && source.id ? source.id.slice(0, 8) : "sketch";
  const uniqueSuffix = now.getTime().toString(36);
  return `notepad-sketch-${dateStamp}-${idPart}-${uniqueSuffix}.png`;
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
