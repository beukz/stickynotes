(function () {
    let lastUrl = window.location.href; // Cache the last known URL
  
    window.onload = function () {
      injectExternalCSS();
      injectNewNoteButton();
      loadNotes();
      observeUrlChanges(); // Watch for dynamic URL changes
    };
  
    function injectExternalCSS() {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://cdn-uicons.flaticon.com/2.6.0/uicons-regular-rounded/css/uicons-regular-rounded.css";
      document.head.appendChild(link);
    }
  
    function injectNewNoteButton() {
      const button = document.createElement("button");
      button.id = "appedle-new-note-btn";
      button.textContent = "New Note";
      button.style.position = "fixed";
      button.style.zIndex = "9999";
      button.style.top = "10px";
      button.style.left = "10px";
      document.body.appendChild(button);
  
      // Add click event listener for "New Note" button
      button.addEventListener("click", () => createStickyNote());
  
      // Add keyboard shortcut (Ctrl + Q) to create a new note
      document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === "q") {
          createStickyNote();
        }
      });
    }
  
    function loadNotes() {
      const urlKey = getEffectiveUrl(); // Get the effective URL key
      chrome.storage.local.get(urlKey, (data) => {
        const notes = data[urlKey] || [];
        removeAllStickyNotes(); // Ensure no leftover notes from the previous URL
        notes.forEach((note) =>
          createStickyNote(note.content, note.top, note.left)
        );
      });
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
        if (error.message === "Extension context invalidated.") {
          console.warn("Extension context invalidated. Notes could not be saved.");
        } else {
          console.error("Error in saveNotes:", error);
        }
      }
    }
  
    function createStickyNote(content = "", top = "100px", left = "100px") {
      const note = document.createElement("div");
      note.className = "sticky-note";
      note.style.position = "absolute";
      note.style.top = top;
      note.style.left = left;
      note.style.zIndex = "1000";
  
      // Sticky note menu with color options
      const menuOptions = createStickyMenuOptions();
  
      // Note Header
      const noteHeader = document.createElement("div");
      noteHeader.className = "note-header";
  
      // Delete Button
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-note-btn";
      deleteButton.title = "Delete note";
      deleteButton.innerHTML = `<img src="${chrome.runtime.getURL('assets/bin-icon.svg')}" alt="Delete" />`;
      deleteButton.addEventListener("click", () => {
        note.remove();
        saveNotes();
      });
  
      noteHeader.appendChild(deleteButton);
      noteHeader.appendChild(menuOptions);
  
      // Content Area
      const contentArea = document.createElement("div");
      contentArea.contentEditable = true;
      contentArea.className = "sticky-content";
      contentArea.innerHTML = content || "Take a note.. 😁";
  
      contentArea.addEventListener("focus", () => {
        if (contentArea.innerHTML === "Take a note.. 😁") {
          contentArea.innerHTML = "";
        }
      });
  
      contentArea.addEventListener("blur", () => {
        if (contentArea.innerHTML.trim() === "") {
          contentArea.innerHTML = "Take a note.. 😁";
        }
      });
  
      // Save on content change
      contentArea.addEventListener("input", saveNotes);
  
      // Assemble sticky note
      note.appendChild(noteHeader);
      note.appendChild(contentArea);
      document.body.appendChild(note);
  
      // Make note draggable
      noteHeader.addEventListener("mousedown", (e) => {
        dragNote(e, note);
      });
  
      saveNotes();
    }
  
    function createStickyMenuOptions() {
      // Menu with color pallets and text style options
      const stickyMenu = document.createElement("div");
      stickyMenu.className = "sticky-note-menu-options";
  
      const colors = ['yellow', 'green', 'darkgrey', 'pink', 'purple', 'lightblue', 'lightgrey'];
  
      const colorPalettes = document.createElement("div");
      colorPalettes.className = "sticky-note-colors";
  
      colors.forEach((color) => {
        const colorPallet = document.createElement("div");
        colorPallet.className = `sticky-note-color-pallets pallet-${color}`;
        colorPalettes.appendChild(colorPallet);
      });
  
      stickyMenu.appendChild(colorPalettes);
  
      const toolbar = document.createElement("div");
      toolbar.className = "sticky-note-cont";
  
      // Add text formatting options
      const formats = ['bold', 'italic', 'underline', 'strikethrough'];
      formats.forEach((format) => {
        const button = document.createElement("div");
        button.className = "sticky-cont-item";
        button.title = format.charAt(0).toUpperCase() + format.slice(1);
        button.innerHTML = `<img src="${chrome.runtime.getURL(`assets/${format}.svg`)}" alt="${format}" />`;
  
        button.addEventListener("click", () => {
          document.execCommand(format);
        });
  
        toolbar.appendChild(button);
      });
  
      stickyMenu.appendChild(toolbar);
      return stickyMenu;
    }
  
    function dragNote(e, note) {
      e.preventDefault();
  
      note.style.zIndex = "9999";
  
      const shiftX = e.clientX - note.getBoundingClientRect().left;
      const shiftY = e.clientY - note.getBoundingClientRect().top;
  
      function moveAt(pageX, pageY) {
        const newLeft = Math.max(0, Math.min(pageX - shiftX, window.innerWidth - note.offsetWidth));
        const newTop = Math.max(0, Math.min(pageY - shiftY, document.body.scrollHeight - note.offsetHeight));
  
        note.style.left = `${newLeft}px`;
        note.style.top = `${newTop}px`;
      }
  
      function onMouseMove(event) {
        moveAt(event.pageX, event.pageY);
      }
  
      document.addEventListener("mousemove", onMouseMove);
  
      document.addEventListener("mouseup", () => {
        document.removeEventListener("mousemove", onMouseMove);
        saveNotes();
      });
    }
  
    function observeUrlChanges() {
      const observer = new MutationObserver(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
          onUrlChange();
        }
      });
  
      observer.observe(document.body, { childList: true, subtree: true });
    }
  
    function onUrlChange() {
      console.log("URL changed to:", window.location.href);
      loadNotes(); // Reload notes for the new URL
    }
  
    function getEffectiveUrl() {
      // Customize URL processing if needed (strip query params, fragments, etc.)
      return window.location.href.split(/[?#]/)[0];
    }
  
    function removeAllStickyNotes() {
      const notes = document.querySelectorAll(".sticky-note");
      notes.forEach((note) => note.remove());
    }
  })();
  