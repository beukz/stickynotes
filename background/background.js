// background/background.js
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