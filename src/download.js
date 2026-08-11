export function sketchFilename(source) {
  const date = source && source.createdAt ? new Date(source.createdAt) : new Date();
  const stamp = date.toISOString().slice(0, 10);
  const idPart = source && source.id ? source.id.slice(0, 8) : "sketch";
  return `notepad-sketch-${stamp}-${idPart}.png`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
