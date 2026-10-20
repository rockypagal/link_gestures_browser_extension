// HoldTab - Service Worker (Manifest V3)

try {
  if (typeof importScripts === 'function') {
    importScripts('/utils/site-status.js');
  }
} catch (e) {
  console.warn('HoldTab: Failed to importScripts site-status.js', e);
}

const DEFAULT_SEARCH_WEBSITES = [
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q={query}', enabled: true, icon: 'google' },
  { id: 'youtube', name: 'YouTube', template: 'https://www.youtube.com/results?search_query={query}', enabled: true, icon: 'youtube' },
  { id: 'wikipedia', name: 'Wikipedia', template: 'https://en.wikipedia.org/w/index.php?search={query}', enabled: true, icon: 'wikipedia' },
  { id: 'reddit', name: 'Reddit', template: 'https://www.reddit.com/search/?q={query}', enabled: true, icon: 'reddit' },
  { id: 'github', name: 'GitHub', template: 'https://github.com/search?q={query}', enabled: true, icon: 'github' },
  { id: 'amazon', name: 'Amazon', template: 'https://www.amazon.com/s?k={query}', enabled: true, icon: 'amazon' }
];

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
  tabCycleAltKeys: true,   // Keyboard keybinds to cycle tabs
  tabCycleKeyShortcut: 'alt+comma_period', // 'alt+comma_period' | 'alt+arrows' | 'alt+brackets' | 'ctrl+arrows' | 'ctrl+pageupdown'
  closeTabShortcutEnabled: true, // Close active tab shortcut
  closeTabShortcut: 'alt+/', // 'alt+/' | 'alt+w' | 'alt+x' | 'alt+q' | 'alt+c'
  tabCycleHud: true,       // On-screen visual HUD pill
  swipeDeviceMode: 'mouse', // 'mouse' (Right->Next, Left->Prev) | 'mousepad' (Left->Next, Right->Prev)
  closeTabOnDoubleRightClick: true, // Close tab on double right-click
  textSearchHold: true,    // Hold on selected text (Left: foreground search, Right: background search)
  textDoubleClickCopyCut: true, // Double left-click to copy, double right-click to cut on selected text
  inputDoubleClickPaste: true, // Double left-click in input field to paste clipboard text
  altDoubleClickFillSearch: true, // Alt + double left-click on text fills current site's search bar
  altHoldSearchSite: true, // Alt + hold on text to search site (Left: Current Tab, Right: New Tab)
  siteSearchHoldDuration: 450, // ms duration for Alt + Hold Site Search (200 - 1200)
  textSearchHoldDuration: 450, // ms duration for Selected Text Search (200 - 1200)
  animLinkHold: true,      // Show/hide link hold animation ring
  animLinkHoldDelay: 180,  // ms grace delay for link hold ring (0 - 600)
  animSiteSearch: true,    // Show/hide site search animation ring
  animSiteSearchDelay: 180,// ms grace delay for site search ring (0 - 600)
  animTextSearch: true,    // Show/hide text search animation ring
  animTextSearchDelay: 180,// ms grace delay for text search ring (0 - 600)
  animFlickDrag: true,     // Show/hide flick/drag dynamic arrow
  animHudBadges: true,     // Show/hide floating HUD badges (tab cycling, clipboard)
  toolbarEnabled: true,    // Text selection floating toolbar master toggle
  toolbarMode: 'auto',     // 'auto' | 'demand' | 'disabled'
  toolbarModifier: 'alt',  // 'alt' | 'ctrl' | 'shift' (used when toolbarMode === 'demand')
  toolbarDelay: 250,       // ms delay before showing toolbar on stable selection (0 - 600)
  toolbarMinLength: 2,     // Minimum characters selected to display toolbar (default: 2)
  toolbarSearchSubmenu: true, // Show search engine submenu on hover
  toolbarSearchWebsites: DEFAULT_SEARCH_WEBSITES,
  quickSearchEnabled: true, // Quick search shortcut and popup
  quickSearchDefaultEngine: 'google', // Default engine for Enter in quick search
  excludedDomains: [],
  siteOverrides: {}
};

