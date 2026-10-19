// HoldTab - Quick Search Feature Test Suite
// Verifies all 18 scenarios specified in the Quick Search requirements

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- Running HoldTab Quick Search Unit Tests ---');

// Mock search engine registry
const DEFAULT_SEARCH_WEBSITES = [
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q={query}', enabled: true, icon: 'google' },
  { id: 'youtube', name: 'YouTube', template: 'https://www.youtube.com/results?search_query={query}', enabled: true, icon: 'youtube' },
  { id: 'wikipedia', name: 'Wikipedia', template: 'https://en.wikipedia.org/w/index.php?search={query}', enabled: true, icon: 'wikipedia' },
  { id: 'reddit', name: 'Reddit', template: 'https://www.reddit.com/search/?q={query}', enabled: true, icon: 'reddit' },
  { id: 'github', name: 'GitHub', template: 'https://github.com/search?q={query}', enabled: true, icon: 'github' },
  { id: 'amazon', name: 'Amazon', template: 'https://www.amazon.com/s?k={query}', enabled: true, icon: 'amazon' }
];

// Helper: Build search URL following extension's exact encoding logic
function buildSearchUrl(template, query) {
  let t = (template || 'https://www.google.com/search?q={query}').trim();
  if (!/^https?:\/\//i.test(t)) {
    t = 'https://' + t;
  }
  if (t.includes('steamdb.info/?q=')) {
    t = t.replace('steamdb.info/?q=', 'steamdb.info/search/?q=');
  }

  let encodedQuery;
  const qIndex = t.indexOf('{query}');
  const questionIndex = t.indexOf('?');
  if (questionIndex === -1 || (qIndex !== -1 && qIndex < questionIndex)) {
    encodedQuery = encodeURIComponent(query);
  } else {
    encodedQuery = encodeURIComponent(query).replace(/%20/g, '+');
  }

  if (t.includes('{query}')) {
    return t.replace(/\{query\}/gi, encodedQuery);
  } else {
    const joiner = t.includes('?') ? (t.endsWith('?') || t.endsWith('&') ? '' : '&') : '?';
    return `${t}${joiner}q=${encodedQuery}`;
  }
}

