function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

// Blobs (ink sketches) don't survive JSON.stringify() -- it silently
// collapses them to {}. Convert to a data URL string for any JSON output
// (export file, GitHub backup snapshot).
export async function itemsToSnapshot(items) {
  const serializedItems = await Promise.all(
    items.map(async (item) => ({
      ...item,
      ink: item.ink instanceof Blob ? await blobToDataUrl(item.ink) : null,
    }))
  );
  return { exportedAt: new Date().toISOString(), items: serializedItems };
}

// Reverse of itemsToSnapshot's ink conversion, for importing a JSON file
// back into IndexedDB (which expects real Blobs).
export async function snapshotItemsToStorable(items) {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      ink:
        typeof item.ink === "string" && item.ink.startsWith("data:")
          ? await dataUrlToBlob(item.ink)
          : null,
    }))
  );
}
