import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase/client.js";
import { getSession } from "../supabase/auth.js";

const notificationList = document.getElementById("notification-list");
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const emptyState = document.getElementById("empty-state");
const errorMsg = document.getElementById("error-msg");
const markAllReadBtn = document.getElementById("mark-all-read-btn");

let notifications = [];
let readIds = [];
let userPlan = "free";

async function selectRows(table, query = "", token = null) {
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  if (query) url += `?${query}`;

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch from ${table}`);
  return await res.json();
}

async function loadNotifications() {
  loadingState.classList.remove("hidden");
  errorState.classList.add("hidden");
  emptyState.classList.add("hidden");
  notificationList.innerHTML = "";

  try {
    const session = await getSession();
    const isGuest = !session?.user;

    // 1. Fetch user plan
    if (!isGuest) {
      const userProfile = await selectRows(
        "stickynotes_users",
        `id=eq.${session.user.id}`,
        session.access_token
      );
      userPlan = userProfile?.[0]?.plan || "free";
    }

    // 2. Fetch all notifications
    const allNotifications = await selectRows(
      "stickynotes_notifications",
      "order=created_at.desc"
    );

    // 3. Filter by target group
    notifications = allNotifications.filter((n) => {
      if (n.target_group === "all") return true;
      if (isGuest) return false;
      if (n.target_group === "signed_up") return true;
      return n.target_group === userPlan;
    });

    // 4. Fetch read IDs
    if (!isGuest) {
      const reads = await selectRows(
        "stickynotes_notification_reads",
        `user_id=eq.${session.user.id}`,
        session.access_token
      );
      readIds = reads.map((r) => r.notification_id);
    } else {
      const data = await new Promise((r) => chrome.storage.local.get("read_notifications", r));
      readIds = data.read_notifications || [];
    }

    renderNotifications();
  } catch (err) {
    console.error("Error loading notifications:", err);
    errorMsg.textContent = err.message || "Failed to load notifications.";
    errorState.classList.remove("hidden");
  } finally {
    loadingState.classList.add("hidden");
  }
}

function renderNotifications() {
  notificationList.innerHTML = "";

  if (notifications.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  notifications.forEach((n) => {
    const isUnread = !readIds.includes(n.id);
    const card = document.createElement("div");
    card.className = `notification-card ${isUnread ? "unread" : ""}`;
    card.innerHTML = `
      <div class="notification-header">
        <h3>${n.title}</h3>
        <span class="notification-time">${new Date(n.created_at).toLocaleString()}</span>
      </div>
      <p class="notification-body">${n.message}</p>
    `;

    card.addEventListener("click", () => {
      if (isUnread) markAsRead(n.id, card);
    });

    notificationList.appendChild(card);
  });
}

async function markAsRead(id, cardElement) {
  const session = await getSession();
  
  if (!session?.user) {
    if (!readIds.includes(id)) {
      readIds.push(id);
      await new Promise((r) => chrome.storage.local.set({ read_notifications: readIds }, r));
    }
  } else {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/stickynotes_notification_reads`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({ user_id: session.user.id, notification_id: id }),
      });
      readIds.push(id);
    } catch (e) {
      console.error("Error marking as read:", e);
      return; // Stop if failed
    }
  }

  if (cardElement) {
    cardElement.classList.remove("unread");
  }
}

markAllReadBtn.addEventListener("click", async () => {
  const unreadIds = notifications.map(n => n.id).filter(id => !readIds.includes(id));
  if (unreadIds.length === 0) return;

  markAllReadBtn.disabled = true;
  markAllReadBtn.innerHTML = '<i class="fi fi-rr-spinner spin"></i> Processing...';

  const session = await getSession();
  
  if (!session?.user) {
    const newReadIds = [...new Set([...readIds, ...unreadIds])];
    await new Promise((r) => chrome.storage.local.set({ read_notifications: newReadIds }, r));
    readIds = newReadIds;
  } else {
    for (const id of unreadIds) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/stickynotes_notification_reads`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify({ user_id: session.user.id, notification_id: id }),
        });
        readIds.push(id);
      } catch (e) {
        console.error("Failed to mark all as read", e);
      }
    }
  }

  renderNotifications();
  markAllReadBtn.disabled = false;
  markAllReadBtn.innerHTML = '<i class="fi fi-rr-check-double"></i> Mark all as read';
});

// Init
document.addEventListener("DOMContentLoaded", loadNotifications);