// Initialize settings on install or update
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const existing = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    // Merge existing with defaults in case of new fields
    const updated = { ...DEFAULT_SETTINGS, ...existing };
    if (!Array.isArray(updated.toolbarSearchWebsites) || updated.toolbarSearchWebsites.length === 0) {
      updated.toolbarSearchWebsites = DEFAULT_SEARCH_WEBSITES;
    }
    if (typeof updated.siteOverrides !== 'object' || !updated.siteOverrides) {
      updated.siteOverrides = {};
    }
    await chrome.storage.sync.set(updated);
    await updateAllTabIcons();
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

  if (message.action === 'getSiteStatus') {
    const targetUrl = message.url || sender?.tab?.url || '';
    chrome.storage.sync.get(DEFAULT_SETTINGS)
      .then((settings) => {
        const statusRes = (typeof calculateSiteStatus === 'function')
          ? calculateSiteStatus(settings, targetUrl)
          : { status: 'active', icon: 'active', title: 'HoldTab — Active' };
        sendResponse({ success: true, status: statusRes });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'updateTabIcon') {
    const targetTabId = message.tabId || sender?.tab?.id;
    updateTabStatusIcon(targetTabId, message.url)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'updateAllIcons') {
    updateAllTabIcons()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'contentScriptLoaded') {
    const tabId = sender?.tab?.id;
    if (typeof tabId === 'number') {
      updateTabStatusIcon(tabId, message.url || sender?.tab?.url);
    }
    return;
  }

  if (message.action === 'getOpenTabsForSearch') {
    handleGetOpenTabsForSearch(message, sender)
      .then((res) => sendResponse(res))
      .catch((err) => {
        console.error('HoldTab: Error fetching open tabs for search:', err);
        sendResponse({ success: false, error: err.message, openTabs: [] });
      });
    return true;
  }
});

/**
 * Returns a list of unique HTTP/HTTPS websites currently open in the browser window
 * for the Open Tabs search feature (Option 1: site:domain search).
 */
async function handleGetOpenTabsForSearch(message, sender) {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const currentTabId = sender?.tab?.id;
    const seenDomains = new Set();
    const resultSites = [];

    for (const tab of tabs) {
      if (!tab.url) continue;
      const urlStr = tab.url.trim();
      if (!/^https?:\/\//i.test(urlStr)) continue;

      let urlObj;
      try {
        urlObj = new URL(urlStr);
      } catch (_) {
        continue;
      }

      const rawHost = urlObj.hostname.toLowerCase();
      const domain = rawHost.replace(/^www\./, '');
      if (!domain || seenDomains.has(domain)) continue;
      seenDomains.add(domain);

      resultSites.push({
        domain: domain,
        origin: urlObj.origin,
        title: tab.title || domain,
        favIconUrl: tab.favIconUrl || '',
        isCurrentTab: (typeof currentTabId === 'number' && tab.id === currentTabId)
      });
    }

    return { success: true, openTabs: resultSites };
  } catch (err) {
    console.error('HoldTab: Error in handleGetOpenTabsForSearch:', err);
    return { success: false, error: err.message, openTabs: [] };
  }
}

// Global tab cycling state to prevent race conditions and trackpad reverse-bounce ping-pong
let isCyclingTab = false;
let lastCycleTime = 0;
let lastCycleDirection = null;
let lastLockedAxis = null;
const GLOBAL_CYCLE_COOLDOWN = 160;  // ms minimum interval between tab switches
const REVERSE_BOUNCE_WINDOW = 400;  // ms strict window suppressing accidental trackpad reverse bounce

