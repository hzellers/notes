export function sketchFilename(source) {
  const date = source && source.createdAt ? new Date(source.createdAt) : new Date();
  const stamp = date.toISOString().slice(0, 10);
  const idPart = source && source.id ? source.id.slice(0, 8) : "sketch";
  return `notepad-sketch-${stamp}-${idPart}.png`;
}

// Mirrors the share-then-fallback pattern already used for JSON export in
// settings-panel.js: prefer the share sheet on mobile (lets you save
// straight to Photos), fall back to a plain download link everywhere else.
export async function shareOrDownloadBlob(blob, filename, mimeType) {
  const file = new File([blob], filename, { type: mimeType });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch {
    // share unsupported, unavailable, or cancelled -- fall through to download
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
