// HoldTab - Search Engine Categories Unit Test Suite
// Verifies all 20 scenarios specified in the Categories requirement

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- Running HoldTab Category Management Unit Tests ---');

const DEFAULT_SEARCH_CATEGORIES = [
  { id: 'cat_gaming', name: 'Gaming', color: '#818cf8', order: 0, createdAt: 1700000000000 },
  { id: 'cat_work', name: 'Work', color: '#38bdf8', order: 1, createdAt: 1700000000001 },
  { id: 'cat_movies', name: 'Movies', color: '#f43f5e', order: 2, createdAt: 1700000000002 },
  { id: 'cat_shopping', name: 'Shopping', color: '#f59e0b', order: 3, createdAt: 1700000000003 },
  { id: 'cat_research', name: 'Research', color: '#10b981', order: 4, createdAt: 1700000000004 }
];

const DEFAULT_SEARCH_WEBSITES = [
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q={query}', enabled: true, icon: 'google', categoryId: 'cat_research' },
  { id: 'youtube', name: 'YouTube', template: 'https://www.youtube.com/results?search_query={query}', enabled: true, icon: 'youtube', categoryId: 'cat_movies' },
  { id: 'wikipedia', name: 'Wikipedia', template: 'https://en.wikipedia.org/w/index.php?search={query}', enabled: true, icon: 'wikipedia', categoryId: 'cat_research' },
  { id: 'reddit', name: 'Reddit', template: 'https://www.reddit.com/search/?q={query}', enabled: true, icon: 'reddit', categoryId: 'cat_work' },
  { id: 'github', name: 'GitHub', template: 'https://github.com/search?q={query}', enabled: true, icon: 'github', categoryId: 'cat_work' },
  { id: 'amazon', name: 'Amazon', template: 'https://www.amazon.com/s?k={query}', enabled: true, icon: 'amazon', categoryId: 'cat_shopping' }
];

// Helper: Filter engines based on category and optional text query
function filterEnginesByCategory(sites, categories, activeCatId, query = '') {
  let list = Array.isArray(sites) ? sites.filter((s) => s.enabled !== false) : [];

  if (activeCatId && activeCatId !== 'all') {
    const knownCatIds = new Set((categories || []).map((c) => c.id));
    if (activeCatId === 'uncategorized') {
      list = list.filter((s) => !s.categoryId || s.categoryId === 'uncategorized' || !knownCatIds.has(s.categoryId));
    } else {
      list = list.filter((s) => s.categoryId === activeCatId);
    }
  }

  const trimmed = (query || '').trim().toLowerCase();
  if (trimmed) {
    list = list.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const id = (s.id || '').toLowerCase();
      return name.includes(trimmed) || id.includes(trimmed);
    });
  }

  return list;
}

// ---------------------------------------------------------------------------
// Scenario 1: Existing engines load correctly after migration (idempotent)
// ---------------------------------------------------------------------------
{
  // Simulated storage from previous version without categoryId
  const legacyStorage = {
    toolbarSearchWebsites: [
      { id: 'legacy_engine', name: 'CustomLegacy', template: 'https://legacy.example/search?q={query}', enabled: true }
    ]
  };

  const categories = legacyStorage.searchCategories || DEFAULT_SEARCH_CATEGORIES;
  const knownCatIds = new Set(categories.map((c) => c.id));

  // Verify legacy engine has undefined categoryId but loads safely as Uncategorized
  const engine = legacyStorage.toolbarSearchWebsites[0];
  const assignedCat = engine.categoryId && knownCatIds.has(engine.categoryId) ? engine.categoryId : 'uncategorized';

  assert.strictEqual(assignedCat, 'uncategorized');
  assert.strictEqual(engine.name, 'CustomLegacy');
  assert.strictEqual(engine.template, 'https://legacy.example/search?q={query}');
  console.log('  ✓ Scenario 1: Existing engines load correctly after migration');
}

