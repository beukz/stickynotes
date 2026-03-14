// background/background.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase/client.js";
import { getSession } from "../supabase/auth.js";

console.log('Service Worker is running!');

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("pages/installed.html") });

  // Handle context menu creation
  let shortcutLabel = "Ctrl + Q"; // Default for Windows/Linux

  if (navigator.userAgentData) {
    const platform = navigator.userAgentData.platform;
    if (platform && platform.toLowerCase().includes("mac")) {
      shortcutLabel = "⌘ + Q";
    }
  } else {
    if (navigator.userAgent.toLowerCase().includes("mac")) {
      shortcutLabel = "⌘ + Q";
    }
  }

  chrome.contextMenus.create({
    id: "addStickyNote",
    title: `Create Sticky Note (${shortcutLabel})`,
    contexts: ["all"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "addStickyNote") {
    chrome.tabs.sendMessage(tab.id, { action: "createStickyNote" });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-notes-page") {
    const notesPageUrl = chrome.runtime.getURL("pages/notes.html");
    // Check if a tab with this URL is already open
    chrome.tabs.query({ url: notesPageUrl }, (tabs) => {
      if (tabs.length > 0) {
        // If it's open, focus it
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        // If not, create a new tab
        chrome.tabs.create({ url: notesPageUrl });
      }
    });
  }
});

// --- Supabase Proxy ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "supabaseAction") {
        handleSupabaseAction(request.method, request.table, request.query, request.body)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open
    }
});

async function handleSupabaseAction(method, table, query, body) {
    const session = await getSession();
    if (!session?.access_token) throw new Error("Not authenticated");

    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    if (query) url += `?${query}`;

    const headers = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
    };

    if (method === "POST" || method === "PATCH") {
        headers["Prefer"] = method === "POST" ? "return=representation" : "return=minimal";
    }

    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Supabase ${method} failed (${res.status}): ${text}`);
    }

    if (method === "GET" || (method === "POST" && headers["Prefer"].includes("representation"))) {
        return await res.json();
    }
    return null;
}

// --- Realtime / Polling fallback ---
async function setupOffscreen() {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
        url: 'background/offscreen.html',
        reasons: ['LOCAL_STORAGE'], // Using this as a proxy for "realtime sync"
        justification: 'Maintaining a Supabase Realtime connection for cloud sync.'
    });
}

// Check session on startup and setup offscreen if needed
getSession().then(session => {
    if (session) setupOffscreen();
});

// Watch for session changes in storage to toggle offscreen
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.supabase_session) {
        if (changes.supabase_session.newValue) setupOffscreen();
        else {
            chrome.offscreen.hasDocument().then(has => {
                if (has) chrome.offscreen.closeDocument();
            });
        }
    }
});