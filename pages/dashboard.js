document.addEventListener("DOMContentLoaded", () => {
    const domainNav = document.getElementById("domain-nav");
    const notesGrid = document.getElementById("notes-grid");
    const searchInput = document.getElementById("search-input");

    let allNotesData = {};
    let activeDomain = "all";

    function getMainDomain(url) {
        try {
            if (!url.startsWith("https://") && !url.startsWith("http://")) {
                url = `https://${url}`;
            }
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (error) {
            console.warn("Invalid URL encountered:", url, error);
            return null;
        }
    }

    function renderDomains(notesData) {
        domainNav.innerHTML = ''; // Clear previous domains

        const groupedNotes = {};
        for (const [url, notes] of Object.entries(notesData)) {
            if (!Array.isArray(notes) || notes.length === 0) continue;
            const mainDomain = getMainDomain(url);
            if (!mainDomain) continue;
            if (!groupedNotes[mainDomain]) {
                groupedNotes[mainDomain] = 0;
            }
            groupedNotes[mainDomain] += notes.length;
        }

        // "All Notes" link
        const allNotesLink = document.createElement("a");
        allNotesLink.className = "domain-link active";
        allNotesLink.dataset.domain = "all";
        allNotesLink.innerHTML = `<i class="fi fi-rr-apps"></i> <span>All Notes</span>`;
        allNotesLink.addEventListener('click', () => setActiveDomain('all'));
        domainNav.appendChild(allNotesLink);

        const domainsHeader = document.createElement('h3');
        domainsHeader.textContent = 'Websites';
        domainNav.appendChild(domainsHeader);

        const sortedDomains = Object.keys(groupedNotes).sort();

        for (const domain of sortedDomains) {
            const domainLink = document.createElement("a");
            domainLink.className = "domain-link";
            domainLink.dataset.domain = domain;
            domainLink.innerHTML = `
                <img src="https://www.google.com/s2/favicons?domain=${domain}" class="favicon" alt="">
                <span>${domain}</span>
            `;
            domainLink.addEventListener('click', () => setActiveDomain(domain));
            domainNav.appendChild(domainLink);
        }
    }

    function setActiveDomain(domain) {
        activeDomain = domain;
        document.querySelectorAll('.domain-link').forEach(link => {
            link.classList.toggle('active', link.dataset.domain === domain);
        });
        renderNotes(allNotesData);
    }

    function renderNotes(notesData) {
        notesGrid.innerHTML = '';
        const searchTerm = searchInput.value.toLowerCase();

        let notesToShow = [];

        for (const [url, notes] of Object.entries(notesData)) {
            if (!Array.isArray(notes) || notes.length === 0) continue;
            const mainDomain = getMainDomain(url);

            // Filter by active domain
            if (activeDomain !== 'all' && mainDomain !== activeDomain) {
                continue;
            }

            notes.forEach(note => {
                // Filter by search term
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = note.content;
                const noteText = (tempDiv.textContent || tempDiv.innerText || '').toLowerCase();
                const noteTitle = (note.title || '').toLowerCase();

                if (searchTerm && !noteText.includes(searchTerm) && !noteTitle.includes(searchTerm)) {
                    return;
                }

                notesToShow.push({ url, ...note });
            });
        }

        if (notesToShow.length === 0) {
            const message = document.createElement("div");
            message.className = "no-notes-message";
            message.textContent = searchTerm 
                ? "No notes match your search." 
                : "No notes here. Go create some!";
            notesGrid.appendChild(message);
            return;
        }

        notesToShow.forEach(note => {
            const card = document.createElement("div");
            card.className = "note-card";
            card.style.borderColor = note.color || '#ffd165';

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = note.content;
            const plainTextContent = tempDiv.textContent || tempDiv.innerText || '';

            card.innerHTML = `
                <div class="note-card-header">
                    <h3 class="note-card-title">${note.title || 'Note'}</h3>
                </div>
                <div class="note-card-content">
                    ${note.content}
                </div>
                <div class="note-card-footer">
                    <button class="note-action-btn visit-btn" title="Go to Note">
                        <i class="fi fi-rr-arrow-up-right-from-square"></i>
                    </button>
                    <button class="note-action-btn copy-btn" title="Copy Note Content">
                        <i class="fi fi-rr-copy"></i>
                    </button>
                    <button class="note-action-btn delete-btn" title="Delete Note">
                        <i class="fi fi-rr-trash"></i>
                    </button>
                </div>
            `;

            // Add event listeners
            card.querySelector('.visit-btn').addEventListener('click', () => {
                chrome.tabs.create({ url: note.url });
            });

            const copyBtn = card.querySelector('.copy-btn');
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(plainTextContent).then(() => {
                    copyBtn.innerHTML = '<i class="fi fi-rr-check"></i>';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fi fi-rr-copy"></i>';
                    }, 2000);
                });
            });

            card.querySelector('.delete-btn').addEventListener('click', () => {
                if (confirm('Are you sure you want to delete this note?')) {
                    deleteNote(note.url, note);
                }
            });

            notesGrid.appendChild(card);
        });
    }

    function deleteNote(url, noteToDelete) {
        chrome.storage.sync.get(url, (data) => {
            if (chrome.runtime.lastError) {
                console.error("Error retrieving notes for deletion:", chrome.runtime.lastError);
                return;
            }

            const notes = data[url] || [];
            const updatedNotes = notes.filter(
                (note) => !(note.content === noteToDelete.content && note.top === noteToDelete.top && note.left === noteToDelete.left)
            );

            if (updatedNotes.length === 0) {
                chrome.storage.sync.remove(url, () => !chrome.runtime.lastError && loadAllData());
            } else {
                chrome.storage.sync.set({ [url]: updatedNotes }, () => !chrome.runtime.lastError && loadAllData());
            }
        });
    }

    function loadAllData() {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.get(null, (data) => {
                if (chrome.runtime.lastError) {
                    console.error("Error retrieving data:", chrome.runtime.lastError);
                    return;
                }
                const notesData = { ...data };
                delete notesData.collapsed_domains;
                allNotesData = notesData;
                
                renderDomains(allNotesData);
                renderNotes(allNotesData);
            });
        } else {
            console.warn("chrome.storage.sync API not available. Dashboard will be empty.");
            renderDomains({});
            renderNotes({});
        }
    }
    
    searchInput.addEventListener('input', () => renderNotes(allNotesData));

    // Initial load
    loadAllData();

    // Listen for changes in storage to keep the dashboard in sync
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
            console.log('Storage changed, reloading dashboard data.');
            loadAllData();
        }
    });
});