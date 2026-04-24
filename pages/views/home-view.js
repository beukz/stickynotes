export function template() {
    return `
        <div class="home-page">
            <header class="home-greeting">
                <h1 id="greeting-title">Good Morning</h1>
                <p id="greeting-date">Loading date...</p>
            </header>
            
            <section class="home-section">
                <div class="home-section-label">
                    <i class="fi fi-rr-apps"></i>
                    <span>Quick Actions</span>
                </div>
                <div class="home-actions">
                    <a href="#notes" class="home-action-card">
                        <div class="home-action-icon notes">
                            <i class="fi fi-rr-edit"></i>
                        </div>
                        <span class="home-action-label">Write Note</span>
                    </a>
                    <a href="#notifications" class="home-action-card">
                        <div class="home-action-icon notifs">
                            <i class="fi fi-rr-bell"></i>
                        </div>
                        <span class="home-action-label">Updates</span>
                    </a>
                    <a href="#account" class="home-action-card">
                        <div class="home-action-icon account">
                            <i class="fi fi-rr-settings"></i>
                        </div>
                        <span class="home-action-label">Account</span>
                    </a>
                </div>
            </section>

            <section class="home-section">
                <div class="home-section-header">
                    <div class="home-section-label">
                        <i class="fi fi-rr-time-past"></i>
                        <span>Recent Notes</span>
                    </div>
                    <a href="#notes" class="view-all-link">View all</a>
                </div>
                
                <div id="loading-state" class="home-empty hidden">
                    <i class="fi fi-rr-spinner spin" style="font-size: 1.5rem; color: #9ca3af;"></i>
                    <p>Loading your notes...</p>
                </div>

                <div id="error-state" class="home-empty hidden" style="color: #ef4444; border-color: #fecaca;">
                    <i class="fi fi-rr-triangle-warning" style="font-size: 1.5rem;"></i>
                    <p id="error-msg">Failed to load notes.</p>
                </div>

                <div id="empty-state" class="home-empty hidden">
                    <div class="home-empty-icon">
                        <i class="fi fi-rr-document"></i>
                    </div>
                    <h3>No notes yet</h3>
                    <p>Your personal space for thoughts, ideas, and plans. Create your first note to get started!</p>
                </div>

                <div id="recent-notes-list" class="home-note-list">
                    <!-- Loaded dynamically -->
                </div>
            </section>
        </div>
    `;
}

export async function mount(container) {
    const greetingTitle = container.querySelector("#greeting-title");
    const greetingDate = container.querySelector("#greeting-date");
    const recentNotesList = container.querySelector("#recent-notes-list");
    const loadingState = container.querySelector("#loading-state");
    const errorState = container.querySelector("#error-state");
    const emptyState = container.querySelector("#empty-state");
    const errorMsg = container.querySelector("#error-msg");

    // Greeting
    const hour = new Date().getHours();
    let greeting = "Good Evening";
    if (hour < 12) greeting = "Good Morning";
    else if (hour < 18) greeting = "Good Afternoon";
    
    if (greetingTitle) greetingTitle.textContent = greeting;
    if (greetingDate) {
        greetingDate.textContent = new Date().toLocaleDateString('en-US', { 
            weekday: 'long', month: 'long', day: 'numeric' 
        });
    }

    // Load Notes
    async function loadNotes() {
        loadingState.classList.remove("hidden");
        errorState.classList.add("hidden");
        emptyState.classList.add("hidden");
        recentNotesList.innerHTML = "";

        chrome.storage.local.get("supabase_session", (data) => {
            const user = data.supabase_session?.user;
            
            if (user) {
                chrome.runtime.sendMessage({
                    action: "supabaseAction",
                    method: "GET",
                    table: "sticky_notes",
                    query: "select=*"
                }, (response) => {
                    loadingState.classList.add("hidden");
                    if (response?.success) {
                        const notes = (response.data || []).map(n => ({
                            id: n.id,
                            title: n.title,
                            content: n.content,
                            created_at: new Date(n.created_at).getTime(),
                            url: n.url
                        }));
                        renderNotes(notes);
                    } else {
                        errorMsg.textContent = response?.error || "Failed to load notes";
                        errorState.classList.remove("hidden");
                    }
                });
            } else {
                chrome.storage.local.get("dashboard_notes", (localData) => {
                    loadingState.classList.add("hidden");
                    renderNotes(localData.dashboard_notes || []);
                });
            }
        });
    }

    function renderNotes(notes) {
        if (!notes || notes.length === 0) {
            emptyState.classList.remove("hidden");
            return;
        }

        const sorted = notes.sort((a, b) => b.created_at - a.created_at).slice(0, 5);
        
        const colors = [
            { bg: '#fef3c7', color: '#d97706' }, // amber
            { bg: '#e0e7ff', color: '#4f46e5' }, // indigo
            { bg: '#dcfce7', color: '#16a34a' }, // green
            { bg: '#fee2e2', color: '#dc2626' }, // red
            { bg: '#f3e8ff', color: '#9333ea' }  // purple
        ];

        sorted.forEach((note, idx) => {
            const color = colors[idx % colors.length];
            const div = document.createElement("a");
            div.href = `#notes`; 
            div.className = "home-note-item";
            
            const dateStr = new Date(note.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric'
            });

            const rawText = (note.content || "").replace(/<[^>]*>?/gm, '');
            const preview = rawText.substring(0, 60) + (rawText.length > 60 ? "..." : "");

            div.innerHTML = `
                <div class="home-note-icon" style="background: ${color.bg}; color: ${color.color};">
                    <i class="fi fi-rr-document"></i>
                </div>
                <div class="home-note-body">
                    <div class="home-note-title">${note.title || "Untitled Note"}</div>
                    <div class="home-note-preview">${preview || "No content"}</div>
                </div>
                <div class="home-note-meta">
                    ${dateStr}
                </div>
            `;
            
            div.addEventListener('click', () => {
                localStorage.setItem("activeNoteId", note.id);
            });

            recentNotesList.appendChild(div);
        });
    }

    loadNotes();
    return () => {};
}