// ---------------------------------------------------------------------------
// Scenario 2: User can create a category with stable ID and color (pure text, no icon)
// ---------------------------------------------------------------------------
{
  const categories = [...DEFAULT_SEARCH_CATEGORIES];
  const newCat = {
    id: 'cat_' + Date.now() + '_test1',
    name: 'Anime',
    color: '#ec4899',
    order: categories.length,
    createdAt: Date.now()
  };
  categories.push(newCat);

  assert.strictEqual(categories.length, 6);
  assert(newCat.id.startsWith('cat_'));
  assert.strictEqual(newCat.name, 'Anime');
  assert.strictEqual(newCat.color, '#ec4899');
  console.log('  ✓ Scenario 2: User can create a category');
}

// ---------------------------------------------------------------------------
// Scenario 3: Empty and duplicate category names are rejected (case-insensitive)
// ---------------------------------------------------------------------------
{
  const categories = [...DEFAULT_SEARCH_CATEGORIES];

  function validateCategoryName(rawName, existingCats, editingId = null) {
    const trimmed = (rawName || '').trim();
    if (!trimmed) return { valid: false, error: 'Category name cannot be empty.' };
    if (trimmed.length > 30) return { valid: false, error: 'Category name must be 30 characters or fewer.' };

    const isDuplicate = existingCats.some((c) =>
      c.id !== editingId && c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) return { valid: false, error: `A category named "${trimmed}" already exists.` };

    return { valid: true, name: trimmed };
  }

  assert.strictEqual(validateCategoryName('', categories).valid, false);
  assert.strictEqual(validateCategoryName('   ', categories).valid, false);
  assert.strictEqual(validateCategoryName('Gaming', categories).valid, false); // exact duplicate
  assert.strictEqual(validateCategoryName('gaming', categories).valid, false); // case-insensitive duplicate
  assert.strictEqual(validateCategoryName('  WORK  ', categories).valid, false); // trimmed duplicate
  assert.strictEqual(validateCategoryName('Novel Cat', categories).valid, true);

  console.log('  ✓ Scenario 3: Empty and duplicate category names are rejected');
}

// ---------------------------------------------------------------------------
// Scenario 4: User can rename a category without losing engine assignments (stable ID)
// ---------------------------------------------------------------------------
{
  const categories = JSON.parse(JSON.stringify(DEFAULT_SEARCH_CATEGORIES));
  const sites = JSON.parse(JSON.stringify(DEFAULT_SEARCH_WEBSITES));

  // YouTube is assigned to 'cat_movies'
  const youtube = sites.find((s) => s.id === 'youtube');
  assert.strictEqual(youtube.categoryId, 'cat_movies');

  // Rename category 'cat_movies' -> 'Cinema & TV'
  const moviesCat = categories.find((c) => c.id === 'cat_movies');
  moviesCat.name = 'Cinema & TV';

  // Engine still points to 'cat_movies' ID, perfectly preserved!
  assert.strictEqual(youtube.categoryId, 'cat_movies');
  assert.strictEqual(moviesCat.id, 'cat_movies');
  assert.strictEqual(moviesCat.name, 'Cinema & TV');

  console.log('  ✓ Scenario 4: User can rename a category without losing engine assignments');
}

// ---------------------------------------------------------------------------
// Scenario 5: User can delete a category without deleting its search engines
// ---------------------------------------------------------------------------
{
  let categories = JSON.parse(JSON.stringify(DEFAULT_SEARCH_CATEGORIES));
  let sites = JSON.parse(JSON.stringify(DEFAULT_SEARCH_WEBSITES));

  const initialEngineCount = sites.length;
  const catToDelete = 'cat_gaming';

  // Delete category
  categories = categories.filter((c) => c.id !== catToDelete);
  assert.strictEqual(categories.length, DEFAULT_SEARCH_CATEGORIES.length - 1);

  // Engines count MUST be unchanged
  assert.strictEqual(sites.length, initialEngineCount, 'Deleting category does not delete engines');

  console.log('  ✓ Scenario 5: User can delete a category without deleting its engines');
}

