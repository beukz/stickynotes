export function template() {
    return `
        <div class="account-content">
            <div class="account-card-box">
                <h1>Sync Settings</h1>
                <p>Log in with Supabase to sync your notes across devices and access the web dashboard.</p>
                <div class="account-row" id="auth-buttons">
                    <!-- Buttons injected dynamically -->
                </div>
                <div id="sync-status" class="account-status-box hidden"></div>
            </div>
        </div>
    `;
}

export async function mount(container) {
    const authButtons = container.querySelector("#auth-buttons");
    const syncStatus = container.querySelector("#sync-status");
    let currentUser = null;

    async function checkAuth() {
        return new Promise((resolve) => {
            chrome.storage.local.get("supabase_session", (data) => {
                currentUser = data.supabase_session?.user || null;
                resolve(currentUser);
            });
        });
    }

    async function updateUI() {
        await checkAuth();
        authButtons.innerHTML = "";
        
        if (currentUser) {
            // Logged in
            syncStatus.textContent = `Syncing as: ${currentUser.email}`;
            syncStatus.className = "account-status-box ok";
            
            const dashBtn = document.createElement("button");
            dashBtn.textContent = "Open Web Dashboard";
            dashBtn.onclick = () => window.open("https://supabase.com/dashboard/project/qrnnthitqgpiowixmlpd", "_blank");
            
            const logoutBtn = document.createElement("button");
            logoutBtn.textContent = "Sign Out";
            logoutBtn.className = "secondary";
            logoutBtn.onclick = handleLogout;
            
            authButtons.appendChild(dashBtn);
            authButtons.appendChild(logoutBtn);
        } else {
            // Logged out
            syncStatus.textContent = "Local mode active. Notes will not sync.";
            syncStatus.className = "account-status-box warn";
            
            const loginBtn = document.createElement("button");
            loginBtn.textContent = "Sign in to Sync";
            loginBtn.onclick = handleLogin;
            
            authButtons.appendChild(loginBtn);
        }
    }

    async function handleLogin() {
        // Just open the Supabase login flow in a tab for now
        chrome.tabs.create({ url: chrome.runtime.getURL("pages/home.html#home") }); // Simplification for demo
    }

    async function handleLogout() {
        chrome.storage.local.remove("supabase_session", () => {
            updateUI();
            // Refresh sidebar
            import("../../pages/sidebar.js").then(m => m.initSidebar());
        });
    }

    updateUI();

    return () => {
        // cleanup
    };
}
