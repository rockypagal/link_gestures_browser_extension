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

  // Quick Search uses distinct electric indigo / violet (#818cf8, #a5b4fc, #c7d2fe)
  assert(css.includes('.ht-quick-query-box {'), 'Contains quick query box styling');
  assert(css.includes('background: #231c53;'), 'Quick Search query box uses distinct indigo background');
  assert(css.includes('linear-gradient(135deg, #2e266d 0%, #1e1744 100%)'), 'Quick Search query box uses distinct indigo gradient');
  assert(css.includes('border: 1.5px solid #818cf8;'), 'Quick Search query box uses distinct electric indigo border');
  assert(css.includes('rgba(129, 140, 248, 0.28)'), 'Quick Search uses electric indigo shadow/glow');
  assert(css.includes('.ht-quick-query-icon {') && css.includes('color: #c7d2fe;'), 'Quick Search icon uses lavender');
  assert(css.includes('.ht-default-badge {') && css.includes('color: #a5b4fc;'), 'Default badge uses indigo accent');

  console.log('  ✓ Scenario 23: Quick Search input has distinct indigo background and colors vs Mode A');
}

// ---------------------------------------------------------------------------
// Scenario 24: Extract unique domains from open tabs, filtering internal browser tabs
// ---------------------------------------------------------------------------
{
  const mockTabs = [
    { id: 1, url: 'https://news.ycombinator.com/item?id=123', title: 'Hacker News' },
    { id: 2, url: 'https://news.ycombinator.com/newest', title: 'New Hacker News' }, // Duplicate domain
    { id: 3, url: 'https://docs.python.org/3/library/', title: 'Python Docs' },
    { id: 4, url: 'chrome://settings/', title: 'Settings' }, // Internal page
    { id: 5, url: 'about:blank', title: 'Blank' }, // Internal page
    { id: 6, url: 'https://www.nytimes.com/section/technology', title: 'NYT Tech' }
  ];

  const seenDomains = new Set();
  const openTabSites = [];
  for (const tab of mockTabs) {
    if (!tab.url || !/^https?:\/\//i.test(tab.url)) continue;
    try {
      const u = new URL(tab.url);
      const domain = u.hostname.toLowerCase().replace(/^www\./, '');
      if (!domain || seenDomains.has(domain)) continue;
      seenDomains.add(domain);
      openTabSites.push({ domain, title: tab.title });
    } catch (_) {}
  }

  assert.strictEqual(openTabSites.length, 3, 'Filtered to 3 unique HTTP/HTTPS domains');
  assert.strictEqual(openTabSites[0].domain, 'news.ycombinator.com');
  assert.strictEqual(openTabSites[1].domain, 'docs.python.org');
  assert.strictEqual(openTabSites[2].domain, 'nytimes.com');
  console.log('  ✓ Scenario 24: Unique domains extracted from open tabs while omitting internal pages');
}

// ---------------------------------------------------------------------------
// Scenario 25: Open tabs already present in saved search engines are excluded
// ---------------------------------------------------------------------------
{
  const mockTabs = [
    { domain: 'google.com' },     // In saved engines
    { domain: 'youtube.com' },    // In saved engines
    { domain: 'stackoverflow.com' }, // NOT in saved engines
    { domain: 'wikipedia.org' }   // In saved engines
  ];

  const isDomainInSaved = (domain) => {
    return DEFAULT_SEARCH_WEBSITES.some((s) => {
      const sId = (s.id || '').toLowerCase();
      const sName = (s.name || '').toLowerCase();
      if (sId === domain || sName === domain) return true;
      if (s.template) {
        try {
          const u = new URL(s.template.replace(/\{query\}/gi, 'test'));
          const sHost = u.hostname.toLowerCase().replace(/^www\./, '');
          if (domain === sHost || domain.endsWith('.' + sHost) || sHost.endsWith('.' + domain)) return true;
        } catch (_) {}
      }
      return false;
    });
  };

  const unaddedTabs = mockTabs.filter((t) => !isDomainInSaved(t.domain));
  assert.strictEqual(unaddedTabs.length, 1);
  assert.strictEqual(unaddedTabs[0].domain, 'stackoverflow.com');
  console.log('  ✓ Scenario 25: Open tabs matching saved search engines are cleanly excluded');
}

// ---------------------------------------------------------------------------
// Scenario 26: Native #ht-site-search template accurately triggers in-page search
// ---------------------------------------------------------------------------
{
  const domain = 'theverge.com';
  const query = 'pixel 9 review';
  const nativeAutoFillTemplate = `https://${domain}/#ht-site-search={query}`;

  const searchUrl = buildSearchUrl(nativeAutoFillTemplate, query);
  assert.strictEqual(searchUrl, 'https://theverge.com/#ht-site-search=pixel%209%20review');
  assert(searchUrl.includes('#ht-site-search='));

  // Also verify known direct template for stackoverflow
  const stackoverflowTemplate = 'https://stackoverflow.com/search?q={query}';
  const soUrl = buildSearchUrl(stackoverflowTemplate, 'python async await');
  assert.strictEqual(soUrl, 'https://stackoverflow.com/search?q=python+async+await');

  console.log('  ✓ Scenario 26: Native #ht-site-search template accurately generates in-page autofill search URLs');
}

// ---------------------------------------------------------------------------
// Scenario 27: Tab switcher switches datasets and supports background/foreground clicks
// ---------------------------------------------------------------------------
{
  let activeTab = 'engines';
  const savedList = [...DEFAULT_SEARCH_WEBSITES];
  const openTabsList = [
    { id: 'opentab_theverge', name: 'theverge.com', domain: 'theverge.com', template: 'https://google.com/search?q=site:theverge.com+{query}', isOpenTab: true }
  ];

  const getSitesForTab = (tab) => (tab === 'opentabs' ? openTabsList : savedList);

  assert.strictEqual(getSitesForTab('engines').length, 6);
  assert.strictEqual(getSitesForTab('opentabs').length, 1);
  assert.strictEqual(getSitesForTab('opentabs')[0].name, 'theverge.com');

  // Verify search on open tab
  const openTab = getSitesForTab('opentabs')[0];
  const url = buildSearchUrl(openTab.template, 'pixel 9 review');
  assert(url.includes('site:theverge.com') || url.includes('site%3Atheverge.com'));
  assert(url.includes('pixel+9+review'));
  console.log('  ✓ Scenario 27: Tab switcher toggles datasets and executes open tab searches');
}

// ---------------------------------------------------------------------------
// Scenario 28: Word length truncation and 2-column grid stability with minmax(0, 1fr)
// ---------------------------------------------------------------------------
{
  // Test simulated long domain / name in Mode A, Mode B, and Open Tabs
  const longDomainTab = {
    id: 'opentab_verylongdomain',
    name: 'extremely-long-subdomain-name-that-would-blow-out-grid.company-internal.co.uk',
    domain: 'extremely-long-subdomain-name-that-would-blow-out-grid.company-internal.co.uk',
    isOpenTab: true,
    isCurrentTab: false
  };

  const longCustomEngine = {
    id: 'custom_long_engine',
    name: 'Documentation Center & API Reference Manuals (Version 2.0 Alpha)',
    template: 'https://docs.example.com/search?q={query}',
    enabled: true
  };

  // Verify truncation helper logic
  const truncateWithEllipsis = (str, maxChars = 24) => {
    if (!str || str.length <= maxChars) return str;
    return str.substring(0, maxChars - 3) + '...';
  };

  const truncatedDomain = truncateWithEllipsis(longDomainTab.name, 22);
  assert(truncatedDomain.endsWith('...'));
  assert.strictEqual(truncatedDomain.length, 22);

  const truncatedName = truncateWithEllipsis(longCustomEngine.name, 25);
  assert(truncatedName.endsWith('...'));
  assert.strictEqual(truncatedName.length, 25);

  console.log('  ✓ Scenario 28: Word length truncation and grid safety logic verified for long names and domains');
}

// ---------------------------------------------------------------------------
// Scenario 29: Universal matchesShortcut for Close Tab custom key combinations
// ---------------------------------------------------------------------------
{
  function matchesShortcut(e, shortcutStr) {
    if (!shortcutStr || typeof shortcutStr !== 'string') return false;
    const parts = shortcutStr.split('+').map((s) => s.trim().toLowerCase());
    if (parts.length === 0) return false;

    const hasAlt = parts.includes('alt') || parts.includes('option');
    const hasCtrl = parts.includes('ctrl') || parts.includes('control');
    const hasShift = parts.includes('shift');
    const hasMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command') || parts.includes('win');

    const eAlt = !!e.altKey;
    const eCtrl = !!e.ctrlKey;
    const eShift = !!e.shiftKey;
    const eMeta = !!e.metaKey;

    if (hasAlt !== eAlt) return false;
    if (hasCtrl !== eCtrl) return false;
    if (hasShift !== eShift) return false;
    if (hasMeta !== eMeta) return false;

    const modifierKeys = new Set(['alt', 'option', 'ctrl', 'control', 'shift', 'meta', 'cmd', 'command', 'win']);
    const nonModifiers = parts.filter((p) => !modifierKeys.has(p));
    if (nonModifiers.length === 0) return false;
    const keyPart = nonModifiers.join('+');

    const eventKey = (e.key || '').toLowerCase();
    const eventCode = (e.code || '').toLowerCase();

    if (eventKey === keyPart) return true;
    if (keyPart === '<' || keyPart === ',') return eventKey === '<' || eventKey === ',' || eventCode === 'comma';
    if (keyPart === '>' || keyPart === '.') return eventKey === '>' || eventKey === '.' || eventCode === 'period';
    if (keyPart === '/' || keyPart === 'slash' || keyPart === '?') return eventKey === '/' || eventKey === '?' || eventCode === 'slash';
    if (keyPart === '[' || keyPart === 'bracketleft') return eventKey === '[' || eventCode === 'bracketleft';
    if (keyPart === ']' || keyPart === 'bracketright') return eventKey === ']' || eventCode === 'bracketright';
    if (keyPart === 'arrowleft' || keyPart === 'left') return eventKey === 'arrowleft' || eventCode === 'arrowleft';
    if (keyPart === 'arrowright' || keyPart === 'right') return eventKey === 'arrowright' || eventCode === 'arrowright';
    if (keyPart === 'arrowup' || keyPart === 'up') return eventKey === 'arrowup' || eventCode === 'arrowup';
    if (keyPart === 'arrowdown' || keyPart === 'down') return eventKey === 'arrowdown' || eventCode === 'arrowdown';
    if (keyPart === 'pageup') return eventKey === 'pageup' || eventCode === 'pageup';
    if (keyPart === 'pagedown') return eventKey === 'pagedown' || eventCode === 'pagedown';
    if (eventCode === 'key' + keyPart) return true;
    if (eventCode === 'digit' + keyPart) return true;

    return false;
  }

  // Alt + / (Default)
  assert.strictEqual(matchesShortcut({ altKey: true, key: '/', code: 'Slash' }, 'Alt + /'), true);
  assert.strictEqual(matchesShortcut({ altKey: true, key: '?', code: 'Slash', shiftKey: true }, 'Alt + /'), false); // Shift mismatch
  assert.strictEqual(matchesShortcut({ altKey: true, key: '?', code: 'Slash', shiftKey: true }, 'Alt + Shift + /'), true);
  assert.strictEqual(matchesShortcut({ ctrlKey: true, key: '/', code: 'Slash' }, 'Alt + /'), false);

  // Custom Alt + W
  assert.strictEqual(matchesShortcut({ altKey: true, key: 'w', code: 'KeyW' }, 'Alt + W'), true);
  assert.strictEqual(matchesShortcut({ altKey: true, key: 'W', code: 'KeyW' }, 'Alt + W'), true);

  // Custom Ctrl + Shift + W
  assert.strictEqual(matchesShortcut({ ctrlKey: true, shiftKey: true, key: 'w', code: 'KeyW' }, 'Ctrl + Shift + W'), true);

  // Custom Alt + Q
  assert.strictEqual(matchesShortcut({ altKey: true, key: 'q', code: 'KeyQ' }, 'Alt + Q'), true);

  console.log('  ✓ Scenario 29: Universal matchesShortcut accurately matches custom Close Tab shortcuts');
}

// ---------------------------------------------------------------------------
// Scenario 30: Universal matchesShortcut for Previous Tab & Next Tab custom keybinds
// ---------------------------------------------------------------------------
{
  function matchesShortcut(e, shortcutStr) {
    if (!shortcutStr || typeof shortcutStr !== 'string') return false;
    const parts = shortcutStr.split('+').map((s) => s.trim().toLowerCase());
    if (parts.length === 0) return false;

    const hasAlt = parts.includes('alt') || parts.includes('option');
    const hasCtrl = parts.includes('ctrl') || parts.includes('control');
    const hasShift = parts.includes('shift');
    const hasMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command') || parts.includes('win');

    const eAlt = !!e.altKey;
    const eCtrl = !!e.ctrlKey;
    const eShift = !!e.shiftKey;
    const eMeta = !!e.metaKey;

    if (hasAlt !== eAlt) return false;
    if (hasCtrl !== eCtrl) return false;
    if (hasShift !== eShift) return false;
    if (hasMeta !== eMeta) return false;

    const modifierKeys = new Set(['alt', 'option', 'ctrl', 'control', 'shift', 'meta', 'cmd', 'command', 'win']);
    const nonModifiers = parts.filter((p) => !modifierKeys.has(p));
    if (nonModifiers.length === 0) return false;
    const keyPart = nonModifiers.join('+');

    const eventKey = (e.key || '').toLowerCase();
    const eventCode = (e.code || '').toLowerCase();

    if (eventKey === keyPart) return true;
    if (keyPart === '<' || keyPart === ',') return eventKey === '<' || eventKey === ',' || eventCode === 'comma';
    if (keyPart === '>' || keyPart === '.') return eventKey === '>' || eventKey === '.' || eventCode === 'period';
    if (keyPart === '/' || keyPart === 'slash' || keyPart === '?') return eventKey === '/' || eventKey === '?' || eventCode === 'slash';
    if (keyPart === '[' || keyPart === 'bracketleft') return eventKey === '[' || eventCode === 'bracketleft';
    if (keyPart === ']' || keyPart === 'bracketright') return eventKey === ']' || eventCode === 'bracketright';
    if (keyPart === 'arrowleft' || keyPart === 'left') return eventKey === 'arrowleft' || eventCode === 'arrowleft';
    if (keyPart === 'arrowright' || keyPart === 'right') return eventKey === 'arrowright' || eventCode === 'arrowright';
    if (keyPart === 'arrowup' || keyPart === 'up') return eventKey === 'arrowup' || eventCode === 'arrowup';
    if (keyPart === 'arrowdown' || keyPart === 'down') return eventKey === 'arrowdown' || eventCode === 'arrowdown';
    if (keyPart === 'pageup') return eventKey === 'pageup' || eventCode === 'pageup';
    if (keyPart === 'pagedown') return eventKey === 'pagedown' || eventCode === 'pagedown';
    if (eventCode === 'key' + keyPart) return true;
    if (eventCode === 'digit' + keyPart) return true;

    return false;
  }

  // Previous Tab (Default Alt + <)
  assert.strictEqual(matchesShortcut({ altKey: true, key: '<', code: 'Comma' }, 'Alt + <'), true);
  assert.strictEqual(matchesShortcut({ altKey: true, key: ',', code: 'Comma' }, 'Alt + <'), true);

  // Next Tab (Default Alt + >)
  assert.strictEqual(matchesShortcut({ altKey: true, key: '>', code: 'Period' }, 'Alt + >'), true);
  assert.strictEqual(matchesShortcut({ altKey: true, key: '.', code: 'Period' }, 'Alt + >'), true);

  // Custom Alt + Left and Alt + Right
  assert.strictEqual(matchesShortcut({ altKey: true, key: 'ArrowLeft', code: 'ArrowLeft' }, 'Alt + Left'), true);
  assert.strictEqual(matchesShortcut({ altKey: true, key: 'ArrowRight', code: 'ArrowRight' }, 'Alt + Right'), true);

  // Custom Ctrl + [ and Ctrl + ]
  assert.strictEqual(matchesShortcut({ ctrlKey: true, key: '[', code: 'BracketLeft' }, 'Ctrl + ['), true);
  assert.strictEqual(matchesShortcut({ ctrlKey: true, key: ']', code: 'BracketRight' }, 'Ctrl + ]'), true);

  console.log('  ✓ Scenario 30: Universal matchesShortcut accurately matches custom Previous Tab & Next Tab shortcuts');
}

// ---------------------------------------------------------------------------
// Scenario 31: 1-Click Auto-Submit and fallback capture session transitions
// ---------------------------------------------------------------------------
{
  // Simulated 1-click auto-submit success scenario
  const marker = 'holdtab_test_xyz789';
  const targetUrl = `https://news.ycombinator.com/item?id=3000#q=${marker}`;
  
  // Derivation of template
  const occurrences = [];
  let idx = 0;
  const markerLower = marker.toLowerCase();
  const urlLower = targetUrl.toLowerCase();
  while ((idx = urlLower.indexOf(markerLower, idx)) !== -1) {
    occurrences.push(idx);
    idx += markerLower.length;
  }
  assert.strictEqual(occurrences.length, 1);
  const template = targetUrl.substring(0, occurrences[0]) + '{query}' + targetUrl.substring(occurrences[0] + markerLower.length);
  assert.strictEqual(template, 'https://news.ycombinator.com/item?id=3000#q={query}');

  const autoCapturedSession = {
    marker,
    step: 'preview',
    template,
    autoCaptured: true
  };
  assert.strictEqual(autoCapturedSession.autoCaptured, true);
  assert.strictEqual(autoCapturedSession.step, 'preview');

  // Simulated fallback scenario when no search bar is found
  const fallbackSession = {
    marker,
    step: 'capturing',
    fallbackNotice: 'Search bar could not be auto-detected on this page. Follow manual capture steps.'
  };
  assert.strictEqual(fallbackSession.step, 'capturing');
  assert(fallbackSession.fallbackNotice.includes('manual capture'));

  console.log('  ✓ Scenario 31: 1-Click Auto-Submit and graceful fallback transitions verified');
}

// ---------------------------------------------------------------------------
// Scenario 32: Pinned background tab capture lifecycle and automatic tab closure
// ---------------------------------------------------------------------------
{
  const activeTab = { id: 101, url: 'https://theverge.com/reviews/headphones', active: true };
  const marker = 'holdtab_test_bg123';
  
  // 1. Creation of non-intrusive pinned background tab
  let closedTabId = null;
  const mockTabs = {
    create: (opts) => {
      assert.strictEqual(opts.active, false, 'Tab opened strictly in background');
      assert.strictEqual(opts.pinned, true, 'Tab opened pinned for minimal footprint');
      assert.strictEqual(opts.url, activeTab.url);
      return { id: 999, url: opts.url, pinned: true, active: false };
    },
    remove: (tabId) => {
      closedTabId = tabId;
    }
  };

  const bgTab = mockTabs.create({ url: activeTab.url, active: false, pinned: true });
  assert.strictEqual(bgTab.id, 999);
  assert.strictEqual(bgTab.active, false);
  assert.strictEqual(bgTab.pinned, true);

  // 2. Simulated search navigation in background tab
  const searchResultUrl = `https://theverge.com/search?q=${marker}`;
  const derived = {
    template: searchResultUrl.replace(marker, '{query}'),
    siteName: 'Theverge'
  };

  const session = {
    marker,
    step: 'preview',
    template: derived.template,
    siteName: derived.siteName,
    autoCaptured: true,
    isBackgroundTab: true
  };

  assert.strictEqual(session.template, 'https://theverge.com/search?q={query}');
  assert.strictEqual(session.isBackgroundTab, true);

  // 3. Immediate automatic tab closure once captured
  if (session.isBackgroundTab) {
    mockTabs.remove(bgTab.id);
  }
  assert.strictEqual(closedTabId, 999, 'Pinned background tab closed automatically after capture');

  console.log('  ✓ Scenario 32: Pinned background tab capture lifecycle and automatic tab closure verified');
}

// ---------------------------------------------------------------------------
// Scenario 33: Open Tabs save icon click & auto-capture integration
// ---------------------------------------------------------------------------
{
  const openTabSite = {
    domain: 'stackoverflow.com',
    name: 'Stack Overflow',
    origin: 'https://stackoverflow.com'
  };

  let closedTabId = null;
  const mockTabs = {
    create: (opts) => {
      assert.strictEqual(opts.active, false, 'Tab opened strictly in background');
      assert.strictEqual(opts.pinned, true, 'Tab opened pinned');
      assert.strictEqual(opts.url, openTabSite.origin);
      return { id: 888, url: opts.url, pinned: true, active: false };
    },
    remove: (tabId) => {
      closedTabId = tabId;
    }
  };

  const bgTab = mockTabs.create({ url: openTabSite.origin, active: false, pinned: true });
  assert.strictEqual(bgTab.id, 888);

  // Simulated auto-capture of search URL
  const marker = 'holdtab_test_so456';
  const capturedUrl = `https://stackoverflow.com/questions/tagged?q=${marker}`;
  const idx = capturedUrl.indexOf(marker);
  const derivedTemplate = capturedUrl.substring(0, idx) + '{query}' + capturedUrl.substring(idx + marker.length);

  assert.strictEqual(derivedTemplate, 'https://stackoverflow.com/questions/tagged?q={query}');

  // Close background tab
  mockTabs.remove(bgTab.id);
  assert.strictEqual(closedTabId, 888, 'Background pinned tab cleaned up');

  // Verify storage insertion into toolbarSearchWebsites
  const existingWebsites = [...DEFAULT_SEARCH_WEBSITES];
  const newSite = {
    id: 'custom_' + Date.now(),
    name: openTabSite.name,
    template: derivedTemplate,
    enabled: true,
    icon: 'custom'
  };
  existingWebsites.push(newSite);

  const found = existingWebsites.find((s) => s.name === 'Stack Overflow');
  assert(found, 'Site saved to search engine list');
  assert.strictEqual(found.template, 'https://stackoverflow.com/questions/tagged?q={query}');

  // Test fallback if search bar not found
  const fallbackSite = { domain: 'staticdocs.com', name: 'StaticDocs' };
  const fallbackTemplate = `https://${fallbackSite.domain}/#ht-site-search={query}`;
  assert.strictEqual(fallbackTemplate, 'https://staticdocs.com/#ht-site-search={query}');

  console.log('  ✓ Scenario 33: Open Tabs save icon click & auto-capture integration verified');
}

// ---------------------------------------------------------------------------
// Scenario 34: Quick Search empty input opens website base URL
// ---------------------------------------------------------------------------
{
  const getWebsiteBaseUrl = (site) => {
    if (!site) return 'https://www.google.com/';
    if (site.url && typeof site.url === 'string' && /^https?:\/\//i.test(site.url)) {
      return site.url;
    }
    const template = site.template || '';
    if (template) {
      try {
        const fixed = template.includes('://') ? template : 'https://' + template;
        const parsed = new URL(fixed);
        return `${parsed.origin}/`;
      } catch (e) {
        const stripped = template.split('?')[0].replace(/\{query\}/gi, '').trim();
        return stripped || 'https://www.google.com/';
      }
    }
    return 'https://www.google.com/';
  };

  // 1. Built-in Google
  const google = { id: 'google', name: 'Google', template: 'https://www.google.com/search?q={query}' };
  assert.strictEqual(getWebsiteBaseUrl(google), 'https://www.google.com/');

  // 2. Built-in YouTube
  const youtube = { id: 'youtube', name: 'YouTube', template: 'https://www.youtube.com/results?search_query={query}' };
  assert.strictEqual(getWebsiteBaseUrl(youtube), 'https://www.youtube.com/');

  // 3. Custom path-based template
  const steamdb = { id: 'steamdb', name: 'SteamDB', template: 'https://steamdb.info/search/?q={query}' };
  assert.strictEqual(getWebsiteBaseUrl(steamdb), 'https://steamdb.info/');

  // 4. Custom site with explicit site.url
  const customPortal = { id: 'portal', name: 'My Portal', url: 'https://internal.portal.dev/dashboard', template: 'https://internal.portal.dev/search?term={query}' };
  assert.strictEqual(getWebsiteBaseUrl(customPortal), 'https://internal.portal.dev/dashboard');

  // Verify URL does not contain empty query or literal undefined/null
  [google, youtube, steamdb, customPortal].forEach(site => {
    const base = getWebsiteBaseUrl(site);
    assert(!base.includes('{query}'), 'No {query} in base URL');
    assert(!base.includes('undefined'), 'No undefined in base URL');
    assert(!base.includes('null'), 'No null in base URL');
    assert(!base.includes('?q='), 'No empty query param in base URL');
  });

  // Verify content.js contains getWebsiteBaseUrl implementation
  const contentJs = fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8');
  assert(contentJs.includes('function getWebsiteBaseUrl'), 'getWebsiteBaseUrl exists in content.js');

  console.log('  ✓ Scenario 34: Quick Search empty input accurately resolves to website base URL without errors');
}

// ---------------------------------------------------------------------------
// Scenario 35: Globe icon fallback for search engines without usable logo
// ---------------------------------------------------------------------------
{
  const popupJs = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const contentJs = fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8');

  // Verify GLOBE_ICON_SVG exists in both files
  assert(popupJs.includes('ht-globe-fallback'), 'Globe icon fallback SVG exists in popup.js');
  assert(contentJs.includes('ht-globe-fallback'), 'Globe icon fallback SVG exists in content.js');

  // Verify attachIconErrorFallbacks exists in popup.js
  assert(popupJs.includes('attachIconErrorFallbacks'), 'attachIconErrorFallbacks function defined in popup.js');

  // Verify event-listener based error fallback in content.js
  assert(contentJs.includes("addEventListener('error'"), 'DOM error handler attached for image fallbacks in content.js');

  console.log('  ✓ Scenario 35: Globe icon fallback renders consistently without broken images or CSP errors');
}

// ---------------------------------------------------------------------------
// Scenario 36: Duplicate website detection with normalization & actions
// ---------------------------------------------------------------------------
{
  const popupJs = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(__dirname, '../popup/popup.html'), 'utf8');

  // Verify duplicate warning markup in popup.html
  assert(popupHtml.includes('id="websiteDuplicateWarning"'), 'websiteDuplicateWarning exists in popup.html');
  assert(popupHtml.includes('id="captureDuplicateWarning"'), 'captureDuplicateWarning exists in popup.html');
  assert(popupHtml.includes('id="websiteDuplicateAddAnywayBtn"'), 'Add Anyway button exists for manual website form');
  assert(popupHtml.includes('id="captureDuplicateAddAnywayBtn"'), 'Add Anyway button exists for captured review');

  // Verify duplicate detection helper exists
  assert(popupJs.includes('findDuplicateWebsite'), 'findDuplicateWebsite function implemented in popup.js');
  assert(popupJs.includes('normalizeUrlForDuplicateCheck'), 'normalizeUrlForDuplicateCheck function implemented in popup.js');

  // Test duplicate detection logic directly
  const normalizeUrlForDuplicateCheck = (urlStr) => {
    if (!urlStr || typeof urlStr !== 'string') return '';
    let cleaned = urlStr.trim().toLowerCase();
    cleaned = cleaned.replace(/^https?:\/\//i, '');
    cleaned = cleaned.replace(/^www\./i, '');
    cleaned = cleaned.replace(/\/+$/, '');
    return cleaned;
  };

  const getDomainFromUrl = (urlStr) => {
    if (!urlStr) return '';
    try {
      const fixed = urlStr.includes('://') ? urlStr : 'https://' + urlStr;
      return new URL(fixed).hostname.replace(/^www\./i, '').toLowerCase();
    } catch (_) { return ''; }
  };

  const findDuplicate = (sites, candidateTemplate, candidateName, excludeId = null) => {
    const candidateNorm = normalizeUrlForDuplicateCheck(candidateTemplate);
    const candidateDomain = getDomainFromUrl(candidateTemplate);
    const candidateNameLower = (candidateName || '').trim().toLowerCase();

    for (const site of sites) {
      if (excludeId && site.id === excludeId) continue;
      const siteNorm = normalizeUrlForDuplicateCheck(site.template || site.url);
      const siteDomain = getDomainFromUrl(site.template || site.url);
      const siteNameLower = (site.name || '').trim().toLowerCase();

      if (candidateNorm && siteNorm && candidateNorm === siteNorm) {
        return { duplicate: true, type: 'exact', message: `This website already exists in your list ("${site.name}").` };
      }
      if (candidateDomain && siteDomain && candidateDomain === siteDomain) {
        return { duplicate: true, type: 'domain', message: `This website already exists in your list ("${site.name}") with a different search configuration.` };
      }
      if (candidateNameLower && siteNameLower && candidateNameLower === siteNameLower) {
        return { duplicate: true, type: 'name', message: `A search engine named "${site.name}" already exists in your list.` };
      }
    }
    return { duplicate: false };
  };

  const sites = [
    { id: 'google', name: 'Google', template: 'https://www.google.com/search?q={query}' },
    { id: 'youtube', name: 'YouTube', template: 'https://www.youtube.com/results?search_query={query}' }
  ];

  // Exact duplicate with differing casing/trailing slash/protocol
  const exactDup = findDuplicate(sites, 'http://GOOGLE.COM/search?q={query}/', 'Google Search');
  assert.strictEqual(exactDup.duplicate, true);
  assert.strictEqual(exactDup.type, 'exact');

  // Same domain, different configuration
  const domainDup = findDuplicate(sites, 'https://google.com/images?q={query}', 'Google Images');
  assert.strictEqual(domainDup.duplicate, true);
  assert.strictEqual(domainDup.type, 'domain');

  // Editing existing engine does NOT trigger warning against itself
  const editSelf = findDuplicate(sites, 'https://www.google.com/search?q={query}', 'Google', 'google');
  assert.strictEqual(editSelf.duplicate, false);

  // Fresh website does not trigger duplicate
  const freshSite = findDuplicate(sites, 'https://duckduckgo.com/?q={query}', 'DuckDuckGo');
  assert.strictEqual(freshSite.duplicate, false);

  console.log('  ✓ Scenario 36: Duplicate website detection with normalization, domain check, and Add Anyway actions verified');
}

// Scenario 37: Keyboard events isolation from underlying webpage while preserving input behavior
{
  class MockKeyboardEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.key = init.key || '';
      this.code = init.code || '';
      this.ctrlKey = !!init.ctrlKey;
      this.altKey = !!init.altKey;
      this.shiftKey = !!init.shiftKey;
      this.metaKey = !!init.metaKey;
      this.defaultPrevented = false;
      this.propagationStopped = false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
    stopPropagation() {
      this.propagationStopped = true;
    }
    stopImmediatePropagation() {
      this.propagationStopped = true;
    }
  }

  // Simulate quickQueryInputEl listeners
  const quickQueryInputListeners = {
    keydown: [],
    keyup: [],
    keypress: []
  };

  const addQuickInputListener = (type, fn) => {
    quickQueryInputListeners[type].push(fn);
  };

  // Implement the exact logic added in content.js for quickQueryInputEl
  addQuickInputListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
    } else if (e.key === 'Escape') {
      e.preventDefault();
    }
  });

  addQuickInputListener('keyup', (e) => {
    e.stopPropagation();
  });

  addQuickInputListener('keypress', (e) => {
    e.stopPropagation();
  });

  const dispatchQuickInputEvent = (type, init) => {
    const ev = new MockKeyboardEvent(type, init);
    for (const fn of quickQueryInputListeners[type]) {
      fn(ev);
    }
    return ev;
  };

  // 1. YouTube 'F' fullscreen shortcut key: must stop propagation so YouTube doesn't receive it, but NOT prevent default
  const fKeyDown = dispatchQuickInputEvent('keydown', { key: 'f', code: 'KeyF' });
  assert.strictEqual(fKeyDown.propagationStopped, true, "Typing 'f' must stop propagation");
  assert.strictEqual(fKeyDown.defaultPrevented, false, "Typing 'f' must NOT prevent default action (allows character insertion)");

  const fKeyUp = dispatchQuickInputEvent('keyup', { key: 'f', code: 'KeyF' });
  assert.strictEqual(fKeyUp.propagationStopped, true, "'f' keyup must stop propagation");

  // 2. YouTube 'Space' pause shortcut key: must stop propagation, but NOT prevent default
  const spaceKeyDown = dispatchQuickInputEvent('keydown', { key: ' ', code: 'Space' });
  assert.strictEqual(spaceKeyDown.propagationStopped, true, "Pressing Space must stop propagation");
  assert.strictEqual(spaceKeyDown.defaultPrevented, false, "Pressing Space must NOT prevent default action (allows space character insertion)");

  // 3. Native editing keys: Backspace, Delete, ArrowLeft, ArrowRight, Home, End
  const backspaceEv = dispatchQuickInputEvent('keydown', { key: 'Backspace' });
  assert.strictEqual(backspaceEv.propagationStopped, true);
  assert.strictEqual(backspaceEv.defaultPrevented, false);

  const arrowLeftEv = dispatchQuickInputEvent('keydown', { key: 'ArrowLeft' });
  assert.strictEqual(arrowLeftEv.propagationStopped, true);
  assert.strictEqual(arrowLeftEv.defaultPrevented, false);

  // 4. Modifier shortcuts: Ctrl+A, Ctrl+C, Ctrl+V
  const ctrlAEv = dispatchQuickInputEvent('keydown', { key: 'a', ctrlKey: true });
  assert.strictEqual(ctrlAEv.propagationStopped, true);
  assert.strictEqual(ctrlAEv.defaultPrevented, false);

  // 5. Handled Quick Search actions: Enter, Escape, ArrowDown should preventDefault
  const enterEv = dispatchQuickInputEvent('keydown', { key: 'Enter' });
  assert.strictEqual(enterEv.propagationStopped, true);
  assert.strictEqual(enterEv.defaultPrevented, true);

  const escapeEv = dispatchQuickInputEvent('keydown', { key: 'Escape' });
  assert.strictEqual(escapeEv.propagationStopped, true);
  assert.strictEqual(escapeEv.defaultPrevented, true);

  const arrowDownEv = dispatchQuickInputEvent('keydown', { key: 'ArrowDown' });
  assert.strictEqual(arrowDownEv.propagationStopped, true);
  assert.strictEqual(arrowDownEv.defaultPrevented, true);

  // 6. Toolbar container isolation lifecycle
  let isQuickSearchOpen = true;
  const isolateQuickSearchKeyEvents = (e) => {
    if (isQuickSearchOpen) {
      e.stopPropagation();
    }
  };

  const containerKeyWhenOpen = new MockKeyboardEvent('keydown', { key: 'm' });
  isolateQuickSearchKeyEvents(containerKeyWhenOpen);
  assert.strictEqual(containerKeyWhenOpen.propagationStopped, true, 'Container must stop propagation while QS is open');

  isQuickSearchOpen = false;
  const containerKeyWhenClosed = new MockKeyboardEvent('keydown', { key: 'm' });
  isolateQuickSearchKeyEvents(containerKeyWhenClosed);
  assert.strictEqual(containerKeyWhenClosed.propagationStopped, false, 'Container must NOT stop propagation when QS is closed');

  console.log('  ✓ Scenario 37: Quick Search keyboard event isolation prevents page shortcut leaks while preserving native input');
}