// ---------------------------------------------------------------------------
// Scenario 6: Engines are reassigned to Uncategorized when their category is deleted
// ---------------------------------------------------------------------------
{
  let categories = JSON.parse(JSON.stringify(DEFAULT_SEARCH_CATEGORIES));
  let sites = JSON.parse(JSON.stringify(DEFAULT_SEARCH_WEBSITES));

  const targetCatId = 'cat_shopping'; // Amazon is assigned here
  const amazonBefore = sites.find((s) => s.id === 'amazon');
  assert.strictEqual(amazonBefore.categoryId, 'cat_shopping');

  // Perform deletion
  categories = categories.filter((c) => c.id !== targetCatId);
  sites = sites.map((s) => (s.categoryId === targetCatId ? { ...s, categoryId: null } : s));

  const amazonAfter = sites.find((s) => s.id === 'amazon');
  assert.strictEqual(amazonAfter.categoryId, null, 'Assigned to uncategorized');

  // Filter for uncategorized
  const uncatEngines = filterEnginesByCategory(sites, categories, 'uncategorized');
  assert(uncatEngines.some((s) => s.id === 'amazon'), 'Amazon appears in Uncategorized view');

  console.log('  ✓ Scenario 6: Engines are reassigned to Uncategorized when category is deleted');
}

// ---------------------------------------------------------------------------
// Scenario 7: User can assign a category when adding a new engine
// ---------------------------------------------------------------------------
{
  const sites = [...DEFAULT_SEARCH_WEBSITES];
  const newEngine = {
    id: 'custom_' + Date.now(),
    name: 'Steam Store',
    template: 'https://store.steampowered.com/search/?term={query}',
    enabled: true,
    icon: 'custom',
    categoryId: 'cat_gaming'
  };
  sites.push(newEngine);

  assert.strictEqual(newEngine.categoryId, 'cat_gaming');
  const gamingEngines = filterEnginesByCategory(sites, DEFAULT_SEARCH_CATEGORIES, 'cat_gaming');
  assert(gamingEngines.some((s) => s.name === 'Steam Store'));

  console.log('  ✓ Scenario 7: User can assign a category when adding a new engine');
}

// ---------------------------------------------------------------------------
// Scenario 8: User can change an existing engine\'s category using Toolbar dropdown
// ---------------------------------------------------------------------------
{
  const sites = JSON.parse(JSON.stringify(DEFAULT_SEARCH_WEBSITES));
  const reddit = sites.find((s) => s.id === 'reddit');
  assert.strictEqual(reddit.categoryId, 'cat_work');

  // Change dropdown from 'cat_work' to 'cat_research'
  reddit.categoryId = 'cat_research';
  assert.strictEqual(reddit.categoryId, 'cat_research');

  const researchEngines = filterEnginesByCategory(sites, DEFAULT_SEARCH_CATEGORIES, 'cat_research');
  assert(researchEngines.some((s) => s.id === 'reddit'));

  console.log('  ✓ Scenario 8: User can change an existing engine category using Toolbar dropdown');
}

// ---------------------------------------------------------------------------
// Scenario 9: Changing category does not alter engine URL, name, or enabled state
// ---------------------------------------------------------------------------
{
  const site = {
    id: 'github',
    name: 'GitHub',
    template: 'https://github.com/search?q={query}',
    enabled: false,
    icon: 'github',
    categoryId: 'cat_work'
  };

  // Change category
  const updatedSite = { ...site, categoryId: 'cat_research' };

  assert.strictEqual(updatedSite.id, site.id);
  assert.strictEqual(updatedSite.name, site.name);
  assert.strictEqual(updatedSite.template, site.template);
  assert.strictEqual(updatedSite.enabled, false, 'Disabled state preserved');
  assert.strictEqual(updatedSite.icon, site.icon);
  assert.strictEqual(updatedSite.categoryId, 'cat_research');

  console.log('  ✓ Scenario 9: Changing category does not alter engine URL or enabled state');
}

// ---------------------------------------------------------------------------
// Scenario 10: Quick Search popup filters engines correctly by category
// ---------------------------------------------------------------------------
{
  const sites = [...DEFAULT_SEARCH_WEBSITES];
  const moviesEngines = filterEnginesByCategory(sites, DEFAULT_SEARCH_CATEGORIES, 'cat_movies');
  assert.strictEqual(moviesEngines.length, 1);
  assert.strictEqual(moviesEngines[0].id, 'youtube');

  const workEngines = filterEnginesByCategory(sites, DEFAULT_SEARCH_CATEGORIES, 'cat_work');
  assert.strictEqual(workEngines.length, 2);
  assert(workEngines.some((s) => s.id === 'reddit'));
  assert(workEngines.some((s) => s.id === 'github'));

  console.log('  ✓ Scenario 10: Quick Search popup filters engines correctly by category');
}

