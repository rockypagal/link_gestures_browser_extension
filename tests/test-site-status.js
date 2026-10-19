/**
 * HoldTab - Comprehensive Site Status & Dynamic Icon Test Suite
 * Tests 14 distinct scenarios for status calculation, icon mapping, and overrides.
 */

const assert = require('assert');
const {
  FEATURES,
  normalizeDomain,
  isRestrictedUrl,
  isSiteExcluded,
  getSiteOverrides,
  countEnabledOverrides,
  calculateSiteStatus,
  getIconPaths
} = require('../utils/site-status.js');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n--- Running Site Status & Icon Unit Tests ---');

// 1. Normal website with default settings
runTest('Scenario 1: Normal website with default settings -> active (blue)', () => {
  const settings = {
    enabled: true,
    excludedDomains: ['example.com'],
    siteOverrides: {}
  };
  const res = calculateSiteStatus(settings, 'https://github.com/trending');
  assert.strictEqual(res.status, 'active');
  assert.strictEqual(res.icon, 'active');
  assert.strictEqual(res.siteExcluded, false);
  assert.strictEqual(res.hasOverrides, false);
  assert.strictEqual(res.title, 'HoldTab — Active');

  const icons = getIconPaths(res.icon);
  assert.strictEqual(icons[16], 'icons/icon-16.png');
  assert.strictEqual(icons[48], 'icons/icon-48.png');
  assert.strictEqual(icons[128], 'icons/icon-128.png');
});

// 2. Normal website with global features enabled
runTest('Scenario 2: Normal website with global features enabled -> active', () => {
  const settings = {
    enabled: true,
    tabCycleSwipe: true,
    toolbarEnabled: true,
    excludedDomains: [],
    siteOverrides: {}
  };
  const res = calculateSiteStatus(settings, 'wikipedia.org');
  assert.strictEqual(res.status, 'active');
  assert.strictEqual(res.icon, 'active');
});

// 3. Excluded website with NO per-site overrides
runTest('Scenario 3: Excluded website with NO overrides -> disabled (grey)', () => {
  const settings = {
    enabled: true,
    excludedDomains: ['reddit.com'],
    siteOverrides: {}
  };
  const res = calculateSiteStatus(settings, 'https://www.reddit.com/r/webdev');
  assert.strictEqual(res.status, 'disabled');
  assert.strictEqual(res.icon, 'disabled');
  assert.strictEqual(res.siteExcluded, true);
  assert.strictEqual(res.hasOverrides, false);
  assert.strictEqual(res.title, 'HoldTab — Disabled');

  const icons = getIconPaths(res.icon);
  assert.strictEqual(icons[16], 'icons/icon-disabled-16.png');
  assert.strictEqual(icons[48], 'icons/icon-disabled-48.png');
  assert.strictEqual(icons[128], 'icons/icon-disabled-128.png');
});

// 4. Excluded website with all overrides set to false
runTest('Scenario 4: Excluded website with all overrides set to false -> disabled', () => {
  const settings = {
    enabled: true,
    excludedDomains: ['reddit.com'],
    siteOverrides: {
      'reddit.com': {
        toolbar: false,
        linkHold: false,
        tabCycle: false,
        textActions: false
      }
    }
  };
  const res = calculateSiteStatus(settings, 'https://reddit.com');
  assert.strictEqual(res.status, 'disabled');
  assert.strictEqual(res.icon, 'disabled');
  assert.strictEqual(res.enabledOverridesCount, 0);
});

// 5. Excluded website with 1 override (toolbar: true) -> custom (orange)
runTest('Scenario 5: Excluded website with 1 override (toolbar: true) -> custom (orange)', () => {
  const settings = {
    enabled: true,
    excludedDomains: ['reddit.com'],
    siteOverrides: {
      'reddit.com': { toolbar: true, linkHold: false }
    }
  };
  const res = calculateSiteStatus(settings, 'https://www.reddit.com/r/technology');
  assert.strictEqual(res.status, 'custom');
  assert.strictEqual(res.icon, 'custom');
  assert.strictEqual(res.siteExcluded, true);
  assert.strictEqual(res.hasOverrides, true);
  assert.strictEqual(res.enabledOverridesCount, 1);
  assert.strictEqual(res.title, 'HoldTab — Custom');

  const icons = getIconPaths(res.icon);
  assert.strictEqual(icons[16], 'icons/icon-custom-16.png');
  assert.strictEqual(icons[48], 'icons/icon-custom-48.png');
  assert.strictEqual(icons[128], 'icons/icon-custom-128.png');
});

// 6. Excluded website with multiple overrides (toolbar + tabCycle) -> custom
runTest('Scenario 6: Excluded website with multiple overrides -> custom', () => {
  const settings = {
    enabled: true,
    excludedDomains: ['steampowered.com'],
    siteOverrides: {
      'steampowered.com': { toolbar: true, tabCycle: true }
    }
  };
  const res = calculateSiteStatus(settings, 'store.steampowered.com/app/1091500');
  assert.strictEqual(res.status, 'custom');
  assert.strictEqual(res.icon, 'custom');
  assert.strictEqual(res.enabledOverridesCount, 2);
});

