/**
 * HoldTab - Centralized Site Status & Feature Registry Module
 * Shared status calculation, domain normalization, and icon mapping.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    if (typeof self !== 'undefined') {
      Object.assign(self, exports);
    }
    if (typeof window !== 'undefined') {
      Object.assign(window, exports);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Core feature registry with stable IDs and descriptions
  const FEATURES = [
    {
      id: 'toolbar',
      label: 'Floating Selection Toolbar',
      desc: 'Contextual toolbar with search engines when highlighting text'
    },
    {
      id: 'linkHold',
      label: 'Link Hold Gestures',
      desc: 'Hold on links to open them in background or foreground tabs'
    },
    {
      id: 'tabCycle',
      label: 'Tab Navigation Gestures',
      desc: 'Switch tabs using swipe, wheel, rocker, and Alt keybinds'
    },
    {
      id: 'textActions',
      label: 'Text & Clipboard Actions',
      desc: 'Double-click copy, cut, paste, and text search hold'
    }
  ];

  /**
   * Normalizes a URL or hostname into a clean lowercase domain (without www, protocol, path, port).
   * e.g. "https://www.Reddit.com:443/r/all" -> "reddit.com"
   */
  function normalizeDomain(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let domain = raw.trim().toLowerCase();

    // Remove protocol
    domain = domain.replace(/^[a-z0-9+.-]+:\/\//i, '');
    // Remove user/password
    domain = domain.replace(/^[^/@]+@/, '');
    // Remove path and query/hash
    domain = domain.replace(/[/?#].*$/, '');
    // Remove port
    domain = domain.split(':')[0];
    // Remove leading/trailing dots and www prefix
    domain = domain.replace(/^\.+|\.+$/g, '').replace(/^www\./, '');

    return domain;
  }

  /**
   * Checks if a URL is a browser-internal, restricted, or extension page where content scripts cannot run.
   */
  function isRestrictedUrl(url) {
    if (!url || typeof url !== 'string') return true;
    const lower = url.trim().toLowerCase();

    if (
      lower.startsWith('chrome://') ||
      lower.startsWith('brave://') ||
      lower.startsWith('edge://') ||
      lower.startsWith('opera://') ||
      lower.startsWith('vivaldi://') ||
      lower.startsWith('about:') ||
      lower.startsWith('devtools://') ||
      lower.startsWith('view-source:') ||
      lower.startsWith('data:') ||
      lower.startsWith('javascript:') ||
      lower.includes('chrome.google.com/webstore') ||
      lower.includes('chromewebstore.google.com') ||
      lower.includes('addons.mozilla.org')
    ) {
      return true;
    }

    // Allow extension test.html if extension ID matches
    if (lower.startsWith('chrome-extension://') || lower.startsWith('moz-extension://')) {
      if (!lower.includes('test.html')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if the given domain or URL is listed in settings.excludedDomains.
   */
  function isSiteExcluded(settings, domainOrUrl) {
    if (!settings || !Array.isArray(settings.excludedDomains)) return false;
    const targetDomain = normalizeDomain(domainOrUrl);
    if (!targetDomain) return false;

    return settings.excludedDomains.some((d) => {
      const excluded = normalizeDomain(d);
      if (!excluded) return false;
      return (
        targetDomain === excluded ||
        targetDomain.endsWith('.' + excluded) ||
        excluded.endsWith('.' + targetDomain)
      );
    });
  }

  /**
   * Retrieves the per-site feature overrides dictionary for a specific domain.
   */
  function getSiteOverrides(settings, domainOrUrl) {
    if (!settings || typeof settings.siteOverrides !== 'object' || !settings.siteOverrides) {
      return {};
    }
    const domain = normalizeDomain(domainOrUrl);
    if (!domain) return {};

    // Match exact domain or parent domain in overrides
    if (settings.siteOverrides[domain]) {
      return settings.siteOverrides[domain];
    }

    for (const [key, val] of Object.entries(settings.siteOverrides)) {
      const normKey = normalizeDomain(key);
      if (normKey && (domain === normKey || domain.endsWith('.' + normKey))) {
        return val || {};
      }
    }

    return {};
  }

  /**
   * Counts how many per-site features are explicitly set to true.
   */
  function countEnabledOverrides(overrides) {
    if (!overrides || typeof overrides !== 'object') return 0;
    let count = 0;
    for (const feat of FEATURES) {
      if (overrides[feat.id] === true) {
        count++;
      }
    }
    return count;
  }

  /**
   * Centralized Status Calculation Function
   * Computes the effective state ('active' | 'custom' | 'disabled') for a tab/website.
   *
   * Rules:
   * 1. Global master switch disabled (`enabled: false`) -> 'disabled'
   * 2. Browser-internal / restricted page -> 'disabled'
   * 3. Website is excluded:
   *    - If one or more feature overrides are explicitly enabled -> 'custom' (Orange)
   *    - Otherwise (no overrides or all overrides false) -> 'disabled' (Grey)
   * 4. Website is not excluded -> 'active' (Blue)
   */
  function calculateSiteStatus(settings, urlOrHostname) {
    const raw = typeof urlOrHostname === 'string' ? urlOrHostname.trim() : '';
    const domain = normalizeDomain(raw);
    const restricted = isRestrictedUrl(raw);

    // 1. Global Master Switch disabled
    if (!settings || settings.enabled === false) {
      return {
        status: 'disabled',
        icon: 'disabled',
        title: 'HoldTab — Disabled',
        reason: 'HoldTab is disabled globally.',
        siteExcluded: isSiteExcluded(settings, domain),
        hasOverrides: false,
        enabledOverridesCount: 0,
        domain,
        isRestricted: restricted,
        overrides: {}
      };
    }

    // 2. Restricted internal pages (chrome://, about:, webstore, etc.)
    if (restricted && !raw.includes('test.html')) {
      return {
        status: 'disabled',
        icon: 'disabled',
        title: 'HoldTab — Disabled',
        reason: 'HoldTab features do not run on internal browser pages.',
        siteExcluded: false,
        hasOverrides: false,
        enabledOverridesCount: 0,
        domain,
        isRestricted: true,
        overrides: {}
      };
    }

    // 3. Excluded Domains
    const excluded = isSiteExcluded(settings, domain);
    const overrides = getSiteOverrides(settings, domain);
    const enabledOverridesCount = countEnabledOverrides(overrides);

    if (excluded) {
      if (enabledOverridesCount > 0) {
        // Excluded by default, but has custom per-site feature overrides enabled
        return {
          status: 'custom',
          icon: 'custom',
          title: 'HoldTab — Custom',
          reason: 'Using custom settings for this website.',
          siteExcluded: true,
          hasOverrides: true,
          enabledOverridesCount,
          domain,
          isRestricted: false,
          overrides
        };
      }

      // Excluded with no features enabled
      return {
        status: 'disabled',
        icon: 'disabled',
        title: 'HoldTab — Disabled',
        reason: 'HoldTab features are disabled on this website.',
        siteExcluded: true,
        hasOverrides: false,
        enabledOverridesCount: 0,
        domain,
        isRestricted: false,
        overrides
      };
    }

    // 4. Normal active site (not excluded)
    return {
      status: 'active',
      icon: 'active',
      title: 'HoldTab — Active',
      reason: 'Using your normal HoldTab settings.',
      siteExcluded: false,
      hasOverrides: false,
      enabledOverridesCount: 0,
      domain,
      isRestricted: false,
      overrides: {}
    };
  }

  /**
   * Returns icon dictionary paths for chrome.action.setIcon({ path: ... })
   */
  function getIconPaths(iconState) {
    if (iconState === 'custom') {
      return {
        16: 'icons/icon-custom-16.png',
        48: 'icons/icon-custom-48.png',
        128: 'icons/icon-custom-128.png'
      };
    }
    if (iconState === 'disabled') {
      return {
        16: 'icons/icon-disabled-16.png',
        48: 'icons/icon-disabled-48.png',
        128: 'icons/icon-disabled-128.png'
      };
    }
    return {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png'
    };
  }

  return {
    FEATURES,
    normalizeDomain,
    isRestrictedUrl,
    isSiteExcluded,
    getSiteOverrides,
    countEnabledOverrides,
    calculateSiteStatus,
    getIconPaths
  };
});
