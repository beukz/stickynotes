document.addEventListener("DOMContentLoaded", () => {
  const notesContainer = document.getElementById("notes-container");

  /**
   * Extracts the main domain from a given URL.
   * @param {string} url - The URL to process.
   * @returns {string|null} - The main domain (e.g., https://example.com) or null for invalid URLs.
   */
  function getMainDomain(url) {
    try {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        // Assume http:// for URLs without a protocol
        url = `http://${url}`;
      }
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch (error) {
      console.warn("Invalid URL encountered:", url, error);
      return null; // Return null for invalid URLs
    }
  }

  /**
   * Renders notes in the popup, grouped by their main domain.
   * Filters out domains with no notes.
   */
  function loadNotes() {
    chrome.storage.local.get(null, (data) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error retrieving notes from storage:",
          chrome.runtime.lastError
        );
        return;
      }

      // Clear existing content
      notesContainer.innerHTML = "";

      // Group notes by domain
      const groupedNotes = {};
      for (const [url, notes] of Object.entries(data)) {
        const mainDomain = getMainDomain(url);
        if (!mainDomain) continue; // Skip invalid URLs
        if (!groupedNotes[mainDomain]) groupedNotes[mainDomain] = [];
        groupedNotes[mainDomain].push({ url, notes });
      }

      // Render each domain and its notes
      for (const [domain, entries] of Object.entries(groupedNotes)) {
        // Skip rendering domains with no notes
        const totalNotes = entries.reduce((sum, entry) => sum + entry.notes.length, 0);
        if (totalNotes === 0) continue;

        // Create domain container
        const domainContainer = document.createElement("div");
        domainContainer.className = "domain-container";

        // Add domain title with a visit button
        const domainTitle = document.createElement("h3");
        domainTitle.textContent = domain;
        domainContainer.appendChild(domainTitle);

        const visitDomainButton = document.createElement("button");
        visitDomainButton.className = "visit-button";
        visitDomainButton.textContent = "Visit";
        visitDomainButton.addEventListener("click", () => {
          chrome.tabs.create({ url: domain });
        });
        domainContainer.appendChild(visitDomainButton);

        // Add notes under the domain
        entries.forEach(({ url, notes }) => {
          notes.forEach((note) => {
            const noteItem = document.createElement("div");
            noteItem.className = "note-item";

            // Note content
            const noteContent = document.createElement("span");
            noteContent.innerHTML = note.content; // Preserve formatting
            noteItem.appendChild(noteContent);

            // Note options container (delete, etc.)
            const noteOptions = document.createElement("div");
            noteOptions.className = "note-options"; // Initially hidden, CSS will manage visibility


            // Visit specific note page button inside note options
            const visitNoteButton = document.createElement("button");
            visitNoteButton.className = "visit-note-button note-op-btn";
            visitNoteButton.textContent = "Go to Note";
            visitNoteButton.addEventListener("click", () => {
              chrome.tabs.create({ url });
            });
            noteOptions.appendChild(visitNoteButton);

            // Delete button inside note options
            const deleteButton = document.createElement("button");
            deleteButton.className = "p-delete-note-btn note-op-btn";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => {
              deleteNote(url, note);
            });
            noteOptions.appendChild(deleteButton);

            // Append the note options to the note item
            noteItem.appendChild(noteOptions);

            // Append the note item to the domain container
            domainContainer.appendChild(noteItem);

            // Add event listener to toggle 'active' class for note options
            noteItem.addEventListener("mouseenter", () => {
              noteOptions.classList.add("active");
            });

            noteItem.addEventListener("mouseleave", () => {
              noteOptions.classList.remove("active");
            });
          });
        });

        // Append the domain container to the notes container
        notesContainer.appendChild(domainContainer);
      }

      // If no notes are found, display a message
      if (notesContainer.innerHTML === "") {
        const noNotesMessage = document.createElement("div");
        noNotesMessage.className = "no-notes-message";
        noNotesMessage.textContent = "No sticky notes saved yet!";
        notesContainer.appendChild(noNotesMessage);
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
        chrome.storage.local.set({ [url]: updatedNotes }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error saving updated notes:",
              chrome.runtime.lastError
            );
          } else {
            loadNotes(); // Refresh the display
          }
        });
      }
    });
  }

  // Load notes when the popup is opened
  loadNotes();
});
