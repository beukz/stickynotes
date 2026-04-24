import { getSession, getUserRole } from "../supabase/auth.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase/client.js";

const usersBody = document.getElementById("users-body");
const userCountEl = document.getElementById("user-count");
const searchInput = document.getElementById("search-input");
const refreshBtn = document.getElementById("refresh-btn");
const backBtn = document.getElementById("back-btn");
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const errorMsg = document.getElementById("error-msg");
const notificationForm = document.getElementById("notification-form");
const notifTitle = document.getElementById("notif-title");
const notifMessage = document.getElementById("notif-message");
const notifTarget = document.getElementById("notif-target");
const sendNotifBtn = document.getElementById("send-notif-btn");

let allUsers = [];

async function fetchUsers() {
    loadingState.classList.remove("hidden");
    errorState.classList.add("hidden");
    usersBody.innerHTML = "";

    try {
        const session = await getSession();
        if (!session) throw new Error("Not authenticated");

        const role = await getUserRole();
        if (role !== "admin") {
            throw new Error("Access Denied: You do not have administrator privileges.");
        }

        // We call a Supabase Edge Function to get users

        // We call a Supabase Edge Function to get users
        // Note: You need to deploy this function first!
        const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-get-users`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
                "apikey": SUPABASE_ANON_KEY
            }
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const msg = err.error || err.message || `Failed to fetch users (${res.status})`;
            throw new Error(msg);
        }

        const data = await res.json();
        allUsers = data.users || [];
        renderUsers(allUsers);
        userCountEl.textContent = `Total Users: ${allUsers.length}`;
    } catch (err) {
        console.error("Admin fetch error:", err);
        errorMsg.textContent = err.message;
        errorState.classList.remove("hidden");
    } finally {
        loadingState.classList.add("hidden");
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
            <td class="actions">
                <button class="action-btn" title="View Details"><i class="fi fi-rr-eye"></i></button>
            </td>
        `;
        usersBody.appendChild(tr);
    });
}

searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allUsers.filter(u => 
        (u.email && u.email.toLowerCase().includes(term)) || 
        (u.full_name && u.full_name.toLowerCase().includes(term)) || 
        u.id.toLowerCase().includes(term)
    );
    renderUsers(filtered);
});

refreshBtn.addEventListener("click", fetchUsers);
backBtn.addEventListener("click", () => window.location.href = "account.html");

notificationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = notifTitle.value;
    const message = notifMessage.value;
    const target = notifTarget.value;

    sendNotifBtn.disabled = true;
    sendNotifBtn.innerHTML = '<i class="fi fi-rr-spinner spin"></i> Sending...';

    try {
        const session = await getSession();
        if (!session) throw new Error("Not authenticated");

        const res = await fetch(`${SUPABASE_URL}/rest/v1/stickynotes_notifications`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
                "apikey": SUPABASE_ANON_KEY,
                "Prefer": "return=minimal"
            },
            body: JSON.stringify({
                title,
                message,
                target_group: target
            })
        });

        if (!res.ok) throw new Error("Failed to send notification");

        showToast("Notification broadcasted successfully!");
        notificationForm.reset();
    } catch (err) {
        alert("Error sending notification: " + err.message);
    } finally {
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

// Initial fetch
fetchUsers();
