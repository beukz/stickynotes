document.addEventListener('DOMContentLoaded', () => {
    const notesListEl = document.getElementById('notes-list');
    const newNoteBtn = document.getElementById('new-note-btn');
    const editorPlaceholder = document.getElementById('editor-placeholder');
    const editorContent = document.getElementById('editor-content');
    const noteTitleInput = document.getElementById('note-title-input');
    const noteEditor = document.getElementById('note-editor');
    const slashCommandMenu = document.getElementById('slash-command-menu');
    const floatingToolbar = document.getElementById('floating-toolbar');
    const mainEditor = document.querySelector('.main-editor');

    let notes = [];
    let activeNoteId = null;
    let saveTimeout;

    let slashMenuActive = false;
    let activeCommandIndex = 0;
    let currentSlashCommandBlock = null;

    const STORAGE_KEY = 'dashboard_notes';

    const commands = [
        {
            id: 'h1',
            label: 'Heading 1',
            description: 'Large section heading.',
            icon: '<i class="fi fi-rr-h1"></i>',
            action: () => document.execCommand('formatBlock', false, '<h1>')
        },
        {
            id: 'h2',
            label: 'Heading 2',
            description: 'Medium section heading.',
            icon: '<i class="fi fi-rr-h2"></i>',
            action: () => document.execCommand('formatBlock', false, '<h2>')
        },
        {
            id: 'h3',
            label: 'Heading 3',
            description: 'Small section heading.',
            icon: '<i class="fi fi-rr-h3"></i>',
            action: () => document.execCommand('formatBlock', false, '<h3>')
        },
        {
            id: 'bulletList',
            label: 'Bulleted list',
            description: 'Create a simple bulleted list.',
            icon: '<i class="fi fi-rr-list"></i>',
            action: () => document.execCommand('insertUnorderedList')
        },
        {
            id: 'numberedList',
            label: 'Numbered list',
            description: 'Create a list with numbering.',
            icon: '<i class="fi fi-rr-list-check"></i>',
            action: () => document.execCommand('insertOrderedList')
        },
        {
            id: 'quote',
            label: 'Quote',
            description: 'Capture a quote.',
            icon: '<i class="fi fi-rr-quote-right"></i>',
            action: () => document.execCommand('formatBlock', false, '<blockquote>')
        },
        {
            id: 'divider',
            label: 'Divider',
            description: 'Visually divide sections.',
            icon: '<i class="fi fi-rr-minus"></i>',
            action: () => document.execCommand('insertHorizontalRule')
        }
    ];

    // --- Data Functions ---
    async function loadNotes() {
        const data = await chrome.storage.sync.get(STORAGE_KEY);
        notes = data[STORAGE_KEY] || [];
        notes.sort((a, b) => b.lastModified - a.lastModified);
        renderNotesList();
    }

    async function saveNotes() {
        await chrome.storage.sync.set({ [STORAGE_KEY]: notes });
    }

    // --- UI Functions ---
    function renderNotesList() {
        notesListEl.innerHTML = '';
        if (notes.length === 0) {
            notesListEl.innerHTML = '<p class="no-notes">No notes yet.</p>';
            return;
        }
        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item';
            item.dataset.id = note.id;
            item.textContent = note.title || 'Untitled';
            if (note.id === activeNoteId) {
                item.classList.add('active');
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-note-btn';
            deleteBtn.innerHTML = '<i class="fi fi-rr-trash"></i>';
            deleteBtn.title = 'Delete Note';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteNote(note.id);
            });

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

    // --- Note Actions ---
    function createNewNote() {
        const newNote = {
            id: Date.now().toString(),
            title: '',
            content: '',
            lastModified: Date.now()
        };
        notes.unshift(newNote);
        activeNoteId = newNote.id;
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
        
        document.querySelectorAll('.note-item').forEach(item => {
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

        if (note.title === newTitle && note.content === newContent) {
            return; // No changes
        }

        note.title = newTitle;
        note.content = newContent;
        note.lastModified = Date.now();

        // Debounce saving
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            notes.sort((a, b) => b.lastModified - a.lastModified);
            await saveNotes();
            renderNotesList(); // Re-render to reflect title changes and order
            console.log('Note saved');
        }, 500);
    }

    async function deleteNote(id) {
        if (!confirm('Are you sure you want to delete this note?')) {
            return;
        }
        notes = notes.filter(n => n.id !== id);
        await saveNotes();
        
        if (activeNoteId === id) {
            if (notes.length > 0) {
                selectNote(notes[0].id);
            } else {
                showPlaceholder();
            }
        }
        renderNotesList();
    }

    // --- Slash Command Functions ---
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
            if (index === activeCommandIndex) {
                item.classList.add('active');
            }
            item.innerHTML = `
                <div class="command-item-icon">${cmd.icon}</div>
                <div class="command-item-text">
                    <h4>${cmd.label}</h4>
                    <p>${cmd.description}</p>
                </div>
            `;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                executeCommand(cmd);
            });
            slashCommandMenu.appendChild(item);
        });
    }

    function openSlashMenu(query) {
        const filteredCommands = commands.filter(cmd =>
            cmd.label.toLowerCase().includes(query.toLowerCase()) ||
            cmd.id.toLowerCase().includes(query.toLowerCase())
        );

        if (filteredCommands.length === 0) {
            closeSlashMenu();
            return;
        }

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

        // Adjust vertical position if it overflows the bottom of the viewport
        if (rect.bottom + menuHeight > window.innerHeight) {
            top = rect.top + window.scrollY - menuHeight - 5;
        }

        // Adjust horizontal position if it overflows the right of the viewport
        if (rect.left + menuWidth > window.innerWidth) {
            left = window.innerWidth - menuWidth - 10; // 10px padding from edge
        }
        
        // Prevent menu from going off the top of the screen
        if (top < window.scrollY) {
            top = rect.bottom + window.scrollY + 5;
        }

        slashCommandMenu.style.top = `${top}px`;
        slashCommandMenu.style.left = `${left}px`;
        slashMenuActive = true;
    }

    function closeSlashMenu() {
        slashCommandMenu.classList.add('hidden');
        slashMenuActive = false;
        currentSlashCommandBlock = null;
    }

    function executeCommand(command) {
        if (!currentSlashCommandBlock) return;

        const selection = window.getSelection();
        const range = document.createRange();

        // Select the contents of the block that contains the slash command
        range.selectNodeContents(currentSlashCommandBlock);
        selection.removeAllRanges();
        selection.addRange(range);

        // Delete the slash command text (e.g., "/h1")
        document.execCommand('delete', false, null);

        // Now that the block is empty, apply the formatting command
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
            if (filteredCommands[activeCommandIndex]) {
                executeCommand(filteredCommands[activeCommandIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeSlashMenu();
        }
    }

    // --- Markdown Shortcuts ---
    function handleMarkdownShortcuts(e) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const node = selection.anchorNode;
        if (!node || node.nodeType !== Node.TEXT_NODE) return;

        const block = getParentBlock(node);
        if (!block) return;

        const text = block.textContent;

        const applyShortcut = (command, value, length) => {
            // Select and delete the markdown text
            const range = document.createRange();
            range.setStart(block.firstChild, 0);
            range.setEnd(block.firstChild, length);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('delete', false, null);

            // Apply the command
            document.execCommand(command, false, value);
            updateNote();
        };

        // Space-triggered shortcuts
        if (e.key === ' ') {
            if (selection.anchorOffset !== text.length) return;

            if (text.startsWith('# ')) {
                applyShortcut('formatBlock', '<h1>', 2);
            } else if (text.startsWith('## ')) {
                applyShortcut('formatBlock', '<h2>', 3);
            } else if (text.startsWith('### ')) {
                applyShortcut('formatBlock', '<h3>', 4);
            } else if (text.startsWith('> ')) {
                applyShortcut('formatBlock', '<blockquote>', 2);
            } else if (text.startsWith('* ') || text.startsWith('- ')) {
                applyShortcut('insertUnorderedList', null, 2);
            } else if (/^1\. $/.test(text)) {
                applyShortcut('insertOrderedList', null, 3);
            }
        }

        // Enter-triggered shortcuts
        if (e.key === 'Enter') {
            if (text === '---' || text === '***') {
                e.preventDefault();

                const hr = document.createElement('hr');
                const newBlock = document.createElement('div');
                newBlock.appendChild(document.createElement('br'));

                const parent = block.parentNode;
                parent.replaceChild(hr, block);
                
                if (hr.nextSibling) {
                    parent.insertBefore(newBlock, hr.nextSibling);
                } else {
                    parent.appendChild(newBlock);
                }

                const range = document.createRange();
                range.setStart(newBlock, 0);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);

                updateNote();
            }
        }
    }

    // --- Floating Toolbar Functions ---
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

            // Prevent toolbar from going above the editor view
            if (top < mainEditor.scrollTop) {
                top = rect.bottom - containerRect.top + mainEditor.scrollTop + 8;
            }

            // Prevent toolbar from going off the sides of the editor view
            if (left < mainEditor.scrollLeft) {
                left = mainEditor.scrollLeft + 8;
            }
            if (left + toolbarRect.width > mainEditor.scrollLeft + containerRect.width) {
                left = mainEditor.scrollLeft + containerRect.width - toolbarRect.width - 8;
            }

            floatingToolbar.style.top = `${top}px`;
            floatingToolbar.style.left = `${left}px`;

            updateToolbarButtonsState();
        } else {
            floatingToolbar.classList.add('hidden');
        }
    }

    function updateToolbarButtonsState() {
        const commands = ['bold', 'italic', 'underline', 'strikeThrough'];
        commands.forEach(command => {
            const button = floatingToolbar.querySelector(`[data-command="${command}"]`);
            if (button) {
                button.classList.toggle('active', document.queryCommandState(command));
            }
        });
    }

    // --- Event Listeners ---
    newNoteBtn.addEventListener('click', createNewNote);
    noteTitleInput.addEventListener('input', updateNote);
    noteEditor.addEventListener('input', updateNote);

    noteEditor.addEventListener('keyup', (e) => {
        // Let keydown handler for slash menu do its thing if menu is active
        if (slashMenuActive && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
            return;
        }

        // Markdown shortcuts
        if (e.key === ' ' || e.key === 'Enter') {
            handleMarkdownShortcuts(e);
        }

        // Slash command activation
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const block = getParentBlock(selection.anchorNode);

        if (block && block.textContent.startsWith('/')) {
            currentSlashCommandBlock = block;
            const query = block.textContent.substring(1);
            openSlashMenu(query);
        } else {
            closeSlashMenu();
        }
    });

    noteEditor.addEventListener('keydown', handleSlashNav, true);

    document.addEventListener('selectionchange', () => {
        // A small timeout can help get a more stable bounding rectangle for the selection
        // especially during quick mouse movements.
        if (document.activeElement === noteEditor) {
            setTimeout(updateToolbarPosition, 1);
        }
    });

    document.addEventListener('click', (e) => {
        // Hide slash menu
        if (slashMenuActive && !slashCommandMenu.contains(e.target) && !noteEditor.contains(e.target)) {
            closeSlashMenu();
        }
        // Hide toolbar if selection is lost
        if (!noteEditor.contains(e.target) && !floatingToolbar.contains(e.target)) {
            floatingToolbar.classList.add('hidden');
        }
    });

    mainEditor.addEventListener('scroll', () => {
        if (!floatingToolbar.classList.contains('hidden')) {
            updateToolbarPosition();
        }
    });

    floatingToolbar.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent editor from losing focus
        const button = e.target.closest('button');
        if (button) {
            const command = button.dataset.command;
            document.execCommand(command, false, null);
            updateNote(); // Save changes
            updateToolbarButtonsState(); // Update button state immediately
        }
    });

    // --- Initial Load ---
    async function init() {
        await loadNotes();
        if (notes.length > 0) {
            selectNote(notes[0].id);
        } else {
            showPlaceholder();
        }
    }

    init();
});