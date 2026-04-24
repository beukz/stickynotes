// This is a refactored version of notes.js adapted for the SPA router
export function initNotesView(container) {
    const notesListEl = container.querySelector('#notes-list');
    const newNoteBtn = container.querySelector('#new-note-btn');
    const searchInput = container.querySelector('#search-notes-input');
    const editorPlaceholder = container.querySelector('#editor-placeholder');
    const editorContent = container.querySelector('#editor-content');
    const noteTitleInput = container.querySelector('#note-title-input');
    const noteEditor = container.querySelector('#note-editor');
    const slashCommandMenu = container.querySelector('#slash-command-menu');
    const floatingToolbar = container.querySelector('#floating-toolbar');
    const mainEditor = container.querySelector('.main-editor');
    
    if (!notesListEl || !noteEditor) return () => {};

    let notes = [];
    let activeNoteId = null;
    let searchQuery = "";
    let saveTimeout;
    let currentUser = null;

    async function checkAuth() {
        return new Promise((resolve) => {
            chrome.storage.local.get("supabase_session", (data) => {
                currentUser = data.supabase_session?.user || null;
                resolve(currentUser);
            });
        });
    }

    let slashMenuActive = false;
    let activeCommandIndex = 0;
    let currentSlashCommandBlock = null;
    const STORAGE_KEY = 'dashboard_notes';

    const commands = [
        { id: 'h1', label: 'Heading 1', description: 'Large section heading.', icon: '<i class="fi fi-rr-h1"></i>', action: () => document.execCommand('formatBlock', false, '<h1>') },
        { id: 'h2', label: 'Heading 2', description: 'Medium section heading.', icon: '<i class="fi fi-rr-h2"></i>', action: () => document.execCommand('formatBlock', false, '<h2>') },
        { id: 'h3', label: 'Heading 3', description: 'Small section heading.', icon: '<i class="fi fi-rr-h3"></i>', action: () => document.execCommand('formatBlock', false, '<h3>') },
        { id: 'bulletList', label: 'Bulleted list', description: 'Create a simple bulleted list.', icon: '<i class="fi fi-rr-list"></i>', action: () => document.execCommand('insertUnorderedList') },
        { id: 'numberedList', label: 'Numbered list', description: 'Create a list with numbering.', icon: '<i class="fi fi-rr-list-check"></i>', action: () => document.execCommand('insertOrderedList') },
        { id: 'quote', label: 'Quote', description: 'Capture a quote.', icon: '<i class="fi fi-rr-quote-right"></i>', action: () => document.execCommand('formatBlock', false, '<blockquote>') },
        { id: 'divider', label: 'Divider', description: 'Visually divide sections.', icon: '<i class="fi fi-rr-minus"></i>', action: () => document.execCommand('insertHorizontalRule') }
    ];

    async function loadNotes() {
        const user = await checkAuth();
        if (user) {
            chrome.runtime.sendMessage({
                action: "supabaseAction",
                method: "GET",
                table: "sticky_notes",
                query: "select=*"
            }, (response) => {
                if (response?.success) {
                    notes = (response.data || []).map(n => ({
                        ...n,
                        id: n.id,
                        id_local: n.id_local || n.id,
                        lastModified: new Date(n.updated_at || n.created_at).getTime()
                    }));
                    notes.sort((a, b) => b.lastModified - a.lastModified);
                    renderNotesList();
                    
                    const requestedId = localStorage.getItem("activeNoteId");
                    if (requestedId) {
                        localStorage.removeItem("activeNoteId");
                        selectNote(requestedId);
                    } else if (notes.length > 0) {
                        selectNote(notes[0].id);
                    }
                }
            });
        } else {
            const data = await chrome.storage.local.get(STORAGE_KEY);
            notes = data[STORAGE_KEY] || [];
            notes.sort((a, b) => b.lastModified - a.lastModified);
            renderNotesList();
            
            const requestedId = localStorage.getItem("activeNoteId");
            if (requestedId) {
                localStorage.removeItem("activeNoteId");
                selectNote(requestedId);
            } else if (notes.length > 0) {
                selectNote(notes[0].id);
            } else {
                showPlaceholder();
            }
        }
    }

    async function saveNotes(note) {
        if (currentUser) {
            const isNew = !note.id.includes('-');
            const method = isNew ? "POST" : "PATCH";
            const query = isNew ? "" : `id=eq.${note.id}`;
            const body = {
                title: note.title,
                content: note.content,
                color: note.color || "#ffd165",
                url: note.url || "dashboard",
                id_local: note.id_local || note.id
            };

            chrome.runtime.sendMessage({
                action: "supabaseAction", method, table: "sticky_notes", query, body
            }, (response) => {
                if (response?.success && isNew) {
                    const newId = response.data?.[0]?.id;
                    if (newId) note.id = newId;
                }
            });
        } else {
            await chrome.storage.local.set({ [STORAGE_KEY]: notes });
        }
    }

    function renderNotesList() {
        notesListEl.innerHTML = '';
        
        const filteredNotes = notes.filter(note => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return (note.title || '').toLowerCase().includes(q) || 
                   (note.content || '').toLowerCase().includes(q);
        });

        if (filteredNotes.length === 0) {
            notesListEl.innerHTML = `<p class="no-notes">${searchQuery ? 'No matching notes.' : 'No notes yet.'}</p>`;
            return;
        }
        filteredNotes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item';
            item.dataset.id = note.id;
            if (note.id === activeNoteId) item.classList.add('active');

            const titleSpan = document.createElement('span');
            titleSpan.className = 'note-item-title';
            titleSpan.textContent = note.title || 'Untitled';
            titleSpan.style.flex = "1";
            titleSpan.style.overflow = "hidden";
            titleSpan.style.textOverflow = "ellipsis";
            titleSpan.style.whiteSpace = "nowrap";

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-note-btn';
            deleteBtn.innerHTML = '<i class="fi fi-rr-trash"></i>';
            deleteBtn.title = 'Delete Note';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDeleteConfirmation(item, () => {
                    deleteNote(note.id);
                });
            });

            item.appendChild(titleSpan);
            item.appendChild(deleteBtn);
            item.addEventListener('click', () => selectNote(note.id));
            notesListEl.appendChild(item);
        });
    }

    function showEditor() {
        editorPlaceholder.classList.add('hidden');
        editorContent.classList.remove('hidden');
    }

    function showPlaceholder() {
        editorPlaceholder.classList.remove('hidden');
        editorContent.classList.add('hidden');
        activeNoteId = null;
        renderNotesList();
    }

    function createNewNote() {
        const newNote = { id: Date.now().toString(), title: '', content: '', lastModified: Date.now() };
        notes.unshift(newNote);
        activeNoteId = newNote.id;
        
        // Clear search when creating a new note to ensure it's visible
        if (searchQuery) {
            searchQuery = "";
            if (searchInput) searchInput.value = "";
        }

        renderNotesList();
        selectNote(newNote.id);
        noteTitleInput.focus();
    }

    function selectNote(id) {
        const note = notes.find(n => n.id === id);
        if (!note) {
            showPlaceholder();
            return;
        }
        activeNoteId = id;
        noteTitleInput.value = note.title;
        noteEditor.innerHTML = note.content;
        
        container.querySelectorAll('.note-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === id);
        });
        showEditor();
    }

    function updateNote() {
        if (!activeNoteId) return;
        const note = notes.find(n => n.id === activeNoteId);
        if (!note) return;
        const newTitle = noteTitleInput.value;
        const newContent = noteEditor.innerHTML;

        if (note.title === newTitle && note.content === newContent) return;

        note.title = newTitle;
        note.content = newContent;
        note.lastModified = Date.now();

        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            notes.sort((a, b) => b.lastModified - a.lastModified);
            await saveNotes(note);
            renderNotesList();
        }, 500);
    }

    function showDeleteConfirmation(noteItem, onConfirm) {
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

        modal.querySelector(".confirm-delete").onclick = (e) => {
            e.stopPropagation();
            onConfirm();
            closeOverlay();
        };

        modal.querySelector(".cancel-delete").onclick = (e) => {
            e.stopPropagation();
            closeOverlay();
        };
    }

    async function deleteNote(id) {
        if (currentUser && id.includes('-')) {
             chrome.runtime.sendMessage({
                action: "supabaseAction", method: "DELETE", table: "sticky_notes", query: `id=eq.${id}`
            });
        }
        notes = notes.filter(n => n.id !== id);
        if (!currentUser) await saveNotes();
        
        if (activeNoteId === id) {
            if (notes.length > 0) selectNote(notes[0].id);
            else showPlaceholder();
        }
        renderNotesList();
    }

    // --- Slash Command ---
    function getParentBlock(node) {
        while (node && node.parentNode !== noteEditor) {
            node = node.parentNode;
        }
        return node;
    }

    function renderSlashMenu(filteredCommands) {
        slashCommandMenu.innerHTML = '';
        if (filteredCommands.length === 0) {
            slashCommandMenu.innerHTML = '<div class="command-item">No results</div>';
            return;
        }
        filteredCommands.forEach((cmd, index) => {
            const item = document.createElement('div');
            item.className = 'command-item';
            if (index === activeCommandIndex) item.classList.add('active');
            item.innerHTML = `
                <div class="command-item-icon">${cmd.icon}</div>
                <div class="command-item-text">
                    <h4>${cmd.label}</h4>
                    <p>${cmd.description}</p>
                </div>
            `;
            item.addEventListener('mousedown', (e) => { e.preventDefault(); executeCommand(cmd); });
            slashCommandMenu.appendChild(item);
        });
    }

    function openSlashMenu(query) {
        const filteredCommands = commands.filter(cmd =>
            cmd.label.toLowerCase().includes(query.toLowerCase()) ||
            cmd.id.toLowerCase().includes(query.toLowerCase())
        );
        if (filteredCommands.length === 0) { closeSlashMenu(); return; }
        activeCommandIndex = 0;
        renderSlashMenu(filteredCommands);
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        slashCommandMenu.classList.remove('hidden');
        const menuHeight = slashCommandMenu.offsetHeight;
        const menuWidth = slashCommandMenu.offsetWidth;
        let top = rect.bottom + window.scrollY + 5;
        let left = rect.left + window.scrollX;
        if (rect.bottom + menuHeight > window.innerHeight) top = rect.top + window.scrollY - menuHeight - 5;
        if (rect.left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
        if (top < window.scrollY) top = rect.bottom + window.scrollY + 5;
        slashCommandMenu.style.top = `${top}px`;
        slashCommandMenu.style.left = `${left}px`;
        slashMenuActive = true;
    }

    function closeSlashMenu() { slashCommandMenu.classList.add('hidden'); slashMenuActive = false; currentSlashCommandBlock = null; }

    function executeCommand(command) {
        if (!currentSlashCommandBlock) return;
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(currentSlashCommandBlock);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('delete', false, null);
        command.action();
        closeSlashMenu();
        updateNote();
    }

    function handleSlashNav(e) {
        if (!slashMenuActive) return;
        const items = slashCommandMenu.querySelectorAll('.command-item');
        if (items.length === 0 || items[0].textContent === 'No results') return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeCommandIndex = (activeCommandIndex + 1) % items.length;
            items.forEach((item, index) => item.classList.toggle('active', index === activeCommandIndex));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeCommandIndex = (activeCommandIndex - 1 + items.length) % items.length;
            items.forEach((item, index) => item.classList.toggle('active', index === activeCommandIndex));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const query = currentSlashCommandBlock.textContent.substring(1);
            const filteredCommands = commands.filter(cmd => cmd.label.toLowerCase().includes(query.toLowerCase()));
            if (filteredCommands[activeCommandIndex]) executeCommand(filteredCommands[activeCommandIndex]);
        } else if (e.key === 'Escape') { e.preventDefault(); closeSlashMenu(); }
    }

    function handleMarkdownShortcuts(e) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const node = selection.anchorNode;
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        const block = getParentBlock(node);
        if (!block) return;
        const text = block.textContent;
        const applyShortcut = (command, value, length) => {
            const range = document.createRange();
            range.setStart(block.firstChild, 0);
            range.setEnd(block.firstChild, length);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('delete', false, null);
            document.execCommand(command, false, value);
            updateNote();
        };
        if (e.key === ' ') {
            if (selection.anchorOffset !== text.length) return;
            if (text.startsWith('# ')) applyShortcut('formatBlock', '<h1>', 2);
            else if (text.startsWith('## ')) applyShortcut('formatBlock', '<h2>', 3);
            else if (text.startsWith('### ')) applyShortcut('formatBlock', '<h3>', 4);
            else if (text.startsWith('> ')) applyShortcut('formatBlock', '<blockquote>', 2);
            else if (text.startsWith('* ') || text.startsWith('- ')) applyShortcut('insertUnorderedList', null, 2);
            else if (/^1\. $/.test(text)) applyShortcut('insertOrderedList', null, 3);
        }
    }

    function updateToolbarPosition() {
        const selection = window.getSelection();
        if (!selection.isCollapsed && noteEditor.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const containerRect = mainEditor.getBoundingClientRect();
            floatingToolbar.classList.remove('hidden');
            const toolbarRect = floatingToolbar.getBoundingClientRect();
            let top = rect.top - containerRect.top + mainEditor.scrollTop - toolbarRect.height - 8;
            let left = rect.left - containerRect.left + mainEditor.scrollLeft + (rect.width / 2) - (toolbarRect.width / 2);
            if (top < mainEditor.scrollTop) top = rect.bottom - containerRect.top + mainEditor.scrollTop + 8;
            if (left < mainEditor.scrollLeft) left = mainEditor.scrollLeft + 8;
            if (left + toolbarRect.width > mainEditor.scrollLeft + containerRect.width) left = mainEditor.scrollLeft + containerRect.width - toolbarRect.width - 8;
            floatingToolbar.style.top = `${top}px`;
            floatingToolbar.style.left = `${left}px`;
        } else {
            floatingToolbar.classList.add('hidden');
        }
    }

    // Event Listeners
    newNoteBtn.addEventListener('click', createNewNote);
    noteTitleInput.addEventListener('input', updateNote);
    noteEditor.addEventListener('input', updateNote);
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderNotesList();
        });
    }

    const keyUpHandler = (e) => {
        if (slashMenuActive && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) return;
        if (e.key === ' ' || e.key === 'Enter') handleMarkdownShortcuts(e);
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const block = getParentBlock(selection.anchorNode);
        if (block && block.textContent.startsWith('/')) {
            currentSlashCommandBlock = block;
            openSlashMenu(block.textContent.substring(1));
        } else { closeSlashMenu(); }
    };
    noteEditor.addEventListener('keyup', keyUpHandler);
    noteEditor.addEventListener('keydown', handleSlashNav, true);

    const selectionChangeHandler = () => {
        if (document.activeElement === noteEditor) setTimeout(updateToolbarPosition, 1);
    };
    document.addEventListener('selectionchange', selectionChangeHandler);

    const bodyClickHandler = (e) => {
        if (slashMenuActive && !slashCommandMenu.contains(e.target) && !noteEditor.contains(e.target)) closeSlashMenu();
        if (!noteEditor.contains(e.target) && !floatingToolbar.contains(e.target)) floatingToolbar.classList.add('hidden');
    };
    document.addEventListener('click', bodyClickHandler);

    const scrollHandler = () => { if (!floatingToolbar.classList.contains('hidden')) updateToolbarPosition(); };
    mainEditor.addEventListener('scroll', scrollHandler);

    const toolbarMouseDownHandler = (e) => {
        e.preventDefault();
        const button = e.target.closest('button');
        if (button) {
            document.execCommand(button.dataset.command, false, null);
            updateNote();
        }
    };
    floatingToolbar.addEventListener('mousedown', toolbarMouseDownHandler);

    loadNotes();

    return () => {
        // Cleanup global listeners
        document.removeEventListener('selectionchange', selectionChangeHandler);
        document.removeEventListener('click', bodyClickHandler);
    };
}