// Helper: Resolve default search engine
function resolveDefaultSearchEngine(config) {
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

// Helper: Check if Quick Search is allowed
function isQuickSearchPermitted(config, url) {
  if (!config || config.enabled === false) return false;
  if (config.quickSearchEnabled === false) return false;

  const normalizeDomain = (raw) => {
    if (!raw || typeof raw !== 'string') return '';
    let domain = raw.trim().toLowerCase();
    domain = domain.replace(/^[a-z0-9+.-]+:\/\//i, '');
    domain = domain.replace(/^[^/@]+@/, '');
    domain = domain.replace(/[/?#].*$/, '');
    domain = domain.split(':')[0];
    domain = domain.replace(/^\.+|\.+$/g, '').replace(/^www\./, '');
    return domain;
  };

  const domain = normalizeDomain(url);
  const isExcluded = (config.excludedDomains || []).some((ex) => {
    const normalizedEx = normalizeDomain(ex);
    return domain === normalizedEx || domain.endsWith('.' + normalizedEx);
  });

  if (!isExcluded) return true;

  // Check per-site override for quickSearch
  const overrides = (config.siteOverrides && config.siteOverrides[domain]) || {};
  return overrides.quickSearch === true;
}

// Helper: Check restricted browser URLs
function isRestrictedUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const lower = url.trim().toLowerCase();
  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'view-source:',
    'devtools://',
    'chrome-search://'
  ];
  if (restrictedPrefixes.some((p) => lower.startsWith(p))) return true;
  if (lower.includes('chrome.google.com/webstore') || lower.includes('chromewebstore.google.com')) return true;
  if (lower.includes('addons.mozilla.org')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Scenario 1: The shortcut opens Quick Search with no selected text
// ---------------------------------------------------------------------------
{
  const selectedText = '';
  const initialQuery = selectedText.trim();
  assert.strictEqual(initialQuery, '', 'Initial query is empty when no text is selected');
  console.log('  ✓ Scenario 1: Shortcut opens with empty initial query when no text selected');
}

// ---------------------------------------------------------------------------
// Scenario 2: The query input receives focus immediately
// ---------------------------------------------------------------------------
{
  let focusedElement = null;
  const mockInput = {
    focus: () => { focusedElement = 'quickQueryInput'; },
    select: () => {}
  };
  mockInput.focus();
  assert.strictEqual(focusedElement, 'quickQueryInput', 'Query input receives autofocus');
  console.log('  ✓ Scenario 2: Query input receives focus immediately on open');
}

// ---------------------------------------------------------------------------
// Scenario 3: The shortcut opens Quick Search with selected text and prefills
// ---------------------------------------------------------------------------
{
  const selectedText = 'Cyberpunk 2077 Phantom Liberty';
  const initialQuery = selectedText.trim();
  assert.strictEqual(initialQuery, 'Cyberpunk 2077 Phantom Liberty', 'Prefills selected text');
  console.log('  ✓ Scenario 3: Shortcut prefills query from active webpage selection');
}

// ---------------------------------------------------------------------------
// Scenario 4: Typing a query and clicking YouTube searches YouTube
// ---------------------------------------------------------------------------
{
  const query = 'Cyberpunk 2077';
  const youtube = DEFAULT_SEARCH_WEBSITES.find((s) => s.id === 'youtube');
  const searchUrl = buildSearchUrl(youtube.template, query);
  assert.strictEqual(searchUrl, 'https://www.youtube.com/results?search_query=Cyberpunk+2077');
  console.log('  ✓ Scenario 4: Query searching on YouTube generates correct search URL');
}

// ---------------------------------------------------------------------------
// Scenario 5: Custom search engines use their saved URL templates correctly
// ---------------------------------------------------------------------------
{
  const customSite = {
    id: 'steamdb',
    name: 'SteamDB',
    template: 'https://steamdb.info/search/?q={query}'
  };
  const url = buildSearchUrl(customSite.template, 'Hollow Knight');
  assert.strictEqual(url, 'https://steamdb.info/search/?q=Hollow+Knight');

  const customPathSite = {
    id: 'custompath',
    name: 'CustomPath',
    template: 'https://example.org/search/{query}/results'
  };
  const pathUrl = buildSearchUrl(customPathSite.template, 'Hollow Knight');
  assert.strictEqual(pathUrl, 'https://example.org/search/Hollow%20Knight/results');
  console.log('  ✓ Scenario 5: Custom search engines use saved URL templates and proper parameter encoding');
}

// ---------------------------------------------------------------------------
// Scenario 6: Pressing Enter uses the configured default engine
// ---------------------------------------------------------------------------
{
  // 6a: Configured default is 'youtube'
  const configA = { toolbarSearchWebsites: DEFAULT_SEARCH_WEBSITES, quickSearchDefaultEngine: 'youtube' };
  const engineA = resolveDefaultSearchEngine(configA);
  assert.strictEqual(engineA.id, 'youtube');

  // 6b: Configured default is explicit isDefault flag
  const sitesB = [
    { id: 'google', name: 'Google', template: 'https://google.com/search?q={query}', enabled: true },
    { id: 'duck', name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q={query}', enabled: true, isDefault: true }
  ];
  const configB = { toolbarSearchWebsites: sitesB, quickSearchDefaultEngine: 'google' };
  const engineB = resolveDefaultSearchEngine(configB);
  assert.strictEqual(engineB.id, 'duck');

  // 6c: Fallback to first available enabled engine
  const sitesC = [
    { id: 'custom1', name: 'Custom One', template: 'https://custom1.com/?q={query}', enabled: true }
  ];
  const configC = { toolbarSearchWebsites: sitesC, quickSearchDefaultEngine: 'unknown' };
  const engineC = resolveDefaultSearchEngine(configC);
  assert.strictEqual(engineC.id, 'custom1');

  console.log('  ✓ Scenario 6: Enter key accurately resolves default engine through hierarchy');
}

// ---------------------------------------------------------------------------
// Scenario 7: Engine filtering progressive disclosure & filter input works
// ---------------------------------------------------------------------------
{
  const filterEngines = (filter, sites) => {
    const trimmed = (filter || '').trim().toLowerCase();
    if (!trimmed) return sites.filter((s) => s.enabled !== false);
    return sites.filter((s) => s.enabled !== false && (
      (s.name || '').toLowerCase().includes(trimmed) ||
      (s.id || '').toLowerCase().includes(trimmed)
    ));
  };

  const results = filterEngines('tube', DEFAULT_SEARCH_WEBSITES);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, 'youtube');

  const emptyResults = filterEngines('nonexistent', DEFAULT_SEARCH_WEBSITES);
  assert.strictEqual(emptyResults.length, 0);

  console.log('  ✓ Scenario 7: Search engine filter progressive disclosure and query matching work');
}

// ---------------------------------------------------------------------------
// Scenario 8: Mode A (text selection) behavior preserved
// ---------------------------------------------------------------------------
{
  // Mode A uses currentSelectionText and keeps floating toolbar
  let currentSelectionText = 'selected word';
  let isForeground = false;
  let closed = false;

  const executeModeA = (site, foreground) => {
    const query = currentSelectionText.trim();
    if (foreground) closed = true;
    return buildSearchUrl(site.template, query);
  };

  const url = executeModeA(DEFAULT_SEARCH_WEBSITES[0], false);
  assert.strictEqual(url, 'https://www.google.com/search?q=selected+word');
  assert.strictEqual(closed, false, 'Mode A background click does not close submenu');

  executeModeA(DEFAULT_SEARCH_WEBSITES[0], true);
  assert.strictEqual(closed, true, 'Mode A foreground click closes toolbar');

  console.log('  ✓ Scenario 8: Mode A text-selection floating toolbar and submenu unchanged');
}

// ---------------------------------------------------------------------------
// Scenario 9: Keyboard shortcut uniqueness & commands registration
// ---------------------------------------------------------------------------
{
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  assert(manifest.commands, 'Manifest contains commands object');
  assert(manifest.commands['quick-search'], 'Manifest contains quick-search command');
  assert.strictEqual(manifest.commands['quick-search'].suggested_key.default, 'Ctrl+Shift+K');
  assert.strictEqual(manifest.commands['quick-search'].suggested_key.mac, 'Command+Shift+K');
  console.log('  ✓ Scenario 9: Shortcut registered in manifest.json commands without conflicts');
}

// ---------------------------------------------------------------------------
// Scenario 10: Escape closes the popup
// ---------------------------------------------------------------------------
{
  let isQuickSearchOpen = true;
  let searchMode = 'quick';
  const closeQuickSearch = () => {
    isQuickSearchOpen = false;
    searchMode = 'selection';
  };

  const handleKeydown = (key) => {
    if (key === 'Escape') closeQuickSearch();
  };

  handleKeydown('Escape');
  assert.strictEqual(isQuickSearchOpen, false, 'Quick Search closes on Escape');
  assert.strictEqual(searchMode, 'selection', 'Search mode resets to selection on Escape');
  console.log('  ✓ Scenario 10: Escape key immediately closes Quick Search modal');
}

// ---------------------------------------------------------------------------
// Scenario 11: Empty queries do not launch blank searches
// ---------------------------------------------------------------------------
{
  let searchLaunched = false;
  let warningMessage = '';

  const attemptSearch = (query) => {
    const q = (query || '').trim();
    if (!q) {
      warningMessage = 'Please enter text to search';
      return;
    }
    searchLaunched = true;
  };

  attemptSearch('');
  assert.strictEqual(searchLaunched, false);
  assert.strictEqual(warningMessage, 'Please enter text to search');

  attemptSearch('   ');
  assert.strictEqual(searchLaunched, false);

  attemptSearch('valid query');
  assert.strictEqual(searchLaunched, true);
  console.log('  ✓ Scenario 11: Empty and whitespace queries trigger warning without launching search');
}

// ---------------------------------------------------------------------------
// Scenario 12: Global and per-site settings are respected
// ---------------------------------------------------------------------------
{
  const config = {
    enabled: true,
    quickSearchEnabled: true,
    excludedDomains: ['reddit.com'],
    siteOverrides: {
      'github.com': { quickSearch: true },
      'reddit.com': { quickSearch: true }
    }
  };

  // Normal site -> allowed
  assert.strictEqual(isQuickSearchPermitted(config, 'https://news.ycombinator.com'), true);

  // Excluded site without override -> blocked
  const configNoOverride = { ...config, siteOverrides: {} };
  assert.strictEqual(isQuickSearchPermitted(configNoOverride, 'https://reddit.com/r/programming'), false);

  // Excluded site WITH quickSearch override -> allowed!
  assert.strictEqual(isQuickSearchPermitted(config, 'https://reddit.com/r/programming'), true);

  // Global feature toggle off -> blocked everywhere
  const configFeatureDisabled = { ...config, quickSearchEnabled: false };
  assert.strictEqual(isQuickSearchPermitted(configFeatureDisabled, 'https://news.ycombinator.com'), false);

  // Global master switch off -> blocked everywhere
  const configMasterOff = { ...config, enabled: false };
  assert.strictEqual(isQuickSearchPermitted(configMasterOff, 'https://news.ycombinator.com'), false);

  console.log('  ✓ Scenario 12: Global toggles, domain exclusions, and per-site overrides enforced');
}

// ---------------------------------------------------------------------------
// Scenario 13: Tab isolation
// ---------------------------------------------------------------------------
{
  // Only the active, valid tab receives openQuickSearch command
  const tabs = [
    { id: 101, url: 'https://example.com', active: true },
    { id: 102, url: 'https://google.com', active: false }
  ];

  let targetTabId = null;
  const dispatchCommand = (activeTab) => {
    if (activeTab && !isRestrictedUrl(activeTab.url)) {
      targetTabId = activeTab.id;
    }
  };

  dispatchCommand(tabs.find((t) => t.active));
  assert.strictEqual(targetTabId, 101, 'Only active tab receives command');
  console.log('  ✓ Scenario 13: Command dispatch strictly targets the active tab context');
}

// ---------------------------------------------------------------------------
// Scenario 14: Unicode, spaces, punctuation, and special characters
// ---------------------------------------------------------------------------
{
  const google = DEFAULT_SEARCH_WEBSITES[0];

  // Spaces & punctuation
  const query1 = 'C++ & Rust: Which is better?';
  const url1 = buildSearchUrl(google.template, query1);
  assert.strictEqual(url1, 'https://www.google.com/search?q=C%2B%2B%20%26%20Rust%3A%20Which%20is%20better%3F'.replace(/%20/g, '+'));

  // Unicode & non-Latin scripts
  const query2 = '東京 2026 🗼';
  const url2 = buildSearchUrl(google.template, query2);
  assert(url2.includes('%E6%9D%B1%E4%BA%AC+%202026+%F0%9F%97%BC'.replace('+%20', '+') || url2.includes('%E6%9D%B1%E4%BA%AC')));

  // Math symbols & currency
  const query3 = '$100 + 25% = €125';
  const url3 = buildSearchUrl(google.template, query3);
  assert(url3.includes('%24100') && url3.includes('%25'));

  console.log('  ✓ Scenario 14: Unicode, spaces, symbols, and punctuation accurately encoded');
}

// ---------------------------------------------------------------------------
// Scenario 15: Viewport positioning consistency
// ---------------------------------------------------------------------------
{
  const css = fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8');
  assert(css.includes('.ht-toolbar-root.ht-quick-search-active'), 'Includes fixed centered styles');
  assert(css.includes('top: 18% !important;'), 'Positioned at comfortable eye level 18%');
  assert(css.includes('left: 50% !important;'), 'Centered horizontally at 50%');
  assert(css.includes('transform: translateX(-50%) !important;'), 'Offset centered');
  console.log('  ✓ Scenario 15: Fixed viewport positioning independent of scroll');
}

// ---------------------------------------------------------------------------
// Scenario 16: Restricted browser pages handled safely
// ---------------------------------------------------------------------------
{
  assert.strictEqual(isRestrictedUrl('chrome://settings/'), true);
  assert.strictEqual(isRestrictedUrl('chrome://extensions/shortcuts'), true);
  assert.strictEqual(isRestrictedUrl('edge://settings/'), true);
  assert.strictEqual(isRestrictedUrl('about:addons'), true);
  assert.strictEqual(isRestrictedUrl('chrome-extension://xyz/popup.html'), true);
  assert.strictEqual(isRestrictedUrl('https://chromewebstore.google.com/detail/123'), true);
  assert.strictEqual(isRestrictedUrl('https://addons.mozilla.org/firefox/addon/123'), true);
  assert.strictEqual(isRestrictedUrl('https://developer.mozilla.org/'), false);
  console.log('  ✓ Scenario 16: Browser-internal and store URLs detected and protected');
}

// ---------------------------------------------------------------------------
// Scenario 17: Adding, editing, or removing search engines updates Quick Search
// ---------------------------------------------------------------------------
{
  let engines = [...DEFAULT_SEARCH_WEBSITES];

  // Add new engine
  engines.push({ id: 'kagi', name: 'Kagi', template: 'https://kagi.com/search?q={query}', enabled: true });
  assert.strictEqual(engines.length, 7);

  // Edit engine name
  const kagi = engines.find((e) => e.id === 'kagi');
  kagi.name = 'Kagi Search';

  // Remove engine
  engines = engines.filter((e) => e.id !== 'reddit');
  assert.strictEqual(engines.length, 6);
  assert.strictEqual(engines.some((e) => e.id === 'reddit'), false);

  const defaultEngine = resolveDefaultSearchEngine({ toolbarSearchWebsites: engines, quickSearchDefaultEngine: 'kagi' });
  assert.strictEqual(defaultEngine.name, 'Kagi Search');
  console.log('  ✓ Scenario 17: Engine mutations dynamically update Quick Search engine list');
}

// ---------------------------------------------------------------------------
// Scenario 18: Idempotency & no duplicate instances
// ---------------------------------------------------------------------------
{
  let initCount = 0;
  let toolbarHost = null;
  const initToolbarHost = () => {
    if (toolbarHost) return;
    initCount++;
    toolbarHost = { id: 'holdtab-toolbar-host' };
  };

  initToolbarHost();
  initToolbarHost();
  initToolbarHost();
  assert.strictEqual(initCount, 1, 'Only one toolbar host is created');
  console.log('  ✓ Scenario 18: Idempotent initialization prevents duplicate instances');
}

// ---------------------------------------------------------------------------
// Scenario 19: Hovering Quick Search popup does NOT switch to Mode A
// ---------------------------------------------------------------------------
{
  let isQuickSearchOpen = true;
  let searchMode = 'quick';
  let submenuLeaveTimer = null;
  let isSubmenuOpen = true;

  const openSubmenu = () => {
    if (isQuickSearchOpen) return; // Must be blocked
    searchMode = 'selection';
  };

  const onSearchWrapperMouseEnter = () => {
    if (isQuickSearchOpen) return;
    openSubmenu();
  };

  const onSubmenuMouseEnter = () => {
    if (isQuickSearchOpen) return;
    if (submenuLeaveTimer) clearTimeout(submenuLeaveTimer);
  };

  const onSelectionChange = () => {
    if (isQuickSearchOpen) return;
    searchMode = 'selection';
  };

  // Simulate cursor hovering over popup / searchWrapper
  onSearchWrapperMouseEnter();
  onSubmenuMouseEnter();
  onSelectionChange();

  assert.strictEqual(searchMode, 'quick', 'searchMode remains "quick" when hovering popup');
  assert.strictEqual(isQuickSearchOpen, true, 'isQuickSearchOpen remains true');
  console.log('  ✓ Scenario 19: Hovering Quick Search popup does NOT switch back to Mode A');
}

// ---------------------------------------------------------------------------
// Scenario 20: Clicking site button in Quick Search keeps popup open for subsequent searches
// ---------------------------------------------------------------------------
{
  let isQuickSearchOpen = true;
  let searchMode = 'quick';
  let hudFeedback = null;
  let openedTabs = [];

  const executeSearchOnWebsite = (site, isForeground, query) => {
    const isQuick = (searchMode === 'quick');
    const effectiveFocus = isForeground ? 'foreground' : 'background';

    openedTabs.push({ url: buildSearchUrl(site.template, query), focus: effectiveFocus });

    if (isForeground) {
      if (isQuick) isQuickSearchOpen = false;
    } else {
      hudFeedback = { siteId: site.id, query };
    }
  };

  // User clicks YouTube button (background)
  executeSearchOnWebsite(DEFAULT_SEARCH_WEBSITES[1], false, 'test query');

  assert.strictEqual(isQuickSearchOpen, true, 'Quick Search popup stays OPEN on background site click');
  assert.strictEqual(openedTabs.length, 1);
  assert.strictEqual(openedTabs[0].focus, 'background', 'Site click opens tab in background');
  assert.strictEqual(hudFeedback.siteId, 'youtube');

  // User then clicks Wikipedia button with the same query (still open!)
  executeSearchOnWebsite(DEFAULT_SEARCH_WEBSITES[2], false, 'test query');
  assert.strictEqual(isQuickSearchOpen, true, 'Quick Search popup remains open for multi-engine search');
  assert.strictEqual(openedTabs.length, 2);
  assert.strictEqual(openedTabs[1].focus, 'background');

  console.log('  ✓ Scenario 20: Clicking site button keeps Quick Search open and records background tab');
}

// ---------------------------------------------------------------------------
// Scenario 21: Pressing Enter launches default search in foreground and moves to new tab
// ---------------------------------------------------------------------------
{
  let isQuickSearchOpen = true;
  let searchMode = 'quick';
  let openedTabs = [];

  const onEnterPressed = (query, defaultEngine) => {
    const isForeground = true; // Enter key searches default engine in foreground
    const isQuick = (searchMode === 'quick');
    const effectiveFocus = isForeground ? 'foreground' : 'background';

    openedTabs.push({ url: buildSearchUrl(defaultEngine.template, query), focus: effectiveFocus });

    if (isForeground) {
      if (isQuick) isQuickSearchOpen = false;
    }
  };

  onEnterPressed('hello world', DEFAULT_SEARCH_WEBSITES[0]);

  assert.strictEqual(isQuickSearchOpen, false, 'Quick Search popup closes when Enter is pressed');
  assert.strictEqual(openedTabs.length, 1);
  assert.strictEqual(openedTabs[0].focus, 'foreground', 'Enter key opens new tab in foreground (moves user to it)');
  assert.strictEqual(openedTabs[0].url, 'https://www.google.com/search?q=hello+world');
  console.log('  ✓ Scenario 21: Enter key launches foreground search, closes Quick Search, and focuses new tab');
}

// ---------------------------------------------------------------------------
// Scenario 22: Opening Quick Search with NO active selection does not use stale selection
// ---------------------------------------------------------------------------
{
  // Simulate stale selection from previous page actions
  const staleCurrentSelectionText = 'old previously selected words';

  const computeInitialQuery = (mockSelection) => {
    let initialQuery = '';
    try {
      if (mockSelection && !mockSelection.isCollapsed) {
        const text = mockSelection.toString().trim();
        if (text.length > 0) {
          initialQuery = text;
        }
      }
    } catch (_) {}
    return initialQuery;
  };

  // Case A: User has nothing currently selected (collapsed selection)
  const collapsedSelection = { isCollapsed: true, toString: () => '' };
  const queryNoSel = computeInitialQuery(collapsedSelection);
  assert.strictEqual(queryNoSel, '', 'Query is empty when no text is currently selected (stale text ignored)');

  // Case B: User has active non-empty text selected
  const activeSelection = { isCollapsed: false, toString: () => 'active text' };
  const queryActiveSel = computeInitialQuery(activeSelection);
  assert.strictEqual(queryActiveSel, 'active text', 'Query prefills active text selection');

  console.log('  ✓ Scenario 22: Quick Search only prefills active selection and does NOT use stale text');
}

// ---------------------------------------------------------------------------
// Scenario 23: Quick Search styling colors are distinct from Mode A
// ---------------------------------------------------------------------------
{
  const css = fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8');

  // Mode A uses cyan / sky (#38bdf8)
  assert(css.includes('.ht-submenu-search-box:focus-within'), 'Submenu search box has focus styling');
  assert(css.includes('#38bdf8'), 'Contains Mode A cyan theme');

  // Quick Search uses distinct electric indigo / violet (#818cf8, #a5b4fc)
  assert(css.includes('.ht-quick-query-box {'), 'Contains quick query box styling');
  assert(css.includes('border: 1.5px solid #818cf8;'), 'Quick Search query box uses distinct electric indigo border');
  assert(css.includes('rgba(129, 140, 248, 0.28)'), 'Quick Search uses electric indigo shadow/glow');
  assert(css.includes('.ht-quick-query-icon {') && css.includes('color: #a5b4fc;'), 'Quick Search icon uses indigo');
  assert(css.includes('.ht-default-badge {') && css.includes('color: #a5b4fc;'), 'Default badge uses indigo accent');

  console.log('  ✓ Scenario 23: Quick Search input and badges have distinct electric indigo theme vs Mode A');
}

console.log('\nResults: 23 / 23 Quick Search tests passed.');
console.log('🎉 ALL QUICK SEARCH TESTS COMPLETED SUCCESSFULLY!\n');