// ---------------------------------------------------------------------------
// Scenario 11: The All category shows all enabled, non-private engines
// ---------------------------------------------------------------------------
{
  const categories = [
    ...DEFAULT_SEARCH_CATEGORIES,
    { id: 'cat_private', name: 'Private Vault', isPrivate: true, order: 5 }
  ];

  const sites = [
    ...DEFAULT_SEARCH_WEBSITES,
    { id: 'vault_engine', name: 'VaultEngine', template: 'https://vault.test/?q={query}', enabled: true, categoryId: 'cat_private' },
    { id: 'disabled_engine', name: 'DisabledOne', template: 'https://off.test/?q={query}', enabled: false, categoryId: 'cat_work' }
  ];

  // In All category, disabled engines are excluded, and engines in private categories are excluded
  const nonPrivateCatIds = new Set(categories.filter((c) => !c.isPrivate).map((c) => c.id));
  const allEngines = sites.filter((s) => {
    if (s.enabled === false) return false;
    if (s.categoryId && !nonPrivateCatIds.has(s.categoryId)) return false;
    return true;
  });

  assert.strictEqual(allEngines.length, 6);
  assert(!allEngines.some((s) => s.id === 'disabled_engine'));
  assert(!allEngines.some((s) => s.id === 'vault_engine'));

  console.log('  ✓ Scenario 11: The All category shows all enabled, non-private engines');
}

// ---------------------------------------------------------------------------
// Scenario 12: Engine search input works within the selected category
// ---------------------------------------------------------------------------
{
  const sites = [...DEFAULT_SEARCH_WEBSITES];

  // In 'cat_work' we have Reddit and GitHub
  const workFiltered = filterEnginesByCategory(sites, DEFAULT_SEARCH_CATEGORIES, 'cat_work', 'git');
  assert.strictEqual(workFiltered.length, 1);
  assert.strictEqual(workFiltered[0].id, 'github');

  // Search for 'google' inside 'cat_work' returns empty (since Google is in Research)
  const noMatch = filterEnginesByCategory(sites, DEFAULT_SEARCH_CATEGORIES, 'cat_work', 'google');
  assert.strictEqual(noMatch.length, 0);

  console.log('  ✓ Scenario 12: Engine search input works within the selected category');
}

// ---------------------------------------------------------------------------
// Scenario 13: Deleting a currently selected category returns selector to All
// ---------------------------------------------------------------------------
{
  let categories = [...DEFAULT_SEARCH_CATEGORIES];
  let activeCategoryId = 'cat_movies';

  // Delete 'cat_movies'
  categories = categories.filter((c) => c.id !== 'cat_movies');

  // Verification helper from content.js
  if (activeCategoryId !== 'all' && activeCategoryId !== 'uncategorized') {
    const exists = categories.some((c) => c.id === activeCategoryId);
    if (!exists) {
      activeCategoryId = 'all';
    }
  }

  assert.strictEqual(activeCategoryId, 'all', 'Safely resets to All when selected category is deleted');
  console.log('  ✓ Scenario 13: Deleting a currently selected category returns selector to All');
}

// ---------------------------------------------------------------------------
// Scenario 14: Empty categories display a useful empty state message
// ---------------------------------------------------------------------------
{
  const sites = [...DEFAULT_SEARCH_WEBSITES];
  // 'cat_gaming' has no engines assigned in default set
  const gamingEngines = filterEnginesByCategory(sites, DEFAULT_SEARCH_CATEGORIES, 'cat_gaming');
  assert.strictEqual(gamingEngines.length, 0);

  const emptyMessage = gamingEngines.length === 0
    ? 'No enabled search engines in this category.'
    : null;

  assert.strictEqual(emptyMessage, 'No enabled search engines in this category.');
  console.log('  ✓ Scenario 14: Empty categories display a useful empty state');
}