/**
 * Checks if a tab allows extension content scripts to run.
 * Restricted browser pages (brave://, chrome://, edge://, about:, webstore) block content scripts.
 */
function isScriptableTab(tab) {
  if (!tab || !tab.url) return true;
  const url = tab.url.toLowerCase();

  // Allow our own extension pages (such as test.html) where content script is included
  const ownExtId = (chrome.runtime && chrome.runtime.id) ? chrome.runtime.id.toLowerCase() : '';
  if (ownExtId && (url.startsWith(`chrome-extension://${ownExtId}/`) || url.startsWith(`moz-extension://${ownExtId}/`))) {
    return true;
  }

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

  const now = Date.now();

  // Prevent concurrent or duplicate rapid switches across tabs
  if (isCyclingTab || (now - lastCycleTime < GLOBAL_CYCLE_COOLDOWN)) {
    return { success: false, reason: 'Cooldown' };
  }

  // Prevent trackpad lift-off bounce or diagonal wobble from ping-ponging back to previous tab.
  // Within REVERSE_BOUNCE_WINDOW (400ms), any opposite scroll direction is discarded.
  if (
    isScrollGesture &&
    lastCycleDirection &&
    direction !== lastCycleDirection &&
    (now - lastCycleTime < REVERSE_BOUNCE_WINDOW)
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
  const windowId = sender?.tab?.windowId;

  // Immediately notify all tabs in the window to suppress context menu
  try {
    const targetWindowId = windowId || chrome.windows.WINDOW_ID_CURRENT;
    const tabsInWindow = await chrome.tabs.query({ windowId: targetWindowId });
    for (const t of tabsInWindow) {
      if (t.id !== tabId) {
        chrome.tabs.sendMessage(t.id, {
          action: 'suppressContextMenu',
          duration: 2500
        }).catch(() => {});
      }
    }
  } catch (_) {}

  // Allow a brief 60ms pause for mouseup/contextmenu on the closing tab to complete event cancellation
  // before the tab is removed from the window/DOM.
  await new Promise((resolve) => setTimeout(resolve, 60));

  if (tabId) {
    try {
      await chrome.tabs.remove(tabId);
    } catch (_) {}

    // Also notify whatever tab became active now
    try {
      const [newActive] = await chrome.tabs.query({ active: true, windowId: windowId || chrome.windows.WINDOW_ID_CURRENT });
      if (newActive && newActive.id) {
        chrome.tabs.sendMessage(newActive.id, {
          action: 'suppressContextMenu',
          duration: 2000
        }).catch(() => {});
      }
    } catch (_) {}

    return { success: true };
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && activeTab.id) {
    try {
      await chrome.tabs.remove(activeTab.id);
    } catch (_) {}
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

// ==========================================
// DYNAMIC EXTENSION ICON MANAGEMENT
// Active (Blue) | Custom (Orange) | Disabled (Grey)
// ==========================================

function getActionApi() {
  if (typeof chrome !== 'undefined' && chrome.action) {
    return chrome.action;
  }
  if (typeof browser !== 'undefined') {
    if (browser.action) return browser.action;
    if (browser.browserAction) return browser.browserAction;
  }
  if (typeof chrome !== 'undefined' && chrome.browserAction) {
    return chrome.browserAction;
  }
  return null;
}

// Inline status calculation to ensure zero dependency on importScripts
function normalizeDomainSafe(raw) {
  if (typeof normalizeDomain === 'function') return normalizeDomain(raw);
  if (!raw || typeof raw !== 'string') return '';
  let domain = raw.trim().toLowerCase();
  domain = domain.replace(/^[a-z0-9+.-]+:\/\//i, '');
  domain = domain.replace(/^[^/@]+@/, '');
  domain = domain.replace(/[/?#].*$/, '');
  domain = domain.split(':')[0];
  domain = domain.replace(/^\.+|\.+$/g, '').replace(/^www\./, '');
  return domain;
}

function calculateSiteStatusSafe(settings, urlOrHostname) {
  if (typeof calculateSiteStatus === 'function') {
    return calculateSiteStatus(settings, urlOrHostname);
  }
  const raw = typeof urlOrHostname === 'string' ? urlOrHostname.trim() : '';
  const domain = normalizeDomainSafe(raw);
  const lower = raw.toLowerCase();

  const isRestricted = !raw ||
    lower.startsWith('chrome://') || lower.startsWith('brave://') ||
    lower.startsWith('edge://') || lower.startsWith('opera://') ||
    lower.startsWith('about:') || lower.startsWith('devtools://') ||
    lower.includes('chrome.google.com/webstore') ||
    lower.includes('chromewebstore.google.com') ||
    lower.includes('addons.mozilla.org');

  if (!settings || settings.enabled === false) {
    return { status: 'disabled', icon: 'disabled', title: 'HoldTab — Disabled', domain, isRestricted };
  }
  if (isRestricted && !lower.includes('test.html')) {
    return { status: 'disabled', icon: 'disabled', title: 'HoldTab — Disabled', domain, isRestricted: true };
  }

  const excludedList = Array.isArray(settings.excludedDomains) ? settings.excludedDomains : [];
  const isExcluded = excludedList.some((d) => {
    const norm = normalizeDomainSafe(d);
    return norm && (domain === norm || domain.endsWith('.' + norm) || norm.endsWith('.' + domain));
  });

  const overrides = (settings.siteOverrides && domain && settings.siteOverrides[domain]) || {};
  const hasAnyOverride = ['toolbar', 'quickSearch', 'linkHold', 'tabCycle', 'textActions'].some((k) => overrides[k] === true);

  if (isExcluded) {
    if (hasAnyOverride) {
      return { status: 'custom', icon: 'custom', title: 'HoldTab — Custom', domain, isRestricted: false };
    }
    return { status: 'disabled', icon: 'disabled', title: 'HoldTab — Disabled', domain, isRestricted: false };
  }

  return { status: 'active', icon: 'active', title: 'HoldTab — Active', domain, isRestricted: false };
}

function getIconPathsSafe(iconState) {
  if (typeof getIconPaths === 'function') {
    return getIconPaths(iconState, false);
  }
  const prefix = 'icons/';
  if (iconState === 'custom') {
    return {
      16: prefix + 'icon-custom-16.png',
      48: prefix + 'icon-custom-48.png',
      128: prefix + 'icon-custom-128.png'
    };
  }
  if (iconState === 'disabled') {
    return {
      16: prefix + 'icon-disabled-16.png',
      48: prefix + 'icon-disabled-48.png',
      128: prefix + 'icon-disabled-128.png'
    };
  }
  return {
    16: prefix + 'icon-16.png',
    48: prefix + 'icon-48.png',
    128: prefix + 'icon-128.png'
  };
}

/**
 * Robustly retrieves the currently active tab across focused or current window.
 */
async function getActiveTabSafe() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) return tab;
  } catch (_) {}
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) return tab;
  } catch (_) {}
  try {
    const [tab] = await chrome.tabs.query({ active: true });
    if (tab) return tab;
  } catch (_) {}
  return null;
}

/**
 * Safely applies icon details, retrying with alternative path format if needed.
 */
async function setActionIconSafe(details) {
  const action = getActionApi();
  if (!action || !action.setIcon) return;

  try {
    await action.setIcon(details);
  } catch (err1) {
    try {
      const altPath = {};
      for (const [size, p] of Object.entries(details.path || {})) {
        altPath[size] = p.startsWith('/') ? p.slice(1) : '/' + p;
      }
      await action.setIcon({ ...details, path: altPath });
    } catch (_) {}
  }
}

/**
 * Safely applies tooltip title.
 */
async function setActionTitleSafe(details) {
  const action = getActionApi();
  if (!action || !action.setTitle) return;

  try {
    await action.setTitle(details);
  } catch (_) {}
}

/**
 * Updates the extension toolbar icon and tooltip for a specific tab based on site status.
 */
async function updateTabStatusIcon(tabId, urlHint) {
  const action = getActionApi();
  if (!action) return;

  try {
    let url = urlHint;
    let targetTab = null;

    if (typeof tabId === 'number') {
      try {
        targetTab = await chrome.tabs.get(tabId);
        url = url || targetTab?.url || targetTab?.pendingUrl || '';
      } catch (_) {
        return; // Tab closed or invalid
      }
    } else {
      targetTab = await getActiveTabSafe();
      if (targetTab) {
        tabId = targetTab.id;
        url = targetTab.url || targetTab.pendingUrl || '';
      }
    }

    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const statusCalc = calculateSiteStatusSafe(settings, url);
    const iconPaths = getIconPathsSafe(statusCalc.icon);

    // 1. Set tab-specific icon and title
    if (typeof tabId === 'number') {
      await setActionIconSafe({ tabId, path: iconPaths });
      await setActionTitleSafe({ tabId, title: statusCalc.title });
    }

    // 2. Also update the global default icon if this tab is active!
    // In Chromium and Firefox, pinned toolbar icons reliably react to the global action icon.
    const isTargetActive = typeof tabId !== 'number' || Boolean(targetTab?.active);
    if (isTargetActive) {
      await setActionIconSafe({ path: iconPaths });
      await setActionTitleSafe({ title: statusCalc.title });
    }
  } catch (err) {
    // Gracefully ignore closed tabs or sandbox errors
  }
}

/**
 * Updates icons for all tabs across all windows and updates global default icon.
 */
async function updateAllTabIcons() {
  const action = getActionApi();
  if (!action) return;

  try {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);

    // Update each open tab
    const tabs = await chrome.tabs.query({});
    if (Array.isArray(tabs)) {
      for (const tab of tabs) {
        if (typeof tab.id === 'number') {
          await updateTabStatusIcon(tab.id, tab.url);
        }
      }
    }

    // Set the global default icon to match the currently active tab
    const activeTab = await getActiveTabSafe();
    if (activeTab && typeof activeTab.id === 'number') {
      await updateTabStatusIcon(activeTab.id, activeTab.url);
    } else {
      const defaultIconState = (settings.enabled === false) ? 'disabled' : 'active';
      const defaultPaths = getIconPathsSafe(defaultIconState);
      await setActionIconSafe({ path: defaultPaths });
      await setActionTitleSafe({ title: (settings.enabled === false) ? 'HoldTab — Disabled' : 'HoldTab Settings' });
    }
  } catch (err) {
    console.debug('HoldTab: Failed to update all tab icons:', err);
  }
}

