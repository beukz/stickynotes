// pages/sidebar.js — Global sidebar for SPA shell
import { getSession } from "../supabase/auth.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase/client.js";

async function getUserProfile(session) {
    if (!session?.user) return { role: 'guest' };
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/stickynotes_users?id=eq.${session.user.id}&select=role,full_name,avatar_url`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${session.access_token}`
            }
        });
        const data = await res.json();
        return data?.[0] || { role: 'user' };
    } catch (err) {
        console.error("Error fetching user profile for sidebar:", err);
        return { role: 'user' };
    }
}

export async function initSidebar() {
    const sidebarContainer = document.getElementById("app-sidebar");
    if (!sidebarContainer) return;

    sidebarContainer.className = "app-sidebar";

    // Determine active page from hash
    const hash = window.location.hash.replace("#", "") || "home";
    const isHome = hash === "home";
    const isNotes = hash === "notes";
    const isNotifications = hash === "notifications";
    const isAdmin = hash === "admin";

    sidebarContainer.innerHTML = `
        <div class="sidebar-header" id="sidebar-logo-header" style="cursor: pointer;">
            <img src="../assets/pin.png" alt="Logo" class="logo" />
            <h2>Sticky Notes</h2>
        </div>
        <nav class="sidebar-nav">
            <a href="#home" class="sidebar-link ${isHome ? 'active' : ''}">
                <i class="fi fi-rr-home"></i> <span>Home</span>
            </a>
            <a href="#notes" class="sidebar-link ${isNotes ? 'active' : ''}">
                <i class="fi fi-rr-document"></i> <span>My Notes</span>
            </a>
            <a href="#notifications" class="sidebar-link ${isNotifications ? 'active' : ''}">
                <i class="fi fi-rr-bell"></i> <span>Notifications</span>
            </a>
            <a href="#admin" id="sidebar-admin-link" class="sidebar-link hidden ${isAdmin ? 'active' : ''}">
                <i class="fi fi-rr-shield-check"></i> <span>Admin</span>
            </a>
        </nav>
        <div class="sidebar-footer">
            <div class="account-card-bg"></div>
            <a href="#account" id="sidebar-account-card" class="sidebar-link account-card guest">
                <div class="account-avatar"><i class="fi fi-rr-user"></i></div>
                <div class="account-info">
                    <span class="account-name">Guest User</span>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <svg width="10" height="10" viewBox="0 0 18 18">
                            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.938 5.512 18 9 18z"/>
                            <path fill="#FBBC05" d="M3.964 10.71a4.914 4.914 0 0 1 0-3.42V4.958H.957a8.993 8.993 0 0 0 0 8.084l3.007-2.332z"/>
                            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.512 0 2.438 2.062.957 5.042l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58z"/>
                        </svg>
                        <span class="account-status">Sign in to sync</span>
                    </div>
                </div>
            </a>
        </div>
    `;

    const logoHeader = document.getElementById("sidebar-logo-header");
    if (logoHeader) {
        logoHeader.addEventListener("click", () => {
            window.location.hash = "#home";
        });
    }

    // Fetch session and update account/admin sections
    const session = await getSession();
    const accountCard = document.getElementById("sidebar-account-card");
    const adminLink = document.getElementById("sidebar-admin-link");

    if (session?.user) {
        const profile = await getUserProfile(session);
        const name = profile.full_name || session.user.email.split('@')[0];

        if (accountCard) {
            accountCard.classList.remove("guest");
            accountCard.innerHTML = `
                <div class="account-avatar">
                    ${profile.avatar_url
                        ? `<img src="${profile.avatar_url}" alt="Avatar">`
                        : `<span style="color: #4b5563;">${name.charAt(0).toUpperCase()}</span>`
                    }
                </div>
                <div class="account-info">
                    <span class="account-name">${name}</span>
                    <span class="account-status">Logged in</span>
                </div>
            `;
        }

        if (profile.role === 'admin' && adminLink) {
            adminLink.classList.remove("hidden");
        }
    }
}
