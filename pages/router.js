// pages/router.js — SPA hash-based router with smooth transitions
import { initSidebar } from "./sidebar.js";

const appMain = document.getElementById("app-main");
let currentView = null;
let currentCleanup = null;
let isNavigating = false;

// View registry — lazy-loaded modules
const views = {
    home:          () => import("./views/home-view.js"),
    notes:         () => import("./views/notes-view.js"),
    notifications: () => import("./views/notifications-view.js"),
    admin:         () => import("./views/admin-view.js"),
    account:       () => import("./views/account-view.js"),
    migrate:       () => import("./views/migrate-view.js"),
};

// ── Navigate to a view ──
async function navigateTo(viewName) {
    if (viewName === currentView || isNavigating) return;
    
    const loader = views[viewName];
    if (!loader) {
        console.warn(`[Router] View "${viewName}" not found in registry, redirecting home.`);
        navigateTo("home");
        return;
    }

    try {
        isNavigating = true;
        console.log(`[Router] Navigating to: ${viewName}`);

        // Fade out
        appMain.classList.add("view-exit");
        await sleep(160);

        // Cleanup previous view
        if (currentCleanup) {
            try { 
                if (typeof currentCleanup === 'function') {
                    currentCleanup(); 
                }
            } catch (e) { console.warn("[Router] Cleanup error:", e); }
            currentCleanup = null;
        }

        // Load + mount new view
        try {
            const mod = await loader();
            appMain.innerHTML = mod.template();

            // For notes view, app-main needs row direction
            if (viewName === "notes") {
                appMain.style.flexDirection = "row";
                appMain.style.overflowY = "hidden";
            } else {
                appMain.style.flexDirection = "column";
                appMain.style.overflowY = "auto";
            }

            currentCleanup = await mod.mount(appMain) || null;
            currentView = viewName;
        } catch (err) {
            console.error(`[Router] Failed to load view "${viewName}":`, err);
            appMain.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:#9ca3af;font-size:0.875rem;gap:12px;padding:40px;text-align:center;">
                    <i class="fi fi-rr-triangle-warning" style="font-size:2rem;color:#f87171;"></i>
                    <div style="color:#111827;font-weight:600;font-size:1rem;">Failed to load "${viewName}"</div>
                    <div style="max-width:300px;">There was an error loading this module. Please check the console or reload the extension.</div>
                    <button onclick="window.location.reload()" style="background:#0a0a0a;color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;margin-top:8px;">Reload Page</button>
                </div>
            `;
        }

        // Update sidebar active state
        updateSidebarActive(viewName);

        // Fade in
        appMain.classList.remove("view-exit");
    } finally {
        isNavigating = false;
    }
}

// ── Sidebar active link ──
function updateSidebarActive(viewName) {
    const links = document.querySelectorAll(".sidebar-link");
    links.forEach(link => {
        const href = link.getAttribute("href") || "";
        const linkView = href.replace("#", "");
        if (linkView === viewName) {
            link.classList.add("active");
            link.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
            link.classList.remove("active");
        }
    });
}

// ── Hash routing ──
function getViewFromHash() {
    const hash = window.location.hash.replace("#", "").split("?")[0];
    return hash || "home";
}

window.addEventListener("hashchange", () => {
    const view = getViewFromHash();
    console.log(`[Router] Hash changed to: ${view}`);
    navigateTo(view);
});

// ── Init ──
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("[Router] Initializing...");
    await initSidebar();

    // Default to #home if no hash
    if (!window.location.hash) {
        window.location.hash = "#home";
    } else {
        navigateTo(getViewFromHash());
    }
});

