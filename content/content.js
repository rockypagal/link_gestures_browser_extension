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
    excludedDomains: []
  };

  // State management
  let isHolding = false;
  let holdTimer = null;
  let hasTriggered = false;
  let startX = 0;
  let startY = 0;
  let targetLinkUrl = null;
  let targetElement = null;
  let suppressClickUntil = 0;
  let isDraggingLink = false;
  let dragTriggered = false;
  let isRightLinkHold = false;

  // Text selection double-click actions (Double Left-Click: Copy/Paste, Double Right-Click: Cut)
  let lastLeftClickTime = 0;
  let lastLeftClickX = 0;
  let lastLeftClickY = 0;
  let lastLeftClickSelectedText = '';
  let lastLeftClickIsInput = false;
  let lastLeftClickTargetInput = null;
  let lastRightClickSelectedText = '';
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
  const ALT_SCROLL_THRESHOLD = 32;  // px threshold for smooth step
  const ALT_REVERSE_THRESHOLD = 95; // px threshold to reverse direction within bounce window
  const ALT_SCROLL_COOLDOWN = 110;  // ms minimum cooldown between steps

  // Double right-click close tab state
  let lastRightClickTime = 0;
  let lastRightClickX = 0;
  let lastRightClickY = 0;
  let lastContextMenuTime = 0;
  let lastContextMenuX = 0;
  let lastContextMenuY = 0;
  const DOUBLE_RIGHT_CLICK_INTERVAL = 380; // ms
  const DOUBLE_RIGHT_CLICK_MAX_DISTANCE = 35; // px

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

  // Get currently selected text on page or inside input/textarea
  function getSelectedText() {
    try {
      const sel = window.getSelection ? window.getSelection().toString().trim() : '';
      if (sel) return sel;

      const active = document.activeElement;
      if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|tel|email)$/i.test(active.type)))) {
        if (typeof active.selectionStart === 'number' && typeof active.selectionEnd === 'number' && active.selectionStart !== active.selectionEnd) {
          return active.value.slice(active.selectionStart, active.selectionEnd).trim();
        }
      }
    } catch (_) {}
    return '';
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
      .ht-icon-arrow {
        display: none;
        opacity: 0;
        transform-origin: 18px 18px;
        transition: opacity 0.1s ease;
      }
      .ht-dragging .ht-icon-tab {
        display: none !important;
      }
      .ht-dragging .ht-icon-arrow {
        display: block !important;
        opacity: 1 !important;
      }
      .ht-dragging .ht-badge {
        opacity: 1 !important;
      }
      .ht-success .ht-icon-arrow {
        display: none !important;
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
      .ht-success .ht-icon-tab {
        opacity: 0;
        display: none;
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
      /* Red shade theme for Right-Click visual indicator circle UI */
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

  // Show visual HUD for clipboard operations (Copy / Cut)
  function showClipboardHud(actionText, previewText = '') {
    initShadowUi();
    if (!hudEl) return;

    const arrowEl = hudEl.querySelector('.ht-hud-arrow');
    const titleEl = hudEl.querySelector('.ht-hud-title');
    const indexEl = hudEl.querySelector('.ht-hud-index');

    if (arrowEl) arrowEl.textContent = actionText.includes('Cut') ? '✂️' : '📋';
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

  // Paste text from clipboard into target input or contenteditable element
  async function performPaste(targetElement) {
    let textToPaste = '';
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        textToPaste = await navigator.clipboard.readText();
      }
    } catch (_) {}

    if (!textToPaste && lastCopiedText) {
      textToPaste = lastCopiedText;
    }

    const target = targetElement || document.activeElement;

    if (!textToPaste) {
      try {
        if (target && target.focus) target.focus();
        document.execCommand('paste');
        showClipboardHud('📋 Pasted');
        return true;
      } catch (_) {}
      return false;
    }

    if (!target) return false;
    if (target.focus) target.focus();

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      const start = typeof target.selectionStart === 'number' ? target.selectionStart : target.value.length;
      const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : target.value.length;
      target.setRangeText(textToPaste, start, end, 'end');
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      showClipboardHud('📋 Pasted', textToPaste);
      return true;
    }

    const editableEl = target.isContentEditable ? target : (target.closest && target.closest('[contenteditable="true"], [contenteditable=""]'));
    if (editableEl) {
      document.execCommand('insertText', false, textToPaste);
      showClipboardHud('📋 Pasted', textToPaste);
      return true;
    }

    return false;
  }

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

  // Show visual indicator and start animated fill
  function showIndicator(x, y, duration, badgeText = 'New Tab', variant = 'blue') {
    initShadowUi();
    if (!indicatorEl) return;

    indicatorEl.style.display = 'flex';
    indicatorEl.style.left = `${x}px`;
    indicatorEl.style.top = `${y}px`;
    indicatorEl.classList.remove('ht-success');
    indicatorEl.classList.remove('ht-dragging');
    indicatorEl.classList.toggle('ht-red', variant === 'red');

    const badge = indicatorEl.querySelector('.ht-badge');
    if (badge) badge.textContent = badgeText;

    const progressRing = indicatorEl.querySelector('.ht-progress');
    const circumference = 87.96; // 2 * PI * 14

    // Reset progress to empty
    progressRing.style.transition = 'none';
    progressRing.style.strokeDashoffset = `${circumference}`;

    // Force layout reflow
    void progressRing.getBoundingClientRect();

    // Start fill transition matching configured duration
    progressRing.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.2, 0, 0, 1)`;
    progressRing.style.strokeDashoffset = '0';

    indicatorEl.classList.add('ht-active');
  }

  // Update dynamic flick/drag indicator tracking the cursor and angle
  function updateDragIndicator(clientX, clientY, dx, dy, distance, variant = 'blue') {
    initShadowUi();
    if (!indicatorEl) return;

    indicatorEl.style.display = 'flex';
    indicatorEl.style.left = `${clientX}px`;
    indicatorEl.style.top = `${clientY}px`;
    indicatorEl.classList.remove('ht-success');
    indicatorEl.classList.toggle('ht-red', variant === 'red');
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
    if (!indicatorEl) return;
    indicatorEl.classList.remove('ht-active');
    indicatorEl.classList.remove('ht-dragging');
    setTimeout(() => {
      if (!isHolding && !isHoldingText && !isDraggingLink && indicatorEl) {
        indicatorEl.classList.remove('ht-success');
        indicatorEl.classList.remove('ht-red');
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
  function triggerSearchText(type, query) {
    if (!query) return;

    hasTriggered = true;
    if (type === 'background') {
      rightHoldSearchTriggered = true;
      suppressContextMenuUntil = performance.now() + 1800;
    } else {
      suppressClickUntil = performance.now() + 800;
    }

    const badgeSuccess = type === 'background' ? 'Searched in BG' : 'Searching...';
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

      // 1. Double Right-Click on Selected Text -> CUT text
      if (config.enabled && config.textDoubleClickCopyCut !== false && timeDiff > 40 && timeDiff < DOUBLE_CLICK_INTERVAL && dist < DOUBLE_CLICK_MAX_DISTANCE && (isTargetingText || lastRightClickSelectedText)) {
        const textToCut = selectedText || lastRightClickSelectedText;
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
        suppressContextMenuUntil = now + 1500;

        if (config.tabCycleHud) {
          showCloseTabHud();
        }

        try {
          if (chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({ action: 'closeTab' });
          }
        } catch (_) {}
        return;
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

      // 1. Text Search Hold (Right Click): Open new background tab and search selected text (Red circle UI)
      if (config.enabled && config.textSearchHold !== false && selectedText && (!linkInfo || isSelectionTarget(e, selectedText))) {
        cancelHold();
        isHoldingText = true;
        textSearchType = 'background';
        textSearchQuery = selectedText;
        hasTriggered = false;
        rightHoldSearchTriggered = false;
        const duration = Math.max(150, config.holdDuration || 450);
        showIndicator(rightStartX, rightStartY, duration, 'Search (BG)', 'red');

        textSearchTimer = setTimeout(() => {
          if (isHoldingText && !hasTriggered) {
            triggerSearchText('background', textSearchQuery);
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

      // Double Left-Click:
      if (leftTimeDiff > 40 && leftTimeDiff < DOUBLE_CLICK_INTERVAL && leftDist < DOUBLE_CLICK_MAX_DISTANCE) {
        // 1. Double Left-Click on Selected Text -> COPY text
        if (config.enabled && config.textDoubleClickCopyCut !== false && (isTargetingText || lastLeftClickSelectedText)) {
          const textToCopy = selectedText || lastLeftClickSelectedText;
          cancelHold();
          lastLeftClickTime = 0;
          lastLeftClickSelectedText = '';
          lastLeftClickIsInput = false;
          lastLeftClickTargetInput = null;
          suppressClickUntil = now + 600;

          performCopy(textToCopy);
          showClipboardHud('📋 Copied', textToCopy);

          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // 2. Double Left-Click with cursor in Input Field -> PASTE text
        if (config.enabled && config.inputDoubleClickPaste !== false && (targetIsInput || lastLeftClickIsInput)) {
          const inputToPaste = targetInputElement || lastLeftClickTargetInput;
          cancelHold();
          lastLeftClickTime = 0;
          lastLeftClickSelectedText = '';
          lastLeftClickIsInput = false;
          lastLeftClickTargetInput = null;
          suppressClickUntil = now + 600;

          performPaste(inputToPaste);

          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      lastLeftClickTime = now;
      lastLeftClickX = e.clientX;
      lastLeftClickY = e.clientY;

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

      // Text Search Hold (Left Click): Open new tab, move to it (active/foreground) and search selected text
      if (config.enabled && config.textSearchHold !== false && selectedText && (!linkInfo || isTargetingText)) {
        cancelHold();
        startX = e.clientX;
        startY = e.clientY;
        isHoldingText = true;
        textSearchType = 'foreground';
        textSearchQuery = selectedText;
        hasTriggered = false;
        const duration = Math.max(150, config.holdDuration || 450);
        showIndicator(startX, startY, duration, 'Search Tab', 'blue');

        textSearchTimer = setTimeout(() => {
          if (isHoldingText && !hasTriggered) {
            triggerSearchText('foreground', textSearchQuery);
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

    // Cancel text search hold if mouse moved > 8px
    if (isHoldingText) {
      const textDist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (textDist > 8) {
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
      if (tabCycleDidExecute || rightSwipeTriggered) {
        suppressContextMenuUntil = performance.now() + 1000;
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

      // Reset session state if user paused scrolling for > 380ms
      if (now - lastAltScrollTime > 380) {
        altScrollAccumulator = 0;
        altLockedAxis = null;
        lastAltDirection = null;
      }

      // Lock onto primary scroll axis (horizontal vs vertical) so diagonal trackpad swipes
      // never flip sign mid-gesture when crossing between deltaX and deltaY dominance
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      if (!altLockedAxis) {
        if (absX === 0 && absY === 0) return;
        altLockedAxis = absX >= absY ? 'x' : 'y';
      } else if (altLockedAxis === 'x' && absX < 1 && absY > 18) {
        altLockedAxis = 'y';
        altScrollAccumulator = 0;
      } else if (altLockedAxis === 'y' && absY < 1 && absX > 18) {
        altLockedAxis = 'x';
        altScrollAccumulator = 0;
      }

      let rawDelta = 0;
      if (altLockedAxis === 'x') {
        rawDelta = config.swipeDeviceMode === 'mousepad' ? e.deltaX : -e.deltaX;
      } else {
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

      // Require higher threshold when reversing direction within 450ms to filter out
      // trackpad finger-lift bounce / return-stroke micro-deltas
      const requiredThreshold = isReversing ? ALT_REVERSE_THRESHOLD : ALT_SCROLL_THRESHOLD;

      if (Math.abs(altScrollAccumulator) >= requiredThreshold && (now - lastAltScrollTime >= ALT_SCROLL_COOLDOWN)) {
        altScrollAccumulator = 0;
        lastAltScrollTime = now;
        lastAltDirection = candidateDirection;
        tabCycleDidExecute = true;
        sendCycleTabMessage(candidateDirection, {
          viaAlt: true,
          isScrollGesture: true,
          intentionalReverse: isReversing,
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

  // Prevent default HTML5 drag-and-drop from interfering when gesture triggered or holding
  window.addEventListener('dragstart', (e) => {
    if (isHolding || isHoldingText || hasTriggered || isDraggingLink) {
      e.preventDefault();
    }
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
    if (rockerTriggered || rightHoldSearchTriggered || now < suppressContextMenuUntil || tabCycleDidExecute || rightSwipeTriggered) {
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