// 7. Excluded website with ALL overrides set to true -> custom (still custom because domain is excluded)
runTest('Scenario 7: Excluded website with ALL overrides set to true -> custom', () => {
  const settings = {
    enabled: true,
    excludedDomains: ['example.org'],
    siteOverrides: {
      'example.org': {
        toolbar: true,
        linkHold: true,
        tabCycle: true,
        textActions: true
      }
    }
  };
  const res = calculateSiteStatus(settings, 'https://example.org/');
  assert.strictEqual(res.status, 'custom');
  assert.strictEqual(res.icon, 'custom');
  assert.strictEqual(res.enabledOverridesCount, 4);
});

// 8. Global master switch disabled on normal site -> disabled
runTest('Scenario 8: Global master switch disabled on normal site -> disabled', () => {
  const settings = {
    enabled: false,
    excludedDomains: [],
    siteOverrides: {}
  };
  const res = calculateSiteStatus(settings, 'https://wikipedia.org');
  assert.strictEqual(res.status, 'disabled');
  assert.strictEqual(res.icon, 'disabled');
  assert.strictEqual(res.reason, 'HoldTab is disabled globally.');
});

// 9. Global master switch disabled on excluded site -> disabled
runTest('Scenario 9: Global master switch disabled on excluded site -> disabled', () => {
  const settings = {
    enabled: false,
    excludedDomains: ['wikipedia.org'],
    siteOverrides: {}
  };
  const res = calculateSiteStatus(settings, 'https://wikipedia.org');
  assert.strictEqual(res.status, 'disabled');
  assert.strictEqual(res.icon, 'disabled');
});

// 10. Global master switch disabled on site with overrides -> disabled (master switch always wins)
runTest('Scenario 10: Global master switch disabled on site with overrides -> disabled', () => {
  const settings = {
    enabled: false,
    excludedDomains: ['reddit.com'],
    siteOverrides: {
      'reddit.com': { toolbar: true, linkHold: true }
    }
  };
  const res = calculateSiteStatus(settings, 'https://reddit.com');
  assert.strictEqual(res.status, 'disabled');
  assert.strictEqual(res.icon, 'disabled');
});

// 11. Browser-internal pages -> disabled
runTest('Scenario 11: Browser-internal pages (chrome://, about:, etc.) -> disabled', () => {
  const settings = { enabled: true, excludedDomains: [], siteOverrides: {} };
  assert.strictEqual(calculateSiteStatus(settings, 'chrome://extensions').status, 'disabled');
  assert.strictEqual(calculateSiteStatus(settings, 'chrome://settings').icon, 'disabled');
  assert.strictEqual(calculateSiteStatus(settings, 'about:blank').status, 'disabled');
  assert.strictEqual(calculateSiteStatus(settings, 'about:config').icon, 'disabled');
  assert.strictEqual(calculateSiteStatus(settings, 'edge://settings').status, 'disabled');
  assert.strictEqual(calculateSiteStatus(settings, 'brave://rewards').status, 'disabled');
  assert.strictEqual(calculateSiteStatus(settings, 'devtools://devtools/bundled/inspector.html').status, 'disabled');
});

// 12. Restricted store pages -> disabled
runTest('Scenario 12: Restricted store pages (Webstore, AMO) -> disabled', () => {
  const settings = { enabled: true, excludedDomains: [], siteOverrides: {} };
  assert.strictEqual(calculateSiteStatus(settings, 'https://chromewebstore.google.com/detail/123').status, 'disabled');
  assert.strictEqual(calculateSiteStatus(settings, 'https://addons.mozilla.org/en-US/firefox/').status, 'disabled');
});

// 13. Subdomain matching
runTest('Scenario 13: Subdomain matching works correctly for exclusion and overrides', () => {
  const settings = {
    enabled: true,
    excludedDomains: ['cnn.com'],
    siteOverrides: {
      'cnn.com': { toolbar: true }
    }
  };
  const res = calculateSiteStatus(settings, 'https://edition.cnn.com/world');
  assert.strictEqual(res.siteExcluded, true);
  assert.strictEqual(res.status, 'custom');
  assert.strictEqual(res.icon, 'custom');
});

// 14. Domain Normalization
runTest('Scenario 14: Domain normalization handles various URL formats', () => {
  assert.strictEqual(normalizeDomain('https://www.Reddit.com:443/r/all?sort=top#hash'), 'reddit.com');
  assert.strictEqual(normalizeDomain('http://sub.domain.co.uk/path'), 'sub.domain.co.uk');
  assert.strictEqual(normalizeDomain('www.google.com'), 'google.com');
  assert.strictEqual(normalizeDomain('user:pass@example.com:8080/path'), 'example.com');
  assert.strictEqual(normalizeDomain('   GITHUB.COM   '), 'github.com');
});

console.log(`\nSite Status Unit Tests: ${passedTests}/${totalTests} Passed\n`);
if (passedTests !== totalTests) {
  process.exit(1);
}
