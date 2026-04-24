import { selectRows } from "../supabase/client.js";
import { getSession } from "../supabase/auth.js";
import { initSidebar } from "./sidebar.js";

document.addEventListener("DOMContentLoaded", async () => {
    await initSidebar();

    const homeContent = document.getElementById("home-content");
    let allNotes = [];

    async function loadAllNotes() {
        let localData = {};
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
            const data = await new Promise(resolve => chrome.storage.sync.get(null, resolve));
            localData = { ...data };
            delete localData.collapsed_domains;
        }

        let cloudNotes = [];
        try {
            const session = await getSession();
            if (session?.user) {
                cloudNotes = await selectRows("sticky_notes", `user_id=eq.${session.user.id}`, session.access_token);
                cloudNotes = cloudNotes.map(n => ({ ...n, source: 'cloud' }));
            }
        } catch (error) {
            console.error("Error loading cloud notes:", error);
        }

        // Flatten local notes
        const flatLocalNotes = [];
        for (const [url, notes] of Object.entries(localData)) {
            if (Array.isArray(notes)) {
                notes.forEach(note => flatLocalNotes.push({ ...note, url, source: 'local' }));
            }
        }

        allNotes = [...flatLocalNotes, ...cloudNotes];
        
        // Sort by created_at or assume newest at the end of cloud/local arrays
        // Since local notes don't have created_at usually, we might rely on ID or just reverse order
        // For now, let's reverse the array assuming newer notes were added later.
        allNotes.reverse();

        renderHomeContent();
    }

    function renderHomeContent() {
        const sessionName = "there"; // We can fetch name from session if needed
        const recentNotes = allNotes.slice(0, 5);

        let recentCardsHtml = '';
        if (recentNotes.length === 0) {
            recentCardsHtml = `<p class="empty-state-text">No notes yet. Create one from any webpage!</p>`;
        } else {
            recentCardsHtml = recentNotes.map(note => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = note.content;
                const textPreview = tempDiv.textContent || 'Empty note...';
                
                return `
                    <div class="home-card recent-card">
                        <div class="card-icon-box" style="background-color: ${note.color || '#fef3c7'}; border: 1px solid rgba(0,0,0,0.05);">
                            <i class="fi fi-rr-document" style="color: #d97706;"></i>
                        </div>
                        <div class="card-info">
                            <span class="card-title">${note.title || 'Untitled Note'}</span>
                            <div class="card-meta">
                                <span class="meta-preview" style="color: var(--text-secondary); font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; display: inline-block;">
                                    ${textPreview}
                                </span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        homeContent.innerHTML = `
            <div class="home-container" style="padding: 40px; max-width: 800px; margin: 0 auto;">
                <h1 class="home-title" style="font-size: 2rem; font-weight: 600; margin-bottom: 32px; letter-spacing: -0.02em;">Good afternoon</h1>
                
                <section class="home-section">
                    <div class="home-section-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; color: var(--text-secondary); font-weight: 500;">
                        <i class="fi fi-rr-time-past"></i>
                        <span>Recently added notes</span>
                    </div>
                    <div class="home-cards-column" style="display: flex; flex-direction: column; gap: 12px;">
                        ${recentCardsHtml}
                    </div>
                </section>
            </div>
        `;
    }

    loadAllNotes();
});
