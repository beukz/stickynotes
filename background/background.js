chrome.runtime.onInstalled.addListener(async () => {
  let shortcutLabel = "Ctrl + Q"; // Default for Windows/Linux
  
  if (navigator.userAgentData) {
    const platform = navigator.userAgentData.platform;
    if (platform && platform.toLowerCase().includes("mac")) {
      shortcutLabel = "⌘ + Q";
    }
  } else {
    // Fallback for older browsers
    if (navigator.userAgent.toLowerCase().includes("mac")) {
      shortcutLabel = "⌘ + Q";
    }
  }

  chrome.contextMenus.create({
    id: "addStickyNote",
    title: `Add Sticky Note (${shortcutLabel})`,
    contexts: ["all"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "addStickyNote") {
    chrome.tabs.sendMessage(tab.id, { action: "createStickyNote" });
  }
});
