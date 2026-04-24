import "/canx-sdk.v1.js";
import { getSession, startGoogleSignIn, signOut } from "../supabase/auth.js";
import { selectRows, insertRows, SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase/client.js";

document.addEventListener("DOMContentLoaded", () => {
  const notesContainer = document.getElementById("notes-container");
  const searchInput = document.getElementById("search-input");
  let allNotesData = {}; // To cache all notes from storage
  let collapsedDomainsState = []; // To cache the collapsed state
  let saveTimeout = null; // Timer for debouncing save operations
  let currentUser = null;

  const authContainer = document.getElementById("auth-container");
  const googleBtn = document.getElementById("google-btn");
  const accountSection = document.getElementById("account-section");
  const migrationPrompt = document.getElementById("migration-prompt");

  const canxContainer = document.getElementById("canx-ad-banner-slot");

  // Initialize the CANX ad network
  const adNetwork = new CANX({
    apiKey: "83b1a3440da12c44cd2f847e942d6b02",
    debug: false,
  });

  // Render the ad
  if (canxContainer) {
    adNetwork.renderAd(canxContainer, {
      format: "BANNER",
      placement: "popup_main", // optional analytics tag
    });
  }

  // Mock data for development when chrome.storage is not available
  const mockNotesData = {
    "https://developer.chrome.com/docs/extensions": [
      {
        content:
          "This is a mock note about Chrome extensions. Great for UI development!",
        top: "150px",
        left: "200px",
      },
    ],
    "https://www.google.com/search?q=mock+data": [
      {
        content:
          "A sticky note for Google! This is a sample note to show how content is displayed.",
        top: "100px",
        left: "50px",
      },
      {
        content:
          'Another note on Google. You can have multiple notes per page. <b style="font-weight: bold;">HTML content</b> like bold text is also supported.',
        top: "300px",
        left: "250px",
      },
    ],
    "https://partnerflow.co.za/": [
      {
        content:
          "This is a note on partnerflow.co.za. The popup groups notes by the main domain.",
        top: "220px",
        left: "400px",
      },
    ],
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
    if (noteItem.querySelector(".popup-delete-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "popup-delete-overlay";

    const modal = document.createElement("div");
    modal.className = "popup-delete-modal";
    modal.innerHTML = `
            <div class="popup-modal-buttons">
                <button class="confirm-delete" title="Confirm Delete"><i class="fi fi-rr-check"></i></button>
                <button class="cancel-delete" title="Cancel"><i class="fi fi-rr-cross-small"></i></button>
            </div>
        `;

    overlay.appendChild(modal);
    noteItem.appendChild(overlay);

    // Trigger transition
    setTimeout(() => overlay.classList.add("active"), 10);

    const closeOverlay = () => {
      overlay.classList.remove("active");
      setTimeout(() => overlay.remove(), 250);
    };

    modal.querySelector(".confirm-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      onConfirm();
      closeOverlay();
    });

    modal.querySelector(".cancel-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      closeOverlay();
    });
  }

  /**
   * Renders notes in the popup, grouped by their main domain.
   * @param {object} notesData - The notes data from storage or mock data.
   * @param {string[]} [collapsedDomains=[]] - An array of domains that should be collapsed.
   * @param {boolean} [isSearchResult=false] - Flag to indicate if the data is from a search.
   */
  function renderNotes(
    notesData,
    collapsedDomains = [],
    isSearchResult = false,
  ) {
    notesContainer.innerHTML = "";

    // Filter out any URLs that have empty note arrays to be safe
    const nonEmptyNotesData = Object.fromEntries(
      Object.entries(notesData).filter(
        ([, notes]) => Array.isArray(notes) && notes.length > 0,
      ),
    );

    if (Object.keys(nonEmptyNotesData).length === 0) {
      const noNotesMessage = document.createElement("div");
      noNotesMessage.className = "no-notes-message";
      if (isSearchResult) {
        noNotesMessage.textContent = "No notes found matching your search. 🕵️‍♂️";
      } else {
        noNotesMessage.textContent =
          "Oops! Your sticky note board is squeaky clean 🧼. Start scribbling to add some magic!";
      }
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
        notes,
      });
    }

    const sortedDomains = Object.keys(groupedNotes).sort((a, b) =>
      a.localeCompare(b),
    );
    for (const domain of sortedDomains) {
      const entries = groupedNotes[domain];
      const totalNotes = entries.reduce(
        (sum, entry) => sum + entry.notes.length,
        0,
      );
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
        updateCollapsedState(
          domain,
          domainContainer.classList.contains("collapsed"),
        );
      });

      domainContainer.appendChild(domainHeader);
      domainContainer.appendChild(notesList);
      notesList.appendChild(notesWrapper); // The wrapper is the single child of the grid container

      entries.forEach(({ url, notes }) => {
        notes.forEach((note) => {
          const noteItem = document.createElement("div");
          noteItem.className = "note-item";
          noteItem.style.borderLeft = `4px solid ${note.color || "#ffd165"}`;

          const noteTitle = document.createElement("div");
          noteTitle.className = "note-item-title";
          noteTitle.textContent = note.title || "Note";
          noteItem.appendChild(noteTitle);

          const contentContainer = document.createElement("div");
          contentContainer.className = "note-content-container";

          const noteContent = document.createElement("span");
          noteContent.innerHTML = note.content;
          contentContainer.appendChild(noteContent);
          noteItem.appendChild(contentContainer);

          // Add a "Show more" button if the content overflows
          // Check after appending to noteItem so we have dimensions
          requestAnimationFrame(() => {
            if (contentContainer.scrollHeight > 120) {
              contentContainer.classList.add("is-truncated");

              const showMoreWrapper = document.createElement("div");
              showMoreWrapper.className = "show-more-container";

              const showMoreBtn = document.createElement("button");
              showMoreBtn.className = "show-more-btn";
              showMoreBtn.textContent = "Show more";

              showMoreBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const isExpanded =
                  contentContainer.classList.toggle("expanded");
                showMoreBtn.classList.toggle("active");
                showMoreBtn.textContent = isExpanded
                  ? "Show less"
                  : "Show more";
              });

              showMoreWrapper.appendChild(showMoreBtn);
              noteItem.insertBefore(showMoreWrapper, noteOptions);
            }
          });

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
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = note.content;
            const textToCopy = tempDiv.textContent || tempDiv.innerText || "";

            navigator.clipboard
              .writeText(textToCopy)
              .then(() => {
                copyButton.innerHTML = '<i class="fi fi-rr-check"></i>';
                copyButton.title = "Copied!";
                copyButton.classList.add("copied");
                setTimeout(() => {
                  copyButton.innerHTML = '<i class="fi fi-rr-copy"></i>';
                  copyButton.title = "Copy Note";
                  copyButton.classList.remove("copied");
                }, 2000);
              })
              .catch((err) => {
                console.error("Failed to copy text: ", err);
                copyButton.title = "Failed to copy";
                setTimeout(() => {
                  copyButton.title = "Copy Note";
                }, 2000);
              });
          });

          const visitNoteButton = document.createElement("button");
          visitNoteButton.className = "visit-note-button note-op-btn";
          visitNoteButton.innerHTML =
            '<i class="fi fi-rr-arrow-up-right-from-square"></i>';
          visitNoteButton.title = "Go to Note";
          visitNoteButton.addEventListener("click", () => {
            chrome.tabs.create({
              url,
            });
          });

          if (
            typeof chrome === "undefined" ||
            typeof chrome.tabs === "undefined"
          ) {
            visitNoteButton.disabled = true;
            visitNoteButton.title =
              "Navigation is disabled in development mode.";
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

          if (
            typeof chrome === "undefined" ||
            typeof chrome.storage === "undefined"
          ) {
            deleteButton.disabled = true;
            deleteButton.title = "Deletion is disabled in development mode.";
          }

          let originalContent = note.content;

          editButton.addEventListener("click", () => {
            originalContent = noteContent.innerHTML;
            noteContent.contentEditable = true;
            noteContent.focus();
            noteItem.classList.add("editing");
            contentContainer.classList.add("expanded"); // Always expand while editing
            noteOptions.classList.add("editing");
            editButton.style.display = "none";
            saveButton.style.display = "flex";
            discardButton.style.display = "flex";
            copyButton.style.display = "none";
            visitNoteButton.style.display = "none";
            deleteButton.style.display = "none";
          });

          saveButton.addEventListener("click", () => {
            noteContent.contentEditable = false;
            noteItem.classList.remove("editing");
            noteOptions.classList.remove("editing");
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
            noteItem.classList.remove("editing");
            // If there's a show more button, and it wasn't expanded, collapse it back
            const showBtn = noteItem.querySelector(".show-more-btn");
            if (showBtn && !showBtn.classList.contains("active")) {
              contentContainer.classList.remove("expanded");
            }
            noteOptions.classList.remove("editing");
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
      noNotesMessage.textContent =
        "Oops! Your sticky note board is squeaky clean 🧼. Start scribbling to add some magic!";
      notesContainer.appendChild(noNotesMessage);
    }
  }

  /**
   * Updates the stored list of collapsed domains.
   * @param {string} domain - The domain to add or remove.
   * @param {boolean} isCollapsed - Whether the domain is now collapsed.
   */
  function updateCollapsedState(domain, isCollapsed) {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.sync
    ) {
      console.warn("Storage API not available. Cannot save collapsed state.");
      return;
    }

    chrome.storage.sync.get({ collapsed_domains: [] }, (data) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error getting collapsed state:",
          chrome.runtime.lastError,
        );
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

      chrome.storage.sync.set({ collapsed_domains: collapsedDomains }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error saving collapsed state:",
            chrome.runtime.lastError,
          );
        }
      });
    });
  }

  /**
   * Fetches notes from Supabase for the current user.
   * @param {string} accessToken
   */
  async function loadSupabaseNotes(accessToken) {
    try {
      const rows = await selectRows("sticky_notes", "", accessToken);

      // Fetch collapsed state from storage
      const storageData = await new Promise((resolve) => {
        chrome.storage.sync.get("collapsed_domains", (data) => resolve(data));
      });
      collapsedDomainsState = storageData.collapsed_domains || [];

      // Group by URL to match the expected format
      const notesData = {};
      rows.forEach((row) => {
        if (!notesData[row.url]) notesData[row.url] = [];
        notesData[row.url].push({
          id: row.id,
          title: row.title,
          content: row.content,
          color: row.color,
          top: row.top,
          left: row.left,
          collapsed: row.collapsed,
        });
      });
      allNotesData = notesData;
      filterAndRenderNotes(searchInput.value);
    } catch (e) {
      console.error("Failed to load Supabase notes:", e);
    }
  }

  /**
   * Renders the skeleton loading UI.
   */
  function showSkeletonLoader() {
    notesContainer.innerHTML = `
      <div class="skeleton-container">
        <div class="skeleton-domain">
          <div class="skeleton-domain-header"></div>
          <div class="skeleton-note">
            <div class="skeleton-note-title"></div>
            <div class="skeleton-note-line"></div>
            <div class="skeleton-note-line short"></div>
          </div>
          <div class="skeleton-note">
            <div class="skeleton-note-title"></div>
            <div class="skeleton-note-line"></div>
          </div>
        </div>
        <div class="skeleton-domain">
          <div class="skeleton-domain-header" style="width: 100px;"></div>
          <div class="skeleton-note">
            <div class="skeleton-note-title"></div>
            <div class="skeleton-note-line"></div>
            <div class="skeleton-note-line"></div>
            <div class="skeleton-note-line short"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Loads notes from storage, or uses mock data if storage is unavailable.
   */
  async function loadNotes() {
    showSkeletonLoader();

    const session = await getSession();
    currentUser = session?.user || null;

    // Unified Migration Prompt Visibility Logic
    const storageKeys = {
      sync: ["migration_log"],
      local: ["migration_dismissed"],
    };
    const [syncData, localData, allSyncData] = await Promise.all([
      new Promise((resolve) =>
        chrome.storage.sync.get(storageKeys.sync, resolve),
      ),
      new Promise((resolve) =>
        chrome.storage.local.get(storageKeys.local, resolve),
      ),
      new Promise((resolve) => chrome.storage.sync.get(null, resolve)),
    ]);

    const isMigrated = !!syncData.migration_log;
    const isDismissed = !!localData.migration_dismissed;
    const hasLocalNotes = Object.keys(allSyncData).some(
      (key) =>
        !["collapsed_domains", "migration_log"].includes(key) &&
        Array.isArray(allSyncData[key]) &&
        allSyncData[key].length > 0,
    );

    const shouldShowPrompt = !isMigrated && !isDismissed && hasLocalNotes;

    if (shouldShowPrompt) {
      if (migrationPrompt) migrationPrompt.style.display = "flex";
      if (accountSection) accountSection.style.display = "flex";
    } else {
      if (migrationPrompt) migrationPrompt.style.display = "none";
      // Only hide accountSection if it doesn't contain other future tools/info
      if (accountSection) accountSection.style.display = "none";
    }

    if (currentUser && session?.access_token) {
      authContainer.style.display = "flex";
      // Account section visibility is handled by shouldShowPrompt above
      googleBtn.innerHTML =
        '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo"> Sign out';

      await loadSupabaseNotes(session.access_token);
      return;
    }

    // Show login button if not signed in
    authContainer.style.display = "flex";
    googleBtn.innerHTML =
      '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo"> Sign in';

    // Check if we are in a real extension environment
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      const notesData = { ...allSyncData };
      const collapsedDomainsState = allSyncData.collapsed_domains || [];
      delete notesData.collapsed_domains;
      delete notesData.migration_log;

      allNotesData = notesData;
      filterAndRenderNotes(searchInput.value);
    } else {
      // Fallback to mock data for local development/testing
      console.warn(
        "chrome.storage.sync API not available. Loading mock data for development.",
      );
      allNotesData = mockNotesData;
      filterAndRenderNotes(searchInput.value);
    }
  }

  /**
   * Filters notes based on a search term and re-renders the list.
   * @param {string} searchTerm - The term to filter by.
   */
  function filterAndRenderNotes(searchTerm) {
    if (!searchTerm) {
      renderNotes(allNotesData, collapsedDomainsState);
      return;
    }

    const filteredData = {};
    const term = searchTerm.toLowerCase();

    for (const [url, notes] of Object.entries(allNotesData)) {
      const domain = getMainDomain(url) || url;

      // Check if the domain itself matches the search term
      const domainMatches = domain.toLowerCase().includes(term);

      // Filter notes within this URL that match the content
      const matchingNotes = notes.filter((note) => {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = note.content;
        const noteText = tempDiv.textContent || tempDiv.innerText || "";
        const noteTitle = note.title || "";
        return (
          noteText.toLowerCase().includes(term) ||
          noteTitle.toLowerCase().includes(term) ||
          domainMatches // Include notes if the domain itself matches
        );
      });

      // If the domain matches or there are matching notes, add them
      if (domainMatches || matchingNotes.length > 0) {
        // If domain matches, add all notes; otherwise, add only matching notes
        filteredData[url] = domainMatches ? notes : matchingNotes;
      }
    }

    // When searching, expand all groups to show results.
    renderNotes(filteredData, [], true);
  }

  // Add event listener for the search input
  searchInput.addEventListener("input", () => {
    filterAndRenderNotes(searchInput.value);
  });

  /**
   * Updates the content of a specific note.
   * @param {string} url - The URL associated with the note.
   * @param {object} originalNote - The original note object to identify it.
   * @param {string} newContent - The new HTML content for the note.
   */
  async function updateNoteContent(url, originalNote, newContent) {
    if (currentUser) {
      try {
        await chrome.runtime.sendMessage({
          action: "supabaseAction",
          method: "PATCH",
          table: "sticky_notes",
          query: `id=eq.${originalNote.id}`,
          body: { content: newContent },
        });
        return;
      } catch (e) {
        console.error("Supabase update failed:", e);
      }
    }

    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.sync
    ) {
      console.warn("Storage API not available. Cannot update note.");
      return;
    }

    chrome.storage.sync.get(url, (data) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error retrieving notes for update:",
          chrome.runtime.lastError,
        );
        return;
      }

      const notes = data[url] || [];
      // Find note by position and title. Content can be stale if edited in another tab/page.
      const noteIndex = notes.findIndex(
        (note) =>
          note.top === originalNote.top &&
          note.left === originalNote.left &&
          note.title === originalNote.title,
      );

      if (noteIndex > -1) {
        notes[noteIndex].content = newContent;

        chrome.storage.sync.set({ [url]: notes }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error saving updated note:",
              chrome.runtime.lastError.message,
            );
          }
        });
      } else {
        console.warn(
          "Could not find the note to update. It might have been edited in another tab. Reloading notes.",
          originalNote,
        );
        loadNotes(); // Fallback to reload all notes if something is out of sync
      }
    });
  }

  /**
   * Deletes a specific note for a given URL and refreshes the display.
   * @param {string} url - The URL associated with the note.
   * @param {object} noteToDelete - The note to delete (identified by content and position).
   */
  async function deleteNote(url, noteToDelete) {
    if (currentUser && noteToDelete.id) {
      try {
        await chrome.runtime.sendMessage({
          action: "supabaseAction",
          method: "DELETE",
          table: "sticky_notes",
          query: `id=eq.${noteToDelete.id}`,
        });
        loadNotes();
        return;
      } catch (e) {
        console.error("Supabase delete failed:", e);
      }
    }

    chrome.storage.sync.get(url, (data) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error retrieving notes for deletion:",
          chrome.runtime.lastError,
        );
        return;
      }

      const notes = data[url] || [];
      // Find the index of the note to delete using stable properties to avoid ambiguity
      const noteIndexToDelete = notes.findIndex(
        (note) =>
          note.top === noteToDelete.top &&
          note.left === noteToDelete.left &&
          note.title === noteToDelete.title,
      );

      if (noteIndexToDelete === -1) {
        console.warn(
          "Could not find the note to delete. It might have been modified. Reloading notes.",
          noteToDelete,
        );
        loadNotes();
        return; // Stop execution to prevent deleting the wrong note
      }

      // Create a new array with the note removed.
      const updatedNotes = notes.filter(
        (_, index) => index !== noteIndexToDelete,
      );

      if (updatedNotes.length === 0) {
        // Remove the URL if no notes are left
        chrome.storage.sync.remove(url, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error removing URL from storage:",
              chrome.runtime.lastError,
            );
          } else {
            loadNotes(); // Refresh the display
          }
        });
      } else {
        // Update the remaining notes
        chrome.storage.sync.set(
          {
            [url]: updatedNotes,
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error saving updated notes:",
                chrome.runtime.lastError.message,
              );
            }
          },
        );
      }
    });
  }

  /**
   * Debounced helper for storage operations.
   * Note: For simple edits, we might still want immediate saves,
   * but this helps if user is clicking around rapidly.
   */
  function debouncedLoadNotes() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      loadNotes();
    }, 1000);
  }

  // Listen for changes in storage to keep the popup in sync
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "sync") {
      const changedKeys = Object.keys(changes);

      // If ONLY the collapsed state changed, we don't need to completely rebuild the DOM.
      // The visual toggle is already handled by the click event. Rebuilding clears search state.
      if (changedKeys.length === 1 && changedKeys[0] === "collapsed_domains") {
        collapsedDomainsState = changes.collapsed_domains.newValue || [];
        return;
      }

      console.log("Storage changed, reloading popup data.");
      loadNotes();
    }
  });

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "supabaseChange") {
      console.log("Supabase Realtime change detected, reloading popup.");
      loadNotes();
    }
  });

  const logoutModal = document.getElementById("logout-modal");
  const confirmLogoutBtn = document.getElementById("confirm-logout-btn");
  const cancelLogoutBtn = document.getElementById("cancel-logout-btn");

  function showLogoutModal() {
    logoutModal.style.display = "flex";
    setTimeout(() => logoutModal.classList.add("active"), 10);
  }

  function hideLogoutModal() {
    logoutModal.classList.remove("active");
    setTimeout(() => (logoutModal.style.display = "none"), 300);
  }

  confirmLogoutBtn.addEventListener("click", async () => {
    hideLogoutModal();
    await signOut();
    currentUser = null;
    loadNotes();
  });

  cancelLogoutBtn.addEventListener("click", () => {
    hideLogoutModal();
  });

  googleBtn.addEventListener("click", async () => {
    if (currentUser) {
      showLogoutModal();
    } else {
      await startGoogleSignIn();
    }
  });

  const dismissMigrationBtn = document.getElementById("dismiss-migration-btn");
  if (dismissMigrationBtn) {
    dismissMigrationBtn.addEventListener("click", () => {
      chrome.storage.local.set({ migration_dismissed: true }, () => {
        if (migrationPrompt) migrationPrompt.style.display = "none";
        if (accountSection) accountSection.style.display = "none";
      });
    });
  }

  // --- Notification System ---
  const notificationBtn = document.getElementById("notification-btn");
  const notificationDropdown = document.getElementById("notification-dropdown");
  const notificationBadge = document.getElementById("notification-badge");
  const notificationList = document.getElementById("notification-list");
  const markAllReadBtn = document.getElementById("mark-all-read-btn");

  let notifications = [];
  let userPlan = "free";

  const NotificationManager = {
    async init() {
      this.attachEventListeners();
      await this.load();
    },

    attachEventListeners() {
      notificationBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isVisible = notificationDropdown.style.display === "flex";
        notificationDropdown.style.display = isVisible ? "none" : "flex";
        if (!isVisible) this.render();
      });

      document.addEventListener("click", (e) => {
        if (!notificationDropdown.contains(e.target) && e.target !== notificationBtn) {
          notificationDropdown.style.display = "none";
        }
      });

      markAllReadBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.markAllAsRead();
      });
    },

    async load() {
      try {
        const session = await getSession();
        const isGuest = !session?.user;

        // Fetch user plan if signed in
        if (!isGuest) {
          const userProfile = await selectRows(
            "stickynotes_users",
            `id=eq.${session.user.id}`,
            session.access_token,
          );
          userPlan = userProfile?.[0]?.plan || "free";
        }

        // Fetch all relevant notifications
        const allNotifications = await selectRows(
          "stickynotes_notifications",
          "order=created_at.desc",
        );

        // Filter based on user status and plan
        notifications = allNotifications.filter((n) => {
          if (n.target_group === "all") return true;
          if (isGuest) return false;
          if (n.target_group === "signed_up") return true;
          return n.target_group === userPlan;
        });

        await this.updateBadge();
      } catch (err) {
        console.error("Error loading notifications:", err);
      }
    },

    async updateBadge() {
      const readIds = await this.getReadIds();
      const unreadCount = notifications.filter(
        (n) => !readIds.includes(n.id),
      ).length;

      if (unreadCount > 0) {
        notificationBadge.style.display = "flex";
      } else {
        notificationBadge.style.display = "none";
      }
    },

    async getReadIds() {
      const session = await getSession();
      if (!session?.user) {
        const data = await new Promise((r) =>
          chrome.storage.local.get("read_notifications", r),
        );
        return data.read_notifications || [];
      } else {
        try {
          const reads = await selectRows(
            "stickynotes_notification_reads",
            `user_id=eq.${session.user.id}`,
            session.access_token,
          );
          return reads.map((r) => r.notification_id);
        } catch (e) {
          console.error("Error fetching read status:", e);
          return [];
        }
      }
    },

    async markAllAsRead() {
      const session = await getSession();
      const unreadIds = await this.getUnreadIds();

      if (unreadIds.length === 0) return;

      if (!session?.user) {
        const readIds = await this.getReadIds();
        const newReadIds = [...new Set([...readIds, ...unreadIds])];
        await new Promise((r) =>
          chrome.storage.local.set({ read_notifications: newReadIds }, r),
        );
      } else {
        // Use insertRows for each to handle read status
        // Alternatively, a bulk insert could be done if the API supports it cleanly
        for (const id of unreadIds) {
          await this.markAsRead(id, session);
        }
      }

      await this.updateBadge();
      this.render();
    },

    async getUnreadIds() {
      const readIds = await this.getReadIds();
      return notifications.map((n) => n.id).filter((id) => !readIds.includes(id));
    },

    async render() {
      const readIds = await this.getReadIds();
      notificationList.innerHTML = "";

      if (notifications.length === 0) {
        notificationList.innerHTML = `
          <div class="empty-notifications">
            <i class="fi fi-rr-bell"></i>
            <p>No notifications yet</p>
          </div>
        `;
        return;
      }

      notifications.forEach((n) => {
        const isUnread = !readIds.includes(n.id);
        const item = document.createElement("div");
        item.className = `notification-item ${isUnread ? "unread" : ""}`;
        item.innerHTML = `
          <h4>${n.title}</h4>
          <p>${n.message}</p>
          <span class="time">${new Date(n.created_at).toLocaleDateString()}</span>
        `;

        item.addEventListener("click", async () => {
          if (isUnread) {
            await this.markAsRead(n.id);
            this.render();
          }
        });

        notificationList.appendChild(item);
      });
    },

    async markAsRead(id, providedSession = null) {
      const session = providedSession || (await getSession());
      if (!session?.user) {
        const readIds = await this.getReadIds();
        if (!readIds.includes(id)) {
          readIds.push(id);
          await new Promise((r) =>
            chrome.storage.local.set({ read_notifications: readIds }, r),
          );
        }
      } else {
        try {
          // Manually handle UPSERT via fetch to use "resolution=merge-duplicates"
          await fetch(`${SUPABASE_URL}/rest/v1/stickynotes_notification_reads`, {
            method: "POST",
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates",
            },
            body: JSON.stringify({ user_id: session.user.id, notification_id: id }),
          });
        } catch (e) {
          console.error("Error marking as read:", e);
        }
      }
      await this.updateBadge();
    },
  };

  // Initialize notifications
  NotificationManager.init();

  // Load notes when the popup is opened
  loadNotes();
});
