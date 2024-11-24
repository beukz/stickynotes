(function () {
  let lastUrl = window.location.href; // Cache the last known URL

  window.onload = function () {
    try {

      injectNewNoteButton();
      loadNotes();
      observeUrlChanges(); // Watch for dynamic URL changes
    } catch (error) {
      console.error("Error during window.onload:", error);
    }
  };


  function injectNewNoteButton() {
    try {
      const button = document.createElement("button");
      button.id = "appedle-new-note-btn";
      button.textContent = "New Note (Ctrl + Q)";
      button.style.position = "fixed";
      button.style.zIndex = "9999";
      // button.style.top = "10px";
      // button.style.right = "10px";
      button.style.display = 'none';
      document.body.appendChild(button);

      // Add click event listener for "New Note" button
      button.addEventListener("click", () => createStickyNote());

      // Add keyboard shortcut (Ctrl + Q) to create a new note
      document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === "q") {
          createStickyNote();
        }
      });
    } catch (error) {
      console.error("Error injecting 'New Note' button:", error);
    }
  }

  function loadNotes() {
    try {
      const urlKey = getEffectiveUrl(); // Get the effective URL key
      chrome.storage.local.get(urlKey, (data) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error loading notes from chrome.storage:",
            chrome.runtime.lastError
          );
          return;
        }

        const notes = data[urlKey] || [];
        removeAllStickyNotes(); // Ensure no leftover notes from the previous URL
        notes.forEach((note) => createStickyNote(note.content, note.top, note.left));
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
        })
      );

      const urlKey = getEffectiveUrl();
      chrome.storage.local.set({ [urlKey]: notes }, () => {
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

  function createStickyNote(content = "", top = null, left = null) {
    try {
      const note = document.createElement("div");
      note.className = "sticky-note";

      // Determine default position based on scroll position and viewport center
      const viewportTop = window.scrollY + window.innerHeight / 2 - 50; // Center vertically
      const viewportLeft = window.scrollX + window.innerWidth / 2 - 75; // Center horizontally

      note.style.top = top || `${viewportTop}px`; // Use given top or viewport center
      note.style.left = left || `${viewportLeft}px`; // Use given left or viewport center
      note.style.position = "absolute"; // Ensure absolute positioning
      note.style.zIndex = "9999"; // Ensure it's on top of other elements

      // Create the sticky note header
      const noteHeader = document.createElement("div");
      noteHeader.className = "note-header";

      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-sticky-div";

      const stickyCloseMenuBox = document.createElement("div");
      stickyCloseMenuBox.className = "sticky-close-menu-box";

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-note-btn ap-sticky-options";
      deleteButton.title = "Delete note";
      deleteButton.innerHTML = `<img src="https://ucktpuitdnqcqtg2.public.blob.vercel-storage.com/bin-icon-EWmPyvXJ3uLxwOU0l7K42iblggAFb1.svg" alt="Delete" />`;
      deleteButton.addEventListener("click", () => {
        try {
          note.remove();
          saveNotes();
        } catch (error) {
          console.error("Error deleting note:", error);
        }
      });

      stickyCloseMenuBox.appendChild(deleteButton);
      noteHeader.appendChild(emptyDiv);
      noteHeader.appendChild(stickyCloseMenuBox);

      // Sticky note content area
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

      // Append the sections to the note div
      note.appendChild(noteHeader); // Header with delete button
      note.appendChild(contentArea); // Content area for the note

      // Append sticky note to body
      document.body.appendChild(note);

      // Make note draggable across the webpage
      noteHeader.addEventListener("mousedown", (e) => {
        dragNote(e, note);
      });

      saveNotes();
    } catch (error) {
      console.error("Error creating sticky note:", error);
    }
  }

  function dragNote(e, note) {
    try {
      let offsetX = e.clientX - note.offsetLeft;
      let offsetY = e.clientY - note.offsetTop;

      function moveNote(e) {
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;

        // Prevent sticky note from overflowing the page horizontally (left or right)
        newX = Math.max(0, newX); // Prevent moving left
        newX = Math.min(newX, document.body.offsetWidth - note.offsetWidth); // Prevent moving right

        // Prevent sticky note from overflowing vertically (top or bottom)
        newY = Math.max(0, newY); // Prevent moving up
        newY = Math.min(newY, document.body.scrollHeight - note.offsetHeight); // Prevent moving down

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
      document.querySelectorAll(".sticky-note").forEach((note) => note.remove());
    } catch (error) {
      console.error("Error removing all sticky notes:", error);
    }
  }

  function getEffectiveUrl() {
    try {
      return window.location.href; // Save the full URL (including protocol and path)
    } catch (error) {
      console.error("Error getting effective URL:", error);
      return "unknown-url"; // Fallback key
    }
  }

  function observeUrlChanges() {
    try {
      const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          loadNotes();
        }
      });

      observer.observe(document, {
        subtree: true,
        childList: true,
      });
    } catch (error) {
      console.error("Error observing URL changes:", error);
    }
  }
})();
