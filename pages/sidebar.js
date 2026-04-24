// pages/sidebar.js
import { getSession } from "../supabase/auth.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase/client.js";

async function getUserRole(session) {
    if (!session?.user) return 'guest';
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
    
    // Determine active page
    const path = window.location.pathname;
    const isHome = path.includes("home.html");
    const isNotes = path.includes("notes.html");
    const isNotifications = path.includes("notification.html");
    const isAdmin = path.includes("admin.html");
    
    // Initial skeleton
    sidebarContainer.innerHTML = `
        <div class="sidebar-header">
            <img src="../assets/pin.png" alt="Logo" class="logo" />
            <h2>Sticky Notes</h2>
        </div>
        <nav class="sidebar-nav">
            <a href="home.html" class="sidebar-link ${isHome ? 'active' : ''}">
                <i class="fi fi-rr-home"></i> <span>Home</span>
            </a>
            <a href="notes.html" class="sidebar-link ${isNotes ? 'active' : ''}">
                <i class="fi fi-rr-document"></i> <span>My Notes</span>
            </a>
            <a href="notification.html" class="sidebar-link ${isNotifications ? 'active' : ''}">
                <i class="fi fi-rr-bell"></i> <span>Notifications</span>
            </a>
            <a href="admin.html" id="sidebar-admin-link" class="sidebar-link hidden ${isAdmin ? 'active' : ''}">
                <i class="fi fi-rr-shield-check"></i> <span>Admin</span>
            </a>
        </nav>
        <div class="sidebar-footer">
            <div class="account-card-bg"></div>
            <a href="account.html" id="sidebar-account-card" class="account-card guest">
                <div class="account-avatar"><i class="fi fi-rr-user"></i></div>
                <div class="account-info">
                    <span class="account-name">Guest User</span>
                    <span class="account-status">Sign in to sync</span>
                </div>
            </a>
        </div>
    `;

    // Fetch session and update account/admin sections
    const session = await getSession();
    const accountCard = document.getElementById("sidebar-account-card");
    const adminLink = document.getElementById("sidebar-admin-link");

    if (session?.user) {
        const profile = await getUserRole(session);
        const name = profile.full_name || session.user.email.split('@')[0];
        
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

        if (profile.role === 'admin') {
            adminLink.classList.remove("hidden");
        }
    }
}
