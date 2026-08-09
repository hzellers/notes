const API_BASE = "https://api.github.com";
const SNAPSHOT_PATH = "snapshot.json";

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function headers(pat) {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function getFileSha(pat, repo) {
  const res = await fetch(`${API_BASE}/repos/${repo}/contents/${SNAPSHOT_PATH}`, {
    headers: headers(pat),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Could not check existing snapshot: ${res.status}`);
  }
  const data = await res.json();
  return data.sha;
}

export async function pushSnapshot({ pat, repo, content, message }) {
  if (!pat || !repo) {
    throw new Error("Missing GitHub token or data repo");
  }
  const sha = await getFileSha(pat, repo);
  const res = await fetch(`${API_BASE}/repos/${repo}/contents/${SNAPSHOT_PATH}`, {
    method: "PUT",
    headers: headers(pat),
    body: JSON.stringify({
      message: message || "Notepad backup",
      content: toBase64(content),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backup push failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}