// Tab activation listener (tab switch)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    await updateTabStatusIcon(activeInfo.tabId);
  } catch (_) {}
});

// Tab update listener (navigation, reload, redirect)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    if (changeInfo.url || tab?.url || changeInfo.status === 'complete' || changeInfo.status === 'loading') {
      await updateTabStatusIcon(tabId, tab?.url || changeInfo.url);
    }

    // Auto-detect search result navigation for active capture sessions
    const activeUrl = changeInfo.url || tab?.url;
    if (activeUrl && chrome.storage && chrome.storage.local) {
      try {
        const stored = await chrome.storage.local.get('activeCaptureSession');
        const session = stored?.activeCaptureSession;
        if (session && session.step === 'capturing' && session.marker && session.tabId === tabId) {
          const markerLower = session.marker.trim().toLowerCase();
          if (activeUrl.toLowerCase().includes(markerLower)) {
            const uLower = activeUrl.toLowerCase();
            const occurrences = [];
            let idx = 0;
            while ((idx = uLower.indexOf(markerLower, idx)) !== -1) {
              occurrences.push(idx);
              idx += markerLower.length;
            }
            if (occurrences.length > 0) {
              const start = occurrences[0];
              const template = activeUrl.substring(0, start) + '{query}' + activeUrl.substring(start + markerLower.length);
              let siteName = 'Custom Search';
              try {
                const u = new URL(activeUrl);
                siteName = u.hostname.replace(/^www\./, '').split('.')[0];
                siteName = siteName.charAt(0).toUpperCase() + siteName.slice(1);
              } catch (_) {}

              await chrome.storage.local.set({
                activeCaptureSession: {
                  marker: session.marker,
                  step: 'preview',
                  siteName: siteName,
                  template: template,
                  testQuery: 'wireless headphones',
                  capturedUrl: activeUrl,
                  multipleOccurrences: occurrences.length > 1,
                  autoCaptured: true,
                  isBackgroundTab: session.isBackgroundTab || false,
                  createdAt: session.createdAt || Date.now(),
                  updatedAt: Date.now()
                }
              });

              // Automatically close pinned background tab once captured
              if (session.isBackgroundTab) {
                try {
                  await chrome.tabs.remove(tabId);
                } catch (_) {}
              }
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}
});

// Window focus changed listener (user switches browser windows)
if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab && typeof tab.id === 'number') {
        await updateTabStatusIcon(tab.id, tab.url);
      }
    } catch (_) {}
  });
}

