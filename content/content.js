(function () {
    let lastUrl = location.href;
    let noteCheckDebounce = null;
    let notesExistInStorage = false;
    let listenersAdded = false; // Flag to ensure event listeners are added only once
    let saveTimeout = null; // Timer for debouncing save operations
    let currentUser = null;
    let contextInvalidated = false;
    let shadowRoot = null;
    let shadowHost = null;

    /**
     * Checks if the extension context is still valid.
     * If not, it sets a flag and returns false.
     */
    function isExtensionValid() {
        if (contextInvalidated) return false;
        try {
            if (!chrome?.runtime?.id) {
                if (!contextInvalidated) {
                    console.log("[Sticky Notes] Extension updated or reloaded. Please refresh the page to keep using sticky notes.");
                }
                contextInvalidated = true;
                return false;
            }
            return true;
        } catch (e) {
            contextInvalidated = true;
            return false;
        }
    }

    async function checkAuth() {
        if (!isExtensionValid()) return null;
        return new Promise((resolve) => {
            chrome.storage.local.get("supabase_session", (data) => {
                if (!isExtensionValid()) {
                    resolve(null);
                    return;
                }
                currentUser = data.supabase_session?.user || null;
                resolve(currentUser);
            });
        });
    }

    function init() {
        try {
            setupShadowDOM().then(() => {
                setupKeyboardShortcuts();
                loadNotes();
                observePageChanges(); // Watch for URL and DOM changes
            });
        } catch (error) {
            console.error("Error during Sticky Notes initialization:", error);
        }
    }

    async function setupShadowDOM() {
        if (shadowRoot || !isExtensionValid()) return;

        shadowHost = document.createElement("div");
        shadowHost.id = "ap-sticky-notes-container";
        shadowHost.style.position = "absolute";
        shadowHost.style.top = "0";
        shadowHost.style.left = "0";
        shadowHost.style.width = "100%";
        shadowHost.style.height = "0";
        shadowHost.style.overflow = "visible";
        shadowHost.style.zIndex = "2147483647";
        shadowHost.style.pointerEvents = "none";
        document.body.appendChild(shadowHost);

        shadowRoot = shadowHost.attachShadow({ mode: "open" });

        // Inject the styles
        try {
            const cssUrl = chrome.runtime.getURL("content/content.css");
            const response = await fetch(cssUrl);
            const cssText = await response.text();

            const style = document.createElement("style");
            style.textContent = cssText.replace(/:root/g, ":host");
            shadowRoot.appendChild(style);

            const interactionStyle = document.createElement("style");
            interactionStyle.textContent = ".sticky-note { pointer-events: auto; }";
            shadowRoot.appendChild(interactionStyle);
        } catch (e) {
            console.error("Failed to load sticky notes styles:", e);
        }
    }

    function setupKeyboardShortcuts() {
        if (!isExtensionValid()) return;
        try {
            if (!listenersAdded) {
                document.addEventListener("keydown", (e) => {
                    if (!isExtensionValid()) return;
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "q") {
                        createStickyNote("", null, null, false, "Note", "#ffd165", true);
                        e.preventDefault();
                    }
                });
                listenersAdded = true;
            }
        } catch (error) {
            if (isExtensionValid()) {
                console.error("Error setting up keyboard shortcuts:", error);
            }
        }
    }

    function getEffectiveUrl() {
        const url = new URL(window.location.href);
        return url.origin + url.pathname;
    }

    async function loadNotes() {
        if (!isExtensionValid()) return;
        try {
            const urlKey = getEffectiveUrl();
            const user = await checkAuth();
            
            if (user) {
                if (!isExtensionValid()) return;
                chrome.runtime.sendMessage({
                    action: "supabaseAction",
                    method: "GET",
                    table: "sticky_notes",
                    query: `url=eq.${encodeURIComponent(urlKey)}`
                }, (response) => {
                    if (!isExtensionValid()) return;
                    if (response?.success) {
                        const notes = response.data || [];
                        notesExistInStorage = notes.length > 0;
                        removeAllStickyNotes();
                        notes.forEach((note) =>
                            createStickyNote(note.content, note.top, note.left, note.collapsed, note.title, note.color, false, note.id)
                        );
                    } else {
                        console.error("Supabase load failed:", response?.error);
                        loadLocalNotes(urlKey);
                    }
                });
            } else {
                loadLocalNotes(urlKey);
            }
        } catch (error) {
            if (isExtensionValid()) {
                console.error("Error in loadNotes:", error);
            }
        }
    }

    function loadLocalNotes(urlKey) {
        if (!isExtensionValid() || !chrome?.storage?.sync) return;
        try {
            chrome.storage.sync.get(urlKey, (data) => {
                if (!isExtensionValid()) return;
                if (chrome.runtime.lastError) {
                    console.error("Error loading notes from chrome.storage:", chrome.runtime.lastError);
                    return;
                }

                const notes = data[urlKey] || [];
                notesExistInStorage = notes.length > 0;

                removeAllStickyNotes();
                notes.forEach((note) =>
                    createStickyNote(note.content, note.top, note.left, note.collapsed, note.title, note.color)
                );
            });
        } catch (e) {
            console.error("Critical error accessing chrome.storage.sync:", e);
        }
    }

    function removeAllStickyNotes() {
        if (!shadowRoot) return;
        const existingNotes = shadowRoot.querySelectorAll(".sticky-note");
        existingNotes.forEach((note) => note.remove());
    }

    async function saveNotes() {
        if (!isExtensionValid() || !shadowRoot) return;
        try {
            const urlKey = getEffectiveUrl();
            const noteElements = Array.from(shadowRoot.querySelectorAll(".sticky-note"));
            
            if (currentUser) {
                for (const noteEl of noteElements) {
                    if (!isExtensionValid()) break;
                    
                    const noteData = {
                        id: noteEl.dataset.id || undefined,
                        url: urlKey,
                        content: noteEl.querySelector(".sticky-content").innerHTML,
                        top: noteEl.style.top,
                        left: noteEl.style.left,
                        collapsed: noteEl.classList.contains("collapsed"),
                        title: noteEl.querySelector(".note-title-input").value,
                        color: noteEl.dataset.color || '#ffd165'
                    };

                    const method = noteData.id ? "PATCH" : "POST";
                    const query = noteData.id ? `id=eq.${noteData.id}` : "";

                    chrome.runtime.sendMessage({
                        action: "supabaseAction",
                        method,
                        table: "sticky_notes",
                        query,
                        body: noteData
                    }, (response) => {
                        if (!isExtensionValid()) return;
                        if (response?.success && method === "POST") {
                            const newId = response.data?.[0]?.id;
                            if (newId && noteEl) {
                                noteEl.dataset.id = newId;
                            }
                        }
                    });
                }
            } else {
                if (!chrome?.storage?.sync) return;
                const localData = noteElements.map(note => ({
                    content: note.querySelector(".sticky-content").innerHTML,
                    top: note.style.top,
                    left: note.style.left,
                    collapsed: note.classList.contains("collapsed"),
                    title: note.querySelector(".note-title-input").value,
                    color: note.dataset.color || '#ffd165'
                }));

                chrome.storage.sync.set({ [urlKey]: localData }, () => {
                    if (!isExtensionValid()) return;
                    if (chrome.runtime.lastError) {
                        console.error("Error saving to chrome.storage:", chrome.runtime.lastError.message);
                    }
                });
            }
        } catch (error) {
            if (isExtensionValid()) {
                console.error("Error in saveNotes:", error);
            }
        }
    }

    function createStickyNote(content, top, left, collapsed = false, title = "Note", color = "#ffd165", isNew = false, id = null) {
        if (!shadowRoot) return;

        const note = document.createElement("div");
        note.className = "sticky-note" + (collapsed ? " collapsed" : "");
        if (id) note.dataset.id = id;
        note.dataset.color = color;

        // Default position if null (for new notes)
        if (isNew && !top && !left) {
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;
            top = (scrollY + 50) + "px";
            left = (scrollX + 50) + "px";
        }

        note.style.top = top || "50px";
        note.style.left = left || "50px";

        note.innerHTML = `
            <div class="note-header" style="background-color: ${color}">
                <div class="note-title-display">${title}</div>
                <input type="text" class="note-title-input" value="${title}" style="display: none;">
                <div class="sticky-close-menu-box">
                    <button class="ap-sticky-options palette-btn" title="Change Color">
                        <img src="${chrome.runtime.getURL('assets/palette.svg')}" alt="Color">
                    </button>
                    <button class="ap-sticky-options collapse-btn" title="${collapsed ? 'Expand' : 'Collapse'}">
                        <img src="${chrome.runtime.getURL(collapsed ? 'assets/maximize.svg' : 'assets/minus.svg')}" alt="Toggle">
                    </button>
                    <button class="ap-sticky-options delete-btn" title="Delete Note">
                        <img src="${chrome.runtime.getURL('assets/bin-icon.svg')}" alt="Delete">
                    </button>
                </div>
            </div>
            <div class="sticky-content" contenteditable="true">${content}</div>
            <div class="sticky-note-toolbar">
                <button class="toolbar-btn bold-btn" title="Bold">
                    <img src="${chrome.runtime.getURL('assets/bold.svg')}" alt="B">
                </button>
                <button class="toolbar-btn italic-btn" title="Italic">
                    <img src="${chrome.runtime.getURL('assets/italic.svg')}" alt="I">
                </button>
                <button class="toolbar-btn underline-btn" title="Underline">
                    <img src="${chrome.runtime.getURL('assets/underline.svg')}" alt="U">
                </button>
                <button class="toolbar-btn strike-btn" title="Strikethrough">
                    <img src="${chrome.runtime.getURL('assets/strikethrough.svg')}" alt="S">
                </button>
            </div>
            <div class="color-palette">
                <div class="color-swatch" style="background-color: #ffd165" data-color="#ffd165"></div>
                <div class="color-swatch" style="background-color: #ff9b9b" data-color="#ff9b9b"></div>
                <div class="color-swatch" style="background-color: #9bf4ff" data-color="#9bf4ff"></div>
                <div class="color-swatch" style="background-color: #b4ff9b" data-color="#b4ff9b"></div>
                <div class="color-swatch" style="background-color: #d19bff" data-color="#d19bff"></div>
            </div>
        `;

        shadowRoot.appendChild(note);

        const header = note.querySelector(".note-header");
        const contentArea = note.querySelector(".sticky-content");
        const deleteBtn = note.querySelector(".delete-btn");
        const collapseBtn = note.querySelector(".collapse-btn");
        const paletteBtn = note.querySelector(".palette-btn");
        const colorPalette = note.querySelector(".color-palette");
        const titleDisplay = note.querySelector(".note-title-display");
        const titleInput = note.querySelector(".note-title-input");

        // Dragging
        header.addEventListener("mousedown", (e) => {
            if (e.target.closest('.ap-sticky-options')) return;
            dragNote(e, note);
        });

        // Prevent keyboard events from bubbling up to the host website
        note.addEventListener("keydown", (e) => e.stopPropagation());
        note.addEventListener("keyup", (e) => e.stopPropagation());
        note.addEventListener("keypress", (e) => e.stopPropagation());

        // Formatting
        note.querySelectorAll(".toolbar-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const command = btn.classList.contains("bold-btn") ? "bold" :
                               btn.classList.contains("italic-btn") ? "italic" :
                               btn.classList.contains("underline-btn") ? "underline" : "strikeThrough";
                document.execCommand(command, false, null);
                contentArea.focus();
            });
        });

        // Content changes
        contentArea.addEventListener("input", debouncedSave);

        // Delete
        deleteBtn.addEventListener("click", () => showDeleteConfirmation(note));

        // Collapse
        collapseBtn.addEventListener("click", () => {
            note.classList.toggle("collapsed");
            const isCollapsed = note.classList.contains("collapsed");
            collapseBtn.querySelector("img").src = chrome.runtime.getURL(isCollapsed ? 'assets/maximize.svg' : 'assets/minus.svg');
            debouncedSave();
        });

        // Color Palette
        paletteBtn.addEventListener("click", () => {
            colorPalette.style.display = colorPalette.style.display === "flex" ? "none" : "flex";
        });

        note.querySelectorAll(".color-swatch").forEach(swatch => {
            swatch.addEventListener("click", () => {
                const newColor = swatch.dataset.color;
                note.dataset.color = newColor;
                header.style.backgroundColor = newColor;
                colorPalette.style.display = "none";
                debouncedSave();
            });
        });

        // Title Editing
        titleDisplay.addEventListener("dblclick", () => {
            titleDisplay.style.display = "none";
            titleInput.style.display = "block";
            titleInput.focus();
        });

        titleInput.addEventListener("blur", () => {
            titleDisplay.textContent = titleInput.value || "Note";
            titleDisplay.style.display = "block";
            titleInput.style.display = "none";
            debouncedSave();
        });

        titleInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") titleInput.blur();
        });

        if (isNew) {
            contentArea.focus();
            debouncedSave();
        }
    }

    function dragNote(e, note) {
        try {
            let offsetX = e.pageX - note.offsetLeft;
            let offsetY = e.pageY - note.offsetTop;

            function moveNote(e) {
                let newX = e.pageX - offsetX;
                let newY = e.pageY - offsetY;

                newX = Math.max(0, newX);
                newX = Math.min(newX, document.body.offsetWidth - note.offsetWidth);

                note.style.left = newX + "px";
                note.style.top = newY + "px";
            }

            function stopDrag() {
                document.removeEventListener("mousemove", moveNote);
                document.removeEventListener("mouseup", stopDrag);
                debouncedSave();
            }

            document.addEventListener("mousemove", moveNote);
            document.addEventListener("mouseup", stopDrag);
        } catch (error) {
            console.error("Error dragging note:", error);
        }
    }

    function debouncedSave() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNotes, 1000);
    }

    function showDeleteConfirmation(noteToDelete) {
        const isCollapsed = noteToDelete.classList.contains("collapsed");
        const overlay = document.createElement("div");

        if (isCollapsed) {
            overlay.className = "sticky-header-delete-overlay";
            overlay.innerHTML = `
                <span>Delete note?</span>
                <div class="header-delete-btns">
                    <button class="header-del-btn confirm-del" title="Confirm Delete">
                        <img src="${chrome.runtime.getURL('assets/check.svg')}" alt="Confirm">
                    </button>
                    <button class="header-del-btn cancel-del" title="Cancel">
                        <img src="${chrome.runtime.getURL('assets/cross.svg')}" alt="Cancel">
                    </button>
                </div>
            `;
        } else {
            overlay.className = "sticky-note-delete-overlay";
            const modal = document.createElement("div");
            modal.className = "sticky-note-delete-modal";
            modal.innerHTML = `
                <p>Delete this note?</p>
                <div class="modal-buttons">
                    <button class="confirm-delete" title="Delete">
                        <img src="${chrome.runtime.getURL('assets/check.svg')}" alt="Delete">
                    </button>
                    <button class="cancel-delete" title="Cancel">
                        <img src="${chrome.runtime.getURL('assets/cross.svg')}" alt="Cancel">
                    </button>
                </div>
            `;
            overlay.appendChild(modal);
        }

        noteToDelete.appendChild(overlay);

        const confirmBtn = isCollapsed ? overlay.querySelector('.confirm-del') : overlay.querySelector('.confirm-delete');
        const cancelBtn = isCollapsed ? overlay.querySelector('.cancel-del') : overlay.querySelector('.cancel-delete');

        confirmBtn.addEventListener('click', () => {
            try {
                const noteId = noteToDelete.dataset.id;
                noteToDelete.remove();
                if (noteId && currentUser) {
                    deleteSupabaseNote(noteId);
                }
                saveNotes();
            } catch (error) {
                console.error("Error deleting note:", error);
            }
        });

        cancelBtn.addEventListener('click', () => {
            overlay.remove();
        });
    }

    async function deleteSupabaseNote(noteId) {
        if (!isExtensionValid()) return;
        try {
            await chrome.runtime.sendMessage({
                action: "supabaseAction",
                method: "DELETE",
                table: "sticky_notes",
                query: `id=eq.${noteId}`
            });
        } catch (e) {
            console.error("Failed to delete note from Supabase:", e);
        }
    }

    chrome.runtime.onMessage.addListener((request) => {
        if (!isExtensionValid()) return;
        if (request.action === "supabaseChange") {
            const payload = request.payload;
            const urlKey = getEffectiveUrl();
            const record = payload.record || payload.new || payload.old_record || payload.old;
            const oldRecord = payload.old_record || payload.old;
            const eventType = payload.eventType;

            if (record?.url !== urlKey && oldRecord?.url !== urlKey) return;

            if (eventType === 'DELETE') {
                const idToDelete = oldRecord?.id || record?.id;
                const noteEl = shadowRoot?.querySelector(`.sticky-note[data-id="${idToDelete}"]`);
                if (noteEl) noteEl.remove();
            } else {
                const existingNote = shadowRoot?.querySelector(`.sticky-note[data-id="${record.id}"]`);
                const isEditing = existingNote && (
                    existingNote.querySelector('.sticky-content:focus') || 
                    existingNote.querySelector('.note-title-input[style*="display: block"]')
                );

                if (isEditing) return;

                if (existingNote) {
                    existingNote.querySelector(".sticky-content").innerHTML = record.content;
                    existingNote.querySelector(".note-title-display").textContent = record.title;
                    existingNote.querySelector(".note-title-input").value = record.title;
                    existingNote.style.top = record.top;
                    existingNote.style.left = record.left;
                    existingNote.dataset.color = record.color;
                    existingNote.querySelector(".note-header").style.backgroundColor = record.color;
                    if (record.collapsed) existingNote.classList.add("collapsed");
                    else existingNote.classList.remove("collapsed");
                } else {
                    createStickyNote(record.content, record.top, record.left, record.collapsed, record.title, record.color, false, record.id);
                }
            }
        }
    });

    function observePageChanges() {
        try {
            const observer = new MutationObserver(() => {
                if (window.location.href !== lastUrl) {
                    lastUrl = window.location.href;
                    loadNotes();
                    return;
                }
                if (notesExistInStorage && shadowRoot?.querySelectorAll('.sticky-note').length === 0) {
                    clearTimeout(noteCheckDebounce);
                    noteCheckDebounce = setTimeout(() => {
                        if (notesExistInStorage && shadowRoot?.querySelectorAll('.sticky-note').length === 0) {
                            loadNotes();
                        }
                    }, 2000);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        } catch (error) {
            console.error("Error observing page changes:", error);
        }
    }

    init();
})();
