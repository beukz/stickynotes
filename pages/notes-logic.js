// This is a refactored version of notes.js adapted for the SPA router using Editor.js
export function initNotesView(container) {
    const notesListEl = container.querySelector('#notes-list');
    const newNoteBtn = container.querySelector('#new-note-btn');
    const searchInput = container.querySelector('#search-notes-input');
    const editorPlaceholder = container.querySelector('#editor-placeholder');
    const editorContent = container.querySelector('#editor-content');
    const noteTitleInput = container.querySelector('#note-title-input');
    const noteDate = container.querySelector('#note-date');
    const mainEditor = container.querySelector('.main-editor');
    
    if (!notesListEl || !noteTitleInput) return () => {};

    let notes = [];
    let activeNoteId = null;
    let searchQuery = "";
    let saveTimeout;
    let currentUser = null;
    let editor = null;
    const STORAGE_KEY = 'dashboard_notes';

    /**
     * ModernEditor: A bespoke, robust block-based editor.
     */
    class ModernEditor {
        constructor(containerId, options = {}) {
            this.container = document.getElementById(containerId);
            this.onChange = options.onChange || (() => {});
            this.blocks = [];
            this.activeBlockId = null;
            this.slashMenu = null;
            this.init();
        }

        init() {
            this.container.innerHTML = '';
            this.container.classList.add('modern-editor');
            this.container.addEventListener('keydown', (e) => this.handleKeyDown(e));
            this.container.addEventListener('input', (e) => this.handleInput(e));
        }

        render(data) {
            this.container.innerHTML = '';
            this.blocks = [];
            const blocksData = this.parseInputData(data);
            if (blocksData.length === 0) {
                this.addBlock('paragraph');
            } else {
                blocksData.forEach(block => {
                    this.addBlock(block.type, block.content, false);
                });
            }
            if (this.blocks.length > 0) this.focusBlock(this.blocks[0].id);
        }

        parseInputData(data) {
            if (!data) return [];
            let blocks = [];
            try {
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                if (Array.isArray(parsed)) return parsed;
                if (parsed.blocks) {
                    return parsed.blocks.map(b => ({
                        type: b.type === 'header' ? `h${b.data.level || 2}` : b.type,
                        content: b.data.text || b.data.items?.join('<br>') || ''
                    }));
                }
            } catch(e) {
                // Fallback to HTML parsing
                const div = document.createElement('div');
                div.innerHTML = data;
                if (div.children.length > 0) {
                    return Array.from(div.children).map(child => ({
                        type: child.tagName.toLowerCase().startsWith('h') ? child.tagName.toLowerCase() : 'paragraph',
                        content: child.innerHTML
                    }));
                }
                return [{ type: 'paragraph', content: String(data) }];
            }
            return [];
        }

        createBlockId() { return 'block-' + Math.random().toString(36).substr(2, 9); }

        addBlock(type = 'paragraph', content = '', shouldFocus = true, afterId = null) {
            const id = this.createBlockId();
            const block = { id, type, content };
            const blockEl = this.createBlockElement(block);
            if (afterId) {
                const afterEl = document.getElementById(afterId);
                const index = this.blocks.findIndex(b => b.id === afterId);
                this.blocks.splice(index + 1, 0, block);
                afterEl.after(blockEl);
            } else {
                this.blocks.push(block);
                this.container.appendChild(blockEl);
            }
            if (shouldFocus) this.focusBlock(id);
            return id;
        }

        createBlockElement(block) {
            const wrapper = document.createElement('div');
            wrapper.className = `editor-block block-${block.type}`;
            wrapper.id = block.id;
            const content = document.createElement('div');
            content.className = 'block-content';
            content.contentEditable = true;
            content.innerHTML = block.content;
            content.dataset.placeholder = this.getPlaceholderForType(block.type);
            wrapper.appendChild(content);
            content.addEventListener('input', () => {
                const b = this.blocks.find(b => b.id === block.id);
                if (b) b.content = content.innerHTML;
                this.onChange();
            });
            return wrapper;
        }

        getPlaceholderForType(type) {
            if (type === 'paragraph') return 'Start writing...';
            if (type.startsWith('h')) return 'Heading...';
            return '';
        }

        focusBlock(id) {
            const el = document.getElementById(id);
            if (el) {
                const content = el.querySelector('.block-content');
                content.focus();
                this.activeBlockId = id;
                const range = document.createRange();
                const selection = window.getSelection();
                range.selectNodeContents(content);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }

        handleKeyDown(e) {
            const blockEl = e.target.closest('.editor-block');
            if (!blockEl) return;
            const id = blockEl.id;
            const index = this.blocks.findIndex(b => b.id === id);

            if (this.slashMenu) {
                if (e.key === 'ArrowDown') { e.preventDefault(); this.moveMenuSelection(1); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); this.moveMenuSelection(-1); return; }
                if (e.key === 'Enter') { e.preventDefault(); this.selectMenuItem(); return; }
                if (e.key === 'Escape') { e.preventDefault(); this.hideSlashMenu(); return; }
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                this.addBlock('paragraph', '', true, id);
            }
            if (e.key === 'Backspace') {
                const content = e.target;
                if (content.innerText.length === 0 || content.innerHTML === '' || content.innerHTML === '<br>') {
                    if (this.blocks.length > 1) {
                        e.preventDefault();
                        const prevId = index > 0 ? this.blocks[index-1].id : null;
                        this.removeBlock(id);
                        if (prevId) this.focusBlock(prevId);
                    }
                }
            }
            if (e.key === 'ArrowUp' && index > 0) { e.preventDefault(); this.focusBlock(this.blocks[index-1].id); }
            if (e.key === 'ArrowDown' && index < this.blocks.length - 1) { e.preventDefault(); this.focusBlock(this.blocks[index+1].id); }
        }

        handleInput(e) {
            const content = e.target;
            const text = content.innerText;
            
            if (text === '/') {
                this.showSlashMenu(content.closest('.editor-block').id);
            } else if (!text.includes('/')) {
                this.hideSlashMenu();
            }

            if (text.startsWith('# ')) this.updateBlockType(content.closest('.editor-block').id, 'h1', text.substring(2));
            else if (text.startsWith('## ')) this.updateBlockType(content.closest('.editor-block').id, 'h2', text.substring(3));
            else if (text.startsWith('### ')) this.updateBlockType(content.closest('.editor-block').id, 'h3', text.substring(4));
        }

        updateBlockType(id, newType, newContent = null) {
            const index = this.blocks.findIndex(b => b.id === id);
            if (index === -1) return;
            this.blocks[index].type = newType;
            if (newContent !== null) this.blocks[index].content = newContent;
            const oldEl = document.getElementById(id);
            const newEl = this.createBlockElement(this.blocks[index]);
            oldEl.replaceWith(newEl);
            this.focusBlock(id);
            this.onChange();
        }

        removeBlock(id) {
            const index = this.blocks.findIndex(b => b.id === id);
            if (index !== -1) {
                this.blocks.splice(index, 1);
                document.getElementById(id).remove();
                this.onChange();
            }
        }

        showSlashMenu(blockId) {
            this.hideSlashMenu();
            const blockEl = document.getElementById(blockId);
            const menu = document.createElement('div');
            menu.className = 'slash-menu';
            
            const items = [
                { type: 'paragraph', label: 'Text', desc: 'Just start writing plain text.', icon: 'fi-rr-text' },
                { type: 'h1', label: 'Heading 1', desc: 'Big section heading.', icon: 'fi-rr-h1' },
                { type: 'h2', label: 'Heading 2', desc: 'Medium section heading.', icon: 'fi-rr-h2' },
                { type: 'h3', label: 'Heading 3', desc: 'Small section heading.', icon: 'fi-rr-h3' }
            ];

            menu.innerHTML = items.map((item, i) => `
                <div class="slash-menu-item ${i === 0 ? 'active' : ''}" data-type="${item.type}">
                    <i class="fi ${item.icon}"></i>
                    <div class="slash-menu-item-info">
                        <span class="slash-menu-item-title">${item.label}</span>
                        <span class="slash-menu-item-desc">${item.desc}</span>
                    </div>
                </div>
            `).join('');

            document.body.appendChild(menu);
            
            const rect = blockEl.getBoundingClientRect();
            menu.style.top = `${rect.bottom + window.scrollY}px`;
            menu.style.left = `${rect.left + window.scrollX}px`;
            
            this.slashMenu = menu;
            this.menuSelectedIndex = 0;

            menu.querySelectorAll('.slash-menu-item').forEach((item, i) => {
                item.onclick = (e) => {
                    e.stopPropagation();
                    this.menuSelectedIndex = i;
                    this.selectMenuItem();
                };
            });
        }

        moveMenuSelection(dir) {
            const items = this.slashMenu.querySelectorAll('.slash-menu-item');
            items[this.menuSelectedIndex].classList.remove('active');
            this.menuSelectedIndex = (this.menuSelectedIndex + dir + items.length) % items.length;
            items[this.menuSelectedIndex].classList.add('active');
            items[this.menuSelectedIndex].scrollIntoView({ block: 'nearest' });
        }

        selectMenuItem() {
            const items = this.slashMenu.querySelectorAll('.slash-menu-item');
            const type = items[this.menuSelectedIndex].dataset.type;
            this.updateBlockType(this.activeBlockId, type, '');
            this.hideSlashMenu();
        }

        hideSlashMenu() {
            if (this.slashMenu) {
                this.slashMenu.remove();
                this.slashMenu = null;
            }
        }

        save() {
            return JSON.stringify(this.blocks.map(b => ({ type: b.type, content: b.content })));
        }
    }

    async function checkAuth() {
        return new Promise((resolve) => {
            chrome.storage.local.get("supabase_session", (data) => {
                currentUser = data.supabase_session?.user || null;
                resolve(currentUser);
            });
        });
    }

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
                    } else {
                        showPlaceholder();
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
        const newNote = { id: Date.now().toString(), title: '', content: '{}', lastModified: Date.now() };
        notes.unshift(newNote);
        activeNoteId = newNote.id;
        
        if (searchQuery) {
            searchQuery = "";
            if (searchInput) searchInput.value = "";
        }

        renderNotesList();
        selectNote(newNote.id);
        noteTitleInput.focus();
    }

    async function selectNote(id) {
        const note = notes.find(n => n.id === id);
        if (!note) {
            showPlaceholder();
            return;
        }
        activeNoteId = id;
        noteTitleInput.value = note.title || "";
        
        let editorData = { blocks: [] };
        const rawContent = (note.content || "").toString().trim();
        
        if (rawContent) {
            try {
                if (rawContent.startsWith('{') || rawContent.startsWith('[')) {
                    editorData = JSON.parse(rawContent);
                } else {
                    // Migration from HTML to Editor.js
                    editorData = {
                        blocks: [{
                            type: 'paragraph',
                            data: { text: rawContent }
                        }]
                    };
                }
            } catch(e) {
                console.error("Failed to parse note content", e);
                editorData = {
                    blocks: [{
                        type: 'paragraph',
                        data: { text: rawContent }
                    }]
                };
            }
        }

        if (noteDate) {
            const date = new Date(note.lastModified || Date.now());
            noteDate.textContent = date.toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric', 
                year: 'numeric' 
            });
        }
        
        container.querySelectorAll('.note-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === id);
        });
        showEditor();

        if (!editor) {
            editor = new ModernEditor('editorjs', {
                onChange: () => updateNote()
            });
        }
        editor.render(note.content);
    }

    async function updateNote() {
        if (!activeNoteId || !editor) return;
        
        const newContent = editor.save();
        const newTitle = noteTitleInput.value;

        const note = notes.find(n => n.id === activeNoteId);
        if (!note) return;

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

    // Event Listeners
    newNoteBtn.addEventListener('click', createNewNote);
    noteTitleInput.addEventListener('input', updateNote);
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderNotesList();
        });
    }

    const bodyClickHandler = (e) => {
        if (editor && editor.slashMenu && !editor.slashMenu.contains(e.target)) {
            editor.hideSlashMenu();
        }
    };
    document.addEventListener('click', bodyClickHandler);

    loadNotes();

    return () => {
        document.removeEventListener('click', bodyClickHandler);
        // Custom editor cleanup if needed
    };
}
