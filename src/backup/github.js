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
  // Without this, the browser can serve a cached copy of this GET instead
  // of hitting the network -- meaning every retry attempt (and every
  // subsequent manual backup) could keep reading the sha from *before* the
  // last successful push, guaranteeing a 409 on every single one.
  const res = await fetch(`${API_BASE}/repos/${repo}/contents/${SNAPSHOT_PATH}`, {
    headers: headers(pat),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Could not check existing snapshot: ${res.status}`);
  }
  const data = await res.json();
  return data.sha;
}

const MAX_ATTEMPTS = 3;

export async function pushSnapshot({ pat, repo, content, message }) {
  if (!pat || !repo) {
    throw new Error("Missing GitHub token or data repo");
  }
  // A 409 means the sha we read is stale -- something else (another tab,
  // another browser, another device) wrote to snapshot.json in between our
  // GET and our PUT. This can't be prevented in-process (an in-memory lock
  // can't span two browsers, let alone two devices), so instead re-read the
  // current sha and retry, exactly as GitHub's API is designed to be used.
  let lastResponseText = "";
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
    if (res.ok) {
      return res.json();
    }
    lastStatus = res.status;
    lastResponseText = await res.text().catch(() => "");
    if (res.status !== 409) {
      break;
    }
  }
  throw new Error(`Backup push failed (${lastStatus}): ${lastResponseText || "unknown error"}`);
}