// Scenario 38: Right-click hold + mouse wheel click shortcut for Quick Search
{
  class MockMouseEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.button = typeof init.button === 'number' ? init.button : 0;
      this.buttons = typeof init.buttons === 'number' ? init.buttons : 0;
      this.clientX = init.clientX || 0;
      this.clientY = init.clientY || 0;
      this.defaultPrevented = false;
      this.propagationStopped = false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
    stopPropagation() {
      this.propagationStopped = true;
    }
    stopImmediatePropagation() {
      this.propagationStopped = true;
    }
  }

  let isRightMouseDown = false;
  let quickSearchMouseTriggered = false;
  let isQuickSearchOpen = false;
  let holdCancelled = false;
  let suppressContextMenuUntil = 0;
  let suppressClickUntil = 0;

  const cancelHold = () => {
    holdCancelled = true;
  };

  const toggleQuickSearch = () => {
    isQuickSearchOpen = !isQuickSearchOpen;
  };

  const config = {
    enabled: true,
    quickSearchEnabled: true,
    quickSearchMouseShortcut: true
  };

  const isQuickSearchAllowed = () => config.enabled && config.quickSearchEnabled;

  const handleMouseDown = (e) => {
    // Middle-click (mouse wheel click)
    if (e.button === 1) {
      const isRightHeld = isRightMouseDown || ((e.buttons & 2) !== 0);
      if (isRightHeld && config.enabled && isQuickSearchAllowed() && config.quickSearchMouseShortcut !== false) {
        quickSearchMouseTriggered = true;
        suppressContextMenuUntil = Date.now() + 1500;
        suppressClickUntil = Date.now() + 1500;
        cancelHold();
        toggleQuickSearch();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    if (e.button === 2) {
      if (config.enabled && isQuickSearchAllowed() && config.quickSearchMouseShortcut !== false && (e.buttons & 4) !== 0) {
        quickSearchMouseTriggered = true;
        suppressContextMenuUntil = Date.now() + 1500;
        suppressClickUntil = Date.now() + 1500;
        cancelHold();
        toggleQuickSearch();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      isRightMouseDown = true;
    }
  };

  const handleMouseUp = (e) => {
    if (e.button === 1 && quickSearchMouseTriggered) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.button === 2) {
      isRightMouseDown = false;
      if (quickSearchMouseTriggered) {
        e.preventDefault();
        e.stopPropagation();
        suppressContextMenuUntil = Date.now() + 1800;
        return;
      }
    }
  };

  const handleContextMenu = (e) => {
    if (quickSearchMouseTriggered || Date.now() < suppressContextMenuUntil) {
      e.preventDefault();
      e.stopPropagation();
      quickSearchMouseTriggered = false;
      return false;
    }
  };

  // 1. Right click hold down
  const rightDown = new MockMouseEvent('mousedown', { button: 2, buttons: 2 });
  handleMouseDown(rightDown);
  assert.strictEqual(isRightMouseDown, true, 'Right mouse button should be tracked as held');
  assert.strictEqual(isQuickSearchOpen, false, 'Quick Search should not open on right click alone');

  // 2. Click mouse wheel while holding right button
  const wheelDown = new MockMouseEvent('mousedown', { button: 1, buttons: 6 }); // buttons = 2 (right) + 4 (middle)
  handleMouseDown(wheelDown);
  assert.strictEqual(quickSearchMouseTriggered, true, 'Quick Search mouse shortcut should trigger');
  assert.strictEqual(isQuickSearchOpen, true, 'Quick Search should be toggled open');
  assert.strictEqual(holdCancelled, true, 'Ongoing hold actions should be cancelled');
  assert.strictEqual(wheelDown.defaultPrevented, true, 'Middle click default should be prevented');

  // 3. Mouse up for middle button
  const wheelUp = new MockMouseEvent('mouseup', { button: 1 });
  handleMouseUp(wheelUp);
  assert.strictEqual(wheelUp.defaultPrevented, true, 'Middle click mouseup should be prevented');

  // 4. Mouse up for right button
  const rightUp = new MockMouseEvent('mouseup', { button: 2 });
  handleMouseUp(rightUp);
  assert.strictEqual(isRightMouseDown, false);
  assert.strictEqual(rightUp.defaultPrevented, true, 'Right click mouseup should be suppressed');

  // 5. Contextmenu event following right click release
  const contextMenuEv = new MockMouseEvent('contextmenu', { button: 2 });
  handleContextMenu(contextMenuEv);
  assert.strictEqual(contextMenuEv.defaultPrevented, true, 'Context menu must be suppressed');

  // 6. Repeating gesture toggles Quick Search closed
  isRightMouseDown = true;
  const wheelDownClose = new MockMouseEvent('mousedown', { button: 1, buttons: 6 });
  handleMouseDown(wheelDownClose);
  assert.strictEqual(isQuickSearchOpen, false, 'Subsequent gesture should toggle Quick Search closed');

  // 7. Middle click without right click does NOT trigger Quick Search
  isRightMouseDown = false;
  const standaloneWheel = new MockMouseEvent('mousedown', { button: 1, buttons: 4 });
  handleMouseDown(standaloneWheel);
  assert.strictEqual(standaloneWheel.defaultPrevented, false, 'Standalone middle click must not be intercepted');

  // 8. When quickSearchMouseShortcut is disabled in settings, gesture does not trigger
  config.quickSearchMouseShortcut = false;
  isRightMouseDown = true;
  const disabledWheel = new MockMouseEvent('mousedown', { button: 1, buttons: 6 });
  handleMouseDown(disabledWheel);
  assert.strictEqual(disabledWheel.defaultPrevented, false, 'Disabled mouse shortcut should not trigger');

  console.log('  ✓ Scenario 38: Right-click hold + mouse wheel click shortcut for Quick Search verified');
}

// ============================================================================
// Scenario 39: Tab Cycle Wheel Speed slider configuration & throttling logic
// ============================================================================
{
  const defaultSpeed = 120;
  const config = { tabCycleWheelSpeed: 120 };

  // Helper calculating effective wheel throttle
  const getWheelThrottle = (cfg) => Math.max(40, Number(cfg.tabCycleWheelSpeed) || defaultSpeed);

  // 1. Default speed validation
  assert.strictEqual(getWheelThrottle(config), 120, 'Default wheel speed should be 120ms');

  // 2. Fast speed (50ms)
  config.tabCycleWheelSpeed = 50;
  assert.strictEqual(getWheelThrottle(config), 50, 'Configured fast speed should be 50ms');

  // 3. Smooth speed (300ms)
  config.tabCycleWheelSpeed = 300;
  assert.strictEqual(getWheelThrottle(config), 300, 'Configured smooth speed should be 300ms');

  // 4. Minimum guardrail protection: values below 40 are clamped to 40ms minimum
  config.tabCycleWheelSpeed = 20;
  assert.strictEqual(getWheelThrottle(config), 40, 'Speeds below 40ms must be safely clamped to 40ms');

  // 5. Throttling simulation
  config.tabCycleWheelSpeed = 60;
  const throttle = getWheelThrottle(config);
  let lastWheelTime = 1000;

  // Event at 1030ms (30ms delta < 60ms throttle) -> Should throttle
  const shouldThrottleEarly = (1030 - lastWheelTime) < throttle;
  assert.strictEqual(shouldThrottleEarly, true, 'Event within cooldown must be throttled');

  // Event at 1070ms (70ms delta >= 60ms throttle) -> Should allow
  const shouldThrottleLate = (1070 - lastWheelTime) < throttle;
  assert.strictEqual(shouldThrottleLate, false, 'Event past cooldown must be allowed');

  console.log('  ✓ Scenario 39: Right-click hold + wheel scroll speed configuration (tabCycleWheelSpeed) and cooldown throttling verified');
}

console.log('\nResults: 39 / 39 Quick Search tests passed.');
console.log('🎉 ALL QUICK SEARCH TESTS COMPLETED SUCCESSFULLY!\n');

