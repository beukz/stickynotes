document.addEventListener("DOMContentLoaded", () => {
    const notesContainer = document.getElementById("notes-container");

    // Mock data for development when chrome.storage is not available
    const mockNotesData = {
        "https://developer.chrome.com/docs/extensions": [{
            content: "This is a mock note about Chrome extensions. Great for UI development!",
            top: "150px",
            left: "200px",
        }, ],
        "https://www.google.com/search?q=mock+data": [{
            content: "A sticky note for Google! This is a sample note to show how content is displayed.",
            top: "100px",
            left: "50px",
        }, {
            content: "Another note on Google. You can have multiple notes per page. <b>HTML content</b> like bold text is also supported.",
            top: "300px",
            left: "250px",
        }, ],
        "https://partnerflow.co.za/": [{
            content: "This is a note on partnerflow.co.za. The popup groups notes by the main domain.",
            top: "220px",
            left: "400px",
        }, ],
    };

    /**
     * Extracts the main domain from a given URL.
     * @param {string} url - The URL to process.
     * @returns {string|null} - The main domain (e.g., https://example.com) or null for invalid URLs.
     */
    function getMainDomain(url) {
        try {
            if (!url.startsWith("https://") && !url.startsWith("http://")) {
                // Assume https:// for URLs without a protocol
                url = `https://${url}`;
            }
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (error) {
            console.warn("Invalid URL encountered:", url, error);
            return null; // Return null for invalid URLs
        }
    }

    /**
     * Shows a custom confirmation modal over a note item in the popup.
     * @param {HTMLElement} noteItem - The note item element to cover.
     * @param {function} onConfirm - The callback function to execute on confirmation.
     */
    function showPopupDeleteConfirmation(noteItem, onConfirm) {
        // Prevent multiple modals on the same item
        if (noteItem.querySelector('.popup-delete-overlay')) {
            return;
        }

        const overlay = document.createElement("div");
        overlay.className = "popup-delete-overlay";

        const modal = document.createElement("div");
        modal.className = "popup-delete-modal";
        modal.innerHTML = `
            <p>Delete this note?</p>
            <div class="popup-modal-buttons">
                <button class="confirm-delete">Delete</button>
                <button class="cancel-delete">Cancel</button>
            </div>
        `;

        overlay.appendChild(modal);
        noteItem.appendChild(overlay);

        modal.querySelector('.confirm-delete').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            onConfirm();
            overlay.remove();
        });

        modal.querySelector('.cancel-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            overlay.remove();
        });
    }

    /**
     * Renders notes in the popup, grouped by their main domain.
     * @param {object} notesData - The notes data from storage or mock data.
     * @param {string[]} [collapsedDomains=[]] - An array of domains that should be collapsed.
     */
    function renderNotes(notesData, collapsedDomains = []) {
        notesContainer.innerHTML = "";

        // Filter out any URLs that have empty note arrays to be safe
        const nonEmptyNotesData = Object.fromEntries(
            Object.entries(notesData).filter(([, notes]) => Array.isArray(notes) && notes.length > 0)
        );

        if (Object.keys(nonEmptyNotesData).length === 0) {
            const noNotesMessage = document.createElement("div");
            noNotesMessage.className = "no-notes-message";
            noNotesMessage.textContent = "Oops! Your sticky note board is squeaky clean 🧼. Start scribbling to add some magic!";
            notesContainer.appendChild(noNotesMessage);
            return;
        }

        const groupedNotes = {};
        for (const [url, notes] of Object.entries(nonEmptyNotesData)) {
            const mainDomain = getMainDomain(url);
            if (!mainDomain) continue;
            if (!groupedNotes[mainDomain]) groupedNotes[mainDomain] = [];
            groupedNotes[mainDomain].push({
                url,
                notes
            });
        }

        for (const [domain, entries] of Object.entries(groupedNotes)) {
            const totalNotes = entries.reduce((sum, entry) => sum + entry.notes.length, 0);
            if (totalNotes === 0) continue;

            const domainContainer = document.createElement("div");
            domainContainer.className = "domain-container";

            if (collapsedDomains.includes(domain)) {
                domainContainer.classList.add("collapsed");
            }

            const domainHeader = document.createElement("div");
            domainHeader.className = "domain-header";

            const domainTitle = document.createElement("h3");
            domainTitle.className = "ap-sn-site-title";

            const favicon = document.createElement("img");
            favicon.src = `https://www.google.com/s2/favicons?domain=${domain}`;
            favicon.className = "favicon";
            domainTitle.appendChild(favicon);

            const domainText = document.createTextNode(domain);
            domainTitle.appendChild(domainText);

            const chevron = document.createElement("i");
            chevron.className = "fi fi-rr-angle-small-down chevron-icon";

            domainHeader.appendChild(domainTitle);
            domainHeader.appendChild(chevron);

            const notesList = document.createElement("div");
            notesList.className = "notes-list";

            // Create a wrapper for the notes to enable smooth collapse/expand animation
            const notesWrapper = document.createElement("div");
            notesWrapper.className = "notes-wrapper";

            domainHeader.addEventListener("click", () => {
                domainContainer.classList.toggle("collapsed");
                updateCollapsedState(domain, domainContainer.classList.contains("collapsed"));
            });

            domainContainer.appendChild(domainHeader);
            domainContainer.appendChild(notesList);
            notesList.appendChild(notesWrapper); // The wrapper is the single child of the grid container

            entries.forEach(({
                url,
                notes
            }) => {
                notes.forEach((note) => {
                    const noteItem = document.createElement("div");
                    noteItem.className = "note-item";

                    const noteContent = document.createElement("span");
                    noteContent.innerHTML = note.content;
                    noteItem.appendChild(noteContent);

                    const noteOptions = document.createElement("div");
                    noteOptions.className = "note-options";

                    const editButton = document.createElement("button");
                    editButton.className = "edit-note-button note-op-btn";
                    editButton.innerHTML = '<i class="fi fi-rr-pencil"></i>';
                    editButton.title = "Edit Note";

                    const saveButton = document.createElement("button");
                    saveButton.className = "save-note-button note-op-btn";
                    saveButton.innerHTML = '<i class="fi fi-rr-check"></i>';
                    saveButton.title = "Save Note";
                    saveButton.style.display = "none";

                    const discardButton = document.createElement("button");
                    discardButton.className = "discard-note-button note-op-btn";
                    discardButton.innerHTML = '<i class="fi fi-rr-cross-small"></i>';
                    discardButton.title = "Discard Changes";
                    discardButton.style.display = "none";

                    const copyButton = document.createElement("button");
                    copyButton.className = "copy-note-button note-op-btn";
                    copyButton.innerHTML = '<i class="fi fi-rr-copy"></i>';
                    copyButton.title = "Copy Note";
                    copyButton.addEventListener("click", () => {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = note.content;
                        const textToCopy = tempDiv.textContent || tempDiv.innerText || '';

                        navigator.clipboard.writeText(textToCopy).then(() => {
                            copyButton.innerHTML = '<i class="fi fi-rr-check"></i>';
                            copyButton.title = "Copied!";
                            copyButton.classList.add("copied");
                            setTimeout(() => {
                                copyButton.innerHTML = '<i class="fi fi-rr-copy"></i>';
                                copyButton.title = "Copy Note";
                                copyButton.classList.remove("copied");
                            }, 2000);
                        }).catch(err => {
                            console.error('Failed to copy text: ', err);
                            copyButton.title = "Failed to copy";
                            setTimeout(() => {
                                copyButton.title = "Copy Note";
                            }, 2000);
                        });
                    });

                    const visitNoteButton = document.createElement("button");
                    visitNoteButton.className = "visit-note-button note-op-btn";
                    visitNoteButton.innerHTML = '<i class="fi fi-rr-arrow-up-right-from-square"></i>';
                    visitNoteButton.title = "Go to Note";
                    visitNoteButton.addEventListener("click", () => {
                        chrome.tabs.create({
                            url
                        });
                    });

                    if (typeof chrome === "undefined" || typeof chrome.tabs === "undefined") {
                        visitNoteButton.disabled = true;
                        visitNoteButton.title = "Navigation is disabled in development mode.";
                    }

                    const deleteButton = document.createElement("button");
                    deleteButton.className = "p-delete-note-btn note-op-btn";
                    deleteButton.innerHTML = '<i class="fi fi-rr-trash"></i>';
                    deleteButton.title = "Delete Note";
                    deleteButton.addEventListener("click", () => {
                        showPopupDeleteConfirmation(noteItem, () => {
                            deleteNote(url, note);
                        });
                    });

                    if (typeof chrome === "undefined" || typeof chrome.storage === "undefined") {
                        deleteButton.disabled = true;
                        deleteButton.title = "Deletion is disabled in development mode.";
                    }

                    let originalContent = note.content;

                    editButton.addEventListener("click", () => {
                        originalContent = noteContent.innerHTML;
                        noteContent.contentEditable = true;
                        noteContent.focus();
                        noteItem.classList.add('editing');
                        noteOptions.classList.add('editing');
                        editButton.style.display = "none";
                        saveButton.style.display = "flex";
                        discardButton.style.display = "flex";
                        copyButton.style.display = "none";
                        visitNoteButton.style.display = "none";
                        deleteButton.style.display = "none";
                    });

                    saveButton.addEventListener("click", () => {
                        noteContent.contentEditable = false;
                        noteItem.classList.remove('editing');
                        noteOptions.classList.remove('editing');
                        editButton.style.display = "flex";
                        saveButton.style.display = "none";
                        discardButton.style.display = "none";
                        copyButton.style.display = "flex";
                        visitNoteButton.style.display = "flex";
                        deleteButton.style.display = "flex";

                        const newContent = noteContent.innerHTML;
                        updateNoteContent(url, note, newContent);
                        note.content = newContent; // Update closure variable
                    });

                    discardButton.addEventListener("click", () => {
                        noteContent.innerHTML = originalContent;
                        noteContent.contentEditable = false;
                        noteItem.classList.remove('editing');
                        noteOptions.classList.remove('editing');
                        editButton.style.display = "flex";
                        saveButton.style.display = "none";
                        discardButton.style.display = "none";
                        copyButton.style.display = "flex";
                        visitNoteButton.style.display = "flex";
                        deleteButton.style.display = "flex";
                    });

                    noteOptions.appendChild(editButton);
                    noteOptions.appendChild(saveButton);
                    noteOptions.appendChild(discardButton);
                    noteOptions.appendChild(copyButton);
                    noteOptions.appendChild(visitNoteButton);
                    noteOptions.appendChild(deleteButton);

                    noteItem.appendChild(noteOptions);
                    notesWrapper.appendChild(noteItem); // Append notes to the wrapper
                });
            });

            notesContainer.appendChild(domainContainer);
        }

        if (notesContainer.innerHTML === "") {
            const noNotesMessage = document.createElement("div");
            noNotesMessage.className = "no-notes-message";
            noNotesMessage.textContent = "Oops! Your sticky note board is squeaky clean 🧼. Start scribbling to add some magic!";
            notesContainer.appendChild(noNotesMessage);
        }
    }

    /**
     * Updates the stored list of collapsed domains.
     * @param {string} domain - The domain to add or remove.
     * @param {boolean} isCollapsed - Whether the domain is now collapsed.
     */
    function updateCollapsedState(domain, isCollapsed) {
        if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
            console.warn("Storage API not available. Cannot save collapsed state.");
            return;
        }

        chrome.storage.local.get({ collapsed_domains: [] }, (data) => {
            if (chrome.runtime.lastError) {
                console.error("Error getting collapsed state:", chrome.runtime.lastError);
                return;
            }

            const collapsedDomains = data.collapsed_domains;
            const domainIndex = collapsedDomains.indexOf(domain);

            if (isCollapsed && domainIndex === -1) {
                // Add to list if it's collapsed and not already there
                collapsedDomains.push(domain);
            } else if (!isCollapsed && domainIndex > -1) {
                // Remove from list if it's expanded and was in the list
                collapsedDomains.splice(domainIndex, 1);
            }

            chrome.storage.local.set({ collapsed_domains: collapsedDomains }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error saving collapsed state:", chrome.runtime.lastError);
                }
            });
        });
    }

    /**
     * Loads notes from storage, or uses mock data if storage is unavailable.
     */
    function loadNotes() {
        // Check if we are in a real extension environment
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(null, (data) => {
                if (chrome.runtime.lastError) {
                    console.error("Error retrieving data:", chrome.runtime.lastError);
                    return;
                }
                const collapsedDomains = data.collapsed_domains || [];
                const notesData = { ...data };
                delete notesData.collapsed_domains; // Separate notes from state

                renderNotes(notesData, collapsedDomains);
            });
        } else {
            // Fallback to mock data for local development/testing
            console.warn("chrome.storage.local API not available. Loading mock data for development.");
            renderNotes(mockNotesData, []);
        }
    }

    /**
     * Updates the content of a specific note.
     * @param {string} url - The URL associated with the note.
     * @param {object} originalNote - The original note object to identify it.
     * @param {string} newContent - The new HTML content for the note.
     */
    function updateNoteContent(url, originalNote, newContent) {
        if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
            console.warn("Storage API not available. Cannot update note.");
            return;
        }

        chrome.storage.local.get(url, (data) => {
            if (chrome.runtime.lastError) {
                console.error("Error retrieving notes for update:", chrome.runtime.lastError);
                return;
            }

            const notes = data[url] || [];
            const noteIndex = notes.findIndex(
                (note) =>
                note.content === originalNote.content &&
                note.top === originalNote.top &&
                note.left === originalNote.left
            );

            if (noteIndex > -1) {
                notes[noteIndex].content = newContent;

                chrome.storage.local.set({ [url]: notes }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("Error saving updated note:", chrome.runtime.lastError);
                    }
                });
            } else {
                console.warn("Could not find the note to update. It might have been edited in another tab. Reloading notes.", originalNote);
                loadNotes(); // Fallback to reload all notes if something is out of sync
            }
        });
    }

    /**
     * Deletes a specific note for a given URL and refreshes the display.
     * @param {string} url - The URL associated with the note.
     * @param {object} noteToDelete - The note to delete (identified by content and position).
     */
    function deleteNote(url, noteToDelete) {
        chrome.storage.local.get(url, (data) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "Error retrieving notes for deletion:",
                    chrome.runtime.lastError
                );
                return;
            }

            const notes = data[url] || [];
            const updatedNotes = notes.filter(
                (note) =>
                note.content !== noteToDelete.content ||
                note.top !== noteToDelete.top ||
                note.left !== noteToDelete.left
            );

            if (updatedNotes.length === 0) {
                // Remove the URL if no notes are left
                chrome.storage.local.remove(url, () => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            "Error removing URL from storage:",
                            chrome.runtime.lastError
                        );
                    } else {
                        loadNotes(); // Refresh the display
                    }
                });
            } else {
                // Update the remaining notes
                chrome.storage.local.set({ 
                        [url]: updatedNotes,
                    },
                    () => {
                        if (chrome.runtime.lastError) {
                            console.error(
                                "Error saving updated notes:",
                                chrome.runtime.lastError
                            );
                        } else {
                            loadNotes(); // Refresh the display
                        }
                    }
                );
            }
        });
    }

    // Load notes when the popup is opened
    loadNotes();
});