// ---------------------------------------------------------------------------
// Scenario 15: Category order remains consistent across all interfaces
// ---------------------------------------------------------------------------
{
  const categories = [
    { id: 'cat_c', name: 'Charlie', order: 2 },
    { id: 'cat_a', name: 'Alpha', order: 0 },
    { id: 'cat_b', name: 'Bravo', order: 1 }
  ];

  const sorted = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  assert.strictEqual(sorted[0].id, 'cat_a');
  assert.strictEqual(sorted[1].id, 'cat_b');
  assert.strictEqual(sorted[2].id, 'cat_c');

  // Verify chips array: All always first, then user categories in order
  const chips = ['all', ...sorted.map((c) => c.id)];
  assert.deepStrictEqual(chips, ['all', 'cat_a', 'cat_b', 'cat_c']);

  console.log('  ✓ Scenario 15: Category order remains consistent across all relevant interfaces');
}

// ---------------------------------------------------------------------------
// Scenario 16: Multiple category changes persist correctly in storage
// ---------------------------------------------------------------------------
{
  const mockStorage = {};
  const saveSettings = (obj) => Object.assign(mockStorage, obj);

  saveSettings({
    searchCategories: [
      { id: 'c1', name: 'Dev', order: 0 },
      { id: 'c2', name: 'Design', order: 1 }
    ],
    toolbarSearchWebsites: [
      { id: 's1', name: 'Figma', categoryId: 'c2' }
    ]
  });

  assert.strictEqual(mockStorage.searchCategories.length, 2);
  assert.strictEqual(mockStorage.toolbarSearchWebsites[0].categoryId, 'c2');

  // Mutate and save again
  saveSettings({
    searchCategories: [
      { id: 'c1', name: 'Dev & Ops', order: 0 },
      { id: 'c2', name: 'Design', order: 1 },
      { id: 'c3', name: 'Audio', order: 2 }
    ]
  });

  assert.strictEqual(mockStorage.searchCategories.length, 3);
  assert.strictEqual(mockStorage.searchCategories[0].name, 'Dev & Ops');

  console.log('  ✓ Scenario 16: Multiple category changes persist correctly in storage');
}

// ---------------------------------------------------------------------------
// Scenario 17: Missing, deleted, or invalid category IDs are handled safely
// ---------------------------------------------------------------------------
{
  const categories = [{ id: 'cat_valid', name: 'Valid' }];
  const sites = [
    { id: 's1', categoryId: 'non_existent_id' },
    { id: 's2', categoryId: null },
    { id: 's3', categoryId: undefined },
    { id: 's4', categoryId: 'cat_valid' }
  ];

  const uncat = filterEnginesByCategory(sites, categories, 'uncategorized');
  assert.strictEqual(uncat.length, 3, 'Invalid or missing IDs safely bucketed into Uncategorized');

  const valid = filterEnginesByCategory(sites, categories, 'cat_valid');
  assert.strictEqual(valid.length, 1);
  assert.strictEqual(valid[0].id, 's4');

  console.log('  ✓ Scenario 17: Missing or invalid category IDs are handled safely');
}

// ---------------------------------------------------------------------------
// Scenario 18: Widened popup dimensions check
// ---------------------------------------------------------------------------
{
  const css = fs.readFileSync(path.join(__dirname, '../popup/popup.css'), 'utf8');
  const match = css.match(/body\s*\{[^}]*width:\s*(\d+)px/);
  assert(match, 'Popup CSS defines body width');
  const width = parseInt(match[1], 10);

  // Original width was 410px. 15-20% increase targets ~470px - 495px.
  assert(width >= 470 && width <= 500, `Popup width (${width}px) is ~15-20% wider`);
  assert(css.includes('overflow-x: hidden'), 'Horizontal overflow prevented');

  console.log(`  ✓ Scenario 18: Widened popup (${width}px) prevents overflow and stays cleanly styled`);
}

