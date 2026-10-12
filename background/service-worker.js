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
  tabCycleWheel: true,     // Right-click + Wheel scroll
  tabCycleSwipe: true,     // Right-click + Swipe left/right
  tabCycleRocker: true,    // Rocker gestures (Left+Right: Next, Right+Left: Prev)
  tabCycleAltScroll: true, // Alt + Two-finger trackpad scroll / wheel
  tabCycleHud: true,       // On-screen visual HUD pill
  swipeDeviceMode: 'mouse', // 'mouse' (Right->Next, Left->Prev) | 'mousepad' (Left->Next, Right->Prev)
  closeTabOnDoubleRightClick: true, // Close tab on double right-click
  textSearchHold: true,    // Hold on selected text (Left: foreground search, Right: background search)
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

  if (message.action === 'searchText') {
    handleSearchText(message, sender)
      .then((res) => sendResponse(res))
      .catch((err) => {
        console.error('HoldTab: Error searching text:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.action === 'cycleTab') {
    handleCycleTab(message, sender)
      .then((res) => sendResponse(res))
      .catch((err) => {
        console.error('HoldTab: Error cycling tab:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.action === 'closeTab') {
    handleCloseTab(sender)
      .then((res) => sendResponse(res))
      .catch((err) => {
        console.error('HoldTab: Error closing tab:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.action === 'getSettings') {
    chrome.storage.sync.get(DEFAULT_SETTINGS)
      .then((settings) => sendResponse({ success: true, settings }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Global tab cycling state to prevent race conditions and trackpad reverse-bounce ping-pong
let isCyclingTab = false;
let lastCycleTime = 0;
let lastCycleDirection = null;
let lastLockedAxis = null;
const GLOBAL_CYCLE_COOLDOWN = 85;   // ms minimum interval between tab switches
const REVERSE_BOUNCE_WINDOW = 450;  // ms guard against accidental trackpad reverse bounce

/**
 * Checks if a tab allows extension content scripts to run.
 * Restricted browser pages (brave://, chrome://, edge://, about:, webstore) block content scripts.
 */
function isScriptableTab(tab) {
  if (!tab || !tab.url) return true;
  const url = tab.url.toLowerCase();
  if (
    url.startsWith('chrome://') ||
    url.startsWith('brave://') ||
    url.startsWith('edge://') ||
    url.startsWith('opera://') ||
    url.startsWith('vivaldi://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('moz-extension://') ||
    url.startsWith('view-source:') ||
    url.startsWith('devtools://') ||
    url.includes('chrome.google.com/webstore') ||
    url.includes('chromewebstore.google.com') ||
    url.includes('addons.mozilla.org')
  ) {
    return false;
  }
  return true;
}

/**
 * Cycles to the next or previous tab in the current browser window.
 */
async function handleCycleTab(message, sender) {
  const direction = message.direction;
  const viaAlt = Boolean(message.viaAlt);
  const isScrollGesture = Boolean(message.isScrollGesture || viaAlt);
  const intentionalReverse = Boolean(message.intentionalReverse);

  const now = Date.now();

  // Prevent concurrent or duplicate rapid switches across tabs
  if (isCyclingTab || (now - lastCycleTime < GLOBAL_CYCLE_COOLDOWN)) {
    return { success: false, reason: 'Cooldown' };
  }

  // Prevent trackpad lift-off bounce or diagonal wobble from ping-ponging back to previous tab
  if (
    isScrollGesture &&
    lastCycleDirection &&
    direction !== lastCycleDirection &&
    (now - lastCycleTime < REVERSE_BOUNCE_WINDOW) &&
    !intentionalReverse
  ) {
    return { success: false, reason: 'Reverse bounce suppressed' };
  }

  isCyclingTab = true;
  try {
    const windowId = sender?.tab?.windowId;
    const queryOptions = windowId ? { windowId } : { currentWindow: true };
    const tabs = await chrome.tabs.query(queryOptions);

    if (!tabs || tabs.length <= 1) {
      return { success: false, reason: 'Single tab' };
    }

    tabs.sort((a, b) => a.index - b.index);

    let activeIndex = tabs.findIndex((t) => t.active);
    if (activeIndex === -1 && sender?.tab?.id) {
      activeIndex = tabs.findIndex((t) => t.id === sender.tab.id);
    }
    if (activeIndex === -1) {
      return { success: false, reason: 'Active tab not found' };
    }

    const step = direction === 'next' ? 1 : -1;
    let targetIndex = (activeIndex + step + tabs.length) % tabs.length;

    // Skip restricted browser tabs (like brave://extensions or chrome://newtab) where gestures cannot run
    for (let i = 1; i < tabs.length; i++) {
      const candidateIndex = (activeIndex + step * i + tabs.length * i) % tabs.length;
      if (isScriptableTab(tabs[candidateIndex])) {
        targetIndex = candidateIndex;
        break;
      }
    }

    const targetTab = tabs[targetIndex];
    lastCycleTime = Date.now();
    lastCycleDirection = direction;
    lastLockedAxis = message.lockedAxis || lastLockedAxis || null;

    await chrome.tabs.update(targetTab.id, { active: true });

    try {
      chrome.tabs.sendMessage(targetTab.id, {
        action: 'tabCycleActivated',
        direction,
        viaAlt,
        lockedAxis: lastLockedAxis,
        targetTitle: targetTab.title,
        targetIndex: targetTab.index,
        totalTabs: tabs.length
      }).catch(() => {});
    } catch (_) {}

    return {
      success: true,
      direction,
      targetTitle: targetTab.title,
      targetIndex: targetTab.index,
      totalTabs: tabs.length
    };
  } finally {
    isCyclingTab = false;
  }
}

/**
 * Closes the sender's tab, or active tab in current window.
 */
async function handleCloseTab(sender) {
  const tabId = sender?.tab?.id;
  if (tabId) {
    await chrome.tabs.remove(tabId);
    return { success: true };
  }
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && activeTab.id) {
    await chrome.tabs.remove(activeTab.id);
    return { success: true };
  }
  return { success: false, error: 'Tab not found' };
}

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

  // When opening in background, ensure the originating window retains active focus
  if (!shouldBeActive && targetWindowId) {
    try {
      await chrome.windows.update(targetWindowId, { focused: true });
    } catch (_) {}
  }

  return { success: true, tabId: newTab.id };
}

/**
 * Opens a new tab searching for the provided text.
 * tabFocus === 'foreground' -> active: true (move to new tab)
 * tabFocus === 'background' -> active: false (stay on current tab)
 */
async function handleSearchText(message, sender) {
  const { text, tabFocus } = message;
  if (!text || typeof text !== 'string') {
    return { success: false, error: 'No text provided' };
  }

  const query = text.trim();
  if (!query) {
    return { success: false, error: 'Empty query' };
  }

  // Load current user settings
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!settings.enabled || settings.textSearchHold === false) {
    return { success: false, reason: 'Disabled' };
  }

  const isForeground = tabFocus === 'foreground';
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  const position = settings.tabPosition || 'next';
  let targetIndex;
  let targetWindowId;

  if (sender && sender.tab) {
    targetWindowId = sender.tab.windowId;
    if (position === 'next' && typeof sender.tab.index === 'number') {
      targetIndex = sender.tab.index + 1;
    }
  } else {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      targetWindowId = activeTab.windowId;
      if (position === 'next' && typeof activeTab.index === 'number') {
        targetIndex = activeTab.index + 1;
      }
    }
  }

  const createProperties = {
    url: searchUrl,
    active: isForeground
  };

  if (typeof targetIndex === 'number') {
    createProperties.index = targetIndex;
  }
  if (targetWindowId) {
    createProperties.windowId = targetWindowId;
  }

  const newTab = await chrome.tabs.create(createProperties);

  // If opening in background, ensure the original window remains focused
  if (!isForeground && targetWindowId) {
    try {
      await chrome.windows.update(targetWindowId, { focused: true });
    } catch (_) {}
  }

  return {
    success: true,
    tabId: newTab.id,
    active: isForeground,
    query
  };
}
