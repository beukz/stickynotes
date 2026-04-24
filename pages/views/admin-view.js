import { getSession, getUserRole } from "../../supabase/auth.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../../supabase/client.js";

export function template() {
    return `
        <div class="admin-container">
            <header class="admin-header">
                <div class="header-left">
                    <h1>Admin Dashboard</h1>
                </div>
                <div class="header-right">
                    <div class="stats">
                        <span id="user-count">Total Users: 0</span>
                    </div>
                    <button id="refresh-btn" class="primary-btn"><i class="fi fi-rr-refresh"></i> Refresh</button>
                </div>
            </header>

            <main class="admin-main">
                <div class="admin-tabs" role="tablist" aria-label="Admin sections">
                    <button class="admin-tab active" type="button" role="tab" aria-selected="true" aria-controls="tab-users" data-tab="users">
                        <i class="fi fi-rr-users"></i>
                        Users
                    </button>
                    <button class="admin-tab" type="button" role="tab" aria-selected="false" aria-controls="tab-broadcast" data-tab="broadcast">
                        <i class="fi fi-rr-megaphone"></i>
                        Broadcast
                    </button>
                    <button class="admin-tab" type="button" role="tab" aria-selected="false" aria-controls="tab-notifications" data-tab="notifications">
                        <i class="fi fi-rr-bell"></i>
                        Notifications
                    </button>
                </div>

                <section id="tab-users" class="admin-panel active" role="tabpanel">
                    <div class="panel-header">
                        <div>
                            <h2>Users</h2>
                            <p>Search and review registered users.</p>
                        </div>
                    </div>

                    <div class="search-bar">
                        <i class="fi fi-rr-search"></i>
                        <input type="text" id="search-input" placeholder="Search by email, name, or role...">
                    </div>

                    <div class="table-container">
                        <table class="users-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Plan</th>
                                    <th>Joined</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="users-tbody">
                                <!-- Users will be populated here -->
                            </tbody>
                        </table>
                    </div>
                    
                    <div id="loading-state" class="state-container hidden">
                        <i class="fi fi-rr-spinner spin"></i>
                        <p>Loading users...</p>
                    </div>

                    <div id="error-state" class="state-container error-state hidden">
                        <i class="fi fi-rr-triangle-warning"></i>
                        <p id="error-msg">Failed to load data.</p>
                    </div>
                </section>

                <section id="tab-broadcast" class="admin-panel" role="tabpanel">
                    <div class="panel-header">
                        <div>
                            <h2>Send broadcast</h2>
                            <p>Send a message to all or specific users immediately.</p>
                        </div>
                    </div>

                    <section class="notification-management">
                        <form id="notification-form" class="notification-form">
                            <div class="form-group">
                                <label for="notif-title">Title</label>
                                <input type="text" id="notif-title" placeholder="e.g. New Feature Update" required>
                            </div>
                            <div class="form-group">
                                <label for="notif-message">Message</label>
                                <textarea id="notif-message" placeholder="What would you like to tell your users?" required></textarea>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="notif-target">Target Audience</label>
                                    <select id="notif-target" required>
                                        <option value="all">Everyone (Incl. Guests)</option>
                                        <option value="signed_up">Signed-up Users Only</option>
                                        <option value="free">Free Plan Users Only</option>
                                        <option value="pro">Pro Users Only</option>
                                    </select>
                                </div>
                                <button type="submit" id="send-notif-btn" class="primary-btn">
                                    <i class="fi fi-rr-paper-plane"></i> Send Notification
                                </button>
                            </div>
                        </form>
                    </section>
                </section>

                <section id="tab-notifications" class="admin-panel" role="tabpanel">
                    <div class="panel-header">
                        <div>
                            <h2>Notifications</h2>
                            <p>Review or delete previously sent notifications.</p>
                        </div>
                        <button id="refresh-notifs-btn" class="secondary-btn" type="button" title="Refresh notifications">
                            <i class="fi fi-rr-refresh"></i>
                        </button>
                    </div>

                    <div class="admin-notifications">
                        <div id="admin-notifs-state" class="admin-notifs-state hidden"></div>
                        <div id="admin-notifs-list" class="admin-notifs-list"></div>
                    </div>
                </section>
            </main>
        </div>

        <!-- Admin modal (edit + confirm) -->
        <div id="admin-modal-overlay" class="admin-modal-overlay hidden" role="dialog" aria-modal="true">
            <div class="admin-modal">
                <div class="admin-modal-header">
                    <h3 id="admin-modal-title">Modal</h3>
                    <button id="admin-modal-close" class="admin-icon-btn" type="button" title="Close">
                        <i class="fi fi-rr-cross-small"></i>
                    </button>
                </div>
                <div id="admin-modal-body" class="admin-modal-body"></div>
                <div id="admin-modal-actions" class="admin-modal-actions"></div>
            </div>
        </div>
    `;
}

