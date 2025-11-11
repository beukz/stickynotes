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
