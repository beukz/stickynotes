// pages/migrate.js
import { insertRows } from "../supabase/client.js";
import { getSession } from "../supabase/auth.js";

const scanBtn = document.getElementById("scan-btn");
const migrateBtn = document.getElementById("migrate-btn");
const statusEl = document.getElementById("status");

let scanned = null;

function setStatus(text, kind = "") {
  statusEl.className = `status ${kind}`.trim();
  statusEl.textContent = text;
}

function isNotesKey(key) {
  // Keys in storage are URLs. We also store some state keys.
  if (!key) return false;
  if (key === "collapsed_domains") return false;
  return true;
}

function normalizeNote(url, note, userId = null) {
  return {
    url,
    domain: (() => {
      try {
        const u = new URL(url);
        return u.hostname;
      } catch {
        return null;
      }
    })(),
    title: note.title || "Note",
    content: note.content || "",
    color: note.color || "#ffd165",
    top: note.top || null,
    left: note.left || null,
    user_id: userId,
    migrated_from: "chrome.storage.sync",
    migrated_at: new Date().toISOString()
  };
}

async function getAllFromStorage() {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.sync) {
      reject(new Error("chrome.storage.sync is not available. Open this page from the installed extension."));
      return;
    }

    chrome.storage.sync.get(null, (data) => {
      if (chrome.runtime?.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(data || {});
    });
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function scan() {
  setStatus("Scanning local notes...");
  const data = await getAllFromStorage();

  const urls = Object.keys(data).filter(isNotesKey);
  let noteCount = 0;
  const rows = [];

  for (const url of urls) {
    const notes = Array.isArray(data[url]) ? data[url] : [];
    for (const n of notes) {
      noteCount++;
      rows.push(normalizeNote(url, n));
    }
  }

  scanned = { urls, noteCount, rows };

  if (noteCount === 0) {
    migrateBtn.disabled = true;
    setStatus("No notes found in chrome.storage.sync.", "warn");
    return;
  }

  migrateBtn.disabled = false;
  setStatus(`Found ${noteCount} notes across ${urls.length} URL keys. Ready to migrate.`);
}

async function migrate() {
  if (!scanned || !scanned.rows?.length) {
    setStatus("Nothing to migrate. Please scan first.", "warn");
    return;
  }

  const session = await getSession();
  if (!session?.user) {
    setStatus("Please sign in with Google first to sync your notes to the database.", "warn");
    return;
  }

  const userId = session.user.id;
  // Re-normalize with userId
  scanned.rows = scanned.rows.map(row => ({ ...row, user_id: userId }));

  migrateBtn.disabled = true;
  scanBtn.disabled = true;

  // Basic idempotency: store a migration log so we can avoid accidental double uploads later.
  // (In a future iteration we can hash notes and upsert.)
  const migrationId = `mig_${Date.now()}`;

  try {
    setStatus("Syncing with Cloud...\n\nJust a moment.");

    // Batch inserts to avoid request size limits.
    const batches = chunk(scanned.rows, 200);

    for (let i = 0; i < batches.length; i++) {
      setStatus(`Uploading batch ${i + 1}/${batches.length}...`);
      await insertRows("sticky_notes", batches[i], session.access_token);
    }

    // Save migration log locally
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set(
        {
          migration_log: {
            lastMigrationId: migrationId,
            migratedAt: new Date().toISOString(),
            noteCount: scanned.noteCount,
            urlCount: scanned.urls.length
          }
        },
        () => {
          if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
          else resolve();
        }
      );
    });

    setStatus(
      `Migration complete.\n\nUploaded: ${scanned.noteCount} notes\nMigration ID: ${migrationId}\n\nLocal notes were NOT deleted.`,
      "ok"
    );

    // Show cleanup offer after a brief delay
    setTimeout(() => {
        showCleanupModal();
    }, 1500);
  } catch (e) {
    console.error(e);
    setStatus(`Migration failed:\n${String(e?.message || e)}`, "err");
  } finally {
    scanBtn.disabled = false;
    migrateBtn.disabled = false;
  }
}

scanBtn.addEventListener("click", () => {
  scan().catch((e) => setStatus(`Scan failed:\n${String(e?.message || e)}`, "err"));
});

migrateBtn.addEventListener("click", () => {
  migrate().catch((e) => setStatus(`Migration failed:\n${String(e?.message || e)}`, "err"));
});


// --- Cleanup Modal Logic ---
const cleanupModal = document.getElementById('cleanup-modal');
const confirmCleanupBtn = document.getElementById('confirm-cleanup-btn');
const cancelCleanupBtn = document.getElementById('cancel-cleanup-btn');

function showCleanupModal() {
    cleanupModal.classList.add('active');
}

function hideCleanupModal() {
    cleanupModal.classList.remove('active');
}

async function clearLocalStorage() {
    if (!scanned || !scanned.urls) return;
    
    setStatus("Cleaning up local storage...");
    
    try {
        await new Promise((resolve, reject) => {
            chrome.storage.sync.remove(scanned.urls, () => {
                if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
                else resolve();
            });
        });
        
        setStatus("Local storage cleaned up successfully. Your notes are now only in the database.", "ok");
        hideCleanupModal();
    } catch (e) {
        console.error(e);
        setStatus(`Cleanup failed:\n${String(e?.message || e)}`, "err");
        hideCleanupModal();
    }
}

confirmCleanupBtn.addEventListener('click', clearLocalStorage);
cancelCleanupBtn.addEventListener('click', hideCleanupModal);

// Auto-scan on load for convenience
scan().catch((e) => setStatus(`Scan failed:\n${String(e?.message || e)}`, "err"));