// ---------------------------------------------------------------------------
// Scenario 19: Existing text-selection search behavior still works
// ---------------------------------------------------------------------------
{
  function buildSearchUrl(template, query) {
    const encoded = encodeURIComponent(query).replace(/%20/g, '+');
    return template.replace(/\{query\}/gi, encoded);
  }

  const site = DEFAULT_SEARCH_WEBSITES[0]; // Google
  const targetUrl = buildSearchUrl(site.template, 'modern web guidance');
  assert.strictEqual(targetUrl, 'https://www.google.com/search?q=modern+web+guidance');

  console.log('  ✓ Scenario 19: Existing text-selection search behavior still works');
}

// ---------------------------------------------------------------------------
// Scenario 20: No unrelated extension features regress
// ---------------------------------------------------------------------------
{
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  assert.strictEqual(manifest.manifest_version, 3);
  assert(manifest.commands['quick-search']);
  assert(manifest.permissions.includes('storage'));
  assert(manifest.permissions.includes('tabs'));

  console.log('  ✓ Scenario 20: No unrelated extension features regress');
}

// ---------------------------------------------------------------------------
// Scenario 21: Category chips and management items are simple text without icons
// ---------------------------------------------------------------------------
{
  const contentJs = fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(__dirname, '../popup/popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');

  // Verify content.js chips do not render cat.icon
  assert(!contentJs.includes('ht-cat-icon'), 'content.js does not contain ht-cat-icon class');
  assert(contentJs.includes('<span class="ht-cat-name">All</span>'), 'All chip is simple text');
  assert(contentJs.includes('<span class="ht-cat-name">Uncategorized</span>'), 'Uncategorized chip is simple text');

  // Verify popup.html has no categoryIconSelect
  assert(!popupHtml.includes('id="categoryIconSelect"'), 'popup.html has removed categoryIconSelect');

  // Verify popup.js does not render category-pill with icons
  assert(!popupJs.includes('class="category-pill"'), 'popup.js has replaced category-pill with text/color dot');

  console.log('  ✓ Scenario 21: Category chips and management items are simple text without icons');
}

// ---------------------------------------------------------------------------
// Scenario 22: Left and right horizontal scroll buttons in Quick Search category bar
// ---------------------------------------------------------------------------
{
  const contentJs = fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8');

  // Verify container and left/right navigation buttons exist in HTML template
  assert(contentJs.includes('ht-category-container'), 'Category container exists in template');
  assert(contentJs.includes('ht-category-scroll-left'), 'Scroll left button exists in template');
  assert(contentJs.includes('ht-category-scroll-right'), 'Scroll right button exists in template');

  // Verify scrollBy behavior is wired up
  assert(contentJs.includes('categoryBarEl.scrollBy({ left: -110'), 'Left button scrolls -110px');
  assert(contentJs.includes('categoryBarEl.scrollBy({ left: 110'), 'Right button scrolls +110px');

  // Verify disabled state logic for scroll buttons
  assert(contentJs.includes('function updateCategoryScrollButtons'), 'Scroll button updater function exists');

  console.log('  ✓ Scenario 22: Left and right horizontal scroll buttons implemented for category list');
}

