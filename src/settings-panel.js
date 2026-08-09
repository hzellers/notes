import { getSettings, saveSettings, exportAllItems, importItems } from "./storage/db.js";
import {
  runBackup,
  getBackupStatus,
  getExpiryWarning,
  formatRelative,
  onBackupStateChange,
} from "./backup.js";

const fab = document.getElementById("settings-fab");
const panel = document.getElementById("settings-panel");
const patInput = document.getElementById("pat-input");
const togglePatBtn = document.getElementById("toggle-pat-btn");
const repoInput = document.getElementById("repo-input");
const expiryInput = document.getElementById("expiry-input");
const saveBtn = document.getElementById("save-settings-btn");
const backupNowBtn = document.getElementById("backup-now-btn");
const backupStatusDetail = document.getElementById("backup-status-detail");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importInput = document.getElementById("import-input");
const importStatus = document.getElementById("import-status");
const backupIndicator = document.getElementById("backup-indicator");
const tokenWarningBanner = document.getElementById("token-warning-banner");

let panelOpen = false;
let autoCloseTimer = null;

function openPanel() {
  panelOpen = true;
  panel.classList.add("show");
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
  // Re-read from storage every time the panel opens, rather than trusting
  // whatever's left in the DOM inputs from a previous session -- if a write
  // silently failed, this is what actually reveals it without needing a
  // full page reload.
  loadForm();
}

function closePanel() {
  panelOpen = false;
  panel.classList.remove("show");
}

fab.addEventListener("click", (evt) => {
  evt.stopPropagation();
  if (panelOpen) {
    closePanel();
  } else {
    openPanel();
  }
});

panel.addEventListener("click", (evt) => evt.stopPropagation());

document.addEventListener("click", (evt) => {
  if (panelOpen && !panel.contains(evt.target) && !fab.contains(evt.target)) {
    closePanel();
  }
});

function repositionForKeyboard() {
  if (!window.visualViewport) return;
  const keyboardOffset = Math.max(
    0,
    window.innerHeight - window.visualViewport.height
  );
  fab.style.bottom = `calc(6px + env(safe-area-inset-bottom) + ${keyboardOffset}px)`;
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", repositionForKeyboard);
}

togglePatBtn.addEventListener("click", () => {
  const showing = patInput.type === "text";
  patInput.type = showing ? "password" : "text";
  togglePatBtn.textContent = showing ? "Show" : "Hide";
});

async function loadForm() {
  const settings = await getSettings();
  patInput.value = settings.githubPat || "";
  repoInput.value = settings.dataRepo || "";
  expiryInput.value = settings.tokenExpiry || "";
}

saveBtn.addEventListener("click", async () => {
  const original = saveBtn.textContent;
  const intended = {
    githubPat: patInput.value.trim() || null,
    dataRepo: repoInput.value.trim() || null,
    tokenExpiry: expiryInput.value || null,
  };
  try {
    await saveSettings(intended);
    // Read back what's actually in storage rather than trusting that the
    // write call resolving means it landed -- only claim success if it
    // verifiably did.
    const verify = await getSettings();
    const persisted =
      verify.githubPat === intended.githubPat &&
      verify.dataRepo === intended.dataRepo &&
      verify.tokenExpiry === intended.tokenExpiry;
    if (!persisted) {
      throw new Error("wrote successfully but read-back didn't match");
    }
  } catch (err) {
    console.error("Settings save failed:", err);
    backupStatusDetail.textContent = `Couldn't save settings: ${err.message}`;
    return;
  }
  saveBtn.textContent = "Saved";
  if (autoCloseTimer) clearTimeout(autoCloseTimer);
  autoCloseTimer = setTimeout(() => {
    saveBtn.textContent = original;
    closePanel();
    autoCloseTimer = null;
  }, 900);
  await refreshIndicators();
});

backupNowBtn.addEventListener("click", async () => {
  backupNowBtn.disabled = true;
  backupStatusDetail.textContent = "Backing up…";
  try {
    await runBackup();
  } finally {
    backupNowBtn.disabled = false;
  }
});

exportBtn.addEventListener("click", async () => {
  const items = await exportAllItems();
  const snapshot = { exportedAt: new Date().toISOString(), items };
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const filename = `notepad-export-${new Date().toISOString().slice(0, 10)}.json`;

  const file = new File([blob], filename, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Notepad export" });
      return;
    } catch {
      // fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener("click", () => importInput.click());

importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(items)) throw new Error("Unrecognized file format");
    await importItems(items);
    importStatus.textContent = `Imported ${items.length} items.`;
    document.dispatchEvent(new CustomEvent("notepad:items-changed"));
  } catch (err) {
    importStatus.textContent = `Import failed: ${err.message}`;
  } finally {
    importInput.value = "";
  }
});

async function refreshIndicators() {
  const status = await getBackupStatus();
  backupIndicator.textContent = status.configured
    ? `Backed up ${formatRelative(status.lastBackupAt)}`
    : "Backup not set up";
  backupIndicator.classList.toggle("loud", status.loud);

  backupStatusDetail.textContent = status.lastBackupError
    ? `Last attempt failed: ${status.lastBackupError}`
    : status.lastBackupAt
      ? `Last backed up ${formatRelative(status.lastBackupAt)}`
      : "Never backed up.";

  const warning = await getExpiryWarning();
  if (warning) {
    tokenWarningBanner.hidden = false;
    tokenWarningBanner.textContent =
      warning.level === "expired"
        ? "GitHub token has expired — renew it in Settings to keep backups working."
        : `GitHub token expires in ${warning.diffDays} day${warning.diffDays === 1 ? "" : "s"} — renew it in Settings.`;
    tokenWarningBanner.classList.toggle("expired", warning.level === "expired");
  } else {
    tokenWarningBanner.hidden = true;
  }
}

onBackupStateChange(refreshIndicators);

loadForm();
refreshIndicators();
setInterval(refreshIndicators, 30000);
