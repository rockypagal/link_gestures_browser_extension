/**
 * Test Suite: Floating Toolbar Submenu Website Search & Filter
 * Tests filtering, highlighting, empty states, and search execution for websites.
 */

const assert = require('assert');

// Default search engines fixture from content.js
const DEFAULT_SEARCH_WEBSITES = [
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q={query}', enabled: true },
  { id: 'youtube', name: 'YouTube', template: 'https://www.youtube.com/results?search_query={query}', enabled: true },
  { id: 'wikipedia', name: 'Wikipedia', template: 'https://en.wikipedia.org/wiki/Special:Search?search={query}', enabled: true },
  { id: 'reddit', name: 'Reddit', template: 'https://www.reddit.com/search/?q={query}', enabled: true },
  { id: 'github', name: 'GitHub', template: 'https://github.com/search?q={query}', enabled: true },
  { id: 'amazon', name: 'Amazon', template: 'https://www.amazon.com/s?k={query}', enabled: true },
  { id: 'steamdb', name: 'SteamDB', template: 'https://steamdb.info/search/?q={query}', enabled: true },
  { id: 'custom_disabled', name: 'Hidden Site', template: 'https://example.com/?q={query}', enabled: false }
];

// Helper functions mirroring content.js implementation
function filterWebsites(sites, filter) {
  const enabledSites = sites.filter((s) => s.enabled !== false);
  const trimmed = typeof filter === 'string' ? filter.trim().toLowerCase() : '';
  if (!trimmed) return enabledSites;
  return enabledSites.filter((s) => {
    const name = (s.name || '').toLowerCase();
    const id = (s.id || '').toLowerCase();
    return name.includes(trimmed) || id.includes(trimmed);
  });
}

function computeHighlightSegments(text, query) {
  if (!query) return [{ type: 'text', text }];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return [{ type: 'text', text }];

  const segments = [];
  if (idx > 0) {
    segments.push({ type: 'text', text: text.slice(0, idx) });
  }
  segments.push({ type: 'match', text: text.slice(idx, idx + query.length) });
  if (idx + query.length < text.length) {
    segments.push({ type: 'text', text: text.slice(idx + query.length) });
  }
  return segments;
}

function buildSearchUrl(site, rawQuery) {
  const query = rawQuery.trim();
  if (!query) return null;

  let template = (site.template || 'https://www.google.com/search?q={query}').trim();
  if (!/^https?:\/\//i.test(template)) {
    template = 'https://' + template;
  }
  if (template.includes('steamdb.info/?q=')) {
    template = template.replace('steamdb.info/?q=', 'steamdb.info/search/?q=');
  }

  let encodedQuery;
  const qIndex = template.indexOf('{query}');
  const questionIndex = template.indexOf('?');
  if (questionIndex === -1 || (qIndex !== -1 && qIndex < questionIndex)) {
    encodedQuery = encodeURIComponent(query);
  } else {
    encodedQuery = encodeURIComponent(query).replace(/%20/g, '+');
  }

  if (template.includes('{query}')) {
    return template.replace(/\{query\}/gi, encodedQuery);
  }
  const joiner = template.includes('?') ? (template.endsWith('?') || template.endsWith('&') ? '' : '&') : '?';
  return `${template}${joiner}q=${encodedQuery}`;
}

console.log('--- Running Floating Toolbar Submenu Search Tests ---');

// Test 1: Empty filter returns all enabled websites
{
  const result = filterWebsites(DEFAULT_SEARCH_WEBSITES, '');
  assert.strictEqual(result.length, 7);
  assert.ok(result.every((s) => s.enabled !== false));
  console.log('  ✓ Test 1: Empty filter returns all enabled websites');
}

// Test 2: Whitespace-only filter returns all enabled websites
{
  const result = filterWebsites(DEFAULT_SEARCH_WEBSITES, '   ');
  assert.strictEqual(result.length, 7);
  console.log('  ✓ Test 2: Whitespace-only filter returns all enabled websites');
}

// Test 3: Filter by site name (case-insensitive)
{
  const result = filterWebsites(DEFAULT_SEARCH_WEBSITES, 'steam');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'steamdb');
  assert.strictEqual(result[0].name, 'SteamDB');
  console.log('  ✓ Test 3: Filter by site name case-insensitively');
}

// Test 4: Filter by site ID
{
  const result = filterWebsites(DEFAULT_SEARCH_WEBSITES, 'wiki');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'wikipedia');
  console.log('  ✓ Test 4: Filter by site ID');
}