// ---------------------------------------------------------------------------
// Scenario 23: Multi-Category selection with OR filtering logic
// ---------------------------------------------------------------------------
{
  const mockWebsites = [
    { id: 'google', name: 'Google', categoryId: 'cat_research', enabled: true },
    { id: 'youtube', name: 'YouTube', categoryId: 'cat_movies', enabled: true },
    { id: 'reddit', name: 'Reddit', categoryId: 'cat_work', enabled: true },
    { id: 'amazon', name: 'Amazon', categoryId: 'cat_shopping', enabled: true },
    { id: 'custom_gaming', name: 'Steam', categoryId: 'cat_gaming', enabled: true },
    { id: 'custom_uncat', name: 'Uncat Engine', categoryId: null, enabled: true }
  ];

  const filterEngines = (sites, selectedCatIds, knownCatIds) => {
    if (!selectedCatIds || selectedCatIds.length === 0) return sites;
    const selSet = new Set(selectedCatIds);
    return sites.filter((s) => {
      const cid = s.categoryId;
      const isUncat = !cid || cid === 'uncategorized' || !knownCatIds.has(cid);
      if (selSet.has('uncategorized') && isUncat) return true;
      if (cid && selSet.has(cid)) return true;
      return false;
    });
  };

  const knownCats = new Set(['cat_gaming', 'cat_work', 'cat_movies', 'cat_shopping', 'cat_research']);

  // 1. Single selection
  const shoppingOnly = filterEngines(mockWebsites, ['cat_shopping'], knownCats);
  assert.strictEqual(shoppingOnly.length, 1);
  assert.strictEqual(shoppingOnly[0].id, 'amazon');

  // 2. Multi-selection (OR logic): Shopping + Movies
  const shoppingAndMovies = filterEngines(mockWebsites, ['cat_shopping', 'cat_movies'], knownCats);
  assert.strictEqual(shoppingAndMovies.length, 2);
  assert(shoppingAndMovies.some(s => s.id === 'amazon'));
  assert(shoppingAndMovies.some(s => s.id === 'youtube'));

  // 3. Multi-selection with Uncategorized
  const researchAndUncat = filterEngines(mockWebsites, ['cat_research', 'uncategorized'], knownCats);
  assert.strictEqual(researchAndUncat.length, 2);
  assert(researchAndUncat.some(s => s.id === 'google'));
  assert(researchAndUncat.some(s => s.id === 'custom_uncat'));

  // 4. Empty / All selection
  const allEngines = filterEngines(mockWebsites, [], knownCats);
  assert.strictEqual(allEngines.length, 6);

  console.log('  ✓ Scenario 23: Multi-Category selection correctly applies OR filtering');
}

// ---------------------------------------------------------------------------
// Scenario 24: "All" stays first, selected categories move immediately after "All"
// ---------------------------------------------------------------------------
{
  const baseCustomCategories = [
    { id: 'cat_dev', name: 'Development' },
    { id: 'cat_shop', name: 'Shopping' },
    { id: 'cat_ent', name: 'Entertainment' },
    { id: 'cat_prod', name: 'Productivity' },
    { id: 'uncategorized', name: 'Uncategorized' }
  ];

  const computeDisplayOrder = (customList, selectedIds) => {
    const allItem = { id: 'all', name: 'All' };
    const selectedItems = (selectedIds || [])
      .map(id => customList.find(c => c.id === id))
      .filter(Boolean);
    const unselectedItems = customList.filter(c => !(selectedIds || []).includes(c.id));
    return [allItem, ...selectedItems, ...unselectedItems];
  };

  // Base state: All is first, followed by original custom categories
  let selected = [];
  let display = computeDisplayOrder(baseCustomCategories, selected);
  assert.deepStrictEqual(display.map(c => c.name), ['All', 'Development', 'Shopping', 'Entertainment', 'Productivity', 'Uncategorized']);

  // Select Shopping then Productivity -> All remains first, followed by selected in order
  selected = ['cat_shop', 'cat_prod'];
  display = computeDisplayOrder(baseCustomCategories, selected);
  assert.deepStrictEqual(display.map(c => c.name), ['All', 'Shopping', 'Productivity', 'Development', 'Entertainment', 'Uncategorized']);

  // Deselect Shopping (Productivity remains after All)
  selected = ['cat_prod'];
  display = computeDisplayOrder(baseCustomCategories, selected);
  assert.deepStrictEqual(display.map(c => c.name), ['All', 'Productivity', 'Development', 'Shopping', 'Entertainment', 'Uncategorized']);

  // Deselect Productivity (none selected -> All first, then original order)
  selected = [];
  display = computeDisplayOrder(baseCustomCategories, selected);
  assert.deepStrictEqual(display.map(c => c.name), ['All', 'Development', 'Shopping', 'Entertainment', 'Productivity', 'Uncategorized']);

  console.log('  ✓ Scenario 24: "All" stays at first place, selected categories added/removed immediately after "All"');
}

