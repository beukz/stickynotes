// This is a refactored version of notes.js adapted for the SPA router using Editor.js
export function initNotesView(container) {
    const notesListEl = container.querySelector('#notes-list');
    const newNoteBtn = container.querySelector('#new-note-btn');
    const searchInput = container.querySelector('#search-notes-input');
    const editorPlaceholder = container.querySelector('#editor-placeholder');
    const editorContent = container.querySelector('#editor-content');
    const noteTitleInput = container.querySelector('#note-title-input');
    const noteDate = container.querySelector('#note-date');
    const saveStatusEl = container.querySelector('#save-status');
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
            this.inlineToolbar = null;
            this.init();
        }

        init() {
            this.container.innerHTML = '';
            this.container.classList.add('modern-editor');
            this.container.addEventListener('keydown', (e) => this.handleKeyDown(e));
            this.container.addEventListener('input', (e) => this.handleInput(e));
            
            // Selection events for inline toolbar
            document.addEventListener('selectionchange', () => this.handleSelectionChange());
            this.initInlineToolbar();
            
            // Click below to focus last line
            this.container.addEventListener('mousedown', (e) => {
                if (e.target === this.container) {
                    setTimeout(() => {
                        if (this.blocks.length > 0) {
                            this.focusBlock(this.blocks[this.blocks.length - 1].id);
                        }
                    }, 0);
                }
            });
        }

        initInlineToolbar() {
            const toolbar = document.createElement('div');
            toolbar.className = 'inline-toolbar';
            toolbar.innerHTML = `
                <div class="toolbar-main">
                    <button class="toolbar-btn" data-command="bold" title="Bold"><i class="fi fi-rr-bold"></i></button>
                    <button class="toolbar-btn" data-command="italic" title="Italic"><i class="fi fi-rr-italic"></i></button>
                    <button class="toolbar-btn" data-command="underline" title="Underline"><i class="fi fi-rr-underline"></i></button>
                    <div class="toolbar-separator"></div>
                    <select class="toolbar-font-select" title="Change Font">
                        <option value="">Default</option>
                        <option value="Inter">Inter</option>
                        <option value="DM Sans">DM Sans</option>
                        <option value="Roboto">Roboto</option>
                        <option value="Montserrat">Montserrat</option>
                        <option value="Nunito">Nunito</option>
                        <option value="Source Sans 3">Source Sans 3</option>
                        <option value="Work Sans">Work Sans</option>
                        <option value="Raleway">Raleway</option>
                        <option value="Manrope">Manrope</option>
                        <option value="Poppins">Poppins</option>
                        <option value="Open Sans">Open Sans</option>
                        <option value="Outfit">Outfit</option>
                        <option value="Lora">Lora (Serif)</option>
                        <option value="Merriweather">Merriweather (Serif)</option>
                        <option value="Playfair Display">Playfair Display (Serif)</option>
                        <option value="Fira Code">Fira Code</option>
                    </select>
                    <div class="toolbar-separator"></div>
                    <button class="toolbar-btn" id="link-btn" title="Add Link"><i class="fi fi-rr-link"></i></button>
                    <button class="toolbar-btn hidden" id="unlink-btn" title="Remove Link"><i class="fi fi-rr-link-slash"></i></button>
                </div>
                <div class="toolbar-link hidden">
                    <input type="text" class="link-input" placeholder="Paste or type a link...">
                    <button class="toolbar-btn link-confirm"><i class="fi fi-rr-check"></i></button>
                    <button class="toolbar-btn link-cancel"><i class="fi fi-rr-cross-small"></i></button>
                </div>
            `;
            
            toolbar.querySelectorAll('.toolbar-main .toolbar-btn[data-command]').forEach(btn => {
                btn.onmousedown = (e) => {
                    e.preventDefault();
                    document.execCommand(btn.dataset.command, false, null);
                    this.onChange();
                };
            });

            const fontSelect = toolbar.querySelector('.toolbar-font-select');
            fontSelect.onchange = () => {
                const font = fontSelect.value;
                if (font) {
                    document.execCommand('fontName', false, font);
                    this.onChange();
                    this.hideInlineToolbar();
                }
            };

            const linkBtn = toolbar.querySelector('#link-btn');
            const unlinkBtn = toolbar.querySelector('#unlink-btn');
            const linkInput = toolbar.querySelector('.link-input');
            const linkConfirm = toolbar.querySelector('.link-confirm');
            const linkCancel = toolbar.querySelector('.link-cancel');

            linkBtn.onmousedown = (e) => {
                e.preventDefault();
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    this.savedRange = selection.getRangeAt(0);
                    toolbar.querySelector('.toolbar-main').classList.add('hidden');
                    toolbar.querySelector('.toolbar-link').classList.remove('hidden');
                    setTimeout(() => linkInput.focus(), 10);
                }
            };

            unlinkBtn.onmousedown = (e) => {
                e.preventDefault();
                document.execCommand('unlink', false, null);
                this.onChange();
                this.handleSelectionChange();
            };

            linkConfirm.onclick = () => this.applyLink(linkInput.value);
            linkInput.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.applyLink(linkInput.value); }
                if (e.key === 'Escape') { e.preventDefault(); this.resetToolbar(); }
            };
            linkCancel.onclick = () => this.resetToolbar();

            document.body.appendChild(toolbar);
            this.inlineToolbar = toolbar;
        }

        applyLink(url) {
            if (!url) return;
            if (!url.startsWith('http') && !url.startsWith('mailto:')) url = 'https://' + url;
            
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(this.savedRange);
            
            document.execCommand('createLink', false, url);
            this.onChange();
            this.resetToolbar();
            this.hideInlineToolbar();
        }

        resetToolbar() {
            this.inlineToolbar.querySelector('.toolbar-main').classList.remove('hidden');
            this.inlineToolbar.querySelector('.toolbar-link').classList.add('hidden');
            this.inlineToolbar.querySelector('.link-input').value = '';
            this.savedRange = null;
        }

        handleSelectionChange() {
            const selection = window.getSelection();
            if (selection.isCollapsed || !selection.toString().trim()) {
                if (this.inlineToolbar && !this.inlineToolbar.querySelector('.toolbar-link').classList.contains('hidden')) {
                    // Don't hide if link input is active
                } else {
                    this.hideInlineToolbar();
                }
                return;
            }

            const range = selection.getRangeAt(0);
            const commonAncestor = range.commonAncestorContainer;
            const blockContent = (commonAncestor.nodeType === 1 ? commonAncestor : commonAncestor.parentElement).closest('.block-content');

            if (!blockContent || !this.container.contains(blockContent)) {
                this.hideInlineToolbar();
                return;
            }

            // Detect existing link
            const parentLink = (commonAncestor.nodeType === 1 ? commonAncestor : commonAncestor.parentElement).closest('a');
            const unlinkBtn = this.inlineToolbar.querySelector('#unlink-btn');
            const linkBtn = this.inlineToolbar.querySelector('#link-btn');
            
            if (parentLink) {
                unlinkBtn.classList.remove('hidden');
                linkBtn.classList.add('hidden');
            } else {
                unlinkBtn.classList.add('hidden');
                linkBtn.classList.remove('hidden');
            }

            const rect = range.getBoundingClientRect();
            this.inlineToolbar.classList.add('active');
            
            const toolbarHeight = 40;
            let top = rect.top + window.scrollY - toolbarHeight - 10;
            let left = rect.left + window.scrollX + (rect.width / 2) - (this.inlineToolbar.offsetWidth / 2);

            this.inlineToolbar.style.top = `${top}px`;
            this.inlineToolbar.style.left = `${left}px`;
        }

        hideInlineToolbar() {
            if (this.inlineToolbar) {
                this.inlineToolbar.classList.remove('active');
                this.resetToolbar();
            }
        }

        render(data) {
            this.container.innerHTML = '';
            this.blocks = [];
            const blocksData = this.parseInputData(data);
            if (blocksData.length === 0) {
                this.addBlock('paragraph');
            } else {
                blocksData.forEach(block => {
                    this.addBlock(block.type, block.content, false, null, block.metadata);
                });
            }
            this.ensureLastBlockIsEmpty();
            if (this.blocks.length > 0) this.focusBlock(this.blocks[0].id);
        }

        ensureLastBlockIsEmpty() {
            const lastBlock = this.blocks[this.blocks.length - 1];
            if (lastBlock && (lastBlock.content.trim() !== '' && lastBlock.content !== '<br>' && lastBlock.type !== 'divider')) {
                this.addBlock('paragraph', '', false);
            }
        }

        parseInputData(data) {
            if (!data) return [];
            try {
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                if (Array.isArray(parsed)) return parsed;
                if (parsed.blocks) {
                    return parsed.blocks.map(b => ({
                        type: b.type === 'header' ? `h${b.data.level || 2}` : b.type,
                        content: b.data.text || b.data.items?.join('<br>') || '',
                        metadata: b.data.checked !== undefined ? { checked: b.data.checked } : {}
                    }));
                }
            } catch(e) {
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

        addBlock(type = 'paragraph', content = '', shouldFocus = true, afterId = null, metadata = {}) {
            const id = this.createBlockId();
            const block = { id, type, content, metadata: { ...metadata } };
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
            if (block.metadata?.checked) wrapper.classList.add('is-checked');
            wrapper.id = block.id;

            if (block.type === 'checklist') {
                const checkbox = document.createElement('div');
                checkbox.className = 'block-checkbox';
                checkbox.innerHTML = block.metadata?.checked ? '<i class="fi fi-rr-check"></i>' : '';
                checkbox.onclick = () => {
                    block.metadata.checked = !block.metadata.checked;
                    wrapper.classList.toggle('is-checked', block.metadata.checked);
                    checkbox.innerHTML = block.metadata.checked ? '<i class="fi fi-rr-check"></i>' : '';
                    this.onChange();
                };
                wrapper.appendChild(checkbox);
            }

            const content = document.createElement('div');
            content.className = 'block-content';
            content.contentEditable = block.type !== 'divider';
            content.innerHTML = block.content;
            content.dataset.placeholder = this.getPlaceholderForType(block.type);
            wrapper.appendChild(content);

            content.addEventListener('focus', () => {
                wrapper.classList.add('is-focused');
            });
            content.addEventListener('blur', () => {
                wrapper.classList.remove('is-focused');
            });

            content.addEventListener('input', () => {
                const b = this.blocks.find(b => b.id === block.id);
                if (b) b.content = content.innerHTML;
                this.ensureLastBlockIsEmpty();
                this.onChange();
            });

            return wrapper;
        }

        getPlaceholderForType(type) {
            if (type === 'paragraph') return 'Start writing...';
            if (type.startsWith('h')) return 'Heading...';
            if (type === 'checklist') return 'To-do...';
            if (type === 'bulleted-list') return 'List item...';
            if (type === 'quote') return 'Quote...';
            return '';
        }

        focusBlock(id, atStart = false) {
            const el = document.getElementById(id);
            if (el) {
                const content = el.querySelector('.block-content');
                content.focus();
                this.activeBlockId = id;
                const selection = window.getSelection();
                const range = document.createRange();
                if (atStart) {
                    range.setStart(content, 0);
                    range.collapse(true);
                } else {
                    range.selectNodeContents(content);
                    range.collapse(false);
                }
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }

        handleKeyDown(e) {
            const blockEl = e.target.closest('.editor-block');
            if (!blockEl) return;
            const id = blockEl.id;
            const index = this.blocks.findIndex(b => b.id === id);
            const block = this.blocks[index];

            if (this.slashMenu) {
                if (e.key === 'ArrowDown') { e.preventDefault(); this.moveMenuSelection(1); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); this.moveMenuSelection(-1); return; }
                if (e.key === 'Enter') { e.preventDefault(); this.selectMenuItem(); return; }
                if (e.key === 'Escape') { e.preventDefault(); this.hideSlashMenu(); return; }
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                // Auto-continue lists
                const nextType = (block.type === 'checklist' || block.type === 'bulleted-list') ? block.type : 'paragraph';
                this.addBlock(nextType, '', true, id);
            }

            if (e.key === 'Backspace') {
                const selection = window.getSelection();
                const range = selection.getRangeAt(0);
                const isAtStart = range.startOffset === 0 && range.endOffset === 0;

                if (isAtStart || e.target.innerText.length === 0 || e.target.innerHTML === '<br>') {
                    if (index > 0) {
                        e.preventDefault();
                        const prevBlock = this.blocks[index - 1];
                        const currentContent = e.target.innerHTML;
                        
                        // If it's just a type change (e.g. backspacing an empty list item to paragraph)
                        if (block.type !== 'paragraph' && (e.target.innerText.length === 0 || e.target.innerHTML === '<br>')) {
                            this.updateBlockType(id, 'paragraph');
                        } else {
                            // Merge content
                            const prevEl = document.getElementById(prevBlock.id).querySelector('.block-content');
                            const originalLength = prevEl.innerText.length;
                            prevBlock.content += (currentContent === '<br>' ? '' : currentContent);
                            prevEl.innerHTML = prevBlock.content;
                            
                            this.removeBlock(id);
                            this.focusBlock(prevBlock.id);
                            // Adjust cursor to merge point
                            const newRange = document.createRange();
                            const newSelection = window.getSelection();
                            // This is a simplified merge focus
                            this.focusBlock(prevBlock.id);
                        }
                    }
                }
            }
            if (e.key === 'ArrowUp' && index > 0) { e.preventDefault(); this.focusBlock(this.blocks[index-1].id); }
            if (e.key === 'ArrowDown' && index < this.blocks.length - 1) { e.preventDefault(); this.focusBlock(this.blocks[index+1].id); }
        }

        handleInput(e) {
            const content = e.target;
            const text = content.innerText;
            const id = content.closest('.editor-block').id;
            
            if (text === '/') {
                this.showSlashMenu(id);
            } else if (!text.includes('/')) {
                this.hideSlashMenu();
            }

            // Markdown detection
            if (text.startsWith('# ')) this.updateBlockType(id, 'h1', text.substring(2));
            else if (text.startsWith('## ')) this.updateBlockType(id, 'h2', text.substring(3));
            else if (text.startsWith('### ')) this.updateBlockType(id, 'h3', text.substring(4));
            else if (text.startsWith('- ') || text.startsWith('* ')) this.updateBlockType(id, 'bulleted-list', text.substring(2));
            else if (text.startsWith('[] ') || text.startsWith('- [ ] ')) this.updateBlockType(id, 'checklist', text.startsWith('[]') ? text.substring(3) : text.substring(6));
            else if (text.startsWith('> ')) this.updateBlockType(id, 'quote', text.substring(2));
            else if (text.startsWith('---')) this.updateBlockType(id, 'divider', '');
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
                const el = document.getElementById(id);
                if (el) el.remove();
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
                { type: 'h3', label: 'Heading 3', desc: 'Small section heading.', icon: 'fi-rr-h3' },
                { type: 'checklist', label: 'To-do List', desc: 'Track tasks with checkboxes.', icon: 'fi-rr-list-check' },
                { type: 'bulleted-list', label: 'Bulleted List', desc: 'Create a simple bulleted list.', icon: 'fi-rr-list-bullet' },
                { type: 'quote', label: 'Quote', desc: 'Capture a quotation.', icon: 'fi-rr-quote-right' },
                { type: 'divider', label: 'Divider', desc: 'Visually divide your content.', icon: 'fi-rr-minus' }
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
            let top = rect.bottom + window.scrollY;
            if (top + 300 > window.innerHeight + window.scrollY) {
                top = rect.top + window.scrollY - 300; // Show above if no space
            }

            menu.style.top = `${top}px`;
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
            return JSON.stringify(this.blocks.map(b => ({ 
                type: b.type, 
                content: b.content,
                metadata: b.metadata 
            })));
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

    let lastSavedTime = null;

    function setSaveStatus(status) {
        if (!saveStatusEl) return;
        if (status === 'saving') {
            const timeInfo = lastSavedTime ? `<small>Last saved at ${lastSavedTime}</small>` : '';
            saveStatusEl.innerHTML = `
                <i class="fi fi-rr-spinner animate-spin"></i>
                <div class="save-info">
                    <span>Saving...</span>
                    ${timeInfo}
                </div>
            `;
            saveStatusEl.classList.add('saving');
            saveStatusEl.classList.remove('saved', 'error');
        } else if (status === 'error') {
            const timeInfo = lastSavedTime ? `<small>Last saved at ${lastSavedTime}</small>` : '';
            saveStatusEl.innerHTML = `
                <i class="fi fi-rr-cloud-slash"></i>
                <div class="save-info">
                    <span>Error</span>
                    ${timeInfo}
                </div>
            `;
            saveStatusEl.classList.add('error');
            saveStatusEl.classList.remove('saving', 'saved');
        } else {
            const now = new Date();
            lastSavedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            saveStatusEl.innerHTML = `
                <i class="fi fi-rr-check"></i>
                <div class="save-info">
                    <span>Saved</span>
                    <small>Last saved at ${lastSavedTime}</small>
                </div>
            `;
            saveStatusEl.classList.add('saved');
            saveStatusEl.classList.remove('saving', 'error');
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
                font_family: note.font_family || "'Inter', sans-serif",
                font_size: note.font_size || 16,
                user_id: currentUser.id // Explicitly send for RLS
            };

            chrome.runtime.sendMessage({
                action: "supabaseAction", method, table: "sticky_notes", query, body
            }, (response) => {
                if (response?.success) {
                    if (isNew) {
                        const newId = response.data?.[0]?.id;
                        if (newId) {
                            const oldId = note.id;
                            note.id = newId;
                            if (activeNoteId === oldId) {
                                activeNoteId = newId;
                                localStorage.setItem("activeNoteId", newId);
                            }
                            renderNotesList(); // Update UI with new ID
                        }
                    }
                    setSaveStatus('saved');
                } else {
                    console.error("Supabase save error:", response?.error);
                    setSaveStatus('error');
                }
            });
        } else {
            await chrome.storage.local.set({ [STORAGE_KEY]: notes });
            setSaveStatus('saved');
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
        localStorage.setItem("activeNoteId", id);
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

        // Update last saved time if available
        if (note.updated_at) {
            const date = new Date(note.updated_at);
            lastSavedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setSaveStatus('saved');
        } else {
            lastSavedTime = null;
            saveStatusEl.innerHTML = '<i class="fi fi-rr-check"></i><div class="save-info"><span>Saved</span></div>';
        }

        applyStyle(note);

        // Used to avoid treating selection/font changes as "unsaved" on load
        note._lastSavedState = {
            title: note.title || "",
            content: (note.content || "").toString(),
            font_family: note.font_family || "'Inter', sans-serif",
            font_size: note.font_size || 16,
        };
        
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

        const effectiveFontFamily = note.font_family || "'Inter', sans-serif";
        const effectiveFontSize = note.font_size || 16;

        const nextState = {
            title: newTitle,
            content: newContent,
            font_family: effectiveFontFamily,
            font_size: effectiveFontSize,
        };

        const lastState = note._lastSavedState || {
            title: note.title || "",
            content: note.content || "",
            font_family: note.font_family || "'Inter', sans-serif",
            font_size: note.font_size || 16,
        };

        if (
            lastState.title === nextState.title &&
            lastState.content === nextState.content &&
            lastState.font_family === nextState.font_family &&
            lastState.font_size === nextState.font_size
        ) {
            return;
        }

        note.title = newTitle;
        note.content = newContent;
        note.lastModified = Date.now();

        setSaveStatus('saving');
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            notes.sort((a, b) => b.lastModified - a.lastModified);
            await saveNotes(note);
            note._lastSavedState = nextState; // optimistic; updated_at handled separately
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

    // Style Menu Logic
    const styleToggle = container.querySelector('.style-toggle');
    const stylePopup = container.querySelector('.style-popup');
    const fontFamilySelect = container.querySelector('#font-family-select');
    const sizeDecrease = container.querySelector('#size-decrease');
    const sizeIncrease = container.querySelector('#size-increase');
    const currentSizeDisplay = container.querySelector('#current-size-display');

    function applyStyle(note) {
        const family = note.font_family || "'Inter', sans-serif";
        const size = note.font_size || 16;
        
        const editorEl = container.querySelector('#editorjs');
        if (editorEl) {
            editorEl.style.fontFamily = family;
            editorEl.style.fontSize = size + 'px';
        }

        // Update UI controls
        if (fontFamilySelect) fontFamilySelect.value = family;
        if (currentSizeDisplay) currentSizeDisplay.textContent = size + 'px';
    }

    if (styleToggle) {
        styleToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            stylePopup.classList.toggle('hidden');
        });
    }

    if (fontFamilySelect) {
        fontFamilySelect.addEventListener('change', () => {
            const note = notes.find(n => n.id === activeNoteId);
            if (note) {
                note.font_family = fontFamilySelect.value;
                applyStyle(note);
                updateNote();
            }
        });
    }

    if (sizeDecrease) {
        sizeDecrease.addEventListener('click', () => {
            const note = notes.find(n => n.id === activeNoteId);
            if (note) {
                const currentSize = note.font_size || 16;
                if (currentSize > 12) {
                    note.font_size = currentSize - 1;
                    applyStyle(note);
                    updateNote();
                }
            }
        });
    }

    if (sizeIncrease) {
        sizeIncrease.addEventListener('click', () => {
            const note = notes.find(n => n.id === activeNoteId);
            if (note) {
                const currentSize = note.font_size || 16;
                if (currentSize < 32) {
                    note.font_size = currentSize + 1;
                    applyStyle(note);
                    updateNote();
                }
            }
        });
    }

    const bodyClickHandler = (e) => {
        if (editor && editor.slashMenu && !editor.slashMenu.contains(e.target)) {
            editor.hideSlashMenu();
        }
        if (stylePopup && !stylePopup.contains(e.target) && !styleToggle.contains(e.target)) {
            stylePopup.classList.add('hidden');
        }
    };
    document.addEventListener('click', bodyClickHandler);

    loadNotes();

    return () => {
        document.removeEventListener('click', bodyClickHandler);
        // Custom editor cleanup if needed
    };
}
