// HoldTab - Content Script
// Handles mouse gesture detection, SVG radial indicator, cancellation, and background tab creation

(function () {
  'use strict';

  // Prevent double injection
  if (window.__HOLDTAB_INITIALIZED__) return;
  window.__HOLDTAB_INITIALIZED__ = true;

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
    tabCycleHud: true,       // On-screen visual HUD pill
    swipeDeviceMode: 'mouse', // 'mouse' | 'mousepad'
    closeTabOnDoubleRightClick: true, // Close tab on double right-click
    textSearchHold: true,    // Hold on selected text (Left: foreground search, Right: background search)
    textDoubleClickCopyCut: true, // Double left-click to copy, double right-click to cut on selected text
    inputDoubleClickPaste: true, // Double left-click in input field to paste clipboard text
    altDoubleClickFillSearch: true, // Alt + Double Left-Click to fill current site's search bar
    altHoldSearchSite: true, // Alt + Hold on text to search site (Left: Current Tab, Right: New Tab)
    excludedDomains: []
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
  let lastLeftClickWithAlt = false;
  let lastLeftClickIsInput = false;
  let lastLeftClickTargetInput = null;
  let lastRightClickSelectedText = '';
  let lastKnownSelectedText = '';
  let lastCopiedText = '';
  const DOUBLE_CLICK_INTERVAL = 380; // ms
  const DOUBLE_CLICK_MAX_DISTANCE = 35; // px

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
      if (chrome.runtime && chrome.runtime.id) {
        chrome.storage.sync.get(config, (stored) => {
          if (chrome.runtime.lastError) return;
          if (stored) {
            config = { ...config, ...stored };
          }
        });
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
            config[key] = change.newValue;
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
      });
    }
  } catch (e) {}

  // Check if current site is excluded
  function isCurrentSiteExcluded() {
    if (!config.enabled) return true;
    const currentHost = window.location.hostname.toLowerCase();
    if (!Array.isArray(config.excludedDomains)) return false;
    return config.excludedDomains.some((d) => {
      const domain = d.trim().toLowerCase();
      return domain && (currentHost === domain || currentHost.endsWith('.' + domain));
    });
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

  // Listen for text selection changes to preserve selected text even if a site clears selection on mousedown
  document.addEventListener('selectionchange', () => {
    try {
      const sel = window.getSelection ? window.getSelection().toString().trim() : '';
      if (sel) {
        lastKnownSelectedText = sel;
      }
    } catch (_) {}
  });

  // Get currently selected text on page or inside input/textarea
  function getSelectedText() {
    try {
      const sel = window.getSelection ? window.getSelection().toString().trim() : '';
      if (sel) {
        lastKnownSelectedText = sel;
        return sel;
      }

      const active = document.activeElement;
      if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|tel|email)$/i.test(active.type)))) {
        if (typeof active.selectionStart === 'number' && typeof active.selectionEnd === 'number' && active.selectionStart !== active.selectionEnd) {
          const inputSel = active.value.slice(active.selectionStart, active.selectionEnd).trim();
          if (inputSel) {
            lastKnownSelectedText = inputSel;
            return inputSel;
          }
        }
      }

      // Check shadow root selection if active element has shadowRoot
      if (active && active.shadowRoot && active.shadowRoot.getSelection) {
        const shadowSel = active.shadowRoot.getSelection().toString().trim();
        if (shadowSel) {
          lastKnownSelectedText = shadowSel;
          return shadowSel;
        }
      }
    } catch (_) {}
    return lastKnownSelectedText || '';
  }

  // Check if mouse event is on or near the current text selection
  function isSelectionTarget(e, selectedText) {
    if (!selectedText) return false;
    try {
      const active = document.activeElement;
      if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|tel|email)$/i.test(active.type)))) {
        if (typeof active.selectionStart === 'number' && typeof active.selectionEnd === 'number' && active.selectionStart !== active.selectionEnd) {
          if (e.target === active || (active.contains && active.contains(e.target))) {
            return true;
          }
        }
      }

      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        if (range.commonAncestorContainer && (range.commonAncestorContainer.contains(e.target) || e.target.contains(range.commonAncestorContainer))) {
          return true;
        }
        const rects = range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (e.clientX >= r.left - 18 && e.clientX <= r.right + 18 &&
              e.clientY >= r.top - 18 && e.clientY <= r.bottom + 18) {
            return true;
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

      /* Red shade theme (Right-Click Foreground Link / Open & Go) */
      .ht-indicator.ht-red .ht-svg-wrap {
        filter: drop-shadow(0 2px 10px rgba(239, 68, 68, 0.45));
      }
      .ht-indicator.ht-red .ht-bg-circle {
        fill: rgba(45, 10, 16, 0.9);
      }
      .ht-indicator.ht-red .ht-track {
        stroke: rgba(252, 165, 165, 0.28);
      }
      .ht-indicator.ht-red .ht-progress {
        stroke: #EF4444;
      }
      .ht-indicator.ht-red .ht-icon-arrow path {
        fill: #EF4444;
      }
      .ht-indicator.ht-red.ht-success .ht-progress {
        stroke: #F43F5E !important;
      }
      .ht-indicator.ht-red .ht-ripple {
        border-color: #EF4444;
      }
      .ht-indicator.ht-red .ht-badge {
        background: rgba(45, 10, 16, 0.95);
        border: 1px solid rgba(239, 68, 68, 0.45);
        color: #FFE4E6;
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

  // Helper to extract word under cursor position if no text was explicitly selected
  function getWordAtPoint(x, y) {
    try {
      let range = null;
      if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos && pos.offsetNode && pos.offsetNode.nodeType === Node.TEXT_NODE) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.setEnd(pos.offsetNode, pos.offset);
        }
      } else if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);
      }
      if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
        const text = range.startContainer.textContent;
        const offset = range.startOffset;
        let start = offset;
        while (start > 0 && /\S/.test(text[start - 1])) start--;
        let end = offset;
        while (end < text.length && /\S/.test(text[end])) end++;
        const word = text.slice(start, end).trim();
        return word;
      }
    } catch (_) {}
    return '';
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

  // Show visual indicator and start animated fill (with grace period delay to prevent flicker on normal clicks)
  function showIndicator(x, y, duration, badgeText = 'New Tab', variant = 'blue') {
    if (indicatorTimer) {
      clearTimeout(indicatorTimer);
      indicatorTimer = null;
    }

    // Delay visual ring appearance by a trackpad-calibrated grace period (up to 180ms)
    // Single clicks on desktop mice (50-90ms) and laptop trackpads (120-175ms) release before the ring ever mounts!
    const graceDelay = Math.min(180, Math.floor(duration * 0.4));

    indicatorTimer = setTimeout(() => {
      indicatorTimer = null;
      if (!isHolding && !isHoldingText) return;

      initShadowUi();
      if (!indicatorEl) return;

      indicatorEl.style.display = 'flex';
      indicatorEl.style.left = `${x}px`;
      indicatorEl.style.top = `${y}px`;
      indicatorEl.classList.remove('ht-success', 'ht-dragging', 'ht-red', 'ht-purple', 'ht-amber', 'ht-cyan', 'ht-teal', 'ht-blue', 'ht-searching');

      if (variant === 'red') {
        indicatorEl.classList.add('ht-red');
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
    }, graceDelay);
  }

  // Update dynamic flick/drag indicator tracking the cursor and angle
  function updateDragIndicator(clientX, clientY, dx, dy, distance, variant = 'blue') {
    if (indicatorTimer) {
      clearTimeout(indicatorTimer);
      indicatorTimer = null;
    }
    initShadowUi();
    if (!indicatorEl) return;

    indicatorEl.style.display = 'flex';
    indicatorEl.style.left = `${clientX}px`;
    indicatorEl.style.top = `${clientY}px`;
    indicatorEl.classList.remove('ht-success', 'ht-red', 'ht-purple', 'ht-amber', 'ht-blue', 'ht-searching');

    if (variant === 'red') {
      indicatorEl.classList.add('ht-red');
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
    if (!indicatorEl) return;

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
        indicatorEl.classList.remove('ht-success', 'ht-red', 'ht-purple', 'ht-amber', 'ht-cyan', 'ht-teal', 'ht-blue', 'ht-searching');
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
    if (isCurrentSiteExcluded()) return;

    // Handle right-click
    if (e.button === 2) {
      // Rocker Gesture: Left button is physically held down + Right button clicked -> Next Tab
      if (config.enabled && config.tabCycleRocker && (e.buttons & 1) !== 0) {
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
      if (config.enabled && config.textDoubleClickCopyCut !== false && !isMultiClick && timeDiff > 40 && timeDiff < DOUBLE_CLICK_INTERVAL && dist < DOUBLE_CLICK_MAX_DISTANCE && lastRightClickSelectedText) {
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
      if (config.enabled && config.closeTabOnDoubleRightClick && timeDiff > 40 && timeDiff < DOUBLE_RIGHT_CLICK_INTERVAL && dist < DOUBLE_RIGHT_CLICK_MAX_DISTANCE) {
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
      const altRightSearchQuery = selectedText || lastRightClickSelectedText || lastKnownSelectedText || getWordAtPoint(e.clientX, e.clientY);
      if (config.enabled && config.altHoldSearchSite !== false && isAltPressed(e) && altRightSearchQuery) {
        cancelHold();
        isHoldingText = true;
        textSearchType = 'site-new-tab';
        textSearchQuery = altRightSearchQuery;
        hasTriggered = false;
        rightHoldSearchTriggered = true;
        altGestureTriggered = true;
        suppressContextMenuUntil = performance.now() + 1800;
        const duration = Math.max(150, config.holdDuration || 450);
        showIndicator(rightStartX, rightStartY, duration, 'Search Site (New Tab)', 'teal');

        textSearchTimer = setTimeout(() => {
          if (isHoldingText && !hasTriggered) {
            triggerSiteSearch('new-tab', textSearchQuery);
          }
        }, duration);
        return;
      }

      // 1b. Text Search Hold (Right Click): Open new foreground tab, move to it (Active Search - Purple)
      if (config.enabled && config.textSearchHold !== false && !isAltPressed(e) && selectedText && (!linkInfo || isSelectionTarget(e, selectedText))) {
        cancelHold();
        isHoldingText = true;
        textSearchType = 'foreground';
        textSearchQuery = selectedText;
        hasTriggered = false;
        rightHoldSearchTriggered = true;
        suppressContextMenuUntil = performance.now() + 1800;
        const duration = Math.max(150, config.holdDuration || 450);
        showIndicator(rightStartX, rightStartY, duration, 'Active Search', 'purple');

        textSearchTimer = setTimeout(() => {
          if (isHoldingText && !hasTriggered) {
            triggerSearchText('foreground', textSearchQuery, true);
          }
        }, duration);
        return;
      }

      // 2. Link Hold (Right Click): Open link in a new tab and move to that tab (Red circle UI)
      if (config.enabled && linkInfo && checkModifier(e)) {
        cancelHold();
        targetLinkUrl = linkInfo.url;
        targetElement = linkInfo.element;
        isHolding = true;
        isRightLinkHold = true;
        isDraggingLink = false;
        hasTriggered = false;
        rightHoldSearchTriggered = false;
        const duration = Math.max(150, config.holdDuration || 450);
        showIndicator(rightStartX, rightStartY, duration, 'Open & Go', 'red');

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
      if (config.enabled && config.tabCycleRocker && (e.buttons & 2) !== 0) {
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

      // Double Left-Click:
      if (!isMultiClick && leftTimeDiff > 40 && leftTimeDiff < DOUBLE_CLICK_INTERVAL && leftDist < DOUBLE_CLICK_MAX_DISTANCE) {
        // 1. Alt + Double Left-Click -> FILL CURRENT SITE'S SEARCH BAR with selected text
        const isAlt = isAltPressed(e) || lastLeftClickWithAlt;
        if (isAlt && config.enabled && config.altDoubleClickFillSearch !== false) {
          const textToFill = selectedText || lastLeftClickSelectedText || getWordAtPoint(e.clientX, e.clientY);
          if (textToFill) {
            cancelHold();
            lastLeftClickTime = 0;
            lastLeftClickSelectedText = '';
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

        // 2. Double Left-Click on Pre-existing Selected Text -> COPY text
        // (Requires text was already selected on Click 1 to preserve native double-click word selection and triple-click select-all)
        if (config.enabled && config.textDoubleClickCopyCut !== false && lastLeftClickSelectedText) {
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

          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // 3. Double Left-Click with cursor in Input Field -> PASTE text
        // (Allows pasting at boundaries or between words with smart spacing; inside words preserves native selection)
        if (config.enabled && config.inputDoubleClickPaste !== false && (targetIsInput || lastLeftClickIsInput)) {
          const inputToPaste = targetInputElement || lastLeftClickTargetInput;
          const isBetweenText = isCursorInOrBetweenText(inputToPaste);

          if (!isBetweenText) {
            cancelHold();
            lastLeftClickTime = 0;
            lastLeftClickSelectedText = '';
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
        lastLeftClickIsInput = false;
        lastLeftClickTargetInput = null;
      } else {
        lastLeftClickSelectedText = '';
        lastLeftClickIsInput = Boolean(targetIsInput);
        lastLeftClickTargetInput = targetInputElement;
      }

      isLeftMouseDown = true;
      isRightMouseDown = (e.buttons & 2) !== 0;

      // 1. Alt + Left Hold on Selected Text: Search current site in Current Tab (Cyan ring)
      const altLeftSearchQuery = selectedText || lastLeftClickSelectedText || lastKnownSelectedText || getWordAtPoint(e.clientX, e.clientY);
      if (config.enabled && config.altHoldSearchSite !== false && isAltPressed(e) && altLeftSearchQuery) {
        cancelHold();
        startX = e.clientX;
        startY = e.clientY;
        isHoldingText = true;
        textSearchType = 'current-site';
        textSearchQuery = altLeftSearchQuery;
        hasTriggered = false;
        altGestureTriggered = true;
        const duration = Math.max(150, config.holdDuration || 450);
        showIndicator(startX, startY, duration, 'Search Site', 'cyan');

        textSearchTimer = setTimeout(() => {
          if (isHoldingText && !hasTriggered) {
            triggerSiteSearch('current-tab', textSearchQuery);
          }
        }, duration);
        return;
      }

      // 2. Text Search Hold (Left Click): Open new background tab and search selected text (Search in BG - Amber)
      if (config.enabled && config.textSearchHold !== false && selectedText && (!linkInfo || isTargetingText) && !isAltPressed(e)) {
        cancelHold();
        startX = e.clientX;
        startY = e.clientY;
        isHoldingText = true;
        textSearchType = 'background';
        textSearchQuery = selectedText;
        hasTriggered = false;
        const duration = Math.max(150, config.holdDuration || 450);
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
    if (isRightMouseDown && (e.buttons & 2) !== 0 && config.enabled && config.tabCycleSwipe && !rightSwipeTriggered && !isCurrentSiteExcluded()) {
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

    if (!config.enabled || isCurrentSiteExcluded()) return;

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

    // Secondary check for double right-click close tab (only when not targeting selected text)
    const timeDiff = now - lastContextMenuTime;
    const dist = Math.hypot(e.clientX - lastContextMenuX, e.clientY - lastContextMenuY);
    const selectedText = getSelectedText();
    const isTextTarget = Boolean(selectedText && isSelectionTarget(e, selectedText));

    if (config.enabled && !isTextTarget && config.closeTabOnDoubleRightClick && !isCurrentSiteExcluded() &&
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
    if (e.key === 'Escape') {
      cancelHold();
    }
  }, true);

  // Suppress Windows Alt-key menu bar activation when Alt (Left or Right / AltGr) was used for tab cycling
  window.addEventListener('keyup', (e) => {
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

})();
