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

    indicatorEl.style.display = 'flex';
    indicatorEl.style.left = `${x}px`;
    indicatorEl.style.top = `${y}px`;
    indicatorEl.classList.remove('ht-success');
    indicatorEl.classList.remove('ht-dragging');

    const badge = indicatorEl.querySelector('.ht-badge');
    if (badge) badge.textContent = 'New Tab';

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
  function updateDragIndicator(clientX, clientY, dx, dy, distance) {
    initShadowUi();
    if (!indicatorEl) return;

    indicatorEl.style.display = 'flex';
    indicatorEl.style.left = `${clientX}px`;
    indicatorEl.style.top = `${clientY}px`;
    indicatorEl.classList.remove('ht-success');
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
  function triggerSuccess(callback) {
    if (!indicatorEl) return;

    indicatorEl.classList.remove('ht-dragging');
    indicatorEl.classList.add('ht-success');

    const badge = indicatorEl.querySelector('.ht-badge');
    if (badge) {
      badge.textContent = 'New Tab Opened';
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
      if (!isHolding && !isDraggingLink && indicatorEl) {
        indicatorEl.classList.remove('ht-success');
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
    if (indicatorEl) {
      indicatorEl.classList.remove('ht-dragging');
    }
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

    if (config.gestureMode === 'drag') {
      isHolding = false;
      isDraggingLink = true;
    } else if (config.gestureMode === 'both') {
      isHolding = true;
      isDraggingLink = false;
      const duration = Math.max(150, config.holdDuration || 450);
      showIndicator(startX, startY, duration);

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
      showIndicator(startX, startY, duration);

      holdTimer = setTimeout(() => {
        if (isHolding && !hasTriggered) {
          triggerOpenLink(targetLinkUrl);
        }
      }, duration);
    }
  }, true);

  // Mouse Move Event Listener (live drag tracking and hold cancellation)
  window.addEventListener('mousemove', (e) => {
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

      // In 'both' mode, seamlessly transition to flick/drag mode
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
    if (e.button !== 0) return;

    if (hasTriggered) {
      suppressClickUntil = performance.now() + 450;
      // Auto-clear hasTriggered in case the browser never fires a native click event
      setTimeout(() => {
        hasTriggered = false;
        suppressClickUntil = 0;
      }, 500);
    }

    cancelHold();
  }, true);

  // Capture and prevent native click navigation if gesture was completed
  window.addEventListener('click', (e) => {
    if (hasTriggered || performance.now() < suppressClickUntil) {
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
    if (hasTriggered || performance.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      hasTriggered = false;
      suppressClickUntil = 0;
      return false;
    }
  }, true);

  // Prevent default HTML5 drag-and-drop from interfering when gesture triggered
  window.addEventListener('dragstart', (e) => {
    if (isHolding || hasTriggered || isDraggingLink) {
      e.preventDefault();
    }
  }, true);

  // Cancellation on window blur, context menu, or Escape key
  // IMPORTANT: Do NOT use capture phase for blur, and verify e.target is window/document.
  // Using capture phase causes page elements losing focus (e.g. previous link blurring) to cancel the hold!
  window.addEventListener('blur', (e) => {
    if (e.target === window || e.target === document) {
      cancelHold();
    }
  }, false);

  window.addEventListener('contextmenu', cancelHold, true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelHold();
    }
  }, true);

})();