export async function mount(container) {
    const usersBody = container.querySelector("#users-tbody");
    const userCountEl = container.querySelector("#user-count");
    const searchInput = container.querySelector("#search-input");
    const refreshBtn = container.querySelector("#refresh-btn");
    const loadingState = container.querySelector("#loading-state");
    const errorState = container.querySelector("#error-state");
    const errorMsg = container.querySelector("#error-msg");
    const notificationForm = container.querySelector("#notification-form");
    const notifTitle = container.querySelector("#notif-title");
    const notifMessage = container.querySelector("#notif-message");
    const notifTarget = container.querySelector("#notif-target");
    const sendNotifBtn = container.querySelector("#send-notif-btn");
    const adminNotifsList = container.querySelector("#admin-notifs-list");
    const adminNotifsState = container.querySelector("#admin-notifs-state");
    const refreshNotifsBtn = container.querySelector("#refresh-notifs-btn");
    const tabButtons = container.querySelectorAll(".admin-tab");
    const panels = container.querySelectorAll(".admin-panel");
    const modalOverlay = container.querySelector("#admin-modal-overlay") || document.querySelector("#admin-modal-overlay");
    const modalTitleEl = document.querySelector("#admin-modal-title");
    const modalBodyEl = document.querySelector("#admin-modal-body");
    const modalActionsEl = document.querySelector("#admin-modal-actions");
    const modalCloseBtn = document.querySelector("#admin-modal-close");

    let allUsers = [];
    let allNotifications = [];
    let sessionCache = null;

    function escapeHtml(str) {
        return String(str ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function openModal({ title, bodyHtml, actions = [] }) {
        modalTitleEl.textContent = title || "Modal";
        modalBodyEl.innerHTML = bodyHtml || "";
        modalActionsEl.innerHTML = "";
        actions.forEach(a => modalActionsEl.appendChild(a));
        modalOverlay.classList.remove("hidden");
        setTimeout(() => modalOverlay.classList.add("active"), 5);
    }

    function closeModal() {
        modalOverlay.classList.remove("active");
        setTimeout(() => modalOverlay.classList.add("hidden"), 150);
    }

    function makeButton({ label, icon, variant = "secondary", onClick, danger = false, disabled = false }) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = variant === "primary" ? "admin-btn primary" : "admin-btn secondary";
        if (danger) btn.classList.add("danger");
        if (icon) btn.innerHTML = `<i class="fi ${icon}"></i><span>${label}</span>`;
        else btn.textContent = label;
        btn.disabled = disabled;
        btn.addEventListener("click", onClick);
        return btn;
    }

    function confirmModal({ title = "Confirm", message = "Are you sure?", confirmText = "Confirm", cancelText = "Cancel", danger = true }) {
        return new Promise((resolve) => {
            const cancelBtn = makeButton({
                label: cancelText,
                variant: "secondary",
                onClick: () => { closeModal(); resolve(false); }
            });
            const confirmBtn = makeButton({
                label: confirmText,
                variant: "primary",
                danger,
                onClick: () => { closeModal(); resolve(true); }
            });

            openModal({
                title,
                bodyHtml: `<p class="admin-modal-text">${escapeHtml(message)}</p>`,
                actions: [cancelBtn, confirmBtn],
            });
        });
    }

    async function editNotificationModal(notification) {
        return new Promise((resolve) => {
            const id = notification.id;
            const title = notification.title || "";
            const message = notification.message || "";
            const target = notification.target_group || "all";

            openModal({
                title: "Edit notification",
                bodyHtml: `
                    <div class="admin-modal-form">
                        <div class="form-group">
                            <label>Title</label>
                            <input id="edit-notif-title" type="text" value="${escapeHtml(title)}" />
                        </div>
                        <div class="form-group">
                            <label>Message</label>
                            <textarea id="edit-notif-message">${escapeHtml(message)}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Target audience</label>
                            <select id="edit-notif-target">
                                <option value="all" ${target === "all" ? "selected" : ""}>Everyone (Incl. Guests)</option>
                                <option value="signed_up" ${target === "signed_up" ? "selected" : ""}>Signed-up Users Only</option>
                                <option value="free" ${target === "free" ? "selected" : ""}>Free Plan Users Only</option>
                                <option value="pro" ${target === "pro" ? "selected" : ""}>Pro Users Only</option>
                            </select>
                        </div>
                    </div>
                `,
                actions: [
                    makeButton({
                        label: "Cancel",
                        variant: "secondary",
                        onClick: () => { closeModal(); resolve(null); }
                    }),
                    makeButton({
                        label: "Save changes",
                        icon: "fi-rr-disk",
                        variant: "primary",
                        onClick: () => {
                            const next = {
                                id,
                                title: document.querySelector("#edit-notif-title")?.value ?? "",
                                message: document.querySelector("#edit-notif-message")?.value ?? "",
                                target_group: document.querySelector("#edit-notif-target")?.value ?? "all",
                            };
                            closeModal();
                            resolve(next);
                        }
                    }),
                ],
            });
        });
    }

    async function requireAdminSession() {
        if (sessionCache?.access_token) return sessionCache;
        const session = await getSession();
        if (!session) throw new Error("Not authenticated");
        const role = await getUserRole();
        if (role !== "admin") throw new Error("Access Denied: You do not have administrator privileges.");
        sessionCache = session;
        return session;
    }

    async function fetchUsers() {
        loadingState.classList.remove("hidden");
        errorState.classList.add("hidden");
        usersBody.innerHTML = "";
        try {
            const session = await requireAdminSession();
            const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-get-users`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}`, "apikey": SUPABASE_ANON_KEY }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || err.message || `Failed to fetch users (${res.status})`);
            }
            const data = await res.json();
            allUsers = data.users || [];
            renderUsers(allUsers);
            userCountEl.textContent = `Total Users: ${allUsers.length}`;
        } catch (err) {
            console.error("Admin fetch error:", err);
            errorMsg.textContent = err.message;
            errorState.classList.remove("hidden");
        } finally { loadingState.classList.add("hidden"); }
    }

    function setNotifsState(text = "", type = "info") {
        if (!adminNotifsState) return;
        if (!text) {
            adminNotifsState.classList.add("hidden");
            adminNotifsState.textContent = "";
            adminNotifsState.dataset.type = "";
            return;
        }
        adminNotifsState.classList.remove("hidden");
        adminNotifsState.textContent = text;
        adminNotifsState.dataset.type = type;
    }

    async function fetchNotifications() {
        if (!adminNotifsList) return;
        adminNotifsList.innerHTML = "";
        setNotifsState("Loading notifications…", "loading");
        try {
            const session = await requireAdminSession();
            const res = await fetch(`${SUPABASE_URL}/rest/v1/stickynotes_notifications?order=created_at.desc`, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`,
                    "apikey": SUPABASE_ANON_KEY
                }
            });
            if (!res.ok) throw new Error("Failed to fetch notifications");
            allNotifications = await res.json();
            renderNotifications(allNotifications);
            setNotifsState(allNotifications.length ? "" : "No notifications yet.", "empty");
        } catch (e) {
            console.error("Fetch notifications error:", e);
            setNotifsState(e.message || "Failed to load notifications.", "error");
        }
    }

    function renderNotifications(list) {
        if (!adminNotifsList) return;
        adminNotifsList.innerHTML = "";
        list.forEach(n => {
            const row = document.createElement("div");
            row.className = "admin-notif-row";
            row.innerHTML = `
                <div class="admin-notif-main">
                    <div class="admin-notif-title">${escapeHtml(n.title || "Untitled")}</div>
                    <div class="admin-notif-meta">
                        <span class="admin-notif-pill">${escapeHtml(n.target_group || "all")}</span>
                        <span class="admin-notif-time">${n.created_at ? new Date(n.created_at).toLocaleString() : ""}</span>
                    </div>
                    <div class="admin-notif-message">${escapeHtml(n.message || "")}</div>
                </div>
                <div class="admin-notif-actions">
                    <button class="admin-notif-edit" type="button" title="Edit notification" data-id="${n.id}">
                        <i class="fi fi-rr-pencil"></i>
                    </button>
                    <button class="admin-notif-delete" type="button" title="Delete notification" data-id="${n.id}">
                        <i class="fi fi-rr-trash"></i>
                    </button>
                </div>
            `;
            adminNotifsList.appendChild(row);
        });

        adminNotifsList.querySelectorAll(".admin-notif-edit").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.dataset.id;
                const n = allNotifications.find(x => String(x.id) === String(id));
                if (!n) return;

                const update = await editNotificationModal(n);
                if (!update) return;

                btn.disabled = true;
                try {
                    await updateNotification(update);
                    allNotifications = allNotifications.map(x => String(x.id) === String(update.id) ? { ...x, ...update } : x);
                    renderNotifications(allNotifications);
                    showToast("Notification updated.");
                } catch (err) {
                    alert("Failed to update: " + (err.message || err));
                    btn.disabled = false;
                }
            });
        });

        adminNotifsList.querySelectorAll(".admin-notif-delete").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.dataset.id;
                if (!id) return;

                const ok = await confirmModal({
                    title: "Delete notification?",
                    message: "This will permanently delete the notification for everyone.",
                    confirmText: "Delete",
                    cancelText: "Cancel",
                    danger: true,
                });
                if (!ok) return;

                btn.disabled = true;
                try {
                    await deleteNotification(id);
                    allNotifications = allNotifications.filter(n => String(n.id) !== String(id));
                    renderNotifications(allNotifications);
                    setNotifsState(allNotifications.length ? "" : "No notifications yet.", "empty");
                    showToast("Notification deleted.");
                } catch (err) {
                    alert("Failed to delete: " + (err.message || err));
                    btn.disabled = false;
                }
            });
        });
    }

    async function deleteNotification(id) {
        const session = await requireAdminSession();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-delete-notification`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
                "apikey": SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ id })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || `Delete request failed (${res.status})`);
        }
    }

    async function updateNotification({ id, title, message, target_group }) {
        const session = await requireAdminSession();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-update-notification`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
                "apikey": SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ id, title, message, target_group })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || `Update request failed (${res.status})`);
        }
    }

    function renderUsers(users) {
        usersBody.innerHTML = "";
        users.forEach(user => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="user-id">${user.id}</td>
                <td>${user.email || "N/A"}</td>
                <td><span class="badge role-${user.role}">${user.role || 'user'}</span></td>
                <td><span class="badge plan-${user.plan}">${user.plan || 'free'}</span></td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td class="actions"><button class="action-btn" title="View Details"><i class="fi fi-rr-eye"></i></button></td>
            `;
            usersBody.appendChild(tr);
        });
    }

    searchInput.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allUsers.filter(u => (u.email && u.email.toLowerCase().includes(term)) || (u.full_name && u.full_name.toLowerCase().includes(term)) || u.id.toLowerCase().includes(term));
        renderUsers(filtered);
    });

    refreshBtn.addEventListener("click", async () => {
        await fetchUsers();
        await fetchNotifications();
    });

    if (refreshNotifsBtn) {
        refreshNotifsBtn.addEventListener("click", fetchNotifications);
    }

    notificationForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        sendNotifBtn.disabled = true;
        sendNotifBtn.innerHTML = '<i class="fi fi-rr-spinner spin"></i> Sending...';
        try {
            const session = await requireAdminSession();
            const res = await fetch(`${SUPABASE_URL}/rest/v1/stickynotes_notifications`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}`, "apikey": SUPABASE_ANON_KEY, "Prefer": "return=minimal" },
                body: JSON.stringify({ title: notifTitle.value, message: notifMessage.value, target_group: notifTarget.value })
            });
            if (!res.ok) throw new Error("Failed to send notification");
            showToast("Notification broadcasted successfully!");
            notificationForm.reset();
            await fetchNotifications();
        } catch (err) { alert("Error sending notification: " + err.message); } finally {
            sendNotifBtn.disabled = false;
            sendNotifBtn.innerHTML = '<i class="fi fi-rr-paper-plane"></i> Send Notification';
        }
    });

    function showToast(msg) {
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.innerHTML = `<i class="fi fi-rr-check-circle"></i> ${msg}`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(20px)";
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    fetchUsers();
    fetchNotifications();

    function setActiveTab(tab) {
        tabButtons.forEach(b => {
            const isActive = b.dataset.tab === tab;
            b.classList.toggle("active", isActive);
            b.setAttribute("aria-selected", isActive ? "true" : "false");
        });
        panels.forEach(p => {
            const isActive = p.id === `tab-${tab}`;
            p.classList.toggle("active", isActive);
        });
    }

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            setActiveTab(tab);
            if (tab === "notifications") fetchNotifications();
            if (tab === "users") fetchUsers();
        });
    });

    // Modal interactions
    if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener("click", (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modalOverlay && !modalOverlay.classList.contains("hidden")) {
            closeModal();
        }
    });

    return () => {};
}
