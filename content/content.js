(function() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "createStickyNote") {
            createStickyNote();
            sendResponse({ status: "ok" }); // Acknowledge the message
        }
        return true; // Keep message channel open for async responses
    });

    let lastUrl = window.location.href; // Cache the last known URL
    let notesExistInStorage = false; // Flag to track if notes should be on the page
    let noteCheckDebounce = null; // Debounce timer for DOM checks
    let listenersAdded = false; // Flag to ensure event listeners are added only once

    /**
     * Initializes the sticky notes functionality on the page.
     */
    function init() {
        try {
            injectExternalCSS();
            injectNewNoteButton();
            loadNotes();
            observePageChanges(); // Watch for URL and DOM changes
        } catch (error) {
            console.error("Error during Sticky Notes initialization:", error);
        }
    }

    // Since content scripts run at `document_idle`, the DOM is generally ready.
    // A small delay can help ensure that single-page applications have finished their initial render.
    if (document.readyState === "complete") {
        setTimeout(init, 100);
    } else {
        window.addEventListener("load", () => setTimeout(init, 100));
    }

    function injectExternalCSS() {
        try {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = "https://cdn-uicons.flaticon.com/3.0.0/uicons-regular-rounded/css/uicons-regular-rounded.css";
            document.head.appendChild(link);
        } catch (error) {
            console.error("Error injecting external CSS:", error);
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

            button.addEventListener("click", () => createStickyNote());

            if (!listenersAdded) {
                document.addEventListener("keydown", (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "q") {
                        createStickyNote();
                        e.preventDefault();
                    }
                });
                listenersAdded = true;
            }
        } catch (error) {
            console.error("Error injecting 'New Note' button:", error);
        }
    }

    function loadNotes() {
        try {
            const urlKey = getEffectiveUrl();
            chrome.storage.sync.get(urlKey, (data) => {
                if (chrome.runtime.lastError) {
                    console.error("Error loading notes from chrome.storage:", chrome.runtime.lastError);
                    return;
                }

                const notes = data[urlKey] || [];
                notesExistInStorage = notes.length > 0; // Update flag

                removeAllStickyNotes();
                notes.forEach((note) =>
                    createStickyNote(note.content, note.top, note.left, note.collapsed, note.title, note.color)
                );
            });
        } catch (error) {
            console.error("Error in loadNotes:", error);
        }
    }

    function saveNotes() {
        try {
            const notes = Array.from(document.querySelectorAll(".sticky-note")).map(
                (note) => ({
                    content: note.querySelector(".sticky-content").innerHTML,
                    top: note.style.top,
                    left: note.style.left,
                    collapsed: note.classList.contains("collapsed"),
                    title: note.querySelector(".note-title-input").value,
                    color: note.dataset.color || '#ffd165'
                })
            );

            notesExistInStorage = notes.length > 0; // Update flag on save

            const urlKey = getEffectiveUrl();
            chrome.storage.sync.set({ 
                [urlKey]: notes }, () => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "Error saving to chrome.storage:",
                        chrome.runtime.lastError
                    );
                }
            });
        } catch (error) {
            console.error("Error in saveNotes:", error);
        }
    }

    function createStickyNote(content = "", top = null, left = null, collapsed = false, title = "Note", color = "#ffd165") {
        try {
            const note = document.createElement("div");
            note.className = "sticky-note";
            note.dataset.color = color;

            const viewportTop = window.scrollY + window.innerHeight / 2 - 50;
            const viewportLeft = window.scrollX + window.innerWidth / 2 - 75;

            note.style.top = top || `${viewportTop}px`;
            note.style.left = left || `${viewportLeft}px`;
            note.style.position = "absolute";
            note.style.zIndex = "9999";

            const noteHeader = document.createElement("div");
            noteHeader.className = "note-header";
            noteHeader.style.backgroundColor = color;

            const titleInput = document.createElement("input");
            titleInput.type = "text";
            titleInput.className = "note-title-input";
            titleInput.value = title;
            titleInput.placeholder = "Title...";
            titleInput.addEventListener("input", saveNotes);

            const stickyCloseMenuBox = document.createElement("div");
            stickyCloseMenuBox.className = "sticky-close-menu-box";

            const NOTE_COLORS = ['#ffd165', '#ff9b71', '#a0d1e8', '#d3a0e8', '#a0e8b1', '#e8a0a0'];

            const colorButton = document.createElement("button");
            colorButton.className = "color-picker-btn ap-sticky-options";
            colorButton.title = "Change color";
            colorButton.innerHTML = `<i class="fi fi-rr-palette"></i>`;

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
                    saveNotes();
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
            minimizeButton.innerHTML = `<i class=\"fi fi-rr-minus-small\"></i>`;

            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-note-btn ap-sticky-options";
            deleteButton.title = "Delete note";
            deleteButton.innerHTML = `<img src=\"https://ucktpuitdnqcqtg2.public.blob.vercel-storage.com/bin-icon-EWmPyvXJ3uLxwOU0l7K42iblggAFb1.svg\" alt=\"Delete\" />`;
            deleteButton.addEventListener("click", () => {
                showDeleteConfirmation(note);
            });

            minimizeButton.addEventListener("click", () => {
                note.classList.toggle("collapsed");
                const isCollapsed = note.classList.contains("collapsed");
                minimizeButton.title = isCollapsed ? "Expand note" : "Minimize note";
                minimizeButton.innerHTML = isCollapsed ? `<i class=\"fi fi-rr-window-maximize\"></i>` : `<i class=\"fi fi-rr-minus-small\"></i>`;
                saveNotes();
            });

            stickyCloseMenuBox.appendChild(colorButton);
            stickyCloseMenuBox.appendChild(minimizeButton);
            stickyCloseMenuBox.appendChild(deleteButton);
            noteHeader.appendChild(titleInput);
            noteHeader.appendChild(stickyCloseMenuBox);

            const contentArea = document.createElement("div");
            contentArea.contentEditable = true;
            contentArea.className = "sticky-content";
            contentArea.innerHTML = content || "Take a note.. ";

            contentArea.addEventListener("focus", () => {
                if (contentArea.innerHTML === "Take a note.. ") {
                    contentArea.innerHTML = "";
                }
            });

            contentArea.addEventListener("blur", () => {
                if (contentArea.innerHTML.trim() === "") {
                    contentArea.innerHTML = "Take a note.. ";
                }
            });

            contentArea.addEventListener("input", saveNotes);

            note.appendChild(noteHeader);
            note.appendChild(contentArea);

            if (collapsed) {
                note.classList.add("collapsed");
                minimizeButton.title = "Expand note";
                minimizeButton.innerHTML = `<i class=\"fi fi-rr-window-maximize\"></i>`;
            }

            document.body.appendChild(note);

            noteHeader.addEventListener("mousedown", (e) => {
                if (e.target.tagName === 'INPUT' || e.target.closest('.ap-sticky-options')) {
                    return;
                }
                dragNote(e, note);
            });

            saveNotes();
        } catch (error) {
            console.error("Error creating sticky note:", error);
        }
    }

    function showDeleteConfirmation(noteToDelete) {
        const overlay = document.createElement("div");
        overlay.className = "sticky-note-delete-overlay";

        const modal = document.createElement("div");
        modal.className = "sticky-note-delete-modal";
        modal.innerHTML = `
            <p>Are you sure you want to delete this note?</p>
            <div class=\"modal-buttons\">
                <button class=\"confirm-delete\">Delete</button>
                <button class=\"cancel-delete\">Cancel</button>
            </div>
        `;

        overlay.appendChild(modal);
        noteToDelete.appendChild(overlay);

        modal.querySelector('.confirm-delete').addEventListener('click', () => {
            try {
                noteToDelete.remove();
                saveNotes();
            } catch (error) {
                console.error("Error deleting note:", error);
            }
        });

        modal.querySelector('.cancel-delete').addEventListener('click', () => {
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
        try {
            document
                .querySelectorAll(".sticky-note")
                .forEach((note) => note.remove());
        } catch (error) {
            console.error("Error removing all sticky notes:", error);
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
                if (notesExistInStorage && document.querySelectorAll('.sticky-note').length === 0) {
                    // Debounce to prevent rapid-fire reloads during complex DOM manipulations
                    clearTimeout(noteCheckDebounce);
                    noteCheckDebounce = setTimeout(() => {
                        // Re-check condition in case notes were added in the meantime
                        if (notesExistInStorage && document.querySelectorAll('.sticky-note').length === 0) {
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
