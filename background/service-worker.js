// HoldTab - Service Worker (Manifest V3)

const DEFAULT_SETTINGS = {
  enabled: true,
  holdDuration: 450,       // Duration in milliseconds (200 - 1200)
  gestureMode: 'hold',     // 'hold', 'drag', 'both'
  dragDistance: 35,        // Pixels for flick/drag gesture
  tabPosition: 'next',     // 'next' | 'end'
  tabFocus: 'background',  // 'background' | 'foreground'
  indicatorStyle: 'ring',  // 'ring' | 'pulse' | 'minimal'
  requireModifier: 'none', // 'none' | 'alt' | 'ctrl' | 'shift'
  excludedDomains: []
};

// Initialize settings on install or update
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const existing = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    // Merge existing with defaults in case of new fields
    const updated = { ...DEFAULT_SETTINGS, ...existing };
    await chrome.storage.sync.set(updated);
  } catch (error) {
    console.error('HoldTab: Failed to initialize settings:', error);
  }
});

// Handle incoming messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openLink') {
    handleOpenLink(message, sender)
      .then((res) => sendResponse(res))
      .catch((err) => {
        console.error('HoldTab: Error opening link:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'getSettings') {
    chrome.storage.sync.get(DEFAULT_SETTINGS)
      .then((settings) => sendResponse({ success: true, settings }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Opens a link in a background (or foreground) tab according to user preferences.
 */
async function handleOpenLink(message, sender) {
  const { url } = message;
  if (!url) {
    return { success: false, error: 'No URL provided' };
  }

  // Load current user settings
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!settings.enabled) {
    return { success: false, error: 'Extension is disabled' };
  }

  const shouldBeActive = (message.tabFocus || settings.tabFocus) === 'foreground';
  const position = message.tabPosition || settings.tabPosition;

  let targetIndex;
  let targetWindowId;

  if (sender && sender.tab) {
    targetWindowId = sender.tab.windowId;
    if (position === 'next' && typeof sender.tab.index === 'number') {
      targetIndex = sender.tab.index + 1;
    }
  } else {
    // If sender.tab is not directly populated, query active tab in current window
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      targetWindowId = activeTab.windowId;
      if (position === 'next' && typeof activeTab.index === 'number') {
        targetIndex = activeTab.index + 1;
      }
    }
  }

  const createProperties = {
    url,
    active: shouldBeActive
  };

  if (typeof targetIndex === 'number') {
    createProperties.index = targetIndex;
  }
  if (targetWindowId) {
    createProperties.windowId = targetWindowId;
  }

  const newTab = await chrome.tabs.create(createProperties);

  return { success: true, tabId: newTab.id };
}
