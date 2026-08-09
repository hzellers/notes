import {
  getSettings,
  recordBackupSuccess,
  recordBackupFailure,
  exportAllItems,
} from "./storage/db.js";
import { pushSnapshot } from "./backup/github.js";

const DEBOUNCE_MS = 5000;
const STALE_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 14;

let debounceTimer = null;
let inFlight = null;
let rerunRequested = false;
const listeners = new Set();

export function onBackupStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

export function scheduleBackup() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBackup();
  }, DEBOUNCE_MS);
}

export async function runBackup() {
  // Two overlapping pushes race on the same file's sha (the GitHub API
  // rejects the second with a 409) -- a debounced auto-backup and a manual
  // "Back up now" click, or just a double-tap, can trigger this. Serialize:
  // if one's already in flight, don't start a second; queue one more run
  // for after it finishes instead, so nothing gets lost.
  if (inFlight) {
    rerunRequested = true;
    return inFlight;
  }
  inFlight = performBackup().finally(() => {
    inFlight = null;
    if (rerunRequested) {
      rerunRequested = false;
      runBackup();
    }
  });
  return inFlight;
}

async function performBackup() {
  const settings = await getSettings();
  if (!settings.githubPat || !settings.dataRepo) {
    return;
  }
  const items = await exportAllItems();
  const snapshot = { exportedAt: new Date().toISOString(), items };
  try {
    await pushSnapshot({
      pat: settings.githubPat,
      repo: settings.dataRepo,
      content: JSON.stringify(snapshot, null, 2),
      message: `Notepad backup ${new Date().toISOString()}`,
    });
    await recordBackupSuccess(Date.now());
  } catch (err) {
    await recordBackupFailure(err.message || String(err));
  }
  notify();
}

export async function getBackupStatus() {
  const settings = await getSettings();
  const now = Date.now();
  const configured = Boolean(settings.githubPat && settings.dataRepo);
  const failing = Boolean(settings.lastBackupError);
  const stale = !settings.lastBackupAt || now - settings.lastBackupAt > STALE_MS;
  return {
    configured,
    failing,
    stale,
    loud: configured && (failing || stale),
    lastBackupAt: settings.lastBackupAt,
    lastBackupError: settings.lastBackupError,
  };
}

export function formatRelative(timestamp) {
  if (!timestamp) return "never";
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function getExpiryWarning() {
  const settings = await getSettings();
  if (!settings.tokenExpiry) return null;
  const expiry = new Date(`${settings.tokenExpiry}T00:00:00`);
  const diffDays = Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return { level: "expired", diffDays };
  if (diffDays <= EXPIRY_WARNING_DAYS) return { level: "soon", diffDays };
  return null;
}
