// pages/migrate.js
import { insertRows } from "../supabase/client.js";

const scanBtn = document.getElementById("scan-btn");
const migrateBtn = document.getElementById("migrate-btn");
const openSupabaseBtn = document.getElementById("open-supabase-btn");
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

function normalizeNote(url, note) {
  return {
    // NOTE: This schema assumes you will create a Supabase table.
    // Suggested table: notes
    // Columns: id (uuid default), url (text), domain (text), title (text), content (text), color (text), top (text), left (text), created_at (timestamptz default now())
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
    // For now we do anonymous migration. Later we can add user_id.
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

  migrateBtn.disabled = true;
  scanBtn.disabled = true;

  // Basic idempotency: store a migration log so we can avoid accidental double uploads later.
  // (In a future iteration we can hash notes and upsert.)
  const migrationId = `mig_${Date.now()}`;

  try {
    setStatus("Uploading to Supabase...\n\nThis may take a few seconds.");

    // Batch inserts to avoid request size limits.
    const batches = chunk(scanned.rows, 200);

    for (let i = 0; i < batches.length; i++) {
      setStatus(`Uploading batch ${i + 1}/${batches.length}...`);
      await insertRows("notes", batches[i]);
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

openSupabaseBtn.addEventListener("click", () => {
  window.open("https://supabase.com/dashboard/project/qrnnthitqgpiowixmlpd", "_blank");
});

// Auto-scan on load for convenience
scan().catch((e) => setStatus(`Scan failed:\n${String(e?.message || e)}`, "err"));
