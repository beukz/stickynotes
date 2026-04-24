import { insertRows, selectRows } from "../../supabase/client.js";
import { getSession } from "../../supabase/auth.js";

export function template() {
    return `
        <div class="account-content" style="padding-top: 60px;">
            <div class="migrate-container">
                <div class="icon-box">
                    <i class="fi fi-rr-cloud-upload"></i>
                </div>
                <h1>Migration Tool</h1>
                <p>Sync your local notes (from chrome.storage.sync) to the cloud database.</p>
                
                <div id="status" class="status-box">Ready to scan...</div>
                
                <div class="actions">
                    <button id="scan-btn" class="secondary-btn">Scan Local Storage</button>
                    <button id="migrate-btn" class="primary-btn" disabled>Migrate to Database</button>
                </div>

                <div class="footer-link" style="margin-top: 32px;">
                    <a href="#account" style="color: var(--text-secondary); text-decoration: none; font-size: 0.8125rem;">
                        <i class="fi fi-rr-arrow-left"></i> Back to Account
                    </a>
                </div>
            </div>

            <!-- Cleanup Modal -->
            <div id="cleanup-modal" class="modal-overlay">
                <div class="modal-content-cleanup">
                    <div class="modal-header-simple">
                        <i class="fi fi-rr-trash"></i>
                        <h3>Cleanup Local Notes?</h3>
                        <p>Migration successful! Would you like to remove the local copies now that they are in the cloud?</p>
                    </div>
                    <div class="modal-actions-horizontal">
                        <button id="cancel-cleanup-btn" class="modal-btn-cancel">Keep Local</button>
                        <button id="confirm-cleanup-btn" class="modal-btn-delete">Delete Local</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export async function mount(container) {
    const scanBtn = container.querySelector("#scan-btn");
    const migrateBtn = container.querySelector("#migrate-btn");
    const statusEl = container.querySelector("#status");
    const cleanupModal = container.querySelector("#cleanup-modal");
    const confirmCleanupBtn = container.querySelector("#confirm-cleanup-btn");
    const cancelCleanupBtn = container.querySelector("#cancel-cleanup-btn");

    let scanned = null;

    function setStatus(text, kind = "") {
        if (!statusEl) return;
        statusEl.className = `status-box ${kind}`.trim();
        statusEl.textContent = text;
    }

    function isNotesKey(key) {
        if (!key) return false;
        if (key === "collapsed_domains" || key === "supabase_session" || key === "dashboard_notes") return false;
        return true;
    }

    function getNoteSignature(note) {
        return `${note.url}|${note.title}|${note.content}|${note.top}|${note.left}`;
    }

    function normalizeNote(url, note, userId = null) {
        return {
            url,
            domain: (() => {
                try {
                    const u = new URL(url);
                    return u.hostname;
                } catch { return null; }
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
        return new Promise((resolve) => {
            chrome.storage.sync.get(null, (data) => resolve(data || {}));
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
        setStatus(`Found ${noteCount} notes. Ready to migrate.`, "ok");
    }

    async function migrate() {
        if (!scanned || !scanned.rows?.length) return;
        
        const session = await getSession();
        if (!session?.user) {
            setStatus("Please sign in with Google first.", "warn");
            return;
        }

        const userId = session.user.id;
        scanned.rows = scanned.rows.map(row => ({ ...row, user_id: userId }));

        migrateBtn.disabled = true;
        scanBtn.disabled = true;

        try {
            setStatus("Checking for duplicates...");
            const existingNotes = await selectRows("sticky_notes", `user_id=eq.${userId}`, session.access_token);
            const existingSignatures = new Set(existingNotes.map(getNoteSignature));

            const notesToMigrate = scanned.rows.filter(row => !existingSignatures.has(getNoteSignature(row)));
            const skippedCount = scanned.rows.length - notesToMigrate.length;

            if (notesToMigrate.length === 0) {
                setStatus(`All notes already exist in database.`, "ok");
                return;
            }

            setStatus(`Uploading ${notesToMigrate.length} notes...`);
            const batches = chunk(notesToMigrate, 50);
            for (let i = 0; i < batches.length; i++) {
                await insertRows("sticky_notes", batches[i], session.access_token);
            }

            setStatus(`Migration complete! Uploaded: ${notesToMigrate.length}.`, "ok");
            cleanupModal.classList.add("active");
        } catch (e) {
            console.error(e);
            setStatus(`Migration failed: ${e.message}`, "err");
        } finally {
            scanBtn.disabled = false;
            migrateBtn.disabled = false;
        }
    }

    scanBtn.onclick = scan;
    migrateBtn.onclick = migrate;
    cancelCleanupBtn.onclick = () => cleanupModal.classList.remove("active");
    confirmCleanupBtn.onclick = async () => {
        if (!scanned?.urls) return;
        setStatus("Cleaning up...");
        chrome.storage.sync.remove(scanned.urls, () => {
            cleanupModal.classList.remove("active");
            setStatus("Cleanup complete. Notes are only in cloud.", "ok");
        });
    };

    // Auto-scan
    scan();

    return () => {};
}