// Storage changes listener (master toggle, exclusions, per-site overrides)
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'sync' || area === 'local') {
    if (changes.enabled || changes.excludedDomains || changes.siteOverrides) {
      await updateAllTabIcons();
    }
  }
});

// Initialize icons on worker launch
try {
  updateAllTabIcons();
} catch (_) {}

/**
 * Checks if a URL is restricted or internal where extensions cannot execute.
 */
function isRestrictedUrlSafe(url) {
  if (typeof isRestrictedUrl === 'function') return isRestrictedUrl(url);
  if (!url || typeof url !== 'string') return true;
  const lower = url.trim().toLowerCase();
  return (
    lower.startsWith('chrome://') || lower.startsWith('brave://') ||
    lower.startsWith('edge://') || lower.startsWith('opera://') ||
    lower.startsWith('about:') || lower.startsWith('devtools://') ||
    lower.startsWith('view-source:') || lower.startsWith('data:') ||
    lower.startsWith('javascript:') ||
    lower.includes('chrome.google.com/webstore') ||
    lower.includes('chromewebstore.google.com') ||
    lower.includes('addons.mozilla.org')
  );
}

/**
 * Handles extension command 'quick-search' triggered by keyboard shortcut.
 */
async function handleQuickSearchCommand() {
  try {
    const activeTab = await getActiveTabSafe();
    if (!activeTab || typeof activeTab.id !== 'number') return;

    const url = activeTab.url || activeTab.pendingUrl || '';
    if (isRestrictedUrlSafe(url)) {
      return;
    }

    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    if (settings.enabled === false) return;
    if (settings.quickSearchEnabled === false) return;

    // Check exclusion & overrides
    const statusCalc = calculateSiteStatusSafe(settings, url);
    if (statusCalc.status === 'disabled') {
      return;
    }
    if (statusCalc.status === 'custom') {
      const domain = normalizeDomainSafe(url);
      const overrides = (settings.siteOverrides && domain && settings.siteOverrides[domain]) || {};
      if (overrides.quickSearch !== true && overrides.toolbar !== true) {
        return;
      }
    }

    // Send openQuickSearch message to the active tab
    chrome.tabs.sendMessage(activeTab.id, { action: 'openQuickSearch' }, () => {
      if (chrome.runtime.lastError) {
        // Tab may not have content script running
      }
    });
  } catch (err) {
    console.debug('HoldTab: Quick Search command failed:', err);
  }
}

// Register browser extension command listener
if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'quick-search') {
      await handleQuickSearchCommand();
    }
  });
}

