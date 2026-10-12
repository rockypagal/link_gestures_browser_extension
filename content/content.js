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

  // Shadow DOM host for visual feedback
  let hostElement = null;
  let shadowRoot = null;
  let indicatorEl = null;

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

  // Check modifier keys according to preference
  function checkModifier(e) {
    switch (config.requireModifier) {
      case 'alt':
        return e.altKey;
      case 'ctrl':
        return e.ctrlKey || e.metaKey;
      case 'shift':
        return e.shiftKey;
      case 'none':
      default:
        // By default, do NOT trigger if standard modifiers (Ctrl, Alt, Shift) are held
        // so browser native behaviors (like Ctrl+Click for foreground tab) remain accessible!
        return !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
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
      :host {
        all: initial;
        pointer-events: none;
      }
      .ht-indicator {
        position: fixed;
        width: 38px;
        height: 38px;
        transform: translate(-50%, -50%) scale(0.85);
        opacity: 0;
        pointer-events: none;
        z-index: 2147483647;
        transition: opacity 0.15s ease-out, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .ht-indicator.ht-active {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
      .ht-indicator.ht-success {
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
        fill: #FFFFFF;
        opacity: 0.9;
        transition: fill 0.15s, opacity 0.15s;
      }
      .ht-icon-check {
        fill: none;
        stroke: #FFFFFF;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
        opacity: 0;
        transform: scale(0.6);
        transform-origin: center;
        transition: opacity 0.15s, transform 0.15s;
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
    `;

    indicatorEl = document.createElement('div');
    indicatorEl.className = 'ht-indicator';
    indicatorEl.innerHTML = `
      <div class="ht-ripple"></div>
      <svg class="ht-svg-wrap" viewBox="0 0 36 36">
        <circle class="ht-bg-circle" cx="18" cy="18" r="16" />
        <circle class="ht-track" cx="18" cy="18" r="14" />
        <circle class="ht-progress" cx="18" cy="18" r="14" />
        <!-- Tab icon in center -->
        <g class="ht-icon-tab" transform="translate(11, 11) scale(0.58)">
          <path d="M4 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4zm2 4h12v2H6V6zm0 5h12v7H6v-7z" />
          <path d="M16 11l4-4m0 0h-3.5m3.5 0v3.5" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        </g>
        <!-- Success checkmark -->
        <g class="ht-icon-check" transform="translate(10, 10)">
          <path d="M4 8.5l3 3 6-6" />
        </g>
      </svg>
      <div class="ht-badge">New Tab</div>
    `;

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(indicatorEl);

    // Attach to DOM safely
    if (document.body) {
      document.body.appendChild(hostElement);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(hostElement);
      });
    }
  }

  // Show visual indicator and start animated fill
  function showIndicator(x, y, duration) {
    initShadowUi();
    if (!indicatorEl) return;

    indicatorEl.style.left = `${x}px`;
    indicatorEl.style.top = `${y}px`;
    indicatorEl.classList.remove('ht-success');

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

  // Trigger success state and fade out
  function triggerSuccess(callback) {
    if (!indicatorEl) return;

    indicatorEl.classList.add('ht-success');

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
    setTimeout(() => {
      if (!isHolding && indicatorEl) {
        indicatorEl.classList.remove('ht-success');
        const progressRing = indicatorEl.querySelector('.ht-progress');
        if (progressRing) {
          progressRing.style.transition = 'none';
          progressRing.style.strokeDashoffset = '87.96';
        }
      }
    }, 150);
  }

  // Perform background tab open via Service Worker
  function triggerOpenLink(url) {
    if (!url) return;

    hasTriggered = true;
    suppressClickUntil = performance.now() + 600;

    triggerSuccess(() => {
      // Completed animation
    });

    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          action: 'openLink',
          url: url,
          tabPosition: config.tabPosition,
          tabFocus: config.tabFocus
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

  // Cancel hold state
  function cancelHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    isHolding = false;
    isDraggingLink = false;
    dragTriggered = false;
    if (!hasTriggered) {
      hideIndicator();
    }
  }

  // Mouse Down Event Listener
  window.addEventListener('mousedown', (e) => {
    // Only respond to main button (left click)
    if (e.button !== 0) return;

    if (isCurrentSiteExcluded()) return;
    if (!checkModifier(e)) return;

    const linkInfo = findLink(e);
    if (!linkInfo) return;

    targetLinkUrl = linkInfo.url;
    targetElement = linkInfo.element;
    startX = e.clientX;
    startY = e.clientY;
    hasTriggered = false;
    isHolding = true;
    isDraggingLink = false;
    dragTriggered = false;

    // Check gesture mode
    if (config.gestureMode === 'hold' || config.gestureMode === 'both') {
      const duration = Math.max(150, config.holdDuration || 450);
      showIndicator(startX, startY, duration);

      holdTimer = setTimeout(() => {
        if (isHolding && !hasTriggered) {
          triggerOpenLink(targetLinkUrl);
        }
      }, duration);
    }
  }, true);

  // Mouse Move Event Listener (cancellation and drag detection)
  window.addEventListener('mousemove', (e) => {
    if (!isHolding && !isDraggingLink) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const distance = Math.hypot(dx, dy);

    // If hold gesture is active, cancel it if moved beyond tolerance (8px)
    if (isHolding && distance > 8) {
      // Hold is broken by movement
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      isHolding = false;
      hideIndicator();

      // Check if drag/flick gesture is enabled
      if ((config.gestureMode === 'drag' || config.gestureMode === 'both') && !hasTriggered) {
        isDraggingLink = true;
      }
    }

    // Check if dragging exceeds flick distance threshold
    if (isDraggingLink && !dragTriggered && distance >= (config.dragDistance || 35)) {
      dragTriggered = true;
      triggerOpenLink(targetLinkUrl);
    }
  }, true);

  // Mouse Up Event Listener
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;

    if (hasTriggered) {
      // Tab already scheduled/opened, just ensure click suppression flag is fresh
      suppressClickUntil = performance.now() + 500;
    }

    cancelHold();
  }, true);

  // Capture and prevent native click navigation if gesture was completed
  window.addEventListener('click', (e) => {
    if (performance.now() < suppressClickUntil || hasTriggered) {
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
    if (performance.now() < suppressClickUntil || hasTriggered) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }
  }, true);

  // Prevent default HTML5 drag-and-drop from interfering when gesture triggered
  window.addEventListener('dragstart', (e) => {
    if (isHolding || hasTriggered || isDraggingLink) {
      if (hasTriggered || (config.gestureMode === 'drag' || config.gestureMode === 'both')) {
        e.preventDefault();
      }
    }
  }, true);

  // Cancellation on window blur, context menu, or Escape key
  window.addEventListener('blur', cancelHold, true);
  window.addEventListener('contextmenu', cancelHold, true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelHold();
    }
  }, true);

})();
