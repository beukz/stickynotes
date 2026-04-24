import { selectRows } from "../supabase/client.js";
import { getSession } from "../supabase/auth.js";
import { initSidebar } from "./sidebar.js";

document.addEventListener("DOMContentLoaded", async () => {
    await initSidebar();

    const homeContent = document.getElementById("home-content");
    let allNotes = [];

    // ── Determine greeting ──
    function getGreeting() {
        const h = new Date().getHours();
        if (h < 12) return "Good morning";
        if (h < 18) return "Good afternoon";
        return "Good evening";
    }

    // ── Load Notes ──
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

        const flatLocalNotes = [];
        for (const [url, notes] of Object.entries(localData)) {
            if (Array.isArray(notes)) {
                notes.forEach(note => flatLocalNotes.push({ ...note, url, source: 'local' }));
            }
        }

        allNotes = [...flatLocalNotes, ...cloudNotes];
        allNotes.reverse();
        renderHome();
    }

    // ── Render ──
    function renderHome() {
        const greeting = getGreeting();
        const recentNotes = allNotes.slice(0, 5);

        const noteColors = ['#fef3c7', '#eef2ff', '#f0fdf4', '#fce7f3', '#e0e7ff'];
        const noteTextColors = ['#d97706', '#4f46e5', '#16a34a', '#db2777', '#4338ca'];

        let recentHtml;
        if (recentNotes.length === 0) {
            recentHtml = `
                <div class="home-empty">
                    <div class="home-empty-icon"><i class="fi fi-rr-note"></i></div>
                    <h3>No notes yet</h3>
                    <p>Create your first note from any webpage using the extension popup.</p>
                </div>
            `;
        } else {
            const items = recentNotes.map((note, i) => {
                const tmp = document.createElement('div');
                tmp.innerHTML = note.content || '';
                let preview = tmp.textContent || '';
                preview = preview.length > 60 ? preview.substring(0, 60) + '…' : preview;
                if (!preview) preview = 'Empty note';

                const bg = noteColors[i % noteColors.length];
                const fg = noteTextColors[i % noteTextColors.length];

                return `
                    <div class="home-note-item" onclick="window.location.href='notes.html'">
                        <div class="home-note-icon" style="background:${bg}; color:${fg};">
                            <i class="fi fi-rr-document"></i>
                        </div>
                        <div class="home-note-body">
                            <div class="home-note-title">${note.title || 'Untitled Note'}</div>
                            <div class="home-note-preview">${preview}</div>
                        </div>
                        <span class="home-note-meta">${note.source === 'cloud' ? '☁️' : '💾'}</span>
                    </div>
                `;
            }).join('');

            recentHtml = `<div class="home-note-list">${items}</div>`;
        }

        homeContent.innerHTML = `
            <div class="home-greeting">
                <h1>${greeting}</h1>
                <p>Here's what's happening with your notes.</p>
            </div>

            <section class="home-section">
                <div class="home-section-label">
                    <i class="fi fi-rr-time-past"></i>
                    <span>Recently added</span>
                </div>
                ${recentHtml}
            </section>

            <section class="home-section">
                <div class="home-section-label">
                    <i class="fi fi-rr-apps"></i>
                    <span>Quick actions</span>
                </div>
                <div class="home-actions">
                    <a href="notes.html" class="home-action-card">
                        <div class="home-action-icon notes"><i class="fi fi-rr-document"></i></div>
                        <span class="home-action-label">My Notes</span>
                    </a>
                    <a href="notification.html" class="home-action-card">
                        <div class="home-action-icon notifs"><i class="fi fi-rr-bell"></i></div>
                        <span class="home-action-label">Notifications</span>
                    </a>
                    <a href="account.html" class="home-action-card">
                        <div class="home-action-icon account"><i class="fi fi-rr-user"></i></div>
                        <span class="home-action-label">Account</span>
                    </a>
                </div>
            </section>
        `;
    }

    loadAllNotes();
});
