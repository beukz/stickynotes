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
            
            const migrateBtn = document.createElement("button");
            migrateBtn.innerHTML = `<i class="fi fi-rr-cloud-upload" style="margin-right: 8px;"></i> Migrate Local Data`;
            migrateBtn.onclick = () => window.location.hash = "#migrate";
            
            const logoutBtn = document.createElement("button");
            logoutBtn.innerHTML = `<i class="fi fi-rr-exit" style="margin-right: 8px;"></i> Sign Out`;
            logoutBtn.className = "secondary";
            logoutBtn.onclick = handleLogout;
            
            authButtons.appendChild(migrateBtn);
            authButtons.appendChild(logoutBtn);
        } else {
            // Logged out
            syncStatus.textContent = "Local mode active. Notes will not sync.";
            syncStatus.className = "account-status-box warn";
            
            const loginBtn = document.createElement("button");
            loginBtn.className = "google-login-btn";
            loginBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 18 18" style="margin-right: 10px;">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.938 5.512 18 9 18z"/>
                    <path fill="#FBBC05" d="M3.964 10.71a4.914 4.914 0 0 1 0-3.42V4.958H.957a8.993 8.993 0 0 0 0 8.084l3.007-2.332z"/>
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.512 0 2.438 2.062.957 5.042l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58z"/>
                </svg>
                <span>Sign in with Google</span>
            `;
            loginBtn.onclick = handleLogin;
            
            authButtons.appendChild(loginBtn);
        }
    }

    async function handleLogin() {
        try {
            const { startGoogleSignIn } = await import("../../supabase/auth.js");
            await startGoogleSignIn();
        } catch (error) {
            console.error("[Account] Login error:", error);
            alert("Failed to start login flow. Please check the console.");
        }
    }

    async function handleLogout() {
        const { signOut } = await import("../../supabase/auth.js");
        await signOut();
        updateUI();
        // Refresh sidebar
        import("../../pages/sidebar.js").then(m => m.initSidebar());
    }

    updateUI();

    return () => {
        // cleanup
    };
}
