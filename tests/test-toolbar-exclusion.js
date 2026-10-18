/**
 * Test Suite: Floating Toolbar Master Toggle, Toolbar Toggle, and Domain Exclusion Tests
 * Verifies that the toolbar is strictly suppressed when:
 * 1. The main extension master toggle is off (enabled: false)
 * 2. The toolbar toggle is off (toolbarEnabled: false)
 * 3. The toolbar mode is set to 'disabled' (toolbarMode: 'disabled')
 * 4. The current website or domain is excluded (excludedDomains)
 */

const assert = require('assert');

// Simulate isCurrentSiteExcluded implementation from content.js
function isCurrentSiteExcluded(config, hostname, href) {
  if (!config || !config.enabled) return true;
  let currentHost = (hostname || '').toLowerCase();
  if (!currentHost) {
    const currentHref = (href || '').toLowerCase();
    if (!Array.isArray(config.excludedDomains)) return false;
    return config.excludedDomains.some((d) => {
      const domain = (d || '').trim().toLowerCase();
      return domain && currentHref.includes(domain);
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

// Simulate isToolbarAllowed implementation from content.js
function isToolbarAllowed(config, hostname, href) {
  if (!config || config.enabled === false) return false;
  if (config.toolbarEnabled === false) return false;
  if (config.toolbarMode === 'disabled') return false;
  if (isCurrentSiteExcluded(config, hostname, href)) return false;
  return true;
}

console.log('--- Running Floating Toolbar Toggle & Domain Exclusion Tests ---');

// Test 1: Enabled by default when all toggles are on
{
  const config = { enabled: true, toolbarEnabled: true, toolbarMode: 'auto', excludedDomains: [] };
  assert.strictEqual(isToolbarAllowed(config, 'example.com'), true);
  console.log('  ✓ Test 1: Toolbar allowed when enabled with no exclusions');
}

// Test 2: Main toggle turned off (enabled: false)
{
  const config = { enabled: false, toolbarEnabled: true, toolbarMode: 'auto', excludedDomains: [] };
  assert.strictEqual(isToolbarAllowed(config, 'example.com'), false);
  console.log('  ✓ Test 2: Main master toggle off suppresses toolbar');
}

// Test 3: Toolbar toggle turned off (toolbarEnabled: false)
{
  const config = { enabled: true, toolbarEnabled: false, toolbarMode: 'auto', excludedDomains: [] };
  assert.strictEqual(isToolbarAllowed(config, 'example.com'), false);
  console.log('  ✓ Test 3: Selection toolbar toggle off suppresses toolbar');
}

// Test 4: Toolbar mode set to 'disabled'
{
  const config = { enabled: true, toolbarEnabled: true, toolbarMode: 'disabled', excludedDomains: [] };
  assert.strictEqual(isToolbarAllowed(config, 'example.com'), false);
  console.log('  ✓ Test 4: Toolbar mode disabled suppresses toolbar');
}

// Test 5: Domain exclusion with exact match
{
  const config = { enabled: true, toolbarEnabled: true, toolbarMode: 'auto', excludedDomains: ['reddit.com'] };
  assert.strictEqual(isCurrentSiteExcluded(config, 'reddit.com'), true);
  assert.strictEqual(isToolbarAllowed(config, 'reddit.com'), false);
  console.log('  ✓ Test 5: Exact domain exclusion suppresses toolbar');
}

// Test 6: Domain exclusion when current host has 'www.' and excluded has none
{
  const config = { enabled: true, toolbarEnabled: true, toolbarMode: 'auto', excludedDomains: ['reddit.com'] };
  assert.strictEqual(isCurrentSiteExcluded(config, 'www.reddit.com'), true);
  assert.strictEqual(isToolbarAllowed(config, 'www.reddit.com'), false);
  console.log('  ✓ Test 6: Exclusion without www matches site with www');
}

// Test 7: Domain exclusion when excluded has 'www.' and current host has none
{
  const config = { enabled: true, toolbarEnabled: true, toolbarMode: 'auto', excludedDomains: ['www.youtube.com'] };
  assert.strictEqual(isCurrentSiteExcluded(config, 'youtube.com'), true);
  assert.strictEqual(isToolbarAllowed(config, 'youtube.com'), false);
  console.log('  ✓ Test 7: Exclusion with www matches site without www');
}

// Test 8: Subdomain exclusion match
{
  const config = { enabled: true, toolbarEnabled: true, toolbarMode: 'auto', excludedDomains: ['github.com'] };
  assert.strictEqual(isCurrentSiteExcluded(config, 'gist.github.com'), true);
  assert.strictEqual(isToolbarAllowed(config, 'gist.github.com'), false);
  console.log('  ✓ Test 8: Parent domain exclusion matches subdomain');
}

// Test 9: Domain entered with protocol or trailing slash in excludedDomains
{
  const config = { enabled: true, toolbarEnabled: true, toolbarMode: 'auto', excludedDomains: ['https://steamdb.info/'] };
  assert.strictEqual(isCurrentSiteExcluded(config, 'steamdb.info'), true);
  assert.strictEqual(isToolbarAllowed(config, 'steamdb.info'), false);
  console.log('  ✓ Test 9: Exclusion with URL protocol and slash handled gracefully');
}

// Test 10: Non-excluded domain on an excluded list still works
{
  const config = { enabled: true, toolbarEnabled: true, toolbarMode: 'auto', excludedDomains: ['reddit.com', 'youtube.com'] };
  assert.strictEqual(isCurrentSiteExcluded(config, 'wikipedia.org'), false);
  assert.strictEqual(isToolbarAllowed(config, 'wikipedia.org'), true);
  console.log('  ✓ Test 10: Non-excluded domains remain fully functional');
}

// Test 11: File URL or empty hostname matching via href
{
  const config = { enabled: true, toolbarEnabled: true, toolbarMode: 'auto', excludedDomains: ['test.html'] };
  assert.strictEqual(isCurrentSiteExcluded(config, '', 'file:///C:/test.html'), true);
  assert.strictEqual(isToolbarAllowed(config, '', 'file:///C:/test.html'), false);
  console.log('  ✓ Test 11: File URL exclusion matched via href');
}

// Test 12: Both main toggle and toolbar toggle off
{
  const config = { enabled: false, toolbarEnabled: false, toolbarMode: 'auto', excludedDomains: ['reddit.com'] };
  assert.strictEqual(isToolbarAllowed(config, 'reddit.com'), false);
  assert.strictEqual(isToolbarAllowed(config, 'google.com'), false);
  console.log('  ✓ Test 12: Multiple disabled toggles reliably suppress toolbar');
}

console.log('\nResults: 12 / 12 tests passed.');
console.log('🎉 ALL TOOLBAR EXCLUSION & TOGGLE TESTS PASSED SUCCESSFULLY!');
