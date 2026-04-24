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
                <section class="notification-management">
                    <div class="section-header">
                        <h2><i class="fi fi-rr-bell"></i> Send Broadcast</h2>
                        <p>Send a message to all or specific users immediately.</p>
                    </div>
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

                <div class="section-divider"></div>

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
            </main>
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

    let allUsers = [];

    async function fetchUsers() {
        loadingState.classList.remove("hidden");
        errorState.classList.add("hidden");
        usersBody.innerHTML = "";
        try {
            const session = await getSession();
            if (!session) throw new Error("Not authenticated");
            const role = await getUserRole();
            if (role !== "admin") throw new Error("Access Denied: You do not have administrator privileges.");
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

    refreshBtn.addEventListener("click", fetchUsers);

    notificationForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        sendNotifBtn.disabled = true;
        sendNotifBtn.innerHTML = '<i class="fi fi-rr-spinner spin"></i> Sending...';
        try {
            const session = await getSession();
            if (!session) throw new Error("Not authenticated");
            const res = await fetch(`${SUPABASE_URL}/rest/v1/stickynotes_notifications`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}`, "apikey": SUPABASE_ANON_KEY, "Prefer": "return=minimal" },
                body: JSON.stringify({ title: notifTitle.value, message: notifMessage.value, target_group: notifTarget.value })
            });
            if (!res.ok) throw new Error("Failed to send notification");
            showToast("Notification broadcasted successfully!");
            notificationForm.reset();
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
    return () => {};
}