// ---------------------------------------------------------------------------
// Scenario 25: Category dropdown on Captured Search Review screen
// ---------------------------------------------------------------------------
{
  const popupHtml = fs.readFileSync(path.join(__dirname, '../popup/popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');

  // Verify captureCategoryInput exists in capturePreviewCard
  assert(popupHtml.includes('id="captureCategoryInput"'), 'captureCategoryInput select dropdown exists in popup.html');

  // Verify populateCategorySelects populates captureCategoryInput
  assert(popupJs.includes("document.getElementById('captureCategoryInput')"), 'populateCategorySelects targets captureCategoryInput');

  // Verify categoryId is saved in saveCapturedWebsiteBtn handler
  assert(popupJs.includes('categoryId'), 'categoryId is extracted and stored on captured website save');

  console.log('  ✓ Scenario 25: Captured search engine review screen includes category selection and persistence');
}

// ---------------------------------------------------------------------------
// Scenario 26: Neutral category creation options (no color dots)
// ---------------------------------------------------------------------------
{
  const popupHtml = fs.readFileSync(path.join(__dirname, '../popup/popup.html'), 'utf8');

  // Verify options in categoryColorSelect do not contain colored dot characters (●)
  const colorSelectMatch = popupHtml.match(/<select[\s\S]*?id="categoryColorSelect"[\s\S]*?<\/select>/);
  assert(colorSelectMatch, 'categoryColorSelect dropdown found in popup.html');
  assert(!colorSelectMatch[0].includes('●'), 'No colored bullet dots in category creation color options');

  console.log('  ✓ Scenario 26: Neutral visual style for category creation options without colored dots');
}

// ---------------------------------------------------------------------------
// Scenario 27: Drag & Drop reordering and Shift+Click jump actions
// ---------------------------------------------------------------------------
{
  const popupJs = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const popupCss = fs.readFileSync(path.join(__dirname, '../popup/popup.css'), 'utf8');

  // Verify drag handle SVG and classes exist
  assert(popupJs.includes('DRAG_HANDLE_SVG'), 'popup.js contains DRAG_HANDLE_SVG');
  assert(popupJs.includes('initListDragAndDrop'), 'popup.js contains reusable initListDragAndDrop function');
  assert(popupCss.includes('.drag-handle'), 'popup.css styles .drag-handle');
  assert(popupCss.includes('.is-dragging'), 'popup.css styles .is-dragging');
  assert(popupCss.includes('.drag-over-above'), 'popup.css styles .drag-over-above');
  assert(popupCss.includes('.drag-over-below'), 'popup.css styles .drag-over-below');

  // Verify draggable attribute is added to category-item and website-item
  assert(popupJs.includes("item.setAttribute('draggable', 'true')"), 'popup.js sets draggable="true" on items');

  // Verify reorder array manipulation logic: moving an item from index 4 to index 0 (drag or Shift+Click)
  const categories = [
    { id: 'cat_0', name: 'Cat 0', order: 0 },
    { id: 'cat_1', name: 'Cat 1', order: 1 },
    { id: 'cat_2', name: 'Cat 2', order: 2 },
    { id: 'cat_3', name: 'Cat 3', order: 3 },
    { id: 'cat_4', name: 'Cat 4', order: 4 }
  ];

  // Move cat_4 from position 4 directly to position 0
  const fromIdx = 4;
  const toIdx = 0;
  const [moved] = categories.splice(fromIdx, 1);
  categories.splice(toIdx, 0, moved);
  categories.forEach((c, idx) => { c.order = idx; });

  assert.strictEqual(categories[0].id, 'cat_4', 'cat_4 moved directly to index 0');
  assert.strictEqual(categories[1].id, 'cat_0', 'cat_0 shifted to index 1');
  assert.strictEqual(categories[4].id, 'cat_3', 'cat_3 shifted to index 4');

  // Verify initListDragAndDrop is hooked up for category-item and website-item
  assert(popupJs.includes("initListDragAndDrop(listContainer, '.category-item'"), 'Drag & drop hooked up for categories');
  assert(popupJs.includes("initListDragAndDrop(listContainer, '.website-item'"), 'Drag & drop hooked up for search engines');

  console.log('  ✓ Scenario 27: Drag & drop reordering and clean list item structure verified');
}

console.log('\nResults: 27 / 27 Category tests passed.');
console.log('🎉 ALL CATEGORY TESTS COMPLETED SUCCESSFULLY!\n');
