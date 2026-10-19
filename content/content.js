// HoldTab - Content Script
// Handles mouse gesture detection, SVG radial indicator, cancellation, and background tab creation

(function () {
  'use strict';

  // Prevent double injection
  if (window.__HOLDTAB_INITIALIZED__) return;
  window.__HOLDTAB_INITIALIZED__ = true;

  // Notify background service worker of tab URL on page load to ensure pinned icon updates
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'contentScriptLoaded', url: window.location.href });
    }
  } catch (_) {}

  const DEFAULT_SEARCH_WEBSITES = [
    { id: 'google', name: 'Google', template: 'https://www.google.com/search?q={query}', enabled: true, icon: 'google' },
    { id: 'youtube', name: 'YouTube', template: 'https://www.youtube.com/results?search_query={query}', enabled: true, icon: 'youtube' },
    { id: 'wikipedia', name: 'Wikipedia', template: 'https://en.wikipedia.org/w/index.php?search={query}', enabled: true, icon: 'wikipedia' },
    { id: 'reddit', name: 'Reddit', template: 'https://www.reddit.com/search/?q={query}', enabled: true, icon: 'reddit' },
    { id: 'github', name: 'GitHub', template: 'https://github.com/search?q={query}', enabled: true, icon: 'github' },
    { id: 'amazon', name: 'Amazon', template: 'https://www.amazon.com/s?k={query}', enabled: true, icon: 'amazon' }
  ];

  // Default configuration
  let config = {
    enabled: true,
    holdDuration: 450,       // ms
    gestureMode: 'hold',     // 'hold', 'drag', 'both'
    dragDistance: 35,        // px
    tabPosition: 'next',     // 'next', 'end'
    tabFocus: 'background',  // 'background', 'foreground'
    indicatorStyle: 'ring',  // 'ring', 'pulse', 'minimal'
    requireModifier: 'none', // 'none', 'alt', 'ctrl', 'shift'
    tabCycleWheel: true,     // Right-click + Wheel scroll
    tabCycleSwipe: true,     // Right-click + Swipe left/right
    tabCycleRocker: true,    // Rocker gestures (Left+Right: Next, Right+Left: Prev)
    tabCycleAltScroll: true, // Alt + Two-finger trackpad scroll / wheel
    tabCycleAltKeys: true,   // Alt + < / > keybinds to cycle tabs
    tabCycleHud: true,       // On-screen visual HUD pill
    swipeDeviceMode: 'mouse', // 'mouse' | 'mousepad'
    closeTabOnDoubleRightClick: true, // Close tab on double right-click
    textSearchHold: true,    // Hold on selected text (Left: foreground search, Right: background search)
    textDoubleClickCopyCut: true, // Double left-click to copy, double right-click to cut on selected text
    inputDoubleClickPaste: true, // Double left-click in input field to paste clipboard text
    altDoubleClickFillSearch: true, // Alt + Double Left-Click to fill current site's search bar
    altHoldSearchSite: true, // Alt + Hold on text to search site (Left: Current Tab, Right: New Tab)
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

  // State management
  let isHolding = false;
  let holdTimer = null;
  let indicatorTimer = null;
  let hasTriggered = false;
  let startX = 0;
  let startY = 0;
  let targetLinkUrl = null;
  let targetElement = null;
  let suppressClickUntil = 0;
  let isDraggingLink = false;
  let dragTriggered = false;
  let isRightLinkHold = false;

  // Text selection double-click actions (Double Left-Click: Copy/Paste/Search, Double Right-Click: Cut)
  let lastLeftClickTime = 0;
  let lastLeftClickX = 0;
  let lastLeftClickY = 0;
  let lastLeftClickSelectedText = '';
  let lastLeftClickRange = null;
  let lastLeftClickInputStart = -1;
  let lastLeftClickInputEnd = -1;
  let lastLeftClickWithAlt = false;
  let lastLeftClickIsInput = false;
  let lastLeftClickTargetInput = null;
  let lastRightClickSelectedText = '';
  let lastKnownSelectedText = '';
  let lastCopiedText = '';
  const DOUBLE_CLICK_INTERVAL = 500; // ms (relaxed to 500ms to match OS standard)
  const DOUBLE_CLICK_MAX_DISTANCE = 45; // px (allows comfortable trackpad glide)

  // Text search hold state
  let isHoldingText = false;
  let textSearchTimer = null;
  let textSearchType = null; // 'foreground' | 'background'
  let textSearchQuery = '';
  let rightHoldSearchTriggered = false;

  // Mouse buttons & rocker state
  let isLeftMouseDown = false;
  let rockerTriggered = false;

  // Tab cycling state
  let isRightMouseDown = false;
  let rightStartX = 0;
  let rightStartY = 0;
  let rightSwipeTriggered = false;
  let tabCycleDidExecute = false;
  let suppressContextMenuUntil = 0;
  let lastWheelCycleTime = 0;
  let hudTimeout = null;

  // Alt + Two-finger scroll state (supports both Left Alt and Right Alt / AltGr)
  let isAltKeyDown = false;
  let altScrollAccumulator = 0;
  let lastAltScrollTime = 0;
  let lastAltDirection = null;
  let altLockedAxis = null; // 'x' | 'y' | null
  let altGestureTriggered = false;
  const ALT_SCROLL_THRESHOLD = 40;  // px threshold for smooth step
  const ALT_REVERSE_THRESHOLD = 120; // px threshold to reverse direction within bounce window
  const ALT_SCROLL_COOLDOWN = 160;  // ms minimum cooldown between steps

  // Alt + < / > keybind state
  let lastAltKeyCycleTime = 0;
  const ALT_KEY_CYCLE_THROTTLE = 140; // ms minimum cooldown between keybind steps

  // Double right-click close tab state
  let lastRightClickTime = 0;
  let lastRightClickX = 0;
  let lastRightClickY = 0;
  let lastContextMenuTime = 0;
  let lastContextMenuX = 0;
  let lastContextMenuY = 0;
  let isClosingTab = false;
  const DOUBLE_RIGHT_CLICK_INTERVAL = 420; // ms
  const DOUBLE_RIGHT_CLICK_MAX_DISTANCE = 40; // px

  // Shadow DOM host for visual feedback
  let hostElement = null;
  let shadowRoot = null;
  let indicatorEl = null;
  let hudEl = null;

  // Load configuration from storage
  function loadConfig() {
    try {
      if (chrome.runtime && chrome.runtime.id && chrome.storage) {
        const storageArea = chrome.storage.sync || chrome.storage.local;
        if (storageArea) {
          storageArea.get(null, (stored) => {
            if (chrome.runtime.lastError) {
              if (chrome.storage.local && storageArea !== chrome.storage.local) {
                chrome.storage.local.get(null, (localStored) => {
                  if (localStored) {
                    config = { ...config, ...localStored };
                    if (!isToolbarAllowed() && typeof hideToolbar === 'function') {
                      hideToolbar();
                    }
                  }
                });
              }
              return;
            }
            if (stored && Object.keys(stored).length > 0) {
              config = { ...config, ...stored };
              if (!isToolbarAllowed() && typeof hideToolbar === 'function') {
                hideToolbar();
              }
            }
          });
        }
      }
    } catch (e) {
      // Storage access may fail in sandboxed or terminating contexts
    }
  }

  loadConfig();

  // Listen for storage changes in real-time
  try {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' || area === 'local') {
          for (const [key, change] of Object.entries(changes)) {
            if (change && typeof change.newValue !== 'undefined') {
              config[key] = change.newValue;
            }
          }
          if (!isToolbarAllowed()) {
            if (typeof hideToolbar === 'function') {
              hideToolbar();
            }
          }
          if (!config.enabled || (isCurrentSiteExcluded() && !isAnyFeatureAllowed())) {
            if (typeof cancelHold === 'function') cancelHold();
            if (typeof hideIndicator === 'function') hideIndicator();
          }
        }
      });
    }
  } catch (e) {}

  // Listen for background tab-cycle activation messages
  try {
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message && message.action === 'tabCycleActivated') {
          isLeftMouseDown = false;
          isRightMouseDown = false;
          rightSwipeTriggered = false;
          rockerTriggered = false;
          altScrollAccumulator = 0;
          lastAltScrollTime = performance.now();
          lastAltDirection = message.direction || null;
          altLockedAxis = message.lockedAxis || null;
          cancelHold();

          if (message.viaAlt) {
            isAltKeyDown = true;
            altGestureTriggered = true;
          }
          if (config.tabCycleHud) {
            showTabCycleHud(message.direction, message.targetTitle, message.targetIndex, message.totalTabs);
          }
        }

        if (message && message.action === 'suppressContextMenu') {
          suppressContextMenuUntil = performance.now() + (message.duration || 2500);
          tabCycleDidExecute = true;
          isRightMouseDown = false;
        }

        if (message && message.action === 'openQuickSearch') {
          toggleQuickSearch();
        }
      });
    }
  } catch (e) {}

  // Helper to normalize domain
  function normalizeSiteDomain(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let domain = raw.trim().toLowerCase();
    domain = domain.replace(/^[a-z0-9+.-]+:\/\//i, '');
    domain = domain.replace(/^[^/@]+@/, '');
    domain = domain.replace(/[/?#].*$/, '');
    domain = domain.split(':')[0];
    domain = domain.replace(/^\.+|\.+$/g, '').replace(/^www\./, '');
    return domain;
  }

  // Get per-site feature overrides for the current domain
  function getCurrentSiteOverrides() {
    if (typeof getSiteOverrides === 'function') {
      return getSiteOverrides(config, window.location.href);
    }
    if (!config || typeof config.siteOverrides !== 'object' || !config.siteOverrides) {
      return {};
    }
    const host = normalizeSiteDomain(window.location.hostname || window.location.href);
    if (!host) return {};

    if (config.siteOverrides[host]) {
      return config.siteOverrides[host];
    }
    for (const [key, val] of Object.entries(config.siteOverrides)) {
      const normKey = normalizeSiteDomain(key);
      if (normKey && (host === normKey || host.endsWith('.' + normKey))) {
        return val || {};
      }
    }
    return {};
  }

  // Check if current site is excluded
  function isCurrentSiteExcluded() {
    if (typeof isSiteExcluded === 'function') {
      return isSiteExcluded(config, window.location.hostname || window.location.href);
    }
    let currentHost = (window.location.hostname || '').toLowerCase();
    if (!currentHost) {
      const href = (window.location.href || '').toLowerCase();
      if (!Array.isArray(config.excludedDomains)) return false;
      return config.excludedDomains.some((d) => {
        const domain = (d || '').trim().toLowerCase();
        return domain && href.includes(domain);
      });
    }
    const currentHostNoWww = currentHost.replace(/^www\./, '');
    if (!Array.isArray(config.excludedDomains)) return false;
    return config.excludedDomains.some((d) => {
      let rawDomain = (d || '').trim().toLowerCase();
      if (!rawDomain) return false;
      rawDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0];
      const domainNoWww = rawDomain.replace(/^www\./, '');
      return (
        currentHost === rawDomain ||
        currentHostNoWww === domainNoWww ||
        currentHost.endsWith('.' + domainNoWww) ||
        domainNoWww.endsWith('.' + currentHostNoWww)
      );
    });
  }

  // Check if a specific feature is permitted on current site
  function isFeatureAllowed(featureId) {
    if (!config || config.enabled === false) return false;

    // If site is not excluded, it's allowed
    if (!isCurrentSiteExcluded()) {
      return true;
    }

    // Site is excluded: check per-site overrides
    const overrides = getCurrentSiteOverrides();
    return overrides && overrides[featureId] === true;
  }

  // Check if ANY feature is allowed on current site
  function isAnyFeatureAllowed() {
    if (!config || config.enabled === false) return false;
    if (!isCurrentSiteExcluded()) return true;
    return (
      isFeatureAllowed('toolbar') ||
      isFeatureAllowed('quickSearch') ||
      isFeatureAllowed('linkHold') ||
      isFeatureAllowed('tabCycle') ||
      isFeatureAllowed('textActions')
    );
  }

  // Check if floating text selection toolbar is permitted in current context
  function isToolbarAllowed() {
    if (!config || config.enabled === false) return false;
    if (config.toolbarEnabled === false) return false;
    if (config.toolbarMode === 'disabled') return false;
    if (!isFeatureAllowed('toolbar')) return false;
    return true;
  }

  // Check if Quick Search modal is permitted in current context
  function isQuickSearchAllowed() {
    if (!config || config.enabled === false) return false;
    if (config.quickSearchEnabled === false) return false;
    if (!isFeatureAllowed('quickSearch')) return false;
    return true;
  }

  // Detect whether Left Alt or Right Alt (including AltGraph / AltGr on Windows) is pressed
  function isAltPressed(e) {
    if (e) {
      if (e.altKey) return true;
      if (typeof e.getModifierState === 'function') {
        if (e.getModifierState('Alt') || e.getModifierState('AltGraph')) {
          return true;
        }
      }
    }
    return isAltKeyDown;
  }

  // Listen for text selection changes to keep track of current active selection
  document.addEventListener('selectionchange', () => {
    try {
      const sel = window.getSelection ? window.getSelection() : null;
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        // Active DOM selection is empty or collapsed
        lastKnownSelectedText = '';
        // Note: Do NOT clear lastLeftClickSelectedText or lastRightClickSelectedText here!
        // When user clicks on selected text (Click 1 of a double-click), the browser collapses the selection,
        // firing selectionchange. Clearing them here destroys Double-Click Copy & Cut before Click 2 arrives!
      } else {
        lastKnownSelectedText = sel.toString().trim();
      }
    } catch (_) {}
  });

  // Get currently selected text on page or inside input/textarea
  function getSelectedText() {
    try {
      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && !sel.isCollapsed) {
        const text = sel.toString().trim();
        if (text) {
          lastKnownSelectedText = text;
          return text;
        }
      }

      const active = document.activeElement;
      const targetInput = isInputField(active) ? active : (document.querySelector(':focus') && isInputField(document.querySelector(':focus')) ? document.querySelector(':focus') : null);
      if (targetInput && typeof targetInput.selectionStart === 'number' && typeof targetInput.selectionEnd === 'number' && targetInput.selectionStart !== targetInput.selectionEnd) {
        const inputSel = targetInput.value.slice(targetInput.selectionStart, targetInput.selectionEnd).trim();
        if (inputSel) {
          lastKnownSelectedText = inputSel;
          return inputSel;
        }
      }

      // Check shadow root selection if active element has shadowRoot
      if (active && active.shadowRoot && active.shadowRoot.getSelection) {
        const shadowSelObj = active.shadowRoot.getSelection();
        if (shadowSelObj && !shadowSelObj.isCollapsed) {
          const shadowSel = shadowSelObj.toString().trim();
          if (shadowSel) {
            lastKnownSelectedText = shadowSel;
            return shadowSel;
          }
        }
      }
    } catch (_) {}
    // If no text is currently selected, clear stale caches and return empty string
    lastKnownSelectedText = '';
    return '';
  }

  // Check if mouse event is on or near the current text selection
  function isSelectionTarget(e, selectedText) {
    if (!selectedText) return false;
    try {
      const active = document.activeElement;
      const targetInput = isInputField(e.target) ? e.target : (isInputField(active) ? active : null);
      if (targetInput && typeof targetInput.selectionStart === 'number' && typeof targetInput.selectionEnd === 'number' && targetInput.selectionStart !== targetInput.selectionEnd) {
        if (e.target === targetInput || (targetInput.contains && targetInput.contains(e.target))) {
          return true;
        }
      }

      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const rects = range.getClientRects();
        if (rects && rects.length > 0) {
          for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            if (e.clientX >= r.left - 24 && e.clientX <= r.right + 24 &&
                e.clientY >= r.top - 24 && e.clientY <= r.bottom + 24) {
              return true;
            }
          }
        } else {
          const br = range.getBoundingClientRect();
          if (br && (br.width > 0 || br.height > 0)) {
            if (e.clientX >= br.left - 24 && e.clientX <= br.right + 24 &&
                e.clientY >= br.top - 24 && e.clientY <= br.bottom + 24) {
              return true;
            }
          }
        }
      }

      if (active && active.shadowRoot && active.shadowRoot.getSelection) {
        const shadowSelObj = active.shadowRoot.getSelection();
        if (shadowSelObj && shadowSelObj.rangeCount > 0 && !shadowSelObj.isCollapsed) {
          const shadowRange = shadowSelObj.getRangeAt(0);
          const sRects = shadowRange.getClientRects();
          for (let i = 0; i < sRects.length; i++) {
            const r = sRects[i];
            if (e.clientX >= r.left - 24 && e.clientX <= r.right + 24 &&
                e.clientY >= r.top - 24 && e.clientY <= r.bottom + 24) {
              return true;
            }
          }
        }
      }
    } catch (_) {}
    return false;
  }

  // Check modifier keys according to preference
  function checkModifier(e) {
    switch (config.requireModifier) {
      case 'alt':
        return isAltPressed(e);
      case 'ctrl':
        return e.ctrlKey || e.metaKey;
      case 'shift':
        return e.shiftKey;
      case 'none':
      default:
        // By default, do NOT trigger if standard modifiers (Ctrl, Alt, Shift) are held
        // so browser native behaviors (like Ctrl+Click for foreground tab) remain accessible!
        return !e.ctrlKey && !e.metaKey && !isAltPressed(e) && !e.shiftKey;
    }
  }

  // Find nearest valid hyperlink target
  function findLink(e) {
    const path = e.composedPath ? e.composedPath() : [];
    for (const el of path) {
      if (!el || el.nodeType !== 1) continue;

      // Check standard <a> tag with href
      if (el.tagName && el.tagName.toLowerCase() === 'a' && el.href) {
        return isValidUrl(el.href) ? { element: el, url: el.href } : null;
      }

      // Check role="link" with data-href or href attribute
      const role = el.getAttribute && el.getAttribute('role');
      if (role === 'link') {
        const href = el.getAttribute('data-href') || el.getAttribute('href');
        if (href && isValidUrl(href)) {
          return { element: el, url: resolveUrl(href) };
        }
      }
    }

    // Fallback to closest('a[href]') if composedPath didn't return
    const anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (anchor && isValidUrl(anchor.href)) {
      return { element: anchor, url: anchor.href };
    }

    return null;
  }

  // Validate that URL is an external web link, not a page anchor or javascript snippet
  function isValidUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    const trimmed = rawUrl.trim();
    if (trimmed.startsWith('javascript:') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
      return false;
    }

    try {
      const url = new URL(trimmed, window.location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return false;
      }

      // If it's just a local hash jump on the same page (#section), do not trigger
      if (url.origin === window.location.origin &&
          url.pathname === window.location.pathname &&
          url.search === window.location.search &&
          url.hash && trimmed.startsWith('#')) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  function resolveUrl(href) {
    try {
      return new URL(href, window.location.href).href;
    } catch {
      return href;
    }
  }

  // Setup Shadow DOM container for styles isolation
  function initShadowUi() {
    if (shadowRoot) return;

    hostElement = document.createElement('div');
    hostElement.id = 'holdtab-root-host';

    shadowRoot = hostElement.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host, :host * {
        pointer-events: none !important;
      }
      @keyframes ht-fade-in {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.82);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }
      .ht-indicator {
        position: fixed;
        width: 38px;
        height: 38px;
        transform: translate(-50%, -50%) scale(0.85);
        opacity: 0;
        display: none;
        pointer-events: none !important;
        z-index: 2147483647;
        transition: opacity 0.15s ease-out, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        align-items: center;
        justify-content: center;
      }
      .ht-indicator.ht-active {
        display: flex;
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
        animation: ht-fade-in 0.14s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .ht-indicator.ht-success {
        display: flex;
        opacity: 1;
        transform: translate(-50%, -50%) scale(1.18);
        transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out;
      }
      .ht-svg-wrap {
        width: 100%;
        height: 100%;
        filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.28));
      }
      .ht-bg-circle {
        fill: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(4px);
      }
      .ht-track {
        fill: none;
        stroke: rgba(255, 255, 255, 0.2);
        stroke-width: 3;
      }
      .ht-progress {
        fill: none;
        stroke: #38BDF8;
        stroke-width: 3;
        stroke-linecap: round;
        transform-origin: center;
        transform: rotate(-90deg);
        stroke-dasharray: 87.96;
        stroke-dashoffset: 87.96;
      }
      .ht-icon-tab {
        opacity: 0.95;
        transition: opacity 0.15s;
      }
      .ht-icon-search {
        display: none;
        opacity: 0.95;
        transition: opacity 0.15s;
      }
      .ht-indicator.ht-searching .ht-icon-tab {
        display: none !important;
      }
      .ht-indicator.ht-searching .ht-icon-search {
        display: block !important;
      }
      .ht-icon-arrow {
        display: none;
        opacity: 0;
        transform-origin: 18px 18px;
        transition: opacity 0.1s ease;
      }
      .ht-dragging .ht-icon-tab,
      .ht-dragging .ht-icon-search {
        display: none !important;
      }
      .ht-dragging .ht-icon-arrow {
        display: block !important;
        opacity: 1 !important;
      }
      .ht-dragging .ht-badge {
        opacity: 1 !important;
      }
      .ht-success .ht-icon-tab,
      .ht-success .ht-icon-search,
      .ht-success .ht-icon-arrow {
        display: none !important;
        opacity: 0 !important;
      }
      .ht-icon-check {
        fill: none;
        stroke: #FFFFFF;
        stroke-width: 2.8;
        stroke-linecap: round;
        stroke-linejoin: round;
        opacity: 0;
        transform-origin: 18px 18px;
        transform: scale(0.5);
        transition: opacity 0.15s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .ht-success .ht-progress {
        stroke: #10B981 !important;
      }
      .ht-success .ht-icon-check {
        opacity: 1;
        transform: scale(1);
      }
      .ht-ripple {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2px solid #10B981;
        opacity: 0;
        pointer-events: none;
      }
      .ht-success .ht-ripple {
        animation: ht-ripple-pulse 0.45s ease-out forwards;
      }
      @keyframes ht-ripple-pulse {
        0% { transform: scale(1); opacity: 0.9; }
        100% { transform: scale(1.7); opacity: 0; }
      }
      .ht-badge {
        position: absolute;
        bottom: -20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.92);
        color: #FFFFFF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 10.5px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        letter-spacing: 0.2px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.18s ease;
      }
      .ht-success .ht-badge {
        opacity: 1;
      }
      /* Blue theme (Link Background Tab) */
      .ht-indicator.ht-blue .ht-svg-wrap {
        filter: drop-shadow(0 2px 10px rgba(56, 189, 248, 0.4));
      }
      .ht-indicator.ht-blue .ht-bg-circle {
        fill: rgba(15, 23, 42, 0.9);
      }
      .ht-indicator.ht-blue .ht-track {
        stroke: rgba(56, 189, 248, 0.22);
      }
      .ht-indicator.ht-blue .ht-progress {
        stroke: #38BDF8;
      }
      .ht-indicator.ht-blue .ht-icon-arrow path {
        fill: #38BDF8;
      }
      .ht-indicator.ht-blue .ht-ripple {
        border-color: #38BDF8;
      }
      .ht-indicator.ht-blue .ht-badge {
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(56, 189, 248, 0.45);
        color: #E0F2FE;
      }

      /* Indigo shade theme (Right-Click Foreground Link / Open & Go) */
      .ht-indicator.ht-indigo .ht-svg-wrap,
      .ht-indicator.ht-red .ht-svg-wrap {
        filter: drop-shadow(0 2px 10px rgba(99, 102, 241, 0.48));
      }
      .ht-indicator.ht-indigo .ht-bg-circle,
      .ht-indicator.ht-red .ht-bg-circle {
        fill: rgba(30, 27, 75, 0.92);
      }
      .ht-indicator.ht-indigo .ht-track,
      .ht-indicator.ht-red .ht-track {
        stroke: rgba(165, 180, 252, 0.28);
      }
      .ht-indicator.ht-indigo .ht-progress,
      .ht-indicator.ht-red .ht-progress {
        stroke: #6366F1;
      }
      .ht-indicator.ht-indigo .ht-icon-arrow path,
      .ht-indicator.ht-red .ht-icon-arrow path {
        fill: #6366F1;
      }
      .ht-indicator.ht-indigo.ht-success .ht-progress,
      .ht-indicator.ht-red.ht-success .ht-progress {
        stroke: #818CF8 !important;
      }
      .ht-indicator.ht-indigo .ht-ripple,
      .ht-indicator.ht-red .ht-ripple {
        border-color: #6366F1;
      }
      .ht-indicator.ht-indigo .ht-badge,
      .ht-indicator.ht-red .ht-badge {
        background: rgba(30, 27, 75, 0.95);
        border: 1px solid rgba(99, 102, 241, 0.45);
        color: #E0E7FF;
      }

      /* Purple theme (Active Search Bar / Foreground Search) */
      .ht-indicator.ht-purple .ht-svg-wrap {
        filter: drop-shadow(0 2px 10px rgba(168, 85, 247, 0.48));
      }
      .ht-indicator.ht-purple .ht-bg-circle {
        fill: rgba(30, 10, 48, 0.92);
      }
      .ht-indicator.ht-purple .ht-track {
        stroke: rgba(216, 180, 254, 0.28);
      }
      .ht-indicator.ht-purple .ht-progress {
        stroke: #A855F7;
      }
      .ht-indicator.ht-purple .ht-icon-arrow path {
        fill: #A855F7;
      }
      .ht-indicator.ht-purple.ht-success .ht-progress {
        stroke: #C084FC !important;
      }
      .ht-indicator.ht-purple .ht-ripple {
        border-color: #A855F7;
      }
      .ht-indicator.ht-purple .ht-badge {
        background: rgba(30, 10, 48, 0.95);
        border: 1px solid rgba(168, 85, 247, 0.45);
        color: #F3E8FF;
      }

      /* Amber theme (Background Search / BG Search) */
      .ht-indicator.ht-amber .ht-svg-wrap {
        filter: drop-shadow(0 2px 10px rgba(245, 158, 11, 0.48));
      }
      .ht-indicator.ht-amber .ht-bg-circle {
        fill: rgba(42, 22, 6, 0.92);
      }
      .ht-indicator.ht-amber .ht-track {
        stroke: rgba(253, 230, 138, 0.28);
      }
      .ht-indicator.ht-amber .ht-progress {
        stroke: #F59E0B;
      }
      .ht-indicator.ht-amber .ht-icon-arrow path {
        fill: #F59E0B;
      }
      .ht-indicator.ht-amber.ht-success .ht-progress {
        stroke: #FBBF24 !important;
      }
      .ht-indicator.ht-amber .ht-ripple {
        border-color: #F59E0B;
      }
      .ht-indicator.ht-amber .ht-badge {
        background: rgba(42, 22, 6, 0.95);
        border: 1px solid rgba(245, 158, 11, 0.45);
        color: #FEF3C7;
      }

      /* Cyan theme (Current Tab Site Search) */
      .ht-indicator.ht-cyan .ht-svg-wrap {
        filter: drop-shadow(0 2px 10px rgba(14, 165, 233, 0.5));
      }
      .ht-indicator.ht-cyan .ht-bg-circle {
        fill: rgba(8, 47, 73, 0.92);
      }
      .ht-indicator.ht-cyan .ht-track {
        stroke: rgba(186, 230, 253, 0.28);
      }
      .ht-indicator.ht-cyan .ht-progress {
        stroke: #38BDF8;
      }
      .ht-indicator.ht-cyan .ht-icon-arrow path {
        fill: #38BDF8;
      }
      .ht-indicator.ht-cyan.ht-success .ht-progress {
        stroke: #0EA5E9 !important;
      }
      .ht-indicator.ht-cyan .ht-ripple {
        border-color: #38BDF8;
      }
      .ht-indicator.ht-cyan .ht-badge {
        background: rgba(8, 47, 73, 0.95);
        border: 1px solid rgba(56, 189, 248, 0.45);
        color: #E0F2FE;
      }

      /* Teal theme (New Tab Site Search) */
      .ht-indicator.ht-teal .ht-svg-wrap {
        filter: drop-shadow(0 2px 10px rgba(20, 184, 166, 0.5));
      }
      .ht-indicator.ht-teal .ht-bg-circle {
        fill: rgba(4, 47, 46, 0.92);
      }
      .ht-indicator.ht-teal .ht-track {
        stroke: rgba(153, 246, 228, 0.28);
      }
      .ht-indicator.ht-teal .ht-progress {
        stroke: #14B8A6;
      }
      .ht-indicator.ht-teal .ht-icon-arrow path {
        fill: #14B8A6;
      }
      .ht-indicator.ht-teal.ht-success .ht-progress {
        stroke: #2DD4BF !important;
      }
      .ht-indicator.ht-teal .ht-ripple {
        border-color: #14B8A6;
      }
      .ht-indicator.ht-teal .ht-badge {
        background: rgba(4, 47, 46, 0.95);
        border: 1px solid rgba(20, 184, 166, 0.45);
        color: #CCFBF1;
      }
      .ht-hud-pill {
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(-10px) scale(0.95);
        background: rgba(15, 23, 42, 0.94);
        color: #F8FAFC;
        border: 1px solid rgba(56, 189, 248, 0.35);
        padding: 7px 16px;
        border-radius: 999px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45), 0 0 15px rgba(56, 189, 248, 0.2);
        backdrop-filter: blur(12px);
        z-index: 2147483647;
        pointer-events: none !important;
        opacity: 0;
        transition: opacity 0.16s ease, transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ht-hud-pill.ht-hud-visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0) scale(1);
      }
      .ht-hud-arrow {
        color: #38BDF8;
        font-size: 14px;
        font-weight: 700;
      }
      .ht-hud-index {
        background: rgba(56, 189, 248, 0.18);
        color: #38BDF8;
        padding: 2px 7px;
        border-radius: 6px;
        font-size: 11px;
      }
      .ht-hud-title {
        max-width: 250px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `;

    indicatorEl = document.createElement('div');
    indicatorEl.className = 'ht-indicator';
    indicatorEl.innerHTML = `
      <div class="ht-ripple"></div>
      <svg class="ht-svg-wrap" viewBox="0 0 36 36">
        <circle class="ht-bg-circle" cx="18" cy="18" r="16" />
        <circle class="ht-track" cx="18" cy="18" r="14" />
        <circle class="ht-progress" cx="18" cy="18" r="14" />
        <!-- Tab icon centered at (18, 18) -->
        <g class="ht-icon-tab">
          <rect x="11.5" y="11.5" width="13" height="13" rx="2" stroke="#FFFFFF" stroke-width="1.8" fill="none" />
          <line x1="11.5" y1="15.5" x2="24.5" y2="15.5" stroke="#FFFFFF" stroke-width="1.5" />
          <line x1="18" y1="18" x2="18" y2="22" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" />
          <line x1="16" y1="20" x2="20" y2="20" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" />
        </g>
        <!-- Search icon centered at (18, 18) -->
        <g class="ht-icon-search">
          <circle cx="16.5" cy="16.5" r="4.5" stroke="#FFFFFF" stroke-width="1.8" fill="none" />
          <line x1="20" y1="20" x2="24" y2="24" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" />
        </g>
        <!-- Directional Drag Arrow centered at (18, 18) -->
        <g class="ht-icon-arrow">
          <path d="M18 9 L23.5 15.5 L19.5 15.5 L19.5 25 L16.5 25 L16.5 15.5 L12.5 15.5 Z" fill="#38BDF8" />
        </g>
        <!-- Success checkmark centered in 36x36 (center is 18, 18) -->
        <path class="ht-icon-check" d="M12 18.5 L16 22.5 L24 14.5" />
      </svg>
      <div class="ht-badge">New Tab</div>
    `;

    hudEl = document.createElement('div');
    hudEl.className = 'ht-hud-pill';
    hudEl.innerHTML = `
      <span class="ht-hud-arrow">◀</span>
      <span class="ht-hud-title">Switching Tab</span>
      <span class="ht-hud-index"></span>
    `;

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(indicatorEl);
    shadowRoot.appendChild(hudEl);

    // Attach to DOM safely
    if (document.body) {
      document.body.appendChild(hostElement);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(hostElement);
      });
    }
  }

  // Show visual HUD when cycling tabs
  function showTabCycleHud(direction, title, index, totalTabs) {
    if (config.animHudBadges === false || !config.tabCycleHud) return;
    initShadowUi();
    if (!hudEl) return;

    const arrowEl = hudEl.querySelector('.ht-hud-arrow');
    const titleEl = hudEl.querySelector('.ht-hud-title');
    const indexEl = hudEl.querySelector('.ht-hud-index');

    if (arrowEl) arrowEl.textContent = direction === 'next' ? '▶' : '◀';
    if (titleEl) titleEl.textContent = title || (direction === 'next' ? 'Next Tab' : 'Previous Tab');
    if (indexEl) {
      if (typeof index === 'number' && typeof totalTabs === 'number') {
        indexEl.textContent = `${index + 1}/${totalTabs}`;
        indexEl.style.display = 'inline-block';
      } else {
        indexEl.style.display = 'none';
      }
    }

    hudEl.classList.add('ht-hud-visible');

    if (hudTimeout) clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => {
      if (hudEl) hudEl.classList.remove('ht-hud-visible');
    }, 750);
  }

  // Show visual HUD when closing tab
  function showCloseTabHud() {
    if (config.animHudBadges === false || !config.tabCycleHud) return;
    initShadowUi();
    if (!hudEl) return;

    const arrowEl = hudEl.querySelector('.ht-hud-arrow');
    const titleEl = hudEl.querySelector('.ht-hud-title');
    const indexEl = hudEl.querySelector('.ht-hud-index');

    if (arrowEl) arrowEl.textContent = '✕';
    if (titleEl) titleEl.textContent = 'Closing Tab...';
    if (indexEl) indexEl.style.display = 'none';

    hudEl.classList.add('ht-hud-visible');
  }

  // Show visual HUD for clipboard operations and search actions (Copy / Cut / Fill Search)
  function showClipboardHud(actionText, previewText = '') {
    if (config.animHudBadges === false) return;
    initShadowUi();
    if (!hudEl) return;

    const arrowEl = hudEl.querySelector('.ht-hud-arrow');
    const titleEl = hudEl.querySelector('.ht-hud-title');
    const indexEl = hudEl.querySelector('.ht-hud-index');

    if (arrowEl) {
      if (actionText.includes('Cut') || actionText.includes('✂️')) {
        arrowEl.textContent = '✂️';
      } else if (actionText.includes('Search') || actionText.includes('🔍')) {
        arrowEl.textContent = '🔍';
      } else if (actionText.includes('⚠️')) {
        arrowEl.textContent = '⚠️';
      } else {
        arrowEl.textContent = '📋';
      }
    }
    if (titleEl) {
      const clean = (previewText || '').replace(/\s+/g, ' ').trim();
      const trimmed = clean.length > 22 ? clean.slice(0, 22) + '…' : clean;
      titleEl.textContent = trimmed ? `${actionText}: "${trimmed}"` : actionText;
    }
    if (indexEl) indexEl.style.display = 'none';

    hudEl.classList.add('ht-hud-visible');

    if (hudTimeout) clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => {
      if (hudEl) hudEl.classList.remove('ht-hud-visible');
    }, 1200);
  }

  // Copy selected text to clipboard with multi-tier fallback
  async function performCopy(text) {
    if (!text) return false;
    lastCopiedText = text;
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (_) {}

    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (_) {}
    }
    return copied;
  }

  // Cut selected text: copy to clipboard and remove text from input or document
  async function performCut(text) {
    if (!text) return false;
    await performCopy(text);

    try {
      const active = document.activeElement;
      if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|tel|email)$/i.test(active.type)))) {
        if (typeof active.selectionStart === 'number' && typeof active.selectionEnd === 'number') {
          const start = active.selectionStart;
          const end = active.selectionEnd;
          if (start !== end) {
            active.setRangeText('', start, end, 'end');
            active.dispatchEvent(new Event('input', { bubbles: true }));
            active.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
      }

      // Check contenteditable
      if (active && (active.isContentEditable || active.getAttribute('contenteditable') === 'true')) {
        document.execCommand('delete');
        return true;
      }

      // Static DOM selection
      const sel = window.getSelection ? window.getSelection() : null;
      if (sel) {
        sel.removeAllRanges();
      }
    } catch (_) {}

    return true;
  }

  // Check if an element is an editable input, textarea, or contenteditable
  function isInputField(el) {
    if (!el) return false;
    const tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      return /^(text|search|url|tel|email|password|number)$/.test(type);
    }
    if (el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true')) {
      return true;
    }
    if (el.closest && el.closest('[contenteditable="true"], [contenteditable=""]')) {
      return true;
    }
    return false;
  }

  // Check if cursor/caret is inside a word (has letters/characters on BOTH sides)
  function isCursorInOrBetweenText(target) {
    if (!target) return false;

    // Standard HTML Input & Textarea
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      const val = target.value;
      if (!val || val.length === 0) {
        return false; // Field is empty -> allow double-click paste
      }

      // If only whitespace in field, allow paste
      if (!/\S/.test(val)) {
        return false;
      }

      let start = -1;
      let end = -1;
      try {
        if (typeof target.selectionStart === 'number') {
          start = target.selectionStart;
          end = target.selectionEnd;
        }
      } catch (_) {}

      // If user already has a selection range (highlighted text), don't paste (allows copy/cut/selection)
      if (start >= 0 && end >= 0 && start !== end) {
        return true;
      }

      // If cursor position is known
      if (start >= 0) {
        const charBefore = start > 0 ? val[start - 1] : '';
        const charAfter = end < val.length ? val[end] : '';

        const hasLetterBefore = Boolean(charBefore && /\S/.test(charBefore));
        const hasLetterAfter = Boolean(charAfter && /\S/.test(charAfter));

        // Only block paste if cursor has letters directly on BOTH sides (e.g. "hel|lo" or "abc|123")
        // If either side is blank, space, or an edge boundary (e.g. "hello |world" or "|world" or "hello|"), allow paste!
        if (hasLetterBefore && hasLetterAfter) {
          return true; // Inside a word -> do NOT paste (allow native word selection)
        }

        return false; // Adjacent to space, blank, or edge -> allow paste
      }

      return false;
    }

    // Contenteditable elements
    const editable = target.isContentEditable ? target : (target.closest && target.closest('[contenteditable="true"], [contenteditable=""]'));
    if (editable) {
      const text = editable.textContent || '';
      if (!text || !/\S/.test(text)) return false; // Empty -> allow paste

      try {
        const sel = window.getSelection ? window.getSelection() : null;
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (!range.collapsed) {
            return true; // Has selection -> do not paste
          }
          const preRange = range.cloneRange();
          preRange.selectNodeContents(editable);
          preRange.setEnd(range.startContainer, range.startOffset);
          const textBefore = preRange.toString();

          const postRange = range.cloneRange();
          postRange.selectNodeContents(editable);
          postRange.setStart(range.endContainer, range.endOffset);
          const textAfter = postRange.toString();

          const charBefore = textBefore.length > 0 ? textBefore[textBefore.length - 1] : '';
          const charAfter = textAfter.length > 0 ? textAfter[0] : '';

          const hasLetterBefore = Boolean(charBefore && /\S/.test(charBefore));
          const hasLetterAfter = Boolean(charAfter && /\S/.test(charAfter));

          if (hasLetterBefore && hasLetterAfter) {
            return true;
          }
          return false;
        }
      } catch (_) {}

      return false;
    }

    return false;
  }

  // Paste text from clipboard into target input or contenteditable element
  async function performPaste(targetElement) {
    const target = targetElement || document.activeElement;
    if (!target) return false;

    // Synchronously preserve cursor positions and adjacent characters before any async clipboard reads
    let savedStart = null;
    let savedEnd = null;
    let savedCharBefore = '';
    let savedCharAfter = '';

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      try {
        if (typeof target.selectionStart === 'number') {
          savedStart = target.selectionStart;
          savedEnd = target.selectionEnd;
          const val = target.value || '';
          savedCharBefore = savedStart > 0 ? val[savedStart - 1] : '';
          savedCharAfter = savedEnd < val.length ? val[savedEnd] : '';
        }
      } catch (_) {}
    } else {
      try {
        const sel = window.getSelection ? window.getSelection() : null;
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const editable = target.isContentEditable ? target : (target.closest && target.closest('[contenteditable="true"], [contenteditable=""]'));
          if (editable) {
            const preRange = range.cloneRange();
            preRange.selectNodeContents(editable);
            preRange.setEnd(range.startContainer, range.startOffset);
            const preText = preRange.toString();
            savedCharBefore = preText.length > 0 ? preText[preText.length - 1] : '';

            const postRange = range.cloneRange();
            postRange.selectNodeContents(editable);
            postRange.setStart(range.endContainer, range.endOffset);
            const postText = postRange.toString();
            savedCharAfter = postText.length > 0 ? postText[0] : '';
          }
        }
      } catch (_) {}
    }

    let textToPaste = '';
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        textToPaste = await navigator.clipboard.readText();
      }
    } catch (_) {}

    if (!textToPaste && lastCopiedText) {
      textToPaste = lastCopiedText;
    }

    if (!textToPaste) {
      try {
        if (target && target.focus) target.focus();
        document.execCommand('paste');
        showClipboardHud('📋 Pasted');
        return true;
      } catch (_) {}
      return false;
    }

    if (target.focus && document.activeElement !== target) {
      target.focus();
    }

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      const start = typeof savedStart === 'number' ? savedStart : (typeof target.selectionStart === 'number' ? target.selectionStart : target.value.length);
      const end = typeof savedEnd === 'number' ? savedEnd : (typeof target.selectionEnd === 'number' ? target.selectionEnd : target.value.length);

      let textToInsert = textToPaste;
      const isPasswordOrUrl = target.tagName === 'INPUT' && (target.type === 'password' || target.type === 'url');

      // Smart Spacing: If adjacent to letters, automatically add space so words don't collide
      // (e.g. pasting "goodmorning" in "hello |world" -> "hello goodmorning world")
      if (!isPasswordOrUrl) {
        if (savedCharBefore && /\S/.test(savedCharBefore) && !/^\s/.test(textToInsert)) {
          textToInsert = ' ' + textToInsert;
        }
        if (savedCharAfter && /\S/.test(savedCharAfter) && !/\s$/.test(textToInsert)) {
          textToInsert = textToInsert + ' ';
        }
      }

      target.setRangeText(textToInsert, start, end, 'end');
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      showClipboardHud('📋 Pasted', textToInsert.trim() || textToInsert);
      return true;
    }

    const editableEl = target.isContentEditable ? target : (target.closest && target.closest('[contenteditable="true"], [contenteditable=""]'));
    if (editableEl) {
      let textToInsert = textToPaste;
      if (savedCharBefore && /\S/.test(savedCharBefore) && !/^\s/.test(textToInsert)) {
        textToInsert = ' ' + textToInsert;
      }
      if (savedCharAfter && /\S/.test(savedCharAfter) && !/\s$/.test(textToInsert)) {
        textToInsert = textToInsert + ' ';
      }
      document.execCommand('insertText', false, textToInsert);
      showClipboardHud('📋 Pasted', textToInsert.trim() || textToInsert);
      return true;
    }

    return false;
  }

  // Check if an element is currently visible on the page (not hidden via display, visibility, opacity, or collapsed dimensions)
  function isElementVisible(el) {
    if (!el || !el.ownerDocument) return false;
    if (el.type === 'hidden' || el.disabled || el.readOnly) return false;

    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
        return false;
      }

      // Filter out off-screen accessible hiding (-9999px)
      if ((style.position === 'absolute' || style.position === 'fixed') &&
          (parseFloat(style.left) < -500 || parseFloat(style.top) < -500)) {
        return false;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width < 15 || rect.height < 10) {
        return false;
      }

      // Elements inside ShadowRoot (e.g. YouTube, Reddit web components) have offsetParent === null even when visible
      const rootNode = el.getRootNode ? el.getRootNode() : null;
      const isShadowChild = Boolean(rootNode && (rootNode.nodeType === 11 || (typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot)));
      if (style.position !== 'fixed' && !isShadowChild && el.offsetParent === null) {
        return false;
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  // Deep query selector traversing open shadow roots (crucial for YouTube, Reddit, custom web components)
  function queryAllDeep(selector, root = document) {
    const results = [];
    try {
      const direct = root.querySelectorAll(selector);
      for (let i = 0; i < direct.length; i++) {
        results.push(direct[i]);
      }
    } catch (_) {}

    try {
      const all = root.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (el && el.shadowRoot) {
          const shadowMatches = queryAllDeep(selector, el.shadowRoot);
          for (let j = 0; j < shadowMatches.length; j++) {
            results.push(shadowMatches[j]);
          }
        }
      }
    } catch (_) {}

    return results;
  }


  // Find a visible search trigger button that opens an expandable search bar or modal (e.g. Algolia, Docusaurus)
  function findSearchTriggerButton() {
    const triggerSelectors = [
      'button.DocSearch-Button',
      'button.DocSearch',
      'button[aria-label*="search" i]',
      'button[title*="search" i]',
      'button[data-target*="search" i]',
      'button[data-testid*="search" i]',
      'button.search-button',
      'button.search-toggle',
      'button.search-btn',
      'a[aria-label*="search" i]',
      'a[title*="search" i]',
      'a.search-toggle',
      'a.search-button',
      '#search-button'
    ];

    for (const sel of triggerSelectors) {
      try {
        const btns = queryAllDeep(sel);
        const visible = btns.filter(isElementVisible);
        if (visible.length > 0) return visible[0];
      } catch (_) {}
    }
    return null;
  }

  // Find the primary search input on the current page using ranked heuristics
  function findSiteSearchInput() {
    const selectorGroups = [
      // 1. Explicit search input types and roles
      'input[type="search"]',
      'input[role="searchbox"]',
      '[role="searchbox"] input',
      '[role="searchbox"] textarea',
      'form[role="search"] input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"])',
      'form[role="search"] textarea',

      // 2. High-profile site IDs & specific search names
      'input#searchInput, textarea#searchInput', // Wikipedia, MediaWiki
      'input#search, textarea#search',           // YouTube, GitHub, etc.
      'input#search-input, input#search_input',
      'input#twotabsearchtextbox',              // Amazon
      'input#gh-ac',                            // eBay
      'input#searchbox_input',                  // DuckDuckGo
      'input#sb_form_q',                        // Bing
      'input[name="search_query"]',             // YouTube
      'input[name="q"], textarea[name="q"]',    // Google, Reddit, SO
      'input[name="query"], textarea[name="query"]',
      'input[name="search"], textarea[name="search"]',
      'input[name="s"], textarea[name="s"]',    // WordPress
      'input[name="keyword"], input[name="keywords"], input[name="field-keywords"]',
      'input[name="search_term"], input[name="term"], input[name="k"]',

      // 3. Elements with search in id, name, placeholder, or aria-label
      'input[id*="search" i]:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])',
      'input[name*="search" i]:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])',
      'input[placeholder*="search" i], textarea[placeholder*="search" i]',
      'input[placeholder*="find" i], textarea[placeholder*="find" i]',
      'input[aria-label*="search" i], textarea[aria-label*="search" i]',
      'input[data-testid*="search" i], textarea[data-testid*="search" i]',
      'input[data-qa*="search" i]',
      'input[class*="search" i]:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])',

      // 4. Containers/forms dedicated to search
      'form[action*="search" i] input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
      'form[id*="search" i] input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
      'form[class*="search" i] input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
      'header input[type="text"], nav input[type="text"]'
    ];

    for (const selector of selectorGroups) {
      try {
        const matches = queryAllDeep(selector);
        const visibleMatches = matches.filter(isElementVisible);
        if (visibleMatches.length > 0) {
          if (visibleMatches.length === 1) {
            return visibleMatches[0];
          }
          // If multiple visible search inputs match, prioritize the one closest to the top of the document
          visibleMatches.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            const topA = rectA.top + window.scrollY;
            const topB = rectB.top + window.scrollY;
            return topA - topB;
          });
          return visibleMatches[0];
        }
      } catch (_) {}
    }

    return null;
  }

  // Set value on HTMLInputElement / HTMLTextAreaElement respecting React / Vue reactive wrappers
  function setNativeInputValue(element, value) {
    try {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value') ||
                         Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ||
                         Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }
    } catch (_) {
      element.value = value;
    }
  }

  // Submit the search query on the search input element via Enter events and form/button submission
  function submitSearch(searchInput) {
    if (!searchInput) return;

    try {
      // 1. Dispatch keyboard Enter events with explicit keyCode and which for React/Vue compatibility
      ['keydown', 'keypress', 'keyup'].forEach((type) => {
        const event = new KeyboardEvent(type, {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true
        });
        try {
          Object.defineProperty(event, 'keyCode', { get: () => 13 });
          Object.defineProperty(event, 'which', { get: () => 13 });
        } catch (_) {}
        searchInput.dispatchEvent(event);
      });

      // 2. Look for associated submit button or form
      const form = searchInput.form || searchInput.closest('form');
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button#search-icon-legacy',
        'button[aria-label*="search" i]',
        'button[title*="search" i]',
        'button[data-testid*="search" i]',
        'button.search-button',
        'button.search-submit',
        'button.search-btn'
      ];

      let submitBtn = null;
      if (form) {
        for (const sel of submitSelectors) {
          const btn = form.querySelector(sel);
          if (btn && isElementVisible(btn)) {
            submitBtn = btn;
            break;
          }
        }
      }

      if (!submitBtn) {
        const container = searchInput.closest('header, nav, [role="search"], .search-container, .search-box') || searchInput.parentElement;
        if (container) {
          for (const sel of submitSelectors) {
            const btn = container.querySelector(sel);
            if (btn && isElementVisible(btn)) {
              submitBtn = btn;
              break;
            }
          }
        }
      }

      if (submitBtn) {
        submitBtn.click();
      } else if (form) {
        if (typeof form.requestSubmit === 'function') {
          try {
            form.requestSubmit();
          } catch (_) {
            form.submit();
          }
        } else if (typeof form.submit === 'function') {
          form.submit();
        }
      }
    } catch (err) {
      console.warn('HoldTab submitSearch error:', err);
    }
  }

  // Fill the current website's search bar with selected text, focus it, and optionally submit
  function fillSiteSearchBar(text, andSubmit = false, allowTriggerModal = true) {
    if (!text) return false;
    const cleanText = text.trim();
    if (!cleanText) return false;

    let searchInput = findSiteSearchInput();

    // If no visible input found and allowTriggerModal is true, try opening a search modal/drawer if button exists
    if (!searchInput && allowTriggerModal) {
      const triggerBtn = findSearchTriggerButton();
      if (triggerBtn) {
        try {
          triggerBtn.click();
          // Wait 140ms for modal/drawer to expand and retry
          setTimeout(() => {
            fillSiteSearchBar(cleanText, andSubmit, false);
          }, 140);
          return true;
        } catch (_) {}
      }
    }

    if (!searchInput) {
      showClipboardHud('⚠️ No search bar found', cleanText);
      return false;
    }

    try {
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      searchInput.focus();

      if (searchInput.tagName === 'INPUT' || searchInput.tagName === 'TEXTAREA') {
        setNativeInputValue(searchInput, cleanText);
        try {
          searchInput.setSelectionRange(cleanText.length, cleanText.length);
        } catch (_) {}
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (searchInput.isContentEditable) {
        searchInput.textContent = cleanText;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Temporary glowing accent ring
      const prevOutline = searchInput.style.outline;
      const prevBoxShadow = searchInput.style.boxShadow;
      searchInput.style.outline = '2px solid #38BDF8';
      searchInput.style.boxShadow = '0 0 12px rgba(56, 189, 248, 0.45)';
      setTimeout(() => {
        searchInput.style.outline = prevOutline;
        searchInput.style.boxShadow = prevBoxShadow;
      }, 900);

      if (andSubmit) {
        submitSearch(searchInput);
        // Deferred submit for reactive frameworks (React/Vue/Angular) after internal state update
        setTimeout(() => {
          submitSearch(searchInput);
        }, 60);
        showClipboardHud('🔍 Searched Site', cleanText);
      } else {
        showClipboardHud('🔍 Filled Search', cleanText);
      }
      return true;
    } catch (err) {
      console.warn('HoldTab fill search error:', err);
      return false;
    }
  }

  // Construct destination URL to search current website in a new tab
  function getSiteSearchUrl(query) {
    const cleanQuery = query.trim();
    if (!cleanQuery) return null;

    const hostname = window.location.hostname.toLowerCase();

    // 1. Known popular site templates
    if (hostname.includes('youtube.com')) {
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
    }
    if (hostname.includes('wikipedia.org')) {
      return `https://${hostname}/w/index.php?search=${encodeURIComponent(cleanQuery)}`;
    }
    if (hostname.includes('github.com')) {
      return `https://github.com/search?q=${encodeURIComponent(cleanQuery)}`;
    }
    if (hostname.includes('amazon.')) {
      return `https://${hostname}/s?k=${encodeURIComponent(cleanQuery)}`;
    }
    if (hostname.includes('reddit.com')) {
      return `https://www.reddit.com/search/?q=${encodeURIComponent(cleanQuery)}`;
    }
    if (hostname.includes('google.')) {
      return `https://${hostname}/search?q=${encodeURIComponent(cleanQuery)}`;
    }
    if (hostname.includes('stackoverflow.com')) {
      return `https://stackoverflow.com/search?q=${encodeURIComponent(cleanQuery)}`;
    }
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      return `https://x.com/search?q=${encodeURIComponent(cleanQuery)}`;
    }
    if (hostname.includes('duckduckgo.com')) {
      return `https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`;
    }

    // 2. Check if a visible search input on the page belongs to a GET form with an action
    const searchInput = findSiteSearchInput();
    if (searchInput) {
      const form = searchInput.form || searchInput.closest('form');
      if (form && form.action) {
        const method = (form.method || 'get').toLowerCase();
        if (method === 'get') {
          try {
            const url = new URL(form.action, window.location.href);
            const paramName = searchInput.name || 'q';
            url.searchParams.set(paramName, cleanQuery);
            return url.href;
          } catch (_) {}
        }
      }
    }

    // 3. If a search input exists on the page, open current page URL with #ht-site-search hash so new tab auto-fills and searches
    if (searchInput) {
      try {
        const pageUrl = new URL(window.location.href);
        pageUrl.hash = `ht-site-search=${encodeURIComponent(cleanQuery)}`;
        return pageUrl.href;
      } catch (_) {}
    }

    return null;
  }

  // Open a new tab with current website and search the selected text there
  function openSiteSearchInNewTab(query) {
    const targetUrl = getSiteSearchUrl(query);
    if (!targetUrl) {
      showClipboardHud('⚠️ No search bar found', query);
      return;
    }

    showClipboardHud('🔍 Search in New Tab', query);

    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          action: 'openLink',
          url: targetUrl,
          tabPosition: config.tabPosition,
          tabFocus: 'foreground'
        });
      }
    } catch (err) {
      console.warn('HoldTab openSiteSearchInNewTab notice:', err);
    }
  }

  // Trigger site search in Current Tab or New Tab
  function triggerSiteSearch(mode, query) {
    if (!query) return;
    hasTriggered = true;
    altGestureTriggered = true;

    if (mode === 'current-tab') {
      suppressClickUntil = performance.now() + 800;
      const filled = fillSiteSearchBar(query, true);
      if (filled) {
        triggerSuccess(() => {}, 'Site Searched');
      } else {
        hideIndicator();
      }
    } else if (mode === 'new-tab') {
      rightHoldSearchTriggered = true;
      suppressContextMenuUntil = performance.now() + 1800;
      triggerSuccess(() => {}, 'Opening Search Tab...');
      openSiteSearchInNewTab(query);
    }
  }

  // Handle auto-running pending site search if opened via #ht-site-search= in a new tab
  function handlePendingSiteSearch() {
    try {
      if (window.location.hash && window.location.hash.includes('ht-site-search=')) {
        const match = window.location.hash.match(/ht-site-search=([^&]+)/);
        if (match && match[1]) {
          const query = decodeURIComponent(match[1]);
          try {
            history.replaceState(null, '', window.location.pathname + window.location.search);
          } catch (_) {}

          let attempts = 0;
          const tryFillAndSubmit = () => {
            attempts++;
            const filled = fillSiteSearchBar(query, true);
            if (!filled && attempts < 10) {
              setTimeout(tryFillAndSubmit, 250);
            }
          };

          if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(tryFillAndSubmit, 200);
          } else {
            document.addEventListener('DOMContentLoaded', () => setTimeout(tryFillAndSubmit, 200));
          }
        }
      }
    } catch (_) {}
  }

  handlePendingSiteSearch();

  // Dispatch tab cycle message to background service worker
  function sendCycleTabMessage(direction, options = {}) {
    const {
      viaAlt = false,
      isScrollGesture = false,
      intentionalReverse = false,
      lockedAxis = null
    } = typeof options === 'boolean' ? { viaAlt: options, isScrollGesture: options } : options;

    // Immediately clear local mouse button/swipe states so they never stick when tab switches away
    isLeftMouseDown = false;
    isRightMouseDown = false;
    altScrollAccumulator = 0;
    cancelHold();

    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          action: 'cycleTab',
          direction,
          viaAlt,
          isScrollGesture,
          intentionalReverse,
          lockedAxis
        }, (response) => {
          if (chrome.runtime.lastError) return;
          if (response && response.success && config.tabCycleHud) {
            showTabCycleHud(direction, response.targetTitle, response.targetIndex, response.totalTabs);
          }
        });
      }
    } catch (err) {
      console.debug('HoldTab: Failed to send cycleTab message:', err);
    }
  }

  // Show visual indicator and start animated fill (respects per-animation toggles & grace delay settings)
  function showIndicator(x, y, duration, badgeText = 'New Tab', variant = 'blue') {
    if (indicatorTimer) {
      clearTimeout(indicatorTimer);
      indicatorTimer = null;
    }

    // Check if visual animation is disabled for this specific gesture type
    const isSiteSearch = variant === 'cyan' || variant === 'teal';
    const isTextSearch = variant === 'amber' || variant === 'purple';
    const isLinkHold = variant === 'blue' || variant === 'red' || variant === 'indigo';

    if (isLinkHold && config.animLinkHold === false) return;
    if (isSiteSearch && config.animSiteSearch === false) return;
    if (isTextSearch && config.animTextSearch === false) return;

    // Retrieve per-animation grace delay configured by the user
    let userDelay = 180;
    if (isLinkHold) userDelay = typeof config.animLinkHoldDelay === 'number' ? config.animLinkHoldDelay : 180;
    else if (isSiteSearch) userDelay = typeof config.animSiteSearchDelay === 'number' ? config.animSiteSearchDelay : 180;
    else if (isTextSearch) userDelay = typeof config.animTextSearchDelay === 'number' ? config.animTextSearchDelay : 180;

    // Cap delay so ring has time to complete before the gesture finishes
    const graceDelay = Math.min(userDelay, Math.floor(duration * 0.85));

    const render = () => {
      if (!isHolding && !isHoldingText) return;

      initShadowUi();
      if (!indicatorEl) return;

      indicatorEl.style.display = 'flex';
      indicatorEl.style.left = `${x}px`;
      indicatorEl.style.top = `${y}px`;
      indicatorEl.classList.remove('ht-success', 'ht-dragging', 'ht-indigo', 'ht-red', 'ht-purple', 'ht-amber', 'ht-cyan', 'ht-teal', 'ht-blue', 'ht-searching');

      if (variant === 'indigo' || variant === 'red') {
        indicatorEl.classList.add('ht-indigo');
      } else if (variant === 'purple') {
        indicatorEl.classList.add('ht-purple', 'ht-searching');
      } else if (variant === 'amber') {
        indicatorEl.classList.add('ht-amber', 'ht-searching');
      } else if (variant === 'cyan') {
        indicatorEl.classList.add('ht-cyan', 'ht-searching');
      } else if (variant === 'teal') {
        indicatorEl.classList.add('ht-teal', 'ht-searching');
      } else {
        indicatorEl.classList.add('ht-blue');
      }

      const badge = indicatorEl.querySelector('.ht-badge');
      if (badge) badge.textContent = badgeText;

      const progressRing = indicatorEl.querySelector('.ht-progress');
      const circumference = 87.96; // 2 * PI * 14
      const remainingDuration = Math.max(50, duration - graceDelay);
      const initialOffset = circumference * (1 - (graceDelay / duration));

      // Reset progress to position reflecting elapsed grace delay
      progressRing.style.transition = 'none';
      progressRing.style.strokeDashoffset = `${initialOffset}`;

      // Force layout reflow
      void progressRing.getBoundingClientRect();

      // Start fill transition matching remaining duration
      progressRing.style.transition = `stroke-dashoffset ${remainingDuration}ms cubic-bezier(0.2, 0, 0, 1)`;
      progressRing.style.strokeDashoffset = '0';

      indicatorEl.classList.add('ht-active');
    };

    if (graceDelay <= 0) {
      render();
    } else {
      indicatorTimer = setTimeout(() => {
        indicatorTimer = null;
        render();
      }, graceDelay);
    }
  }

  // Update dynamic flick/drag indicator tracking the cursor and angle
  function updateDragIndicator(clientX, clientY, dx, dy, distance, variant = 'blue') {
    if (config.animFlickDrag === false) return;

    if (indicatorTimer) {
      clearTimeout(indicatorTimer);
      indicatorTimer = null;
    }
    initShadowUi();
    if (!indicatorEl) return;

    indicatorEl.style.display = 'flex';
    indicatorEl.style.left = `${clientX}px`;
    indicatorEl.style.top = `${clientY}px`;
    indicatorEl.classList.remove('ht-success', 'ht-indigo', 'ht-red', 'ht-purple', 'ht-amber', 'ht-blue', 'ht-searching');

    if (variant === 'indigo' || variant === 'red') {
      indicatorEl.classList.add('ht-indigo');
    } else if (variant === 'purple') {
      indicatorEl.classList.add('ht-purple');
    } else if (variant === 'amber') {
      indicatorEl.classList.add('ht-amber');
    } else {
      indicatorEl.classList.add('ht-blue');
    }

    indicatorEl.classList.add('ht-active');
    indicatorEl.classList.add('ht-dragging');

    const arrowEl = indicatorEl.querySelector('.ht-icon-arrow');
    const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (arrowEl) {
      arrowEl.style.transform = `rotate(${angleDeg}deg)`;
    }

    const threshold = config.dragDistance || 35;
    const pct = Math.min(1, Math.max(0, distance / threshold));
    const circumference = 87.96;

    const progressRing = indicatorEl.querySelector('.ht-progress');
    if (progressRing) {
      progressRing.style.transition = 'none';
      progressRing.style.strokeDashoffset = `${circumference * (1 - pct)}`;
    }

    const badge = indicatorEl.querySelector('.ht-badge');
    if (badge) {
      badge.textContent = `Flick: ${Math.round(pct * 100)}%`;
      badge.style.opacity = '1';
    }
  }

  // Trigger success state and fade out
  function triggerSuccess(callback, successText = 'New Tab Opened') {
    if (indicatorTimer) {
      clearTimeout(indicatorTimer);
      indicatorTimer = null;
    }

    // If indicator element is not active or animation is disabled, finish cleanly
    if (!indicatorEl || indicatorEl.style.display === 'none' || !indicatorEl.classList.contains('ht-active')) {
      if (callback) callback();
      return;
    }

    indicatorEl.classList.remove('ht-dragging');
    indicatorEl.classList.add('ht-success');

    const badge = indicatorEl.querySelector('.ht-badge');
    if (badge) {
      badge.textContent = successText;
      badge.style.opacity = '1';
    }

    // Keep visible briefly for visual satisfaction, then clean up
    setTimeout(() => {
      hideIndicator();
      if (callback) callback();
    }, 450);
  }

  // Hide visual indicator
  function hideIndicator() {
    if (indicatorTimer) {
      clearTimeout(indicatorTimer);
      indicatorTimer = null;
    }
    if (!indicatorEl) return;
    indicatorEl.classList.remove('ht-active');
    indicatorEl.classList.remove('ht-dragging');
    setTimeout(() => {
      if (!isHolding && !isHoldingText && !isDraggingLink && indicatorEl) {
        indicatorEl.classList.remove('ht-success', 'ht-indigo', 'ht-red', 'ht-purple', 'ht-amber', 'ht-cyan', 'ht-teal', 'ht-blue', 'ht-searching');
        indicatorEl.style.display = 'none';
        indicatorEl.style.left = '-9999px';
        indicatorEl.style.top = '-9999px';
        const badge = indicatorEl.querySelector('.ht-badge');
        if (badge) {
          badge.textContent = 'New Tab';
          badge.style.opacity = '';
        }
        const progressRing = indicatorEl.querySelector('.ht-progress');
        if (progressRing) {
          progressRing.style.transition = 'none';
          progressRing.style.strokeDashoffset = '87.96';
        }
      }
    }, 150);
  }

  // Perform background or foreground tab open via Service Worker
  function triggerOpenLink(url, focusOverride = null, isRightHold = false) {
    if (!url) return;

    const effectiveFocus = focusOverride || config.tabFocus;
    hasTriggered = true;

    if (isRightHold) {
      rightHoldSearchTriggered = true;
      suppressContextMenuUntil = performance.now() + 1800;
    } else {
      suppressClickUntil = performance.now() + 600;
    }

    const successLabel = effectiveFocus === 'foreground' ? 'Opening Tab...' : 'New Tab Opened';
    triggerSuccess(() => {
      // Completed animation
    }, successLabel);

    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          action: 'openLink',
          url: url,
          tabPosition: config.tabPosition,
          tabFocus: effectiveFocus
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('HoldTab message notice:', chrome.runtime.lastError.message);
          }
        });
      }
    } catch (err) {
      console.error('HoldTab: Failed to send openLink message:', err);
    }
  }

  // Perform selected text search in new tab via Service Worker
  function triggerSearchText(type, query, isRightHold = false) {
    if (!query) return;

    hasTriggered = true;
    if (isRightHold) {
      rightHoldSearchTriggered = true;
      suppressContextMenuUntil = performance.now() + 1800;
    } else {
      suppressClickUntil = performance.now() + 800;
    }

    const badgeSuccess = type === 'background' ? 'Searched in BG' : 'Active Search Opened';
    triggerSuccess(() => {}, badgeSuccess);

    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          action: 'searchText',
          text: query,
          tabFocus: type
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.debug('HoldTab notice:', chrome.runtime.lastError.message);
          }
        });
      }
    } catch (err) {
      console.error('HoldTab: Failed to send searchText message:', err);
    }
  }

  // Cancel hold state
  function cancelHold() {
    if (indicatorTimer) {
      clearTimeout(indicatorTimer);
      indicatorTimer = null;
    }
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (textSearchTimer) {
      clearTimeout(textSearchTimer);
      textSearchTimer = null;
    }
    isHolding = false;
    isRightLinkHold = false;
    isHoldingText = false;
    textSearchQuery = '';
    textSearchType = null;
    isDraggingLink = false;
    dragTriggered = false;
    if (indicatorEl) {
      indicatorEl.classList.remove('ht-dragging');
    }
    if (!hasTriggered) {
      hideIndicator();
    }
  }

  // Mouse Down Event Listener
  window.addEventListener('mousedown', (e) => {
    // Dismiss floating selection toolbar if clicking outside
    if (isToolbarVisible && !isToolbarHovered && !isSubmenuHovered) {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (!path.includes(toolbarHost) && !path.includes(toolbarRoot)) {
        hideToolbar();
      }
    }

    if (!isToolbarAllowed() && isToolbarVisible) {
      hideToolbar();
    }

    if (!isAnyFeatureAllowed()) return;

    // Handle right-click
    if (e.button === 2) {
      // Rocker Gesture: Left button is physically held down + Right button clicked -> Next Tab
      if (config.enabled && isFeatureAllowed('tabCycle') && config.tabCycleRocker && (e.buttons & 1) !== 0) {
        rockerTriggered = true;
        tabCycleDidExecute = true;
        lastRightClickTime = 0;
        lastContextMenuTime = 0;
        suppressContextMenuUntil = performance.now() + 1500;
        suppressClickUntil = performance.now() + 1500;
        cancelHold();
        sendCycleTabMessage('next', { viaAlt: false, isScrollGesture: false, intentionalReverse: true });
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const now = performance.now();
      const timeDiff = now - lastRightClickTime;
      const dist = Math.hypot(e.clientX - lastRightClickX, e.clientY - lastRightClickY);
      const selectedText = getSelectedText();
      const linkInfo = findLink(e);
      const isTargetingText = Boolean(selectedText && isSelectionTarget(e, selectedText));
      const isMultiClick = typeof e.detail === 'number' && e.detail >= 3;

      // 1. Double Right-Click on Pre-existing Selected Text -> CUT text
      // (Only cuts if text was already selected before the double-click started)
      if (config.enabled && isFeatureAllowed('textActions') && config.textDoubleClickCopyCut !== false && timeDiff > 40 && timeDiff < DOUBLE_CLICK_INTERVAL && dist < DOUBLE_CLICK_MAX_DISTANCE && lastRightClickSelectedText) {
        const textToCut = lastRightClickSelectedText || selectedText;
        cancelHold();
        lastRightClickTime = 0;
        lastContextMenuTime = 0;
        lastRightClickSelectedText = '';
        tabCycleDidExecute = true;
        suppressContextMenuUntil = now + 1500;

        performCut(textToCut);
        showClipboardHud('✂️ Cut', textToCut);

        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 2. Double Right-Click anywhere else -> Close Active Tab
      if (config.enabled && isFeatureAllowed('tabCycle') && config.closeTabOnDoubleRightClick && timeDiff > 40 && timeDiff < DOUBLE_RIGHT_CLICK_INTERVAL && dist < DOUBLE_RIGHT_CLICK_MAX_DISTANCE) {
        // Double right-click detected!
        cancelHold();
        lastRightClickTime = 0;
        lastContextMenuTime = 0;
        lastRightClickSelectedText = '';
        tabCycleDidExecute = true;
        isClosingTab = true;
        suppressContextMenuUntil = now + 3000;

        if (config.tabCycleHud) {
          showCloseTabHud();
        }

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        try {
          if (chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({ action: 'closeTab' });
          }
        } catch (_) {}
        return false;
      }

      lastRightClickTime = now;
      lastRightClickX = e.clientX;
      lastRightClickY = e.clientY;
      lastRightClickSelectedText = isTargetingText ? selectedText : '';

      isRightMouseDown = true;
      rightStartX = e.clientX;
      rightStartY = e.clientY;
      startX = e.clientX;
      startY = e.clientY;
      rightSwipeTriggered = false;
      tabCycleDidExecute = false;

      // 1a. Alt + Right Click Hold on Selected Text: Search current website in a NEW TAB (Teal ring)
      // Must strictly require that the user clicked directly on an active text selection!
      const altRightSearchQuery = isTargetingText ? (selectedText || lastRightClickSelectedText) : '';
      if (config.enabled && isFeatureAllowed('textActions') && config.altHoldSearchSite !== false && isAltPressed(e) && altRightSearchQuery) {
        cancelHold();
        isHoldingText = true;
        textSearchType = 'site-new-tab';
        textSearchQuery = altRightSearchQuery;
        hasTriggered = false;
        rightHoldSearchTriggered = true;
        altGestureTriggered = true;
        suppressContextMenuUntil = performance.now() + 1800;
        const duration = Math.max(150, config.siteSearchHoldDuration || config.holdDuration || 450);
        showIndicator(rightStartX, rightStartY, duration, 'Search Site (New Tab)', 'teal');

        textSearchTimer = setTimeout(() => {
          if (isHoldingText && !hasTriggered) {
            triggerSiteSearch('new-tab', textSearchQuery);
          }
        }, duration);
        return;
      }

      // 1b. Text Search Hold (Right Click): Open new foreground tab, move to it (Active Search - Purple)
      // Must strictly require that the user clicked directly on an active text selection!
      if (config.enabled && isFeatureAllowed('textActions') && config.textSearchHold !== false && !isAltPressed(e) && isTargetingText && selectedText) {
        cancelHold();
        isHoldingText = true;
        textSearchType = 'foreground';
        textSearchQuery = selectedText;
        hasTriggered = false;
        rightHoldSearchTriggered = true;
        suppressContextMenuUntil = performance.now() + 1800;
        const duration = Math.max(150, config.textSearchHoldDuration || config.holdDuration || 450);
        showIndicator(rightStartX, rightStartY, duration, 'Active Search', 'purple');

        textSearchTimer = setTimeout(() => {
          if (isHoldingText && !hasTriggered) {
            triggerSearchText('foreground', textSearchQuery, true);
          }
        }, duration);
        return;
      }

      // 2. Link Hold (Right Click): Open link in a new tab and move to that tab (Indigo circle UI)
      if (config.enabled && isFeatureAllowed('linkHold') && linkInfo && checkModifier(e)) {
        cancelHold();
        targetLinkUrl = linkInfo.url;
        targetElement = linkInfo.element;
        isHolding = true;
        isRightLinkHold = true;
        isDraggingLink = false;
        hasTriggered = false;
        rightHoldSearchTriggered = false;
        const duration = Math.max(150, config.holdDuration || 450);
        showIndicator(rightStartX, rightStartY, duration, 'Open & Go', 'indigo');

        holdTimer = setTimeout(() => {
          if (isHolding && !hasTriggered) {
            triggerOpenLink(targetLinkUrl, 'foreground', true);
          }
        }, duration);
        return;
      }

      return;
    }

    // Handle left-click
    if (e.button === 0) {
      // Rocker Gesture: Right button is physically held down + Left button clicked -> Previous Tab
      if (config.enabled && isFeatureAllowed('tabCycle') && config.tabCycleRocker && (e.buttons & 2) !== 0) {
        rockerTriggered = true;
        tabCycleDidExecute = true;
        lastRightClickTime = 0;
        lastContextMenuTime = 0;
        suppressContextMenuUntil = performance.now() + 1500;
        suppressClickUntil = performance.now() + 1500;
        cancelHold();
        sendCycleTabMessage('prev', { viaAlt: false, isScrollGesture: false, intentionalReverse: true });
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const now = performance.now();
      const selectedText = getSelectedText();
      const linkInfo = findLink(e);
      const isTargetingText = Boolean(selectedText && isSelectionTarget(e, selectedText));
      const targetIsInput = isInputField(e.target) || isInputField(document.activeElement);
      const targetInputElement = isInputField(e.target) ? e.target : (isInputField(document.activeElement) ? document.activeElement : null);

      const leftTimeDiff = now - lastLeftClickTime;
      const leftDist = Math.hypot(e.clientX - lastLeftClickX, e.clientY - lastLeftClickY);
      const isMultiClick = typeof e.detail === 'number' && e.detail >= 3;

      // Rapid Successive Click:
      if (leftTimeDiff > 40 && leftTimeDiff < DOUBLE_CLICK_INTERVAL && leftDist < DOUBLE_CLICK_MAX_DISTANCE) {
        // 1. Alt + Double Left-Click -> FILL CURRENT SITE'S SEARCH BAR with selected text
        const isAlt = isAltPressed(e) || lastLeftClickWithAlt;
        if (isAlt && config.enabled && isFeatureAllowed('textActions') && config.altDoubleClickFillSearch !== false) {
          const textToFill = (isTargetingText ? selectedText : '') || lastLeftClickSelectedText;
          if (textToFill) {
            cancelHold();
            lastLeftClickTime = 0;
            lastLeftClickSelectedText = '';
            lastLeftClickRange = null;
            lastLeftClickWithAlt = false;
            lastLeftClickIsInput = false;
            lastLeftClickTargetInput = null;
            altGestureTriggered = true;
            suppressClickUntil = now + 600;

            fillSiteSearchBar(textToFill);

            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }

        // 2a. Triple Left-Click on Pre-existing Selected Text in an Editable Input -> CUT text
        if (config.enabled && isFeatureAllowed('textActions') && config.textDoubleClickCopyCut !== false && isMultiClick && targetIsInput && (lastLeftClickSelectedText || selectedText)) {
          const textToCut = lastLeftClickSelectedText || selectedText;
          cancelHold();
          lastLeftClickTime = 0;
          lastLeftClickSelectedText = '';
          lastLeftClickRange = null;
          lastLeftClickWithAlt = false;
          lastLeftClickIsInput = false;
          lastLeftClickTargetInput = null;
          suppressClickUntil = now + 600;

          performCut(textToCut);
          showClipboardHud('✂️ Cut', textToCut);

          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // 2b. Double Left-Click on Pre-existing Selected Text -> COPY text
        // (Triggers when text was already selected on Click 1)
        if (config.enabled && isFeatureAllowed('textActions') && config.textDoubleClickCopyCut !== false && lastLeftClickSelectedText) {
          const textToCopy = lastLeftClickSelectedText || selectedText;
          cancelHold();
          lastLeftClickTime = 0;
          lastLeftClickSelectedText = '';
          lastLeftClickWithAlt = false;
          lastLeftClickIsInput = false;
          lastLeftClickTargetInput = null;
          suppressClickUntil = now + 600;

          performCopy(textToCopy);
          showClipboardHud('📋 Copied', textToCopy);

          // Restore selection visual so the copied text remains visibly highlighted
          if (lastLeftClickRange) {
            try {
              const s = window.getSelection();
              if (s) {
                s.removeAllRanges();
                s.addRange(lastLeftClickRange);
              }
            } catch (_) {}
            lastLeftClickRange = null;
          } else if (lastLeftClickTargetInput && lastLeftClickInputStart >= 0 && lastLeftClickInputEnd > lastLeftClickInputStart) {
            try {
              lastLeftClickTargetInput.focus();
              lastLeftClickTargetInput.setSelectionRange(lastLeftClickInputStart, lastLeftClickInputEnd);
            } catch (_) {}
          }

          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // 3. Double Left-Click with cursor in Input Field -> PASTE text
        // (Allows pasting at boundaries or between words with smart spacing; inside words preserves native selection)
        if (!isMultiClick && config.enabled && isFeatureAllowed('textActions') && config.inputDoubleClickPaste !== false && (targetIsInput || lastLeftClickIsInput)) {
          const inputToPaste = targetInputElement || lastLeftClickTargetInput;
          const isBetweenText = isCursorInOrBetweenText(inputToPaste);

          if (!isBetweenText) {
            cancelHold();
            lastLeftClickTime = 0;
            lastLeftClickSelectedText = '';
            lastLeftClickRange = null;
            lastLeftClickWithAlt = false;
            lastLeftClickIsInput = false;
            lastLeftClickTargetInput = null;
            suppressClickUntil = now + 600;

            performPaste(inputToPaste);

            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }

      lastLeftClickTime = now;
      lastLeftClickX = e.clientX;
      lastLeftClickY = e.clientY;
      lastLeftClickWithAlt = isAltPressed(e);

      if (isTargetingText) {
        lastLeftClickSelectedText = selectedText;
        lastLeftClickIsInput = Boolean(targetIsInput);
        lastLeftClickTargetInput = targetInputElement;
        const selObj = window.getSelection ? window.getSelection() : null;
        if (selObj && selObj.rangeCount > 0 && !selObj.isCollapsed) {
          try {
            lastLeftClickRange = selObj.getRangeAt(0).cloneRange();
          } catch (_) {
            lastLeftClickRange = null;
          }
        } else {
          lastLeftClickRange = null;
        }
        if (targetInputElement && typeof targetInputElement.selectionStart === 'number') {
          lastLeftClickInputStart = targetInputElement.selectionStart;
          lastLeftClickInputEnd = targetInputElement.selectionEnd;
        } else {
          lastLeftClickInputStart = -1;
          lastLeftClickInputEnd = -1;
        }
      } else {
        lastLeftClickSelectedText = '';
        lastLeftClickRange = null;
        lastLeftClickInputStart = -1;
        lastLeftClickInputEnd = -1;
        lastLeftClickIsInput = Boolean(targetIsInput);
        lastLeftClickTargetInput = targetInputElement;
      }

      isLeftMouseDown = true;
      isRightMouseDown = (e.buttons & 2) !== 0;

      // 1. Alt + Left Hold on Selected Text: Search current site in Current Tab (Cyan ring)
      // Must strictly require that the user clicked directly on an active text selection!
      const altLeftSearchQuery = isTargetingText ? (selectedText || lastLeftClickSelectedText) : '';
      if (config.enabled && isFeatureAllowed('textActions') && config.altHoldSearchSite !== false && isAltPressed(e) && altLeftSearchQuery) {
        cancelHold();
        startX = e.clientX;
        startY = e.clientY;
        isHoldingText = true;
        textSearchType = 'current-site';
        textSearchQuery = altLeftSearchQuery;
        hasTriggered = false;
        altGestureTriggered = true;
        const duration = Math.max(150, config.siteSearchHoldDuration || config.holdDuration || 450);
        showIndicator(startX, startY, duration, 'Search Site', 'cyan');

        textSearchTimer = setTimeout(() => {
          if (isHoldingText && !hasTriggered) {
            triggerSiteSearch('current-tab', textSearchQuery);
          }
        }, duration);
        return;
      }

      // 2. Text Search Hold (Left Click): Open new background tab and search selected text (Search in BG - Amber)
      // Must strictly require that the user clicked directly on an active text selection!
      if (config.enabled && isFeatureAllowed('textActions') && config.textSearchHold !== false && isTargetingText && selectedText && !isAltPressed(e)) {
        cancelHold();
        startX = e.clientX;
        startY = e.clientY;
        isHoldingText = true;
        textSearchType = 'background';
        textSearchQuery = selectedText;
        hasTriggered = false;
        const duration = Math.max(150, config.textSearchHoldDuration || config.holdDuration || 450);
        showIndicator(startX, startY, duration, 'Search in BG', 'amber');

        textSearchTimer = setTimeout(() => {
          if (isHoldingText && !hasTriggered) {
            triggerSearchText('background', textSearchQuery, false);
          }
        }, duration);
        return;
      }

      if (!checkModifier(e)) return;
      if (!linkInfo) return;
      if (!isFeatureAllowed('linkHold')) return;

      // Force clear any pending timers or prior states
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }

      targetLinkUrl = linkInfo.url;
      targetElement = linkInfo.element;
      startX = e.clientX;
      startY = e.clientY;
      hasTriggered = false;
      dragTriggered = false;
      isRightLinkHold = false;

      if (config.gestureMode === 'drag') {
        isHolding = false;
        isDraggingLink = true;
      } else if (config.gestureMode === 'both') {
        isHolding = true;
        isDraggingLink = false;
        const duration = Math.max(150, config.holdDuration || 450);
        showIndicator(startX, startY, duration, 'New Tab', 'blue');

        holdTimer = setTimeout(() => {
          if (isHolding && !hasTriggered) {
            triggerOpenLink(targetLinkUrl);
          }
        }, duration);
      } else {
        // Hold mode (default)
        isHolding = true;
        isDraggingLink = false;
        const duration = Math.max(150, config.holdDuration || 450);
        showIndicator(startX, startY, duration, 'New Tab', 'blue');

        holdTimer = setTimeout(() => {
          if (isHolding && !hasTriggered) {
            triggerOpenLink(targetLinkUrl);
          }
        }, duration);
      }
    }
  }, true);

  // Mouse Move Event Listener (live drag tracking, text search cancellation, and hold cancellation)
  window.addEventListener('mousemove', (e) => {
    // Self-heal stuck mouse button states if mouseup occurred on another tab
    if (isRightMouseDown && (e.buttons & 2) === 0) {
      isRightMouseDown = false;
      rightSwipeTriggered = false;
    }
    if (isLeftMouseDown && (e.buttons & 1) === 0) {
      isLeftMouseDown = false;
    }

    // Cancel text search hold if mouse moved > 18px (tolerates trackpad micro-tremors)
    if (isHoldingText) {
      const textDist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (textDist > 18) {
        cancelHold();
      }
    }

    // Tab cycling via right-click swipe (requires right button physically held down)
    if (isRightMouseDown && (e.buttons & 2) !== 0 && config.enabled && isFeatureAllowed('tabCycle') && config.tabCycleSwipe && !rightSwipeTriggered) {
      const rdx = e.clientX - rightStartX;
      const rdy = e.clientY - rightStartY;
      const absRdx = Math.abs(rdx);
      const absRdy = Math.abs(rdy);

      // Require 42px horizontal swipe and clear horizontal dominance
      if (absRdx >= 42 && absRdx > absRdy * 1.3) {
        cancelHold();
        rightSwipeTriggered = true;
        tabCycleDidExecute = true;
        lastRightClickTime = 0;
        lastContextMenuTime = 0;
        suppressContextMenuUntil = performance.now() + 1200;

        // Device-aware swipe direction:
        // Mouse mode: Swipe Right (rdx > 0) = Next Tab, Swipe Left (rdx < 0) = Prev Tab (standard mouse)
        // Mousepad mode: Swipe Left (rdx < 0) = Next Tab, Swipe Right (rdx > 0) = Prev Tab (reversed for trackpad)
        let direction;
        if (config.swipeDeviceMode === 'mousepad') {
          direction = rdx < 0 ? 'next' : 'prev';
        } else {
          direction = rdx > 0 ? 'next' : 'prev';
        }

        sendCycleTabMessage(direction, { viaAlt: false, isScrollGesture: false, intentionalReverse: true });
      }
    }

    if (!isHolding && !isDraggingLink) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const distance = Math.hypot(dx, dy);

    // If in hold mode (or both), switch or cancel if moved beyond threshold
    if (isHolding && distance > 6) {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      isHolding = false;

      // Right-click link hold cancels on movement so Right-Click Swipe tab cycling works cleanly
      if (isRightLinkHold) {
        isRightLinkHold = false;
        hideIndicator();
        return;
      }

      // In 'both' mode on left-click, seamlessly transition to flick/drag mode
      if (config.gestureMode === 'both' && !hasTriggered) {
        isDraggingLink = true;
      } else {
        hideIndicator();
      }
    }

    // Live Drag / Flick tracking with directional arrow & progress
    if (isDraggingLink && !dragTriggered && !hasTriggered) {
      const threshold = config.dragDistance || 35;

      // Only show after small movement to avoid flickering on static click
      if (distance >= 5) {
        updateDragIndicator(e.clientX, e.clientY, dx, dy, distance);
      }

      if (distance >= threshold) {
        dragTriggered = true;
        isDraggingLink = false;
        triggerOpenLink(targetLinkUrl);
      }
    }
  }, true);

  // Mouse Up Event Listener
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
      isRightMouseDown = false;
      const now = performance.now();
      const shouldSuppress = isClosingTab || now < suppressContextMenuUntil || tabCycleDidExecute || rockerTriggered || rightSwipeTriggered;

      if (shouldSuppress) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }

      if (rockerTriggered) {
        suppressContextMenuUntil = performance.now() + 1500;
        suppressClickUntil = performance.now() + 1500;
        if ((e.buttons & 1) === 0) {
          isLeftMouseDown = false;
          rockerTriggered = false;
        }
        cancelHold();
        return;
      }
      if (rightHoldSearchTriggered || hasTriggered) {
        suppressContextMenuUntil = performance.now() + 1800;
        setTimeout(() => {
          hasTriggered = false;
          rightHoldSearchTriggered = false;
        }, 500);
      }
      if (tabCycleDidExecute || rightSwipeTriggered || isClosingTab) {
        suppressContextMenuUntil = performance.now() + 2000;
      }
      cancelHold();
      setTimeout(() => {
        rightSwipeTriggered = false;
      }, 120);
      return;
    }

    if (e.button === 0) {
      isLeftMouseDown = false;
      if (rockerTriggered) {
        suppressClickUntil = performance.now() + 1500;
        suppressContextMenuUntil = performance.now() + 1500;
        if ((e.buttons & 2) === 0) {
          isRightMouseDown = false;
          rockerTriggered = false;
        }
        cancelHold();
        return;
      }

      if (hasTriggered) {
        suppressClickUntil = performance.now() + 500;
        // Auto-clear hasTriggered in case the browser never fires a native click event
        setTimeout(() => {
          hasTriggered = false;
          suppressClickUntil = 0;
        }, 500);
      }

      cancelHold();
    }
  }, true);

  // Tab cycling via Wheel events:
  // 1. Alt + Two-Finger Trackpad Scroll / Wheel (Supports Left Alt and Right Alt / AltGr)
  // 2. Right-Click + Wheel Scroll
  const WHEEL_CYCLE_THROTTLE = 130; // ms to prevent runaway cycling

  window.addEventListener('wheel', (e) => {
    if (isHolding || isHoldingText) {
      cancelHold();
    }

    if (!config.enabled || !isFeatureAllowed('tabCycle')) return;

    const isAltScroll = config.tabCycleAltScroll !== false && isAltPressed(e);
    const isRightPressed = config.tabCycleWheel !== false && (e.buttons & 2) !== 0;

    if (!isAltScroll && !isRightPressed) return;

    // Suppress native scroll, page navigation, and zoom
    e.preventDefault();
    e.stopPropagation();

    const now = performance.now();

    // Mode 1: Alt + Two-Finger Trackpad Scroll
    if (isAltScroll) {
      altGestureTriggered = true;

      // Reset session state if user paused scrolling for > 300ms
      if (now - lastAltScrollTime > 300) {
        altScrollAccumulator = 0;
        altLockedAxis = null;
        lastAltDirection = null;
      }

      // Lock onto primary scroll axis (horizontal vs vertical) at gesture start
      // and keep it locked so diagonal wobble never flips axes mid-swipe!
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      if (!altLockedAxis) {
        if (absX < 2 && absY < 2) return;
        altLockedAxis = absX >= absY ? 'x' : 'y';
      }

      let rawDelta = 0;
      if (altLockedAxis === 'x') {
        // Standard mapping:
        // Mouse mode (default): Swipe Right (deltaX > 0) = Next Tab, Swipe Left (deltaX < 0) = Prev Tab
        // Mousepad mode: Inverted (Swipe Left = Next, Swipe Right = Prev) for "Natural Scrolling"
        rawDelta = config.swipeDeviceMode === 'mousepad' ? -e.deltaX : e.deltaX;
      } else {
        // Vertical two-finger scroll: Scroll Down (deltaY > 0) = Next Tab, Scroll Up (deltaY < 0) = Prev Tab
        rawDelta = e.deltaY;
      }

      if (Math.abs(rawDelta) < 0.5) return;

      // Normalize deltaMode (lines/pages to pixels)
      let delta = rawDelta;
      if (e.deltaMode === 1) {
        delta = rawDelta * 33;
      } else if (e.deltaMode === 2) {
        delta = rawDelta * 600;
      }

      // Reset accumulator if user reversed scroll direction
      if ((delta > 0 && altScrollAccumulator < 0) || (delta < 0 && altScrollAccumulator > 0)) {
        altScrollAccumulator = 0;
      }

      altScrollAccumulator += delta;

      const candidateDirection = altScrollAccumulator > 0 ? 'next' : 'prev';
      const isReversing = lastAltDirection !== null &&
        candidateDirection !== lastAltDirection &&
        (now - lastAltScrollTime < 450);

      // Require higher threshold when reversing direction to filter out trackpad rebound
      const requiredThreshold = isReversing ? ALT_REVERSE_THRESHOLD : ALT_SCROLL_THRESHOLD;

      if (Math.abs(altScrollAccumulator) >= requiredThreshold && (now - lastAltScrollTime >= ALT_SCROLL_COOLDOWN)) {
        altScrollAccumulator = 0;
        lastAltScrollTime = now;
        lastAltDirection = candidateDirection;
        tabCycleDidExecute = true;
        sendCycleTabMessage(candidateDirection, {
          viaAlt: true,
          isScrollGesture: true,
          intentionalReverse: false,
          lockedAxis: altLockedAxis
        });
      }
      return;
    }

    // Mode 2: Right-Click + Wheel Scroll
    if (now - lastWheelCycleTime < WHEEL_CYCLE_THROTTLE) return;

    let direction = null;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5) {
      if (e.deltaX > 0) direction = 'next';
      else if (e.deltaX < 0) direction = 'prev';
    } else {
      if (e.deltaY > 0) direction = 'next';
      else if (e.deltaY < 0) direction = 'prev';
    }

    if (!direction) return;
    lastWheelCycleTime = now;

    tabCycleDidExecute = true;
    lastRightClickTime = 0;
    lastContextMenuTime = 0;
    suppressContextMenuUntil = now + 1200;

    sendCycleTabMessage(direction, {
      viaAlt: false,
      isScrollGesture: true,
      intentionalReverse: false
    });
  }, { passive: false, capture: true });

  // Capture and prevent native click navigation if gesture was completed
  window.addEventListener('click', (e) => {
    if (rockerTriggered || hasTriggered || performance.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      hasTriggered = false;
      suppressClickUntil = 0;
      return false;
    }
  }, true);

  // Also catch auxclick in capture phase
  window.addEventListener('auxclick', (e) => {
    if (rockerTriggered || hasTriggered || performance.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      hasTriggered = false;
      suppressClickUntil = 0;
      return false;
    }
  }, true);

  // Prevent default HTML5 drag-and-drop from interfering when link or text search gestures trigger
  // BUT allow native HTML5 drag-and-drop for selected text when NO gesture is holding!
  window.addEventListener('dragstart', (e) => {
    // If our hold gesture or drag gesture is active, prevent HTML5 drag so it doesn't cancel our action
    if (isHoldingText || isHolding || isDraggingLink || hasTriggered) {
      e.preventDefault();
      return;
    }

    const selectedText = getSelectedText();
    if (selectedText && isSelectionTarget(e, selectedText)) {
      return; // Allow native text drag when no gesture is active
    }

    e.preventDefault();
  }, true);

  // Clean up drag and hold states when native drag ends
  window.addEventListener('dragend', () => {
    isLeftMouseDown = false;
    isRightMouseDown = false;
    cancelHold();
  }, true);

  // Cancellation on window blur, visibilitychange, context menu, or Escape key
  window.addEventListener('blur', (e) => {
    if (e.target === window || e.target === document) {
      isLeftMouseDown = false;
      isRightMouseDown = false;
      rightSwipeTriggered = false;
      isAltKeyDown = false;
      altScrollAccumulator = 0;
      rockerTriggered = false;
      cancelHold();
    }
  }, false);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      isLeftMouseDown = false;
      isRightMouseDown = false;
      rightSwipeTriggered = false;
      rockerTriggered = false;
      altScrollAccumulator = 0;
      cancelHold();
    }
  });

  window.addEventListener('contextmenu', (e) => {
    const now = performance.now();
    if (isClosingTab || rockerTriggered || rightHoldSearchTriggered || now < suppressContextMenuUntil || tabCycleDidExecute || rightSwipeTriggered) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      tabCycleDidExecute = false;
      rightSwipeTriggered = false;
      rightHoldSearchTriggered = false;
      return false;
    }

    // Double right-click to CUT on selected text (suppress context menu and execute cut)
    const rightClickDiff = now - lastRightClickTime;
    const rightDist = Math.hypot(e.clientX - lastRightClickX, e.clientY - lastRightClickY);
    if (config.enabled && config.textDoubleClickCopyCut !== false && lastRightClickSelectedText &&
        rightClickDiff > 40 && rightClickDiff < DOUBLE_CLICK_INTERVAL && rightDist < DOUBLE_CLICK_MAX_DISTANCE) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const textToCut = lastRightClickSelectedText;
      lastRightClickTime = 0;
      lastContextMenuTime = 0;
      lastRightClickSelectedText = '';
      tabCycleDidExecute = true;
      suppressContextMenuUntil = now + 1500;
      performCut(textToCut);
      showClipboardHud('✂️ Cut', textToCut);
      return false;
    }

    // Secondary check for double right-click close tab (only when not targeting selected text)
    const timeDiff = now - lastContextMenuTime;
    const dist = Math.hypot(e.clientX - lastContextMenuX, e.clientY - lastContextMenuY);
    const selectedText = getSelectedText();
    const isTextTarget = Boolean(selectedText && isSelectionTarget(e, selectedText));

    if (config.enabled && !isTextTarget && isFeatureAllowed('tabCycle') && config.closeTabOnDoubleRightClick &&
        timeDiff > 40 && timeDiff < DOUBLE_RIGHT_CLICK_INTERVAL && dist < DOUBLE_RIGHT_CLICK_MAX_DISTANCE) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      lastContextMenuTime = 0;
      lastRightClickTime = 0;
      isClosingTab = true;
      suppressContextMenuUntil = now + 3000;
      if (config.tabCycleHud) {
        showCloseTabHud();
      }
      try {
        if (chrome.runtime && chrome.runtime.id) {
          chrome.runtime.sendMessage({ action: 'closeTab' });
        }
      } catch (_) {}
      return false;
    }

    lastContextMenuTime = now;
    lastContextMenuX = e.clientX;
    lastContextMenuY = e.clientY;

    if ((!isHoldingText && !isRightLinkHold) || !isRightMouseDown) {
      cancelHold();
    }
  }, true);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt' || e.key === 'AltGraph' || e.code === 'AltLeft' || e.code === 'AltRight') {
      isAltKeyDown = true;
    }
    if (e.key === 'Control' || e.key === 'Meta') {
      isCtrlKeyDown = true;
    }
    if (e.key === 'Shift') {
      isShiftKeyDown = true;
    }
    if (e.key === 'Escape') {
      if (isToolbarVisible) {
        hideToolbar();
      }
      cancelHold();
      lastKnownSelectedText = '';
      lastLeftClickSelectedText = '';
      lastRightClickSelectedText = '';
    }

    // Alt + < (Prev Tab) and Alt + > (Next Tab) keybinds
    if (config.enabled && isFeatureAllowed('tabCycle') && config.tabCycleAltKeys !== false) {
      const isAlt = isAltPressed(e);
      if (isAlt && !e.ctrlKey && !e.metaKey) {
        // Detect < (Prev Tab): e.key '<' or ',' or code 'Comma'
        // Detect > (Next Tab): e.key '>' or '.' or code 'Period'
        const isPrev = e.key === '<' || e.key === ',' || e.code === 'Comma';
        const isNext = e.key === '>' || e.key === '.' || e.code === 'Period';

        if (isPrev || isNext) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const now = performance.now();
          if (now - lastAltKeyCycleTime >= ALT_KEY_CYCLE_THROTTLE) {
            lastAltKeyCycleTime = now;
            altGestureTriggered = true;
            tabCycleDidExecute = true;

            const direction = isPrev ? 'prev' : 'next';
            sendCycleTabMessage(direction, { viaAlt: true, isScrollGesture: false });
          }
          return false;
        }
      }
    }
  }, true);

  // Suppress Windows Alt-key menu bar activation when Alt (Left or Right / AltGr) was used for tab cycling
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Control' || e.key === 'Meta') {
      isCtrlKeyDown = false;
    }
    if (e.key === 'Shift') {
      isShiftKeyDown = false;
    }
    const isAltKey = e.key === 'Alt' || e.key === 'AltGraph' || e.code === 'AltLeft' || e.code === 'AltRight';
    if (isAltKey) {
      if (altGestureTriggered) {
        e.preventDefault();
        e.stopPropagation();
      }
      isAltKeyDown = false;
      altGestureTriggered = false;
      altScrollAccumulator = 0;
      altLockedAxis = null;
      lastAltDirection = null;
    }
  }, true);

  // =========================================================================
  // SECTION: Floating Text Selection Toolbar Implementation
  // =========================================================================

  let toolbarHost = null;
  let toolbarShadow = null;
  let toolbarRoot = null;
  let toolbarEl = null;
  let btnSelectAll = null;
  let btnSearch = null;
  let btnCopy = null;
  let btnCut = null;
  let searchWrapper = null;
  let submenuEl = null;
  let submenuGridEl = null;
  let submenuSearchInputEl = null;
  let submenuSearchClearEl = null;
  let submenuHeaderEl = null;
  let quickQueryBoxEl = null;
  let quickQueryInputEl = null;
  let quickQueryClearEl = null;
  let quickMetaBarEl = null;
  let quickDefaultTagEl = null;
  let quickFilterToggleEl = null;
  let quickEmptyWarningEl = null;
  let quickShortcutsTipEl = null;
  let searchMode = 'selection'; // 'selection' | 'quick'
  let isQuickSearchOpen = false;
  let isEngineFilterVisible = false;
  let toolbarTimer = null;
  let submenuLeaveTimer = null;
  let isToolbarVisible = false;
  let isToolbarHovered = false;
  let isSubmenuHovered = false;
  let isSubmenuOpen = false;
  let isSearchInputFocused = false;
  let currentSelectionText = '';
  let isShiftKeyDown = false;
  let isCtrlKeyDown = false;

  function initToolbarHost() {
    if (toolbarHost && toolbarShadow) return;

    toolbarHost = document.createElement('div');
    toolbarHost.id = 'holdtab-toolbar-host';
    toolbarHost.style.cssText = 'all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; user-select: none !important;';

    toolbarShadow = toolbarHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = getToolbarStyles();
    toolbarShadow.appendChild(style);

    toolbarRoot = document.createElement('div');
    toolbarRoot.className = 'ht-toolbar-root';
    toolbarRoot.setAttribute('role', 'toolbar');
    toolbarRoot.setAttribute('aria-label', 'Text Selection Actions');

    // Inner horizontal toolbar
    toolbarEl = document.createElement('div');
    toolbarEl.className = 'ht-toolbar';

    // 1. Select Line Button
    btnSelectAll = createToolbarButton('select-all', 'Select', 'Select current line', `
      <svg class="ht-tb-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12" stroke-width="3" stroke="#38bdf8"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    `);

    // 2. Search Button & Wrapper
    searchWrapper = document.createElement('div');
    searchWrapper.className = 'ht-search-wrapper';

    btnSearch = createToolbarButton('search', 'Search', 'Search with Google (Hover for more engines)', `
      <svg class="ht-tb-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    `);
    btnSearch.setAttribute('aria-haspopup', 'true');
    btnSearch.setAttribute('aria-expanded', 'false');

    const arrowIcon = document.createElement('span');
    arrowIcon.className = 'ht-tb-arrow';
    arrowIcon.innerHTML = `<svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 4.5L6 8L9.5 4.5"/></svg>`;
    btnSearch.appendChild(arrowIcon);

    // Submenu (shared between Mode A: Selection Hover & Mode B: Quick Search)
    submenuEl = document.createElement('div');
    submenuEl.className = 'ht-submenu';
    submenuEl.setAttribute('role', 'dialog');
    submenuEl.setAttribute('aria-label', 'Search engines');
    submenuEl.innerHTML = `
      <div class="ht-quick-query-box" style="display: none;">
        <svg class="ht-quick-query-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" class="ht-quick-query-input" placeholder="Enter text to search..." autocomplete="off" spellcheck="false" />
        <button type="button" class="ht-quick-query-clear" style="display: none;" title="Clear search query" aria-label="Clear search query">✕</button>
      </div>
      <div class="ht-quick-meta-bar" style="display: none;">
        <button type="button" class="ht-quick-filter-toggle" title="Filter search engines" aria-label="Filter search engines">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Filter</span>
        </button>
      </div>
      <div class="ht-submenu-header">
        <div class="ht-submenu-search-box">
          <svg class="ht-submenu-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="ht-submenu-search-input" placeholder="Search websites..." autocomplete="off" spellcheck="false" />
          <button type="button" class="ht-submenu-search-clear" style="display: none;" title="Clear filter" aria-label="Clear filter">✕</button>
        </div>
      </div>
      <div class="ht-quick-empty-warning" style="display: none;">Please enter text to search</div>
      <div class="ht-submenu-grid" role="group"></div>
      <div class="ht-submenu-footer">
        <span class="ht-quick-shortcuts-tip" style="display: none;">↵ Search • ↑↓ Navigate • Esc Close</span>
        <button type="button" class="ht-submenu-manage" title="Manage search engines in HoldTab settings">
          <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11"><path d="M8 0a8 8 0 1 0 8 8A8 8 0 0 0 8 0zm1 11H7v-2h2zm0-4H7V4h2z"/></svg>
          <span>Manage Engines</span>
        </button>
      </div>
    `;
    submenuGridEl = submenuEl.querySelector('.ht-submenu-grid');
    submenuSearchInputEl = submenuEl.querySelector('.ht-submenu-search-input');
    submenuSearchClearEl = submenuEl.querySelector('.ht-submenu-search-clear');
    submenuHeaderEl = submenuEl.querySelector('.ht-submenu-header');
    quickQueryBoxEl = submenuEl.querySelector('.ht-quick-query-box');
    quickQueryInputEl = submenuEl.querySelector('.ht-quick-query-input');
    quickQueryClearEl = submenuEl.querySelector('.ht-quick-query-clear');
    quickMetaBarEl = submenuEl.querySelector('.ht-quick-meta-bar');
    quickDefaultTagEl = submenuEl.querySelector('.ht-quick-default-tag');
    quickFilterToggleEl = submenuEl.querySelector('.ht-quick-filter-toggle');
    quickEmptyWarningEl = submenuEl.querySelector('.ht-quick-empty-warning');
    quickShortcutsTipEl = submenuEl.querySelector('.ht-quick-shortcuts-tip');

    searchWrapper.appendChild(btnSearch);
    searchWrapper.appendChild(submenuEl);

    // 3. Copy Button
    btnCopy = createToolbarButton('copy', 'Copy', 'Copy (Ctrl+C)', `
      <svg class="ht-tb-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    `);

    // 4. Cut Button
    btnCut = createToolbarButton('cut', 'Cut', 'Cut selected text', `
      <svg class="ht-tb-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="6" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <line x1="20" y1="4" x2="8.12" y2="15.88"/>
        <line x1="14.47" y1="14.48" x2="20" y2="20"/>
        <line x1="8.12" y1="8.12" x2="12" y2="12"/>
      </svg>
    `);

    toolbarEl.appendChild(btnSelectAll);
    toolbarEl.appendChild(searchWrapper);
    toolbarEl.appendChild(btnCopy);
    toolbarEl.appendChild(btnCut);

    toolbarRoot.appendChild(toolbarEl);
    toolbarShadow.appendChild(toolbarRoot);

    const targetParent = document.documentElement || document.body;
    if (targetParent) {
      targetParent.appendChild(toolbarHost);
    }

    setupToolbarActionListeners();
  }

  function createToolbarButton(action, label, tooltip, svgHtml) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ht-tb-btn';
    btn.dataset.action = action;
    btn.setAttribute('title', tooltip);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('tabindex', '0');

    btn.innerHTML = `
      ${svgHtml}
      <span class="ht-tb-label">${label}</span>
    `;

    btn.addEventListener('mousedown', (e) => {
      // Prevent native selection from collapsing
      e.preventDefault();
      e.stopPropagation();
    });

    return btn;
  }

  function setupToolbarActionListeners() {
    // Select Line
    btnSelectAll.addEventListener('click', (e) => {
      if (isQuickSearchOpen) return;
      e.preventDefault();
      e.stopPropagation();
      selectCurrentLine();
    });

    // Main Search Click -> Google Search in Background Tab
    btnSearch.addEventListener('click', (e) => {
      if (isQuickSearchOpen) return;
      e.preventDefault();
      e.stopPropagation();
      const query = currentSelectionText.trim();
      if (!query) return;
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      chrome.runtime.sendMessage({
        action: 'openLink',
        url,
        tabFocus: 'background'
      });
      hideToolbar();
    });

    // Copy Button
    btnCopy.addEventListener('click', async (e) => {
      if (isQuickSearchOpen) return;
      e.preventDefault();
      e.stopPropagation();
      const text = currentSelectionText;
      if (!text) return;
      const success = await copyTextToClipboard(text);
      if (success) {
        showButtonFeedback(btnCopy, 'Copied!');
        if (config.animHudBadges) {
          showClipboardHud('📋 Copied', text);
        }
      }
    });

    // Cut Button
    btnCut.addEventListener('click', (e) => {
      if (isQuickSearchOpen) return;
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection();
      const isEditable = isSelectionInEditableContext(sel);
      if (!isEditable) {
        showToolbarToast('Cut is only available in editable fields');
        return;
      }
      try {
        const ok = document.execCommand('cut');
        if (ok) {
          showButtonFeedback(btnCut, 'Cut!');
          if (config.animHudBadges) {
            showClipboardHud('✂️ Cut', currentSelectionText);
          }
          hideToolbar();
          return;
        }
      } catch (_) {}
      showToolbarToast('Cannot cut in this context');
    });

    // Manage Engines button in Submenu
    const manageBtn = submenuEl.querySelector('.ht-submenu-manage');
    if (manageBtn) {
      manageBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      manageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          chrome.runtime.sendMessage({
            action: 'openLink',
            url: chrome.runtime.getURL('popup/popup.html'),
            tabFocus: 'foreground'
          });
        } catch (_) {}
        hideToolbar();
      });
    }

    // Quick Search query input & clear listeners
    if (quickQueryInputEl) {
      quickQueryInputEl.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      quickQueryInputEl.addEventListener('input', () => {
        const val = quickQueryInputEl.value;
        if (quickQueryClearEl) {
          quickQueryClearEl.style.display = val.length > 0 ? 'inline-flex' : 'none';
        }
        hideQuickEmptyWarning();
      });

      quickQueryInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const query = quickQueryInputEl.value.trim();
          if (!query) {
            showQuickEmptyWarning('Please enter text to search');
            return;
          }
          const defaultEngine = getDefaultSearchEngine();
          if (defaultEngine) {
            executeSearchOnWebsite(defaultEngine, true, query);
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          if (isEngineFilterVisible && submenuSearchInputEl && submenuHeaderEl && submenuHeaderEl.style.display !== 'none') {
            submenuSearchInputEl.focus();
          } else {
            const firstItem = submenuGridEl ? submenuGridEl.querySelector('.ht-submenu-item') : null;
            if (firstItem) firstItem.focus();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeQuickSearch();
        }
      });
    }

    if (quickQueryClearEl) {
      quickQueryClearEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      quickQueryClearEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (quickQueryInputEl) {
          quickQueryInputEl.value = '';
          quickQueryInputEl.focus();
        }
        quickQueryClearEl.style.display = 'none';
        hideQuickEmptyWarning();
      });
    }

    if (quickFilterToggleEl) {
      quickFilterToggleEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      quickFilterToggleEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isEngineFilterVisible = !isEngineFilterVisible;
        if (submenuHeaderEl) {
          submenuHeaderEl.style.display = isEngineFilterVisible ? 'block' : 'none';
        }
        quickFilterToggleEl.classList.toggle('active', isEngineFilterVisible);
        if (isEngineFilterVisible && submenuSearchInputEl) {
          submenuSearchInputEl.placeholder = 'Filter engines...';
          submenuSearchInputEl.focus();
        } else {
          if (submenuSearchInputEl) submenuSearchInputEl.value = '';
          if (submenuSearchClearEl) submenuSearchClearEl.style.display = 'none';
          renderSubmenuGrid('');
          if (quickQueryInputEl) quickQueryInputEl.focus();
        }
      });
    }

    // Submenu search input & clear button listeners
    if (submenuSearchInputEl) {
      submenuSearchInputEl.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      submenuSearchInputEl.addEventListener('input', () => {
        const query = submenuSearchInputEl.value;
        if (submenuSearchClearEl) {
          submenuSearchClearEl.style.display = query.trim() ? 'inline-flex' : 'none';
        }
        renderSubmenuGrid(query);
      });

      submenuSearchInputEl.addEventListener('focus', () => {
        isSearchInputFocused = true;
        isSubmenuHovered = true;
        if (submenuLeaveTimer) {
          clearTimeout(submenuLeaveTimer);
          submenuLeaveTimer = null;
        }
      });

      submenuSearchInputEl.addEventListener('blur', () => {
        isSearchInputFocused = false;
        if (!isSubmenuHovered) {
          startSubmenuLeaveTimer();
        }
      });

      submenuSearchInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const firstItem = submenuGridEl ? submenuGridEl.querySelector('.ht-submenu-item') : null;
          if (firstItem && firstItem.dataset.siteId) {
            const sites = Array.isArray(config.toolbarSearchWebsites) && config.toolbarSearchWebsites.length > 0
              ? config.toolbarSearchWebsites.filter((s) => s.enabled !== false)
              : DEFAULT_SEARCH_WEBSITES;
            const targetSite = sites.find((s) => s.id === firstItem.dataset.siteId);
            if (targetSite) {
              const query = (searchMode === 'quick' && quickQueryInputEl) ? quickQueryInputEl.value.trim() : currentSelectionText.trim();
              if (searchMode === 'quick' && !query) {
                showQuickEmptyWarning('Please enter text to search');
                if (quickQueryInputEl) quickQueryInputEl.focus();
                return;
              }
              executeSearchOnWebsite(targetSite, e.shiftKey || e.altKey, query);
            }
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          const firstItem = submenuGridEl ? submenuGridEl.querySelector('.ht-submenu-item') : null;
          if (firstItem) firstItem.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          if (searchMode === 'quick' && quickQueryInputEl) {
            quickQueryInputEl.focus();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          if (submenuSearchInputEl.value) {
            submenuSearchInputEl.value = '';
            if (submenuSearchClearEl) submenuSearchClearEl.style.display = 'none';
            renderSubmenuGrid('');
          } else if (searchMode === 'quick') {
            if (isEngineFilterVisible) {
              isEngineFilterVisible = false;
              if (submenuHeaderEl) submenuHeaderEl.style.display = 'none';
              if (quickFilterToggleEl) quickFilterToggleEl.classList.remove('active');
              if (quickQueryInputEl) quickQueryInputEl.focus();
            } else {
              closeQuickSearch();
            }
          } else {
            closeSubmenu();
            if (btnSearch) btnSearch.focus();
          }
        }
      });
    }

    if (submenuSearchClearEl) {
      submenuSearchClearEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      submenuSearchClearEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (submenuSearchInputEl) {
          submenuSearchInputEl.value = '';
          submenuSearchInputEl.focus();
        }
        submenuSearchClearEl.style.display = 'none';
        renderSubmenuGrid('');
      });
    }

    // Hover bridging for Search button & Submenu
    searchWrapper.addEventListener('mouseenter', () => {
      if (isQuickSearchOpen) return;
      isToolbarHovered = true;
      if (config.toolbarSearchSubmenu !== false) {
        openSubmenu();
      }
    });

    searchWrapper.addEventListener('mouseleave', () => {
      if (isQuickSearchOpen) return;
      startSubmenuLeaveTimer();
    });

    submenuEl.addEventListener('mouseenter', () => {
      if (isQuickSearchOpen) return;
      isSubmenuHovered = true;
      if (submenuLeaveTimer) {
        clearTimeout(submenuLeaveTimer);
        submenuLeaveTimer = null;
      }
    });

    submenuEl.addEventListener('mouseleave', () => {
      if (isQuickSearchOpen) return;
      isSubmenuHovered = false;
      startSubmenuLeaveTimer();
    });

    // Toolbar root hover tracking
    toolbarRoot.addEventListener('mouseenter', () => {
      if (isQuickSearchOpen) return;
      isToolbarHovered = true;
    });

    toolbarRoot.addEventListener('mouseleave', () => {
      if (isQuickSearchOpen) return;
      isToolbarHovered = false;
    });

    // Keyboard navigation inside toolbar
    toolbarEl.addEventListener('keydown', (e) => {
      if (isQuickSearchOpen) return;
      const buttons = [btnSelectAll, btnSearch, btnCopy, btnCut];
      const activeIdx = buttons.indexOf(toolbarShadow.activeElement);

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIdx = (activeIdx + 1) % buttons.length;
        buttons[nextIdx].focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevIdx = (activeIdx - 1 + buttons.length) % buttons.length;
        buttons[prevIdx].focus();
      } else if (e.key === 'ArrowDown' && toolbarShadow.activeElement === btnSearch) {
        e.preventDefault();
        openSubmenu();
        if (submenuSearchInputEl) {
          submenuSearchInputEl.focus();
        } else {
          const firstItem = submenuGridEl.querySelector('.ht-submenu-item');
          if (firstItem) firstItem.focus();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (isSubmenuOpen) {
          closeSubmenu();
          btnSearch.focus();
        } else {
          hideToolbar();
        }
      }
    });

    // Keyboard navigation inside submenu
    submenuEl.addEventListener('keydown', (e) => {
      const items = Array.from(submenuGridEl.querySelectorAll('.ht-submenu-item'));
      const activeIdx = items.indexOf(toolbarShadow.activeElement);

      if (e.key === 'Escape') {
        e.preventDefault();
        if (isQuickSearchOpen) {
          closeQuickSearch();
        } else {
          closeSubmenu();
          btnSearch.focus();
        }
      } else if (e.key === 'ArrowDown') {
        if (toolbarShadow.activeElement === submenuSearchInputEl) {
          e.preventDefault();
          if (items[0]) items[0].focus();
        } else if (activeIdx >= 0) {
          e.preventDefault();
          const next = Math.min(items.length - 1, activeIdx + 2);
          if (items[next]) items[next].focus();
        }
      } else if (e.key === 'ArrowUp') {
        if (activeIdx >= 0) {
          e.preventDefault();
          const prev = activeIdx - 2;
          if (prev >= 0 && items[prev]) {
            items[prev].focus();
          } else if (submenuSearchInputEl && submenuHeaderEl && submenuHeaderEl.style.display !== 'none') {
            submenuSearchInputEl.focus();
          } else if (isQuickSearchOpen && quickQueryInputEl) {
            quickQueryInputEl.focus();
          } else {
            closeSubmenu();
            btnSearch.focus();
          }
        }
      } else if (e.key === 'ArrowRight') {
        if (activeIdx >= 0) {
          e.preventDefault();
          const next = (activeIdx + 1) % items.length;
          if (items[next]) items[next].focus();
        }
      } else if (e.key === 'ArrowLeft') {
        if (activeIdx >= 0) {
          e.preventDefault();
          const prev = (activeIdx - 1 + items.length) % items.length;
          if (items[prev]) items[prev].focus();
        }
      }
    });
  }

  function startSubmenuLeaveTimer() {
    if (isQuickSearchOpen) return;
    if (submenuLeaveTimer) clearTimeout(submenuLeaveTimer);
    submenuLeaveTimer = setTimeout(() => {
      if (isQuickSearchOpen) return;
      if (!isSubmenuHovered && !searchWrapper.matches(':hover') && !isSearchInputFocused) {
        closeSubmenu();
      }
    }, 220);
  }

  function openSubmenu() {
    if (isQuickSearchOpen) return;
    if (!config.toolbarSearchSubmenu || !submenuEl || !submenuGridEl) return;
    if (submenuLeaveTimer) {
      clearTimeout(submenuLeaveTimer);
      submenuLeaveTimer = null;
    }

    searchMode = 'selection';
    if (quickQueryBoxEl) quickQueryBoxEl.style.display = 'none';
    if (quickMetaBarEl) quickMetaBarEl.style.display = 'none';
    if (quickShortcutsTipEl) quickShortcutsTipEl.style.display = 'none';
    if (submenuHeaderEl) submenuHeaderEl.style.display = 'block';

    if (submenuSearchInputEl) {
      submenuSearchInputEl.value = '';
    }
    if (submenuSearchClearEl) {
      submenuSearchClearEl.style.display = 'none';
    }

    renderSubmenuGrid('');

    submenuEl.classList.add('ht-submenu-open');
    submenuEl.style.display = 'block';
    btnSearch.setAttribute('aria-expanded', 'true');
    isSubmenuOpen = true;
  }

  function closeSubmenu() {
    if (isQuickSearchOpen) return;
    if (!submenuEl) return;
    submenuEl.classList.remove('ht-submenu-open');
    submenuEl.style.display = 'none';
    if (btnSearch) btnSearch.setAttribute('aria-expanded', 'false');
    isSubmenuOpen = false;
    isSubmenuHovered = false;
    isSearchInputFocused = false;
    if (submenuSearchInputEl && toolbarShadow && toolbarShadow.activeElement === submenuSearchInputEl) {
      submenuSearchInputEl.blur();
    }
  }

  function showQuickEmptyWarning(message = 'Please enter text to search') {
    if (quickEmptyWarningEl) {
      quickEmptyWarningEl.textContent = message;
      quickEmptyWarningEl.style.display = 'block';
    }
  }

  function hideQuickEmptyWarning() {
    if (quickEmptyWarningEl) {
      quickEmptyWarningEl.style.display = 'none';
    }
  }

  function getDefaultSearchEngine() {
    const sites = Array.isArray(config.toolbarSearchWebsites) && config.toolbarSearchWebsites.length > 0
      ? config.toolbarSearchWebsites.filter((s) => s.enabled !== false)
      : DEFAULT_SEARCH_WEBSITES;

    if (sites.length === 0) return DEFAULT_SEARCH_WEBSITES[0];

    const explicitDefault = sites.find((s) => s.isDefault === true);
    if (explicitDefault) return explicitDefault;

    const defaultId = config.quickSearchDefaultEngine || 'google';
    const matched = sites.find((s) => s.id === defaultId);
    if (matched) return matched;

    return sites[0];
  }

  function openQuickSearch() {
    if (!isQuickSearchAllowed()) return;

    initToolbarHost();
    if (!toolbarRoot || !toolbarEl || !submenuEl) return;

    searchMode = 'quick';
    isQuickSearchOpen = true;

    // Reset toolbar positioning and classes
    toolbarRoot.classList.remove('ht-visible');
    toolbarRoot.removeAttribute('data-placement');
    toolbarRoot.style.left = '50%';
    toolbarRoot.style.top = '18%';
    toolbarRoot.style.transform = 'translateX(-50%)';
    toolbarRoot.style.display = 'flex';
    toolbarRoot.classList.add('ht-visible', 'ht-quick-search-active');
    toolbarEl.classList.add('ht-quick-search-active');

    // Show Quick Search UI elements
    if (quickQueryBoxEl) quickQueryBoxEl.style.display = 'flex';
    if (quickMetaBarEl) quickMetaBarEl.style.display = 'flex';
    if (quickShortcutsTipEl) quickShortcutsTipEl.style.display = 'inline-block';

    // Hide engine filter search input initially (progressive disclosure)
    isEngineFilterVisible = false;
    if (submenuHeaderEl) submenuHeaderEl.style.display = 'none';
    if (quickFilterToggleEl) quickFilterToggleEl.classList.remove('active');
    if (submenuSearchInputEl) submenuSearchInputEl.value = '';
    if (submenuSearchClearEl) submenuSearchClearEl.style.display = 'none';

    // Update default engine indicator in meta bar
    const defEngine = getDefaultSearchEngine();
    if (quickDefaultTagEl && defEngine) {
      quickDefaultTagEl.textContent = `Default: ${defEngine.name} ↵`;
      quickDefaultTagEl.title = `Press Enter to search with ${defEngine.name}`;
    }

    // Only prefill if user currently has active selected text on the webpage
    let initialQuery = '';
    try {
      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && !sel.isCollapsed) {
        const text = sel.toString().trim();
        if (text.length > 0) {
          initialQuery = text;
        }
      }
    } catch (_) {}

    if (quickQueryInputEl) {
      quickQueryInputEl.value = initialQuery;
      if (quickQueryClearEl) {
        quickQueryClearEl.style.display = initialQuery ? 'inline-flex' : 'none';
      }
    }

    hideQuickEmptyWarning();
    renderSubmenuGrid('');

    // Display submenu
    submenuEl.classList.add('ht-submenu-open');
    submenuEl.style.display = 'block';
    isSubmenuOpen = true;

    // Autofocus input
    setTimeout(() => {
      if (quickQueryInputEl) {
        quickQueryInputEl.focus();
        if (initialQuery) {
          quickQueryInputEl.select();
        }
      }
    }, 25);
  }

  function closeQuickSearch() {
    if (!isQuickSearchOpen && searchMode !== 'quick') return;

    isQuickSearchOpen = false;
    searchMode = 'selection';

    if (quickQueryInputEl) {
      quickQueryInputEl.blur();
    }

    if (toolbarRoot) {
      toolbarRoot.classList.remove('ht-visible', 'ht-quick-search-active');
      toolbarRoot.style.display = 'none';
      toolbarRoot.style.transform = '';
    }

    if (toolbarEl) {
      toolbarEl.classList.remove('ht-quick-search-active');
    }

    closeSubmenu();

    if (quickQueryBoxEl) quickQueryBoxEl.style.display = 'none';
    if (quickMetaBarEl) quickMetaBarEl.style.display = 'none';
    if (quickShortcutsTipEl) quickShortcutsTipEl.style.display = 'none';
    hideQuickEmptyWarning();
  }

  function toggleQuickSearch() {
    if (isQuickSearchOpen) {
      closeQuickSearch();
    } else {
      openQuickSearch();
    }
  }

  function selectCurrentLine() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const origRange = sel.getRangeAt(0);

    // 1. Use native browser Selection.modify with line boundaries (Chromium, Firefox, WebKit)
    let selectedLineText = '';
    if (typeof sel.modify === 'function') {
      try {
        sel.collapseToStart();
        sel.modify('move', 'backward', 'lineboundary');
        sel.modify('extend', 'forward', 'lineboundary');
        selectedLineText = sel.toString().trim();
      } catch (_) {}
    }

    // 2. DOM-based fallback if lineboundary didn't capture or returned empty
    if (!selectedLineText || selectedLineText.length === 0) {
      try {
        let node = origRange.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          const offset = origRange.startOffset;

          let lineStart = text.lastIndexOf('\n', offset);
          lineStart = lineStart === -1 ? 0 : lineStart + 1;

          let lineEnd = text.indexOf('\n', offset);
          lineEnd = lineEnd === -1 ? text.length : lineEnd;

          if (lineEnd > lineStart) {
            const range = document.createRange();
            range.setStart(node, lineStart);
            range.setEnd(node, lineEnd);
            sel.removeAllRanges();
            sel.addRange(range);
            selectedLineText = sel.toString().trim();
          }
        }

        if (!selectedLineText || selectedLineText.length === 0) {
          let blockEl = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
          const blockTags = ['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'DIV', 'TR', 'TD', 'TH', 'ARTICLE', 'SECTION'];
          while (blockEl && blockEl !== document.body && !blockTags.includes(blockEl.tagName)) {
            const style = window.getComputedStyle(blockEl);
            if (style.display === 'block' || style.display === 'flex' || style.display === 'list-item') {
              break;
            }
            blockEl = blockEl.parentElement;
          }

          if (blockEl && blockEl !== document.body) {
            const range = document.createRange();
            range.selectNodeContents(blockEl);
            sel.removeAllRanges();
            sel.addRange(range);
            selectedLineText = sel.toString().trim();
          }
        }
      } catch (_) {}
    }

    if (sel.rangeCount > 0) {
      currentSelectionText = sel.toString().trim();
      // Reposition toolbar to fit the newly selected line without hiding
      requestAnimationFrame(() => {
        updateToolbarPosition();
      });
    }
  }

  function renderSubmenuGrid(filter = '') {
    if (!submenuGridEl) return;
    submenuGridEl.innerHTML = '';

    const sites = Array.isArray(config.toolbarSearchWebsites) && config.toolbarSearchWebsites.length > 0
      ? config.toolbarSearchWebsites.filter((s) => s.enabled !== false)
      : DEFAULT_SEARCH_WEBSITES;

    const trimmedFilter = typeof filter === 'string' ? filter.trim().toLowerCase() : '';
    const filteredSites = trimmedFilter
      ? sites.filter((s) => {
          const name = (s.name || '').toLowerCase();
          const id = (s.id || '').toLowerCase();
          return name.includes(trimmedFilter) || id.includes(trimmedFilter);
        })
      : sites;

    if (filteredSites.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'ht-submenu-empty';
      emptyItem.textContent = `No websites matching "${filter.trim()}"`;
      submenuGridEl.appendChild(emptyItem);
      return;
    }

    const defaultEngine = getDefaultSearchEngine();

    filteredSites.forEach((site) => {
      const isDefaultSite = defaultEngine && defaultEngine.id === site.id;
      const item = document.createElement('div');
      item.className = 'ht-submenu-item';
      if (searchMode === 'quick' && isDefaultSite) {
        item.classList.add('ht-item-default');
      }
      item.setAttribute('role', 'menuitem');
      item.setAttribute('tabindex', '0');
      item.dataset.siteId = site.id;
      item.title = searchMode === 'quick'
        ? (isDefaultSite ? `Search on ${site.name} (Default engine - Enter)` : `Search on ${site.name}`)
        : `Search on ${site.name} (Background Tab, keeps menu open)`;

      const mainAction = document.createElement('div');
      mainAction.className = 'ht-submenu-main-action';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'ht-submenu-icon';
      iconSpan.innerHTML = getWebsiteIconSvg(site);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'ht-submenu-name';

      if (trimmedFilter) {
        nameSpan.appendChild(createHighlightedTextFragment(site.name, trimmedFilter));
      } else {
        nameSpan.textContent = site.name;
      }

      mainAction.appendChild(iconSpan);
      mainAction.appendChild(nameSpan);

      if (searchMode === 'quick' && isDefaultSite) {
        const badge = document.createElement('span');
        badge.className = 'ht-default-badge';
        badge.textContent = 'Default';
        mainAction.appendChild(badge);
      }

      // Right-side open-in-foreground action icon (switches immediately to new tab)
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'ht-submenu-open-action';
      openBtn.title = `Search on ${site.name} & switch to tab (Foreground)`;
      openBtn.setAttribute('aria-label', `Search on ${site.name} and switch to tab`);
      openBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

      item.appendChild(mainAction);
      item.appendChild(openBtn);

      const getQuery = () => {
        return (searchMode === 'quick' && quickQueryInputEl)
          ? quickQueryInputEl.value.trim()
          : currentSelectionText.trim();
      };

      // Foreground click on right-side icon
      openBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const query = getQuery();
        if (searchMode === 'quick' && !query) {
          showQuickEmptyWarning('Please enter text to search');
          if (quickQueryInputEl) quickQueryInputEl.focus();
          return;
        }
        executeSearchOnWebsite(site, true, query);
      });

      // Background click on main item
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const query = getQuery();
        if (searchMode === 'quick' && !query) {
          showQuickEmptyWarning('Please enter text to search');
          if (quickQueryInputEl) quickQueryInputEl.focus();
          return;
        }
        executeSearchOnWebsite(site, false, query);
      });

      // Keyboard support
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const query = getQuery();
          if (searchMode === 'quick' && !query) {
            showQuickEmptyWarning('Please enter text to search');
            if (quickQueryInputEl) quickQueryInputEl.focus();
            return;
          }
          executeSearchOnWebsite(site, e.shiftKey || e.altKey, query);
        }
      });

      submenuGridEl.appendChild(item);
    });
  }

  function createHighlightedTextFragment(text, query) {
    const frag = document.createDocumentFragment();
    if (!query) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }
    if (idx > 0) {
      frag.appendChild(document.createTextNode(text.slice(0, idx)));
    }
    const matchEl = document.createElement('span');
    matchEl.className = 'ht-search-match';
    matchEl.textContent = text.slice(idx, idx + query.length);
    frag.appendChild(matchEl);
    if (idx + query.length < text.length) {
      frag.appendChild(document.createTextNode(text.slice(idx + query.length)));
    }
    return frag;
  }

  function executeSearchOnWebsite(site, isForeground = false, queryOverride = null) {
    const rawQuery = (typeof queryOverride === 'string')
      ? queryOverride
      : (searchMode === 'quick' && quickQueryInputEl ? quickQueryInputEl.value : currentSelectionText);
    const query = (rawQuery || '').trim();
    if (!query) {
      if (searchMode === 'quick') {
        showQuickEmptyWarning('Please enter text to search');
        if (quickQueryInputEl) quickQueryInputEl.focus();
      }
      return;
    }

    let template = (site.template || 'https://www.google.com/search?q={query}').trim();
    if (!/^https?:\/\//i.test(template)) {
      template = 'https://' + template;
    }

    // Auto-fix steamdb if legacy or missing /search/
    if (template.includes('steamdb.info/?q=')) {
      template = template.replace('steamdb.info/?q=', 'steamdb.info/search/?q=');
    }

    // Determine query encoding: inside path (spaces as %20) vs inside search params (spaces as '+')
    let encodedQuery;
    const qIndex = template.indexOf('{query}');
    const questionIndex = template.indexOf('?');
    if (questionIndex === -1 || (qIndex !== -1 && qIndex < questionIndex)) {
      encodedQuery = encodeURIComponent(query);
    } else {
      encodedQuery = encodeURIComponent(query).replace(/%20/g, '+');
    }

    let finalUrl;
    if (template.includes('{query}')) {
      finalUrl = template.replace(/\{query\}/gi, encodedQuery);
    } else {
      const joiner = template.includes('?')
        ? (template.endsWith('?') || template.endsWith('&') ? '' : '&')
        : '?';
      finalUrl = `${template}${joiner}q=${encodedQuery}`;
    }

    const isQuick = (searchMode === 'quick');
    const effectiveFocus = isForeground ? 'foreground' : 'background';

    chrome.runtime.sendMessage({
      action: 'openLink',
      url: finalUrl,
      tabFocus: effectiveFocus
    });

    if (isForeground) {
      if (isQuick) {
        closeQuickSearch();
      } else {
        hideToolbar();
      }
    } else {
      showSubmenuItemFeedback(site.id, query);
    }
  }

  function showSubmenuItemFeedback(siteId, feedbackQuery = '') {
    if (!submenuGridEl) return;
    const item = submenuGridEl.querySelector(`[data-site-id="${siteId}"]`);
    if (item) {
      item.classList.add('ht-item-opened');
      const nameEl = item.querySelector('.ht-submenu-name');
      const origText = nameEl ? nameEl.textContent : '';
      if (nameEl) {
        nameEl.textContent = '✓ Opened';
        nameEl.style.color = '#38bdf8';
      }
      setTimeout(() => {
        item.classList.remove('ht-item-opened');
        if (nameEl) {
          nameEl.textContent = origText;
          nameEl.style.color = '';
        }
      }, 1200);
    }
    const q = feedbackQuery || currentSelectionText;
    if (config.animHudBadges && q) {
      showClipboardHud('✓ Search Opened (Background)', q);
    }
  }

  function hideToolbar() {
    if (isQuickSearchOpen) return;
    if (toolbarTimer) {
      clearTimeout(toolbarTimer);
      toolbarTimer = null;
    }
    if (submenuLeaveTimer) {
      clearTimeout(submenuLeaveTimer);
      submenuLeaveTimer = null;
    }
    closeSubmenu();
    if (toolbarRoot) {
      toolbarRoot.classList.remove('ht-visible');
      toolbarRoot.style.display = 'none';
    }
    isToolbarVisible = false;
    isToolbarHovered = false;
    isSubmenuHovered = false;
  }

  function showButtonFeedback(btn, feedbackText) {
    const labelEl = btn.querySelector('.ht-tb-label');
    if (!labelEl) return;
    const origText = labelEl.textContent;
    labelEl.textContent = feedbackText;
    btn.classList.add('ht-btn-success');
    setTimeout(() => {
      labelEl.textContent = origText;
      btn.classList.remove('ht-btn-success');
    }, 1200);
  }

  function showToolbarToast(message) {
    if (!toolbarShadow || !toolbarRoot) return;
    let toast = toolbarShadow.querySelector('.ht-toolbar-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'ht-toolbar-toast';
      toolbarRoot.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('ht-toast-show');
    setTimeout(() => {
      toast.classList.remove('ht-toast-show');
    }, 1600);
  }

  function isToolbarModifierActive(e) {
    const mod = config.toolbarModifier || 'alt';
    if (mod === 'alt') {
      return isAltPressed(e);
    }
    if (mod === 'ctrl') {
      return Boolean((e && (e.ctrlKey || e.metaKey)) || isCtrlKeyDown || isMetaKeyDown);
    }
    if (mod === 'shift') {
      return Boolean((e && e.shiftKey) || isShiftKeyDown);
    }
    return false;
  }

  function isSelectionInExcludedContext(sel) {
    try {
      const active = document.activeElement;
      if (active) {
        if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') return true;
        if (active.isContentEditable || (active.getAttribute && active.getAttribute('contenteditable') === 'true')) return true;
      }

      const anchor = sel.anchorNode;
      const focus = sel.focusNode;
      const anchorEl = anchor ? (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement) : null;
      const focusEl = focus ? (focus.nodeType === Node.ELEMENT_NODE ? focus : focus.parentElement) : null;

      if (anchorEl) {
        if (anchorEl.closest('input, textarea, [contenteditable="true"], [contenteditable=""], #holdtab-toolbar-host, #holdtab-root-host')) {
          return true;
        }
      }
      if (focusEl) {
        if (focusEl.closest('input, textarea, [contenteditable="true"], [contenteditable=""], #holdtab-toolbar-host, #holdtab-root-host')) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function isSelectionInEditableContext(sel) {
    try {
      const active = document.activeElement;
      if (active) {
        if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') {
          const type = (active.type || '').toLowerCase();
          return !active.readOnly && !active.disabled && type !== 'password';
        }
        if (active.isContentEditable || (active.getAttribute && active.getAttribute('contenteditable') === 'true')) {
          return true;
        }
      }
      const anchor = sel.anchorNode;
      const anchorEl = anchor ? (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement) : null;
      if (anchorEl && anchorEl.closest('[contenteditable="true"]')) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function handleToolbarSelectionChange(e) {
    if (isQuickSearchOpen) return;
    if (!isToolbarAllowed()) {
      if (isToolbarVisible) hideToolbar();
      return;
    }

    if (isToolbarHovered || isSubmenuHovered || isSearchInputFocused) {
      return;
    }

    scheduleToolbarDisplay(e);
  }

  function scheduleToolbarDisplay(e) {
    if (isQuickSearchOpen) return;
    if (toolbarTimer) {
      clearTimeout(toolbarTimer);
      toolbarTimer = null;
    }

    if (!isToolbarAllowed()) {
      if (isToolbarVisible) hideToolbar();
      return;
    }

    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed) {
      if (isToolbarVisible && !isToolbarHovered && !isSubmenuHovered && !isSearchInputFocused) {
        hideToolbar();
      }
      return;
    }

    const text = sel.toString().trim();
    const minLen = typeof config.toolbarMinLength === 'number' ? config.toolbarMinLength : 2;
    if (text.length < minLen) {
      if (isToolbarVisible && !isToolbarHovered && !isSubmenuHovered && !isSearchInputFocused) {
        hideToolbar();
      }
      return;
    }

    if (isSelectionInExcludedContext(sel)) {
      if (isToolbarVisible) hideToolbar();
      return;
    }

    if (config.toolbarMode === 'demand') {
      if (!isToolbarModifierActive(e)) {
        if (isToolbarVisible) hideToolbar();
        return;
      }
    }

    const delay = typeof config.toolbarDelay === 'number' ? config.toolbarDelay : 250;
    toolbarTimer = setTimeout(() => {
      renderAndShowToolbar(sel, text);
    }, delay);
  }

  function renderAndShowToolbar(sel, text) {
    if (isQuickSearchOpen) return;
    if (!isToolbarAllowed()) {
      if (isToolbarVisible) hideToolbar();
      return;
    }

    initToolbarHost();
    if (!toolbarRoot || !toolbarEl) return;

    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return;

    currentSelectionText = text;

    // Cut availability check
    const isEditable = isSelectionInEditableContext(sel);
    if (!isEditable) {
      btnCut.classList.add('ht-btn-disabled');
      btnCut.setAttribute('aria-disabled', 'true');
      btnCut.setAttribute('title', 'Cut is only available in editable fields');
    } else {
      btnCut.classList.remove('ht-btn-disabled');
      btnCut.removeAttribute('aria-disabled');
      btnCut.setAttribute('title', 'Cut (Ctrl+X)');
    }

    updateToolbarPosition(rect);

    toolbarRoot.classList.add('ht-visible');
    isToolbarVisible = true;
  }

  function updateToolbarPosition(rect) {
    if (isQuickSearchOpen) return;
    if (!toolbarRoot || !toolbarEl) return;
    toolbarRoot.style.display = 'flex';

    const tbWidth = toolbarEl.offsetWidth || 280;
    const tbHeight = toolbarEl.offsetHeight || 38;

    const selCenterX = (rect.left + rect.right) / 2;
    let left = selCenterX - (tbWidth / 2);
    left = Math.max(10, Math.min(left, window.innerWidth - tbWidth - 10));

    const margin = 8;
    let top = rect.top - tbHeight - margin;
    let placement = 'above';
    if (top < 10) {
      top = rect.bottom + margin;
      placement = 'below';
    }
    top = Math.max(10, Math.min(top, window.innerHeight - tbHeight - 10));

    toolbarRoot.style.left = `${Math.round(left)}px`;
    toolbarRoot.style.top = `${Math.round(top)}px`;
    toolbarRoot.setAttribute('data-placement', placement);
  }

  async function copyTextToClipboard(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position: fixed; left: -9999px; top: -9999px; opacity: 0; pointer-events: none;';
      document.body.appendChild(ta);
      ta.select();
      const res = document.execCommand('copy');
      document.body.removeChild(ta);
      return res;
    } catch (_) {
      return false;
    }
  }

  function getWebsiteIconSvg(site) {
    const id = (site.icon || site.id || '').toLowerCase();
    if (id === 'google') {
      return `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.9c2.28-2.1 3.645-5.2 3.645-9.14z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.9-3.05c-1.08.72-2.45 1.16-4.03 1.16-3.1 0-5.73-2.1-6.67-4.93H1.28v3.15C3.26 21.3 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.33 14.27c-.24-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.28C.46 8.2 0 10.04 0 12s.46 3.8 1.28 5.42l4.05-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.7 1.28 6.58l4.05 3.15c.94-2.83 3.57-4.98 6.67-4.98z"/></svg>`;
    }
    if (id === 'youtube') {
      return `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
    }
    if (id === 'wikipedia') {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="#FFFFFF"><path d="M12.09 13.002l3.05-7.05h2.46l-5.01 11.025-4.5-9.975-4.5 9.975L-1.5 5.952h2.46l3.05 7.05 2.5-5.55h1.98l2.5 5.55z"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`;
    }
    if (id === 'reddit') {
      return `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="11" fill="#FF4500"/><path fill="#FFF" d="M19.5 12c0-.8-.7-1.5-1.5-1.5-.4 0-.8.2-1.1.5-1.1-.8-2.6-1.3-4.3-1.4l.7-3.4 2.4.5c0 .7.6 1.3 1.4 1.3.8 0 1.4-.6 1.4-1.4s-.6-1.4-1.4-1.4c-.6 0-1.1.4-1.3.9l-2.7-.6c-.2 0-.3.1-.4.3l-.9 4.1c-1.8.1-3.3.6-4.4 1.4-.3-.3-.7-.5-1.1-.5-.8 0-1.5.7-1.5 1.5 0 .6.4 1.1.9 1.3-.1.4-.1.8-.1 1.2 0 2.5 2.9 4.5 6.5 4.5s6.5-2 6.5-4.5c0-.4 0-.8-.1-1.2.5-.2.9-.7.9-1.3zm-10.5 1c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm6 4c-.9.9-2.6.9-3 0-.1-.1 0-.3.1-.4.1-.1.3 0 .4.1.3.6 1.8.6 2.1 0 .1-.1.3-.1.4 0 .1.1.1.2 0 .3zm-.5-3c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z"/></svg>`;
    }
    if (id === 'github') {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="#FFFFFF"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`;
    }
    if (id === 'amazon') {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="#FF9900"><path d="M13.88 15.63c-2.36 1.83-5.8 2.8-8.8 2.8-4.22 0-8.02-1.62-10.88-4.33-.23-.22-.03-.52.24-.35 3.1 1.9 6.94 3.05 10.9 3.05 2.65 0 5.61-.71 8.28-2.19.41-.23.67.24.26 1.02zM15.42 14.18c-.3-.39-1.99-.18-2.75-.09-.23.03-.27-.15-.06-.29 1.37-.97 3.63-.69 3.9-.34.27.35-.07 2.63-1.37 3.69-.2.16-.38.07-.3-.14.28-.73.88-2.44.58-2.83z"/><path d="M14.6 9.87c0-1.74-.88-2.76-2.5-2.76-1.57 0-2.46.97-2.72 1.92-.05.18.06.33.24.35l1.64.12c.15.01.29-.09.33-.23.13-.44.47-.73.96-.73.65 0 1.03.38 1.03 1.15v.42c-.88.08-2.1.23-3.08.63-1.28.53-1.95 1.55-1.95 2.8 0 1.74 1.2 2.67 2.68 2.67 1.25 0 2.05-.6 2.5-1.33h.06v1.07c0 .16.1.28.25.29l1.45.02c.16 0 .28-.13.28-.29V11.5c0-.52-.04-1.07-.08-1.63zm-2.02 4.12c-.38.45-.94.75-1.55.75-.7 0-1.12-.46-1.12-1.2 0-.96.65-1.5 1.8-1.65.37-.05.65-.05.87-.03v2.13z" fill="#FFFFFF"/></svg>`;
    }
    let domain = '';
    try {
      const u = new URL(site.template.replace(/\{query\}/g, 'test'));
      domain = u.hostname;
    } catch (_) {}
    if (domain) {
      return `<img src="https://${domain}/favicon.ico" alt="${site.name}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-flex';"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="display: none;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"/></svg>`;
  }

  function getToolbarStyles() {
    return `
      :host, :host * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }

      .ht-toolbar-root {
        position: fixed;
        display: none;
        opacity: 0;
        transform: translateY(-4px) scale(0.96);
        transition: opacity 0.16s ease, transform 0.16s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: auto !important;
        z-index: 2147483647;
        user-select: none;
      }

      .ht-toolbar-root.ht-visible {
        display: flex;
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      .ht-toolbar {
        display: inline-flex;
        align-items: center;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 9px;
        padding: 3px 5px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
        gap: 3px;
      }

      .ht-tb-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 28px;
        padding: 0 9px;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: #f1f5f9;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        transition: background 0.12s ease, color 0.12s ease, transform 0.08s ease;
        outline: none;
        white-space: nowrap;
      }

      .ht-tb-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #38bdf8;
      }

      .ht-tb-btn:focus-visible {
        outline: 2px solid #38bdf8;
        outline-offset: 1px;
      }

      .ht-tb-btn:active {
        transform: scale(0.96);
      }

      .ht-tb-btn.ht-btn-disabled {
        opacity: 0.38;
        cursor: not-allowed;
      }

      .ht-tb-btn.ht-btn-disabled:hover {
        background: transparent;
        color: #f1f5f9;
      }

      .ht-tb-btn.ht-btn-success {
        background: rgba(16, 185, 129, 0.22) !important;
        color: #34d399 !important;
        border: 1px solid rgba(16, 185, 129, 0.4);
      }

      .ht-tb-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .ht-tb-label {
        line-height: 1;
      }

      .ht-tb-arrow {
        display: inline-flex;
        align-items: center;
        opacity: 0.7;
        margin-left: -1px;
        transition: transform 0.15s ease;
      }

      .ht-search-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
      }

      /* Invisible hover bridge */
      .ht-search-wrapper::after {
        content: '';
        position: absolute;
        left: -8px;
        right: -8px;
        top: 100%;
        height: 10px;
        pointer-events: auto;
      }

      .ht-toolbar-root[data-placement="below"] .ht-search-wrapper::after {
        top: auto;
        bottom: 100%;
      }

      /* Submenu */
      .ht-submenu {
        position: absolute;
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        top: calc(100% + 6px);
        width: 290px;
        background: rgba(15, 23, 42, 0.96);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 10px;
        box-shadow: 0 14px 35px rgba(0, 0, 0, 0.6);
        padding: 6px;
        display: none;
        opacity: 0;
        pointer-events: auto;
        transition: opacity 0.15s ease, transform 0.15s ease;
        z-index: 100;
      }

      .ht-toolbar-root[data-placement="below"] .ht-submenu {
        top: auto;
        bottom: calc(100% + 6px);
        transform: translateX(-50%) translateY(-4px);
      }

      .ht-submenu.ht-submenu-open {
        display: block;
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      .ht-submenu-header {
        padding: 2px 2px 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        margin-bottom: 5px;
      }

      .ht-submenu-search-box {
        display: flex;
        align-items: center;
        width: 100%;
        background: rgba(2, 6, 23, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        padding: 3px 7px;
        gap: 6px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      }

      .ht-submenu-search-box:focus-within {
        background: rgba(2, 6, 23, 0.95);
        border-color: #38bdf8;
        box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.22);
      }

      .ht-submenu-search-icon {
        color: #94a3b8;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .ht-submenu-search-input {
        flex: 1;
        min-width: 0;
        background: transparent;
        border: none;
        outline: none;
        color: #f8fafc;
        font-size: 11px;
        font-family: inherit;
        padding: 1px 0;
        line-height: 16px;
      }

      .ht-submenu-search-input::placeholder {
        color: #64748b;
        font-size: 11px;
      }

      .ht-submenu-search-clear {
        display: none;
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 11px;
        cursor: pointer;
        padding: 0 2px;
        line-height: 1;
        border-radius: 3px;
        transition: color 0.12s ease;
        align-items: center;
        justify-content: center;
      }

      .ht-submenu-search-clear:hover {
        color: #f1f5f9;
      }

      .ht-submenu-empty {
        grid-column: 1 / -1;
        padding: 14px 6px;
        text-align: center;
        color: #94a3b8;
        font-size: 11px;
        font-style: italic;
      }

      .ht-search-match {
        color: #38bdf8;
        font-weight: 700;
        text-decoration: underline;
      }

      .ht-submenu-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 3px;
        max-height: 220px;
        overflow-y: auto;
        padding: 1px;
      }

      .ht-submenu-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
        padding: 5px 6px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid transparent;
        color: #f1f5f9;
        font-size: 11.5px;
        font-weight: 500;
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        outline: none;
        white-space: nowrap;
        position: relative;
        box-sizing: border-box;
      }

      .ht-submenu-item:hover,
      .ht-submenu-item:focus-visible {
        background: rgba(56, 189, 248, 0.14);
        border-color: rgba(56, 189, 248, 0.25);
        color: #f8fafc;
      }

      .ht-submenu-item.ht-item-opened {
        background: rgba(56, 189, 248, 0.22) !important;
        border-color: rgba(56, 189, 248, 0.45) !important;
      }

      .ht-submenu-main-action {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        min-width: 0;
        overflow: hidden;
      }

      .ht-submenu-icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .ht-submenu-icon img {
        width: 16px;
        height: 16px;
        border-radius: 2px;
      }

      .ht-submenu-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: color 0.15s ease;
      }

      .ht-submenu-open-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 4px;
        background: transparent;
        border: none;
        color: #64748b;
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        transition: color 0.12s ease, background 0.12s ease, transform 0.1s ease;
        outline: none;
      }

      .ht-submenu-open-action:hover {
        background: rgba(56, 189, 248, 0.25);
        color: #38bdf8;
        transform: scale(1.15);
      }

      .ht-submenu-open-action:active {
        transform: scale(0.92);
      }

      .ht-submenu-footer {
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        justify-content: flex-end;
      }

      .ht-submenu-manage {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 10.5px;
        cursor: pointer;
        padding: 3px 6px;
        border-radius: 4px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: color 0.14s ease;
      }

      .ht-submenu-manage:hover {
        color: #38bdf8;
        text-decoration: underline;
      }

      /* Floating Toast Bubble for feedback */
      .ht-toolbar-toast {
        position: absolute;
        bottom: calc(100% + 7px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        background: rgba(30, 41, 59, 0.95);
        backdrop-filter: blur(8px);
        color: #f8fafc;
        font-size: 11px;
        font-weight: 500;
        padding: 5px 10px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease, transform 0.15s ease;
        z-index: 200;
      }

      .ht-toolbar-root[data-placement="below"] .ht-toolbar-toast {
        bottom: auto;
        top: calc(100% + 7px);
        transform: translateX(-50%) translateY(-4px);
      }

      .ht-toolbar-toast.ht-toast-show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* Mode B: Quick Search Styles */
      .ht-toolbar-root.ht-quick-search-active {
        top: 18% !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        background: transparent !important;
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
      }

      .ht-toolbar.ht-quick-search-active {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }

      .ht-toolbar-root.ht-quick-search-active .ht-tb-btn {
        display: none !important;
      }

      .ht-toolbar-root.ht-quick-search-active .ht-search-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .ht-toolbar-root.ht-quick-search-active .ht-search-wrapper::after {
        display: none !important;
      }

      .ht-toolbar-root.ht-quick-search-active .ht-submenu {
        position: static !important;
        transform: none !important;
        width: 330px !important;
        background: rgba(15, 19, 39, 0.97) !important;
        border: 1px solid rgba(129, 140, 248, 0.25) !important;
        box-shadow: 0 20px 45px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(129, 140, 248, 0.25) !important;
        padding: 10px !important;
        animation: htQuickFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes htQuickFadeIn {
        from {
          opacity: 0;
          transform: translateY(-8px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .ht-quick-query-box {
        display: flex;
        align-items: center;
        width: 100%;
        background: #231c53;
        background: linear-gradient(135deg, #2e266d 0%, #1e1744 100%);
        border: 1.5px solid #818cf8;
        box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.28), inset 0 1px 3px rgba(0, 0, 0, 0.3);
        border-radius: 8px;
        padding: 7px 10px;
        gap: 8px;
        margin-bottom: 8px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      }

      .ht-quick-query-box:focus-within {
        border-color: #c7d2fe;
        box-shadow: 0 0 0 4px rgba(165, 180, 252, 0.4), inset 0 1px 3px rgba(0, 0, 0, 0.2);
        background: #2f2575;
        background: linear-gradient(135deg, #3730a3 0%, #251c5a 100%);
      }

      .ht-quick-query-icon {
        color: #c7d2fe;
        flex-shrink: 0;
      }

      .ht-quick-query-input {
        flex: 1;
        min-width: 0;
        background: transparent;
        border: none;
        outline: none;
        color: #ffffff;
        font-size: 13.5px;
        font-weight: 500;
        font-family: inherit;
        line-height: 1.4;
      }

      .ht-quick-query-input::placeholder {
        color: #c7d2fe;
        opacity: 0.7;
        font-size: 13px;
        font-weight: 400;
      }

      .ht-quick-query-clear {
        background: rgba(255, 255, 255, 0.14);
        border: none;
        color: #e0e7ff;
        font-size: 11px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: background 0.12s, color 0.12s;
      }

      .ht-quick-query-clear:hover {
        background: rgba(129, 140, 248, 0.35);
        color: #ffffff;
      }

      .ht-quick-meta-bar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 0 2px 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        margin-bottom: 6px;
      }

      .ht-quick-filter-toggle {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        color: #94a3b8;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        cursor: pointer;
        transition: background 0.12s, color 0.12s, border-color 0.12s;
      }

      .ht-quick-filter-toggle:hover,
      .ht-quick-filter-toggle.active {
        background: rgba(129, 140, 248, 0.18);
        color: #c7d2fe;
        border-color: rgba(129, 140, 248, 0.4);
      }

      .ht-quick-empty-warning {
        background: rgba(239, 68, 68, 0.16);
        border: 1px solid rgba(239, 68, 68, 0.35);
        color: #fca5a5;
        font-size: 11px;
        font-weight: 500;
        border-radius: 6px;
        padding: 5px 8px;
        margin-bottom: 6px;
        text-align: center;
        animation: htQuickShake 0.2s ease-in-out;
      }

      @keyframes htQuickShake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-3px); }
        75% { transform: translateX(3px); }
      }

      .ht-default-badge {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        color: #a5b4fc;
        background: rgba(129, 140, 248, 0.16);
        border: 1px solid rgba(129, 140, 248, 0.35);
        border-radius: 3px;
        padding: 0 4px;
        margin-left: auto;
        line-height: 14px;
      }

      .ht-quick-shortcuts-tip {
        font-size: 9.5px;
        color: #64748b;
        margin-right: auto;
        line-height: 18px;
        align-self: center;
      }
    `;
  }

  // Attach Selection Toolbar global events
  document.addEventListener('selectionchange', handleToolbarSelectionChange);

  window.addEventListener('mouseup', (e) => {
    if (isQuickSearchOpen) return;
    if (!isToolbarAllowed()) {
      if (isToolbarVisible) hideToolbar();
      return;
    }
    if (!isToolbarHovered && !isSubmenuHovered && !isSearchInputFocused) {
      scheduleToolbarDisplay(e);
    }
  }, { passive: true });

  window.addEventListener('scroll', () => {
    if (isQuickSearchOpen) return;
    if (!isToolbarAllowed()) {
      if (isToolbarVisible) hideToolbar();
      return;
    }
    if (isToolbarVisible && !isToolbarHovered && !isSubmenuHovered && !isSearchInputFocused) {
      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          hideToolbar();
        } else {
          updateToolbarPosition(rect);
        }
      } else {
        hideToolbar();
      }
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (isQuickSearchOpen) return;
    if (!isToolbarAllowed()) {
      if (isToolbarVisible) hideToolbar();
      return;
    }
    if (isToolbarVisible) {
      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        updateToolbarPosition(sel.getRangeAt(0).getBoundingClientRect());
      } else {
        hideToolbar();
      }
    }
  }, { passive: true });

  // Global outside-click listener for Quick Search
  document.addEventListener('mousedown', (e) => {
    if (!isQuickSearchOpen) return;
    if (toolbarHost && e.composedPath && e.composedPath().includes(toolbarHost)) {
      return;
    }
    closeQuickSearch();
  }, true);

  // Global Escape key listener for Quick Search
  document.addEventListener('keydown', (e) => {
    if (isQuickSearchOpen && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeQuickSearch();
    }
  }, true);

  // Initialize toolbar when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToolbarHost);
  } else {
    initToolbarHost();
  }

})();