// Test 5: Filter matches multiple websites
{
  // 'oo' matches Google, YouTube (contains 'ou' not 'oo'), etc.
  const result = filterWebsites(DEFAULT_SEARCH_WEBSITES, 'e'); // Google, YouTube, Wikipedia, Reddit, SteamDB
  assert.ok(result.length > 1);
  assert.ok(result.some((s) => s.name === 'Google'));
  assert.ok(result.some((s) => s.name === 'YouTube'));
  console.log('  ✓ Test 5: Filter matches multiple websites correctly');
}

// Test 6: Filter with no matching websites
{
  const result = filterWebsites(DEFAULT_SEARCH_WEBSITES, 'nonexistent_engine_xyz');
  assert.strictEqual(result.length, 0);
  console.log('  ✓ Test 6: Non-matching filter returns empty array');
}

// Test 7: Disabled websites are excluded even if they match filter
{
  const result = filterWebsites(DEFAULT_SEARCH_WEBSITES, 'Hidden');
  assert.strictEqual(result.length, 0);
  console.log('  ✓ Test 7: Disabled websites are excluded from search filter results');
}

// Test 8: Highlight segment calculation for prefix match
{
  const segments = computeHighlightSegments('Google', 'goo');
  assert.strictEqual(segments.length, 2);
  assert.deepStrictEqual(segments[0], { type: 'match', text: 'Goo' });
  assert.deepStrictEqual(segments[1], { type: 'text', text: 'gle' });
  console.log('  ✓ Test 8: Highlight segment calculation for prefix match');
}

// Test 9: Highlight segment calculation for mid-word match
{
  const segments = computeHighlightSegments('YouTube', 'out');
  assert.strictEqual(segments.length, 3);
  assert.deepStrictEqual(segments[0], { type: 'text', text: 'Y' });
  assert.deepStrictEqual(segments[1], { type: 'match', text: 'ouT' });
  assert.deepStrictEqual(segments[2], { type: 'text', text: 'ube' });
  console.log('  ✓ Test 9: Highlight segment calculation for mid-word match preserving text casing');
}

// Test 10: Highlight segment calculation for suffix match
{
  const segments = computeHighlightSegments('Reddit', 'dit');
  assert.strictEqual(segments.length, 2);
  assert.deepStrictEqual(segments[0], { type: 'text', text: 'Red' });
  assert.deepStrictEqual(segments[1], { type: 'match', text: 'dit' });
  console.log('  ✓ Test 10: Highlight segment calculation for suffix match');
}

// Test 11: Highlight segment calculation when no match exists
{
  const segments = computeHighlightSegments('GitHub', 'xyz');
  assert.strictEqual(segments.length, 1);
  assert.deepStrictEqual(segments[0], { type: 'text', text: 'GitHub' });
  console.log('  ✓ Test 11: Highlight segment returns entire text when no match');
}

// Test 12: Enter key execution selects first matching site
{
  const filtered = filterWebsites(DEFAULT_SEARCH_WEBSITES, 'git');
  assert.ok(filtered.length >= 1);
  const firstSite = filtered[0];
  const url = buildSearchUrl(firstSite, 'react hooks');
  assert.strictEqual(url, 'https://github.com/search?q=react+hooks');
  console.log('  ✓ Test 12: First matching site generates correct search URL for Enter key');
}

// Test 13: Background search URL preserves spaces as '+' in query parameters
{
  const steam = DEFAULT_SEARCH_WEBSITES.find((s) => s.id === 'steamdb');
  const url = buildSearchUrl(steam, 'Cyberpunk 2077');
  assert.strictEqual(url, 'https://steamdb.info/search/?q=Cyberpunk+2077');
  console.log('  ✓ Test 13: Search URL for filtered SteamDB correctly encodes spaces as +');
}

// Test 14: Path-based search template encodes spaces as %20
{
  const pathSite = { id: 'pathsite', name: 'Path Search', template: 'https://example.com/wiki/{query}', enabled: true };
  const url = buildSearchUrl(pathSite, 'artificial intelligence');
  assert.strictEqual(url, 'https://example.com/wiki/artificial%20intelligence');
  console.log('  ✓ Test 14: Path-based search URL encodes spaces as %20');
}

// Test 15: Empty search selection does not produce URL
{
  const google = DEFAULT_SEARCH_WEBSITES.find((s) => s.id === 'google');
  const url = buildSearchUrl(google, '   ');
  assert.strictEqual(url, null);
  console.log('  ✓ Test 15: Empty selection string returns null and does not execute search');
}

console.log('\nResults: 15 / 15 tests passed.');
console.log('🎉 ALL SUBMENU SEARCH TESTS PASSED SUCCESSFULLY!');
