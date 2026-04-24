export function template() {
    return `
        <!-- Secondary Sidebar: Notes List -->
        <aside class="notes-sidebar">
          <div class="sidebar-header">
            <h2>My Notes</h2>
            <button id="new-note-btn" title="New Note">
              <i class="fi fi-rr-plus"></i>
            </button>
          </div>
          <div class="search-notes">
            <i class="fi fi-rr-search"></i>
            <input type="text" id="search-notes-input" placeholder="Search notes..." />
          </div>
          <div class="notes-list" id="notes-list">
            <!-- List of notes will be populated here -->
          </div>
        </aside>

        <!-- Main Editor Area -->
        <main class="main-editor" style="flex: 1; border-left: 1px solid rgba(0,0,0,0.06);">
          <div id="editor-placeholder">
            <h2>Select a note or create a new one</h2>
            <p>Your personal space for thoughts, ideas, and plans.</p>
          </div>
          <div id="editor-content" class="hidden">
            <div class="editor-meta-header">
              <div class="header-left">
                <input type="text" id="note-title-input" placeholder="Untitled" />
              </div>
              <div class="header-right">
                <div id="save-status" class="save-status">
                  <i class="fi fi-rr-check"></i>
                  <div class="save-info">
                    <span>Saved</span>
                  </div>
                </div>
                <span class="header-divider">|</span>
                <div class="style-menu">
                    <button class="style-toggle" title="Text Style">
                        <i class="fi fi-rr-text-size"></i>
                    </button>
                    <div class="style-popup hidden">
                        <div class="style-section">
                            <label>Font Family</label>
                            <select id="font-family-select">
                                <option value="'Inter', sans-serif">Inter</option>
                                <option value="'DM Sans', sans-serif">DM Sans</option>
                                <option value="'Roboto', sans-serif">Roboto</option>
                                <option value="'Montserrat', sans-serif">Montserrat</option>
                                <option value="'Nunito', sans-serif">Nunito</option>
                                <option value="'Source Sans 3', sans-serif">Source Sans 3</option>
                                <option value="'Work Sans', sans-serif">Work Sans</option>
                                <option value="'Raleway', sans-serif">Raleway</option>
                                <option value="'Manrope', sans-serif">Manrope</option>
                                <option value="'Poppins', sans-serif">Poppins</option>
                                <option value="'Open Sans', sans-serif">Open Sans</option>
                                <option value="'Outfit', sans-serif">Outfit</option>
                                <option value="'Lora', serif">Lora (Serif)</option>
                                <option value="'Merriweather', serif">Merriweather (Serif)</option>
                                <option value="'Playfair Display', serif">Playfair (Serif)</option>
                                <option value="'Fira Code', monospace">Fira Code</option>
                            </select>
                        </div>
                        <div class="style-section">
                            <label>Font Size</label>
                            <div class="size-controls">
                                <button id="size-decrease"><i class="fi fi-rr-minus-small"></i></button>
                                <span id="current-size-display">16px</span>
                                <button id="size-increase"><i class="fi fi-rr-plus-small"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
                <span class="header-divider">|</span>
                <span id="note-date">April 24, 2024</span>
                <span class="header-divider">|</span>
                <div class="share-btn-wrapper" data-tooltip="Coming Soon">
                  <i class="fi fi-rr-share"></i>
                </div>
              </div>
            </div>
            <div id="editorjs"></div>
          </div>
          <!-- Editor.js handles its own toolbar and slash menu -->
        </main>
    `;
}

export async function mount(container) {
    // We will dynamically import the actual notes logic, 
    // but we need to bind the elements to the module.
    // To avoid duplicating 600 lines, we can use the existing notes.js logic
    // by abstracting it, but since we are moving to SPA, we should copy the logic here.
    
    // Instead of copying 600 lines right now, we can try to re-use the file by slightly modifying it.
    // For now, I'll copy the core parts needed. Let's do a full import of a refactored notes-logic.js
    
    try {
        const module = await import("../notes-logic.js");
        if (module.initNotesView) {
            return module.initNotesView(container);
        }
    } catch(e) {
        console.error("Could not load notes logic", e);
    }

    return () => {};
}
