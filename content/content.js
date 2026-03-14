(function() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "createStickyNote") {
            createStickyNote("", null, null, false, "Note", "#ffd165", true);
            sendResponse({ status: "ok" }); // Acknowledge the message
        }
        return true; // Keep message channel open for async responses
    });

    let lastUrl = window.location.href; // Cache the last known URL
    let notesExistInStorage = false; // Flag to track if notes should be on the page
    let noteCheckDebounce = null; // Debounce timer for DOM checks
    let listenersAdded = false; // Flag to ensure event listeners are added only once
    let saveTimeout = null; // Timer for debouncing save operations
    let currentUser = null;
    let contextInvalidated = false;
    let shadowRoot = null;
    let shadowHost = null;

    /**
     * Checks if the extension context is still valid.

    /**
     * Checks if the extension context is still valid.
     * If not, it sets a flag and returns false.
     */
    function isExtensionValid() {
        if (contextInvalidated) return false;
        try {
            // Accessing chrome.runtime.id is a stable way to check if the background context is still there
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

    /**
     * Initializes the sticky notes functionality on the page.
     */
    if (document.readyState === "complete") {
        setTimeout(init, 100);
    } else {
        window.addEventListener("load", () => setTimeout(init, 100));
    }

    function init() {
        try {
            setupShadowDOM().then(() => {
                injectNewNoteButton();
                loadNotes();
                observePageChanges(); // Watch for URL and DOM changes
            });
        } catch (error) {
            console.error("Error during Sticky Notes initialization:", error);
        }
    }

    async function setupShadowDOM() {
        if (shadowRoot) return;
        
        shadowHost = document.createElement("div");
        shadowHost.id = "ap-sticky-notes-container";
        // Ensure the host doesn't block interactions with the page
        shadowHost.style.position = "fixed";
        shadowHost.style.inset = "0";
        shadowHost.style.zIndex = "2147483647"; // Max z-index
        shadowHost.style.overflow = "visible";
        shadowHost.style.pointerEvents = "none";
        
        shadowRoot = shadowHost.attachShadow({ mode: "open" });
        document.documentElement.appendChild(shadowHost);

        // Inject the styles
        try {
            const cssUrl = chrome.runtime.getURL("content/content.css");
            const response = await fetch(cssUrl);
            const cssText = await response.text();
            
            const style = document.createElement("style");
            // Adjust CSS for Shadow DOM if necessary
            // For example, variables in :root might need to be in :host
            style.textContent = cssText.replace(/:root/g, ":host");
            shadowRoot.appendChild(style);

            // Re-enable pointer events for sticky notes themselves
            const interactionStyle = document.createElement("style");
            interactionStyle.textContent = ".sticky-note { pointer-events: auto; }";
            shadowRoot.appendChild(interactionStyle);
        } catch (e) {
            console.error("Failed to load sticky notes styles:", e);
        }
    }


    function injectNewNoteButton() {
        try {
            if (document.getElementById("appedle-new-note-btn")) {
                return; // Button already exists
            }
            const button = document.createElement("button");
            button.id = "appedle-new-note-btn";
            button.textContent = "New Note (Ctrl + Q)";
            document.body.appendChild(button);

            button.addEventListener("click", () => createStickyNote("", null, null, false, "Note", "#ffd165", true));

            if (!listenersAdded) {
                document.addEventListener("keydown", (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "q") {
                        createStickyNote("", null, null, false, "Note", "#ffd165", true);
                        e.preventDefault();
                    }
                });
                listenersAdded = true;
            }
        } catch (error) {
            console.error("Error injecting 'New Note' button:", error);
        }
    }

    async function loadNotes() {
        if (!isExtensionValid()) return;
        try {
            const user = await checkAuth();
            if (contextInvalidated) return;
            const urlKey = getEffectiveUrl();

            if (user) {
                // Load from Supabase
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
                        // Fallback to local?
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
        if (!isExtensionValid()) return;
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
    }

    async function saveNotes() {
        if (!isExtensionValid() || !shadowRoot) return;
        try {
            const urlKey = getEffectiveUrl();
            const notes = Array.from(shadowRoot.querySelectorAll(".sticky-note")).map(
                (note) => ({
                    id: note.dataset.id || undefined, // UUID from Supabase
                    url: urlKey,
                    content: note.querySelector(".sticky-content").innerHTML,
                    top: note.style.top,
                    left: note.style.left,
                    collapsed: note.classList.contains("collapsed"),
                    title: note.querySelector(".note-title-input").value,
                    color: note.dataset.color || '#ffd165'
                })
            );

            notesExistInStorage = notes.length > 0;

            if (currentUser) {
                const noteElements = Array.from(shadowRoot.querySelectorAll(".sticky-note"));
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
                            // Update the note element with the new ID
                            const newId = response.data?.[0]?.id;
                            if (newId && noteEl) {
                                noteEl.dataset.id = newId;
                            }
                        }
                    });
                }
            } else {
                chrome.storage.sync.set({ 
                    [urlKey]: notes.map(n => {
                        const { id, url, ...rest } = n;
                        return rest;
                    })
                }, () => {
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

    /**
     * Debounced version of saveNotes to prevent hitting storage quotas.
     */
    function debouncedSaveNotes() {
        if (!isExtensionValid()) return;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            if (isExtensionValid()) {
                saveNotes();
            }
        }, 1000); // Wait 1 second after last change before saving
    }

    function createStickyNote(content = "", top = null, left = null, collapsed = false, title = "Note", color = "#ffd165", shouldSave = false, id = null) {
        try {
            const note = document.createElement("div");
            note.className = "sticky-note";
            note.dataset.color = color;
            if (id) note.dataset.id = id;

            const viewportTop = window.scrollY + window.innerHeight / 2 - 50;
            const viewportLeft = window.scrollX + window.innerWidth / 2 - 75;

            note.style.top = top || `${viewportTop}px`;
            note.style.left = left || `${viewportLeft}px`;
            note.style.position = "absolute";
            note.style.zIndex = "9999";

            const noteHeader = document.createElement("div");
            noteHeader.className = "note-header";
            noteHeader.style.backgroundColor = color;

            // --- Title Elements ---
            const titleDisplay = document.createElement("div");
            titleDisplay.className = "note-title-display";
            titleDisplay.textContent = title;

            const titleInput = document.createElement("input");
            titleInput.type = "text";
            titleInput.className = "note-title-input";
            titleInput.value = title;
            titleInput.placeholder = "Title...";
            titleInput.style.display = "none"; // Hidden by default

            // --- Button Container ---
            const stickyCloseMenuBox = document.createElement("div");
            stickyCloseMenuBox.className = "sticky-close-menu-box";

            // --- Title Edit Buttons ---
            const acceptTitleButton = document.createElement("button");
            acceptTitleButton.className = "accept-title-btn ap-sticky-options";
            acceptTitleButton.title = "Save title";
            if (isExtensionValid()) {
                acceptTitleButton.innerHTML = `<img src="${chrome.runtime.getURL('assets/check.svg')}" alt="Save">`;
            }
            acceptTitleButton.style.display = "none";

            const discardTitleButton = document.createElement("button");
            discardTitleButton.className = "discard-title-btn ap-sticky-options";
            discardTitleButton.title = "Cancel";
            if (isExtensionValid()) {
                discardTitleButton.innerHTML = `<img src="${chrome.runtime.getURL('assets/cross.svg')}" alt="Cancel">`;
            }
            discardTitleButton.style.display = "none";

            // --- Regular Note Buttons ---
            const NOTE_COLORS = ['#ffd165', '#ff9b71', '#a0d1e8', '#d3a0e8', '#a0e8b1', '#e8a0a0'];

            const colorButton = document.createElement("button");
            colorButton.className = "color-picker-btn ap-sticky-options";
            colorButton.title = "Change color";
            if (isExtensionValid()) {
                colorButton.innerHTML = `<img src="${chrome.runtime.getURL('assets/palette.svg')}" alt="Color">`;
            }

            const colorPalette = document.createElement("div");
            colorPalette.className = "color-palette";

            NOTE_COLORS.forEach(c => {
                const swatch = document.createElement("div");
                swatch.className = "color-swatch";
                swatch.style.backgroundColor = c;
                swatch.addEventListener("click", (e) => {
                    e.stopPropagation();
                    noteHeader.style.backgroundColor = c;
                    note.dataset.color = c;
                    debouncedSaveNotes();
                    colorPalette.style.display = 'none';
                });
                colorPalette.appendChild(swatch);
            });

            note.appendChild(colorPalette);

            colorButton.addEventListener("click", (e) => {
                e.stopPropagation();
                colorPalette.style.display = colorPalette.style.display === 'flex' ? 'none' : 'flex';
            });

            document.addEventListener('click', (e) => {
                if (!note.contains(e.target)) {
                    colorPalette.style.display = 'none';
                }
            });

            const minimizeButton = document.createElement("button");
            minimizeButton.className = "minimize-note-btn ap-sticky-options";
            minimizeButton.title = "Minimize note";
            if (isExtensionValid()) {
                minimizeButton.innerHTML = `<img src="${chrome.runtime.getURL('assets/minus.svg')}" alt="Minimize">`;
            }

            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-note-btn ap-sticky-options";
            deleteButton.title = "Delete note";
            if (isExtensionValid()) {
                deleteButton.innerHTML = `<img src="${chrome.runtime.getURL('assets/bin-icon.svg')}" alt="Delete">`;
            }
            deleteButton.addEventListener("click", () => {
                showDeleteConfirmation(note);
            });

            // --- Title Edit Logic ---
            const startTitleEdit = () => {
                titleDisplay.style.display = "none";
                titleInput.style.display = "block";
                titleInput.focus();
                titleInput.select();

                // Hide regular buttons
                colorButton.style.display = "none";
                minimizeButton.style.display = "none";
                deleteButton.style.display = "none";

                // Show editing buttons
                acceptTitleButton.style.display = "flex";
                discardTitleButton.style.display = "flex";
            };

            const endTitleEdit = () => {
                titleDisplay.style.display = "block";
                titleInput.style.display = "none";

                // Show regular buttons
                colorButton.style.display = "flex";
                minimizeButton.style.display = "flex";
                deleteButton.style.display = "flex";

                // Hide editing buttons
                acceptTitleButton.style.display = "none";
                discardTitleButton.style.display = "none";
            };

            titleDisplay.addEventListener("dblclick", startTitleEdit);

            acceptTitleButton.addEventListener("click", () => {
                const newTitle = titleInput.value.trim();
                if (newTitle) {
                    titleDisplay.textContent = newTitle;
                    debouncedSaveNotes();
                } else {
                    titleInput.value = titleDisplay.textContent;
                }
                endTitleEdit();
            });

            discardTitleButton.addEventListener("click", () => {
                titleInput.value = titleDisplay.textContent;
                endTitleEdit();
            });

            titleInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    acceptTitleButton.click();
                    e.preventDefault();
                } else if (e.key === "Escape") {
                    discardTitleButton.click();
                }
            });

            // --- Other Button Logic ---
            minimizeButton.addEventListener("click", () => {
                note.classList.toggle("collapsed");
                const isCollapsed = note.classList.contains("collapsed");
                minimizeButton.title = isCollapsed ? "Expand note" : "Minimize note";
                minimizeButton.innerHTML = isCollapsed ? 
                    `<img src="${chrome.runtime.getURL('assets/maximize.svg')}" alt="Expand">` : 
                    `<img src="${chrome.runtime.getURL('assets/minus.svg')}" alt="Minimize">`;
                saveNotes();
            });

            // --- Assemble Header ---
            stickyCloseMenuBox.appendChild(acceptTitleButton);
            stickyCloseMenuBox.appendChild(discardTitleButton);
            stickyCloseMenuBox.appendChild(colorButton);
            stickyCloseMenuBox.appendChild(minimizeButton);
            stickyCloseMenuBox.appendChild(deleteButton);
            
            noteHeader.appendChild(titleDisplay);
            noteHeader.appendChild(titleInput);
            noteHeader.appendChild(stickyCloseMenuBox);

            // --- Assemble Note ---
            const contentArea = document.createElement("div");
            contentArea.contentEditable = true;
            contentArea.className = "sticky-content";
            contentArea.innerHTML = content || "Take a note.. ";

            // --- Formatting Toolbar ---
            const noteToolbar = document.createElement("div");
            noteToolbar.className = "sticky-note-toolbar";

            const formattingButtons = [
                { command: 'bold', icon: 'assets/bold.svg', title: 'Bold' },
                { command: 'italic', icon: 'assets/italic.svg', title: 'Italic' },
                { command: 'underline', icon: 'assets/underline.svg', title: 'Underline' },
                { command: 'strikeThrough', icon: 'assets/strikethrough.svg', title: 'Strikethrough' }
            ];

            formattingButtons.forEach(btn => {
                const button = document.createElement("button");
                button.className = "toolbar-btn";
                button.title = btn.title;
                button.innerHTML = `<img src="${chrome.runtime.getURL(btn.icon)}" alt="${btn.title}">`;
                
                button.addEventListener('mousedown', (e) => {
                    e.preventDefault(); // Prevent contenteditable from losing focus
                    document.execCommand(btn.command, false, null);
                });
                noteToolbar.appendChild(button);
            });

            contentArea.addEventListener("focus", () => {
                if (contentArea.innerHTML === "Take a note.. ") {
                    contentArea.innerHTML = "";
                }
                noteToolbar.style.display = "flex";
            });

            contentArea.addEventListener("blur", () => {
                if (contentArea.innerHTML.trim() === "") {
                    contentArea.innerHTML = "Take a note.. ";
                }
                setTimeout(() => {
                    if (!noteToolbar.contains(document.activeElement)) {
                        noteToolbar.style.display = "none";
                    }
                }, 200);
            });

            contentArea.addEventListener("input", saveNotes);

            note.appendChild(noteHeader);
            note.appendChild(contentArea);
            note.appendChild(noteToolbar);

            noteToolbar.style.display = "none";

            if (collapsed) {
                note.classList.add("collapsed");
                minimizeButton.title = "Expand note";
                minimizeButton.innerHTML = `<img src="${chrome.runtime.getURL('assets/maximize.svg')}" alt="Expand">`;
            }

            if (shadowRoot) {
                shadowRoot.appendChild(note);
            } else {
                // Fallback (should not happen after init)
                document.body.appendChild(note);
            }

            noteHeader.addEventListener("mousedown", (e) => {
                if (e.target.tagName === 'INPUT' || e.target.closest('.ap-sticky-options') || titleInput.style.display === 'block') {
                    return;
                }
                dragNote(e, note);
            });

            if (shouldSave) {
                saveNotes();
            }
        } catch (error) {
            console.error("Error creating sticky note:", error.message);
        }
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
                <p>Are you sure you want to delete this note?</p>
                <div class="modal-buttons">
                    <button class="confirm-delete">Delete</button>
                    <button class="cancel-delete">Cancel</button>
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

    function dragNote(e, note) {
        try {
            let offsetX = e.clientX - note.offsetLeft;
            let offsetY = e.clientY - note.offsetTop;

            function moveNote(e) {
                let newX = e.clientX - offsetX;
                let newY = e.clientY - offsetY;

                newX = Math.max(0, newX);
                newX = Math.min(newX, document.body.offsetWidth - note.offsetWidth);

                newY = Math.max(0, newY);
                newY = Math.min(newY, document.body.scrollHeight - note.offsetHeight);

                note.style.top = `${newY}px`;
                note.style.left = `${newX}px`;
            }

            function stopDrag() {
                document.removeEventListener("mousemove", moveNote);
                document.removeEventListener("mouseup", stopDrag);
                saveNotes();
            }

            document.addEventListener("mousemove", moveNote);
            document.addEventListener("mouseup", stopDrag);
        } catch (error) {
            console.error("Error dragging note:", error);
        }
    }

    function removeAllStickyNotes() {
        if (!shadowRoot) return;
        try {
            shadowRoot
                .querySelectorAll(".sticky-note")
                .forEach((note) => note.remove());
        } catch (error) {
            console.error("Error removing all sticky notes:", error);
        }
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

    function getEffectiveUrl() {
        try {
            return window.location.href;
        } catch (error) {
            console.error("Error getting effective URL:", error);
            return "unknown-url";
        }
    }

    /**
     * Listen for changes in storage to keep notes in sync across tabs and windows.
     */
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (!isExtensionValid()) return;
        if (namespace === 'sync') {
            // Check if we are currently editing any note
            const isEditing = shadowRoot?.querySelector('.note-title-input[style*="display: block"]') || 
                             shadowRoot?.querySelector('.sticky-content:focus');
            
            if (!isEditing) {
                console.log('Storage changed, reloading notes in content script.');
                loadNotes();
            }
        }
    });

    chrome.runtime.onMessage.addListener((request) => {
        if (!isExtensionValid()) return;
        if (request.action === "supabaseChange") {
            const payload = request.payload;
            const urlKey = getEffectiveUrl();
            if (payload.record?.url === urlKey || payload.old_record?.url === urlKey) {
                console.log("Supabase Realtime change for this page! Reloading...");
                loadNotes();
            }
        }
    });

    /**
     * Observes changes to the page URL (for SPAs) and DOM structure.
     * This ensures notes are reloaded if the URL changes or if a framework
     * re-renders the page and removes the notes.
     */
    function observePageChanges() {
        try {
            const observer = new MutationObserver(() => {
                // 1. Handle URL changes for single-page applications
                if (window.location.href !== lastUrl) {
                    lastUrl = window.location.href;
                    loadNotes();
                    return; // URL changed, notes are reloaded, no need for further checks
                }

                // 2. Handle DOM wipes by frameworks (e.g., React, Vue)
                // If we have notes in storage for this URL but none are on the page,
                // it's likely they were removed by a re-render.
                const noteCount = shadowRoot ? shadowRoot.querySelectorAll('.sticky-note').length : 0;
                if (notesExistInStorage && noteCount === 0) {
                    // Debounce to prevent rapid-fire reloads during complex DOM manipulations
                    clearTimeout(noteCheckDebounce);
                    noteCheckDebounce = setTimeout(() => {
                        // Re-check condition in case notes were added in the meantime
                        const currentCount = shadowRoot ? shadowRoot.querySelectorAll('.sticky-note').length : 0;
                        if (notesExistInStorage && currentCount === 0) {
                            console.log("Sticky notes missing from page, attempting to restore.");
                            loadNotes();
                        }
                    }, 500);
                }
            });

            // Observe the body for child additions/removals. This is a good
            // indicator of page re-renders without being overly resource-intensive.
            if (document.body) {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                });
            }
        } catch (error) {
            console.error("Error observing page changes:", error);
        }
    }
})();
