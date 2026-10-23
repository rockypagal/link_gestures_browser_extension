// HoldTab - Popup Controller

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

const DEFAULT_SETTINGS = {
  enabled: true,
  holdDuration: 450,
  gestureMode: 'hold',
  dragDistance: 35,
  tabPosition: 'next',
  tabFocus: 'background',
  indicatorStyle: 'ring',
  requireModifier: 'none',
  tabCycleWheel: true,
  tabCycleWheelSpeed: 120,
  tabCycleSwipe: true,
  tabCycleRocker: true,
  tabCycleAltScroll: true,
  tabCycleAltKeys: true,
  tabCyclePrevShortcut: 'Alt + <',
  tabCycleNextShortcut: 'Alt + >',
  closeTabShortcutEnabled: true,
  closeTabShortcut: 'Alt + /',
  tabCycleHud: true,
  swipeDeviceMode: 'mouse',
  closeTabOnDoubleRightClick: true,
  textSearchHold: true,
  textDoubleClickCopyCut: true,
  inputDoubleClickPaste: true,
  altDoubleClickFillSearch: true,
  altHoldSearchSite: true,
  siteSearchHoldDuration: 450,
  textSearchHoldDuration: 450,
  animLinkHold: true,
  animLinkHoldDelay: 180,
  animSiteSearch: true,
  animSiteSearchDelay: 180,
  animTextSearch: true,
  animTextSearchDelay: 180,
  animFlickDrag: true,
  animHudBadges: true,
  toolbarEnabled: true,
  toolbarMode: 'auto',
  toolbarModifier: 'alt',
  toolbarDelay: 250,
  toolbarMinLength: 2,
  toolbarSearchSubmenu: true,
  toolbarSearchWebsites: DEFAULT_SEARCH_WEBSITES,
  searchCategories: DEFAULT_SEARCH_CATEGORIES,
  quickSearchEnabled: true,
  quickSearchDefaultEngine: 'google',
  quickSearchMouseShortcut: true,
  excludedDomains: [],
  siteOverrides: {}
};

let currentSettings = { ...DEFAULT_SETTINGS };
let currentTabHostname = '';
let currentTabUrl = '';
let selectedOverrideDomain = '';
let editingCategoryId = null;

// Category plan limits helper (prepared for future entitlement integration)
const CATEGORY_PLAN_CONFIG = {
  FREE_TIER_MAX: 5,
  PRO_TIER_MAX: Infinity
};

function getCategoryPlanLimit() {
  if (currentSettings.isProUser === true) return CATEGORY_PLAN_CONFIG.PRO_TIER_MAX;
  return currentSettings.maxCategoriesLimit || Infinity;
}

document.addEventListener('DOMContentLoaded', async () => {
  setupTabNavigation();
  await loadCurrentTabInfo();
  await loadAndRenderSettings();
  setupEventListeners();
  setupTestArena();
  await resumeCaptureSessionIfActive();
});

// Setup organized tab switching
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');

  let savedTab = localStorage.getItem('holdtab_active_tab');
  if (savedTab === 'tab-sites') {
    savedTab = 'tab-rules';
  }
  if (savedTab && document.getElementById(savedTab)) {
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));

    const targetTabBtn = document.querySelector(`.nav-tab[data-tab="${savedTab}"]`);
    const targetPanel = document.getElementById(savedTab);
    if (targetTabBtn && targetPanel) {
      targetTabBtn.classList.add('active');
      targetPanel.classList.add('active');
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      panels.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
      try {
        localStorage.setItem('holdtab_active_tab', targetId);
      } catch (_) {}
    });
  });
}

// Detect current active tab hostname and full URL
async function loadCurrentTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      currentTabUrl = tab.url;
      const url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        currentTabHostname = url.hostname;
      }
    }
  } catch (err) {
    console.debug('Could not determine active tab domain:', err);
  }
}

// Load settings from chrome.storage
async function loadAndRenderSettings() {
  try {
    const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    currentSettings = { ...DEFAULT_SETTINGS, ...stored };
    renderUI();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// Render settings state in DOM elements
function renderUI() {
  // Master toggle
  const masterToggle = document.getElementById('masterToggle');
  if (masterToggle) masterToggle.checked = currentSettings.enabled;

  // Duration
  const durationSlider = document.getElementById('holdDuration');
  if (durationSlider) {
    durationSlider.value = currentSettings.holdDuration;
    document.getElementById('durationValue').textContent = `${currentSettings.holdDuration} ms`;
  }

  // Flick distance
  const dragSlider = document.getElementById('dragDistance');
  if (dragSlider) {
    dragSlider.value = currentSettings.dragDistance || 35;
    document.getElementById('dragDistanceValue').textContent = `${currentSettings.dragDistance || 35} px`;
  }

  // Gesture mode
  const gestureRadio = document.querySelector(`input[name="gestureMode"][value="${currentSettings.gestureMode}"]`);
  if (gestureRadio) gestureRadio.checked = true;

  // Dynamic visibility based on selected gesture
  updateGestureVisibility(currentSettings.gestureMode);

  // Tab position
  const posRadio = document.querySelector(`input[name="tabPosition"][value="${currentSettings.tabPosition}"]`);
  if (posRadio) posRadio.checked = true;

  // Tab focus
  const focusRadio = document.querySelector(`input[name="tabFocus"][value="${currentSettings.tabFocus}"]`);
  if (focusRadio) focusRadio.checked = true;

  // Modifier key
  const modifierSelect = document.getElementById('requireModifier');
  if (modifierSelect) modifierSelect.value = currentSettings.requireModifier || 'none';

  // Tab cycling toggles
  const wheelToggle = document.getElementById('tabCycleWheelToggle');
  if (wheelToggle) wheelToggle.checked = currentSettings.tabCycleWheel !== false;

  const wheelSpeedGroup = document.getElementById('tabCycleWheelSpeedGroup');
  if (wheelSpeedGroup) {
    wheelSpeedGroup.style.display = currentSettings.tabCycleWheel !== false ? 'block' : 'none';
  }
  const wheelSpeedSlider = document.getElementById('tabCycleWheelSpeed');
  const wheelSpeedVal = document.getElementById('tabCycleWheelSpeedValue');
  if (wheelSpeedSlider && wheelSpeedVal) {
    wheelSpeedSlider.value = currentSettings.tabCycleWheelSpeed ?? 120;
    wheelSpeedVal.textContent = `${currentSettings.tabCycleWheelSpeed ?? 120} ms`;
  }

  const swipeToggle = document.getElementById('tabCycleSwipeToggle');
  if (swipeToggle) swipeToggle.checked = currentSettings.tabCycleSwipe !== false;

  const hudToggle = document.getElementById('tabCycleHudToggle');
  if (hudToggle) hudToggle.checked = currentSettings.tabCycleHud !== false;

  // Rocker gestures toggle
  const rockerToggle = document.getElementById('tabCycleRockerToggle');
  if (rockerToggle) rockerToggle.checked = currentSettings.tabCycleRocker !== false;

  // Alt + Two-finger scroll toggle
  const altScrollToggle = document.getElementById('tabCycleAltScrollToggle');
  if (altScrollToggle) altScrollToggle.checked = currentSettings.tabCycleAltScroll !== false;

  // Keyboard tab cycle shortcut
  const altKeysToggle = document.getElementById('tabCycleAltKeysToggle');
  if (altKeysToggle) altKeysToggle.checked = currentSettings.tabCycleAltKeys !== false;

  const prevBadge = document.getElementById('tabCyclePrevShortcutBadge');
  if (prevBadge) prevBadge.textContent = currentSettings.tabCyclePrevShortcut || 'Alt + <';

  const nextBadge = document.getElementById('tabCycleNextShortcutBadge');
  if (nextBadge) nextBadge.textContent = currentSettings.tabCycleNextShortcut || 'Alt + >';

  const tabCycleKeyShortcutGroup = document.getElementById('tabCycleKeyShortcutGroup');
  if (tabCycleKeyShortcutGroup) {
    tabCycleKeyShortcutGroup.style.opacity = (currentSettings.tabCycleAltKeys !== false) ? '1' : '0.45';
    tabCycleKeyShortcutGroup.style.pointerEvents = (currentSettings.tabCycleAltKeys !== false) ? 'auto' : 'none';
  }

  // Close tab shortcut
  const closeTabShortcutToggle = document.getElementById('closeTabShortcutToggle');
  if (closeTabShortcutToggle) closeTabShortcutToggle.checked = currentSettings.closeTabShortcutEnabled !== false;

  const closeTabBadge = document.getElementById('closeTabShortcutBadge');
  if (closeTabBadge) closeTabBadge.textContent = currentSettings.closeTabShortcut || 'Alt + /';

  const closeTabShortcutGroup = document.getElementById('closeTabShortcutGroup');
  if (closeTabShortcutGroup) {
    closeTabShortcutGroup.style.opacity = (currentSettings.closeTabShortcutEnabled !== false) ? '1' : '0.45';
    closeTabShortcutGroup.style.pointerEvents = (currentSettings.closeTabShortcutEnabled !== false) ? 'auto' : 'none';
  }

  // Swipe device mode
  const swipeDeviceRadio = document.querySelector(`input[name="swipeDeviceMode"][value="${currentSettings.swipeDeviceMode || 'mouse'}"]`);
  if (swipeDeviceRadio) swipeDeviceRadio.checked = true;

  // Double right-click close toggle
  const closeTabToggle = document.getElementById('closeTabOnDoubleRightClickToggle');
  if (closeTabToggle) closeTabToggle.checked = currentSettings.closeTabOnDoubleRightClick !== false;

  // Hold selected text to search toggle
  const textSearchToggle = document.getElementById('textSearchHoldToggle');
  if (textSearchToggle) textSearchToggle.checked = currentSettings.textSearchHold !== false;

  // Double-click copy & cut toggle (NEW)
  const doubleClickCopyCutToggle = document.getElementById('textDoubleClickCopyCutToggle');
  if (doubleClickCopyCutToggle) doubleClickCopyCutToggle.checked = currentSettings.textDoubleClickCopyCut !== false;

  // Double-click in input to paste toggle (NEW)
  const inputDoubleClickPasteToggle = document.getElementById('inputDoubleClickPasteToggle');
  if (inputDoubleClickPasteToggle) inputDoubleClickPasteToggle.checked = currentSettings.inputDoubleClickPaste !== false;

  // Alt + Double-Click to fill site search toggle (NEW)
  const altDoubleClickFillSearchToggle = document.getElementById('altDoubleClickFillSearchToggle');
  if (altDoubleClickFillSearchToggle) altDoubleClickFillSearchToggle.checked = currentSettings.altDoubleClickFillSearch !== false;

  // Alt + Hold to Search Site toggle (NEW)
  const altHoldSearchSiteToggle = document.getElementById('altHoldSearchSiteToggle');
  if (altHoldSearchSiteToggle) altHoldSearchSiteToggle.checked = currentSettings.altHoldSearchSite !== false;

  // Animation & Visual toggles and delays
  const animLinkHoldToggle = document.getElementById('animLinkHoldToggle');
  if (animLinkHoldToggle) animLinkHoldToggle.checked = currentSettings.animLinkHold !== false;

  const animLinkHoldDelay = document.getElementById('animLinkHoldDelay');
  const animLinkHoldDelayVal = document.getElementById('animLinkHoldDelayValue');
  const animLinkHoldGroup = document.getElementById('animLinkHoldDelayGroup');
  if (animLinkHoldDelay && animLinkHoldDelayVal) {
    animLinkHoldDelay.value = currentSettings.animLinkHoldDelay ?? 180;
    animLinkHoldDelayVal.textContent = `${currentSettings.animLinkHoldDelay ?? 180} ms`;
    if (animLinkHoldGroup) animLinkHoldGroup.style.opacity = currentSettings.animLinkHold !== false ? '1' : '0.4';
  }

  const animSiteSearchToggle = document.getElementById('animSiteSearchToggle');
  if (animSiteSearchToggle) animSiteSearchToggle.checked = currentSettings.animSiteSearch !== false;

  const animSiteSearchDelay = document.getElementById('animSiteSearchDelay');
  const animSiteSearchDelayVal = document.getElementById('animSiteSearchDelayValue');
  const animSiteSearchGroup = document.getElementById('animSiteSearchDelayGroup');
  if (animSiteSearchDelay && animSiteSearchDelayVal) {
    animSiteSearchDelay.value = currentSettings.animSiteSearchDelay ?? 180;
    animSiteSearchDelayVal.textContent = `${currentSettings.animSiteSearchDelay ?? 180} ms`;
    if (animSiteSearchGroup) animSiteSearchGroup.style.opacity = currentSettings.animSiteSearch !== false ? '1' : '0.4';
  }

  const animTextSearchToggle = document.getElementById('animTextSearchToggle');
  if (animTextSearchToggle) animTextSearchToggle.checked = currentSettings.animTextSearch !== false;

  const animTextSearchDelay = document.getElementById('animTextSearchDelay');
  const animTextSearchDelayVal = document.getElementById('animTextSearchDelayValue');
  const animTextSearchGroup = document.getElementById('animTextSearchDelayGroup');
  if (animTextSearchDelay && animTextSearchDelayVal) {
    animTextSearchDelay.value = currentSettings.animTextSearchDelay ?? 180;
    animTextSearchDelayVal.textContent = `${currentSettings.animTextSearchDelay ?? 180} ms`;
    if (animTextSearchGroup) animTextSearchGroup.style.opacity = currentSettings.animTextSearch !== false ? '1' : '0.4';
  }

  // Site search & Web search hold durations
  const siteSearchDurationSlider = document.getElementById('siteSearchHoldDuration');
  const siteSearchDurationVal = document.getElementById('siteSearchHoldDurationValue');
  if (siteSearchDurationSlider && siteSearchDurationVal) {
    siteSearchDurationSlider.value = currentSettings.siteSearchHoldDuration ?? 450;
    siteSearchDurationVal.textContent = `${currentSettings.siteSearchHoldDuration ?? 450} ms`;
  }

  const textSearchDurationSlider = document.getElementById('textSearchHoldDuration');
  const textSearchDurationVal = document.getElementById('textSearchHoldDurationValue');
  if (textSearchDurationSlider && textSearchDurationVal) {
    textSearchDurationSlider.value = currentSettings.textSearchHoldDuration ?? 450;
    textSearchDurationVal.textContent = `${currentSettings.textSearchHoldDuration ?? 450} ms`;
  }

  const animFlickDragToggle = document.getElementById('animFlickDragToggle');
  if (animFlickDragToggle) animFlickDragToggle.checked = currentSettings.animFlickDrag !== false;

  const animHudBadgesToggle = document.getElementById('animHudBadgesToggle');
  if (animHudBadgesToggle) animHudBadgesToggle.checked = currentSettings.animHudBadges !== false;

  // Text selection toolbar
  const toolbarEnabledToggle = document.getElementById('toolbarEnabledToggle');
  if (toolbarEnabledToggle) toolbarEnabledToggle.checked = currentSettings.toolbarEnabled !== false;

  const tbMode = currentSettings.toolbarMode || 'auto';
  const tbModeRadio = document.querySelector(`input[name="toolbarMode"][value="${tbMode}"]`);
  if (tbModeRadio) tbModeRadio.checked = true;

  const tbModGroup = document.getElementById('toolbarModifierGroup');
  if (tbModGroup) {
    tbModGroup.style.display = (tbMode === 'demand') ? 'block' : 'none';
  }

  const tbModSelect = document.getElementById('toolbarModifier');
  if (tbModSelect) tbModSelect.value = currentSettings.toolbarModifier || 'alt';

  const tbDelaySlider = document.getElementById('toolbarDelay');
  const tbDelayVal = document.getElementById('toolbarDelayValue');
  if (tbDelaySlider && tbDelayVal) {
    tbDelaySlider.value = currentSettings.toolbarDelay ?? 250;
    tbDelayVal.textContent = `${currentSettings.toolbarDelay ?? 250} ms`;
  }

  const tbMinLenSlider = document.getElementById('toolbarMinLength');
  const tbMinLenVal = document.getElementById('toolbarMinLengthValue');
  if (tbMinLenSlider && tbMinLenVal) {
    tbMinLenSlider.value = currentSettings.toolbarMinLength ?? 2;
    tbMinLenVal.textContent = `${currentSettings.toolbarMinLength ?? 2} chars`;
  }

  const tbSubmenuToggle = document.getElementById('toolbarSearchSubmenuToggle');
  if (tbSubmenuToggle) tbSubmenuToggle.checked = currentSettings.toolbarSearchSubmenu !== false;

  renderToolbarWebsitesList();
  renderCategoriesList();
  populateCategorySelects();

  // Quick Search Settings
  const quickSearchEnabledToggle = document.getElementById('quickSearchEnabledToggle');
  if (quickSearchEnabledToggle) {
    quickSearchEnabledToggle.checked = currentSettings.quickSearchEnabled !== false;
  }
  const quickSearchMouseShortcutToggle = document.getElementById('quickSearchMouseShortcutToggle');
  if (quickSearchMouseShortcutToggle) {
    quickSearchMouseShortcutToggle.checked = currentSettings.quickSearchMouseShortcut !== false;
  }
  renderQuickSearchEnginesDropdown();
  updateQuickSearchShortcutDisplay();

  // Excluded domains
  renderExcludedTags();

  // Update site status indicator and overrides card
  updateSiteStatusUI();
}

// Immediately apply dynamic icon to browser action from popup
function applyActionIcon(iconState, title) {
  const action = (typeof chrome !== 'undefined' && chrome.action)
    ? chrome.action
    : (typeof chrome !== 'undefined' && chrome.browserAction ? chrome.browserAction : null);
  if (!action || !action.setIcon) return;

  const paths = (typeof getIconPaths === 'function')
    ? getIconPaths(iconState, false)
    : {
        16: `icons/icon-${iconState === 'active' ? '' : iconState + '-'}16.png`.replace('--', '-'),
        48: `icons/icon-${iconState === 'active' ? '' : iconState + '-'}48.png`.replace('--', '-'),
        128: `icons/icon-${iconState === 'active' ? '' : iconState + '-'}128.png`.replace('--', '-')
      };

  try {
    // 1. Global default icon (updates the pinned toolbar icon in Chrome/Brave/Edge)
    action.setIcon({ path: paths });
    if (title && action.setTitle) action.setTitle({ title });
  } catch (_) {}

  // 2. Active tab icon
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && typeof tabs[0].id === 'number') {
        try {
          action.setIcon({ tabId: tabs[0].id, path: paths });
          if (title && action.setTitle) action.setTitle({ tabId: tabs[0].id, title });
        } catch (_) {}
      }
    });
  } catch (_) {}
}

// Update real-time site status in Rules tab and per-site overrides card
function updateSiteStatusUI() {
  const dot = document.getElementById('siteStatusDot');
  const title = document.getElementById('siteStatusTitle');
  const badge = document.getElementById('siteStatusBadge');
  const subtitle = document.getElementById('siteStatusSubtitle');
  const toggleBtn = document.getElementById('toggleCurrentDomainBtn');
  const overridesCard = document.getElementById('siteOverridesCard');
  const overrideDomainPill = document.getElementById('overrideDomainName');
  const overrideBadge = document.getElementById('overrideBadge');

  const statusCalc = (typeof calculateSiteStatus === 'function')
    ? calculateSiteStatus(currentSettings, currentTabUrl || currentTabHostname)
    : { status: 'active', icon: 'active', title: 'HoldTab — Active' };

  // Immediately apply the dynamic icon from popup
  applyActionIcon(statusCalc.icon, statusCalc.title);

  if (dot) {
    dot.className = `site-status-dot status-${statusCalc.status}`;
  }
  if (title) {
    if (statusCalc.domain || currentTabHostname) {
      title.textContent = statusCalc.domain || currentTabHostname;
    } else {
      title.textContent = 'HoldTab Status';
    }
  }
  if (badge) {
    if (!currentSettings.enabled) {
      badge.textContent = 'Global Off';
      badge.className = 'badge badge-disabled';
    } else if (statusCalc.isRestricted) {
      badge.textContent = 'Restricted';
      badge.className = 'badge badge-disabled';
    } else if (statusCalc.status === 'custom') {
      badge.textContent = `Custom (${statusCalc.enabledOverridesCount})`;
      badge.className = 'badge badge-custom';
    } else if (statusCalc.status === 'disabled') {
      badge.textContent = 'Excluded';
      badge.className = 'badge badge-disabled';
    } else {
      badge.textContent = 'Active';
      badge.className = 'badge badge-active';
    }
  }
  if (subtitle) {
    if (!currentSettings.enabled) {
      subtitle.textContent = 'HoldTab is disabled globally via the master toggle above.';
    } else if (statusCalc.isRestricted) {
      subtitle.textContent = 'Features do not run on internal browser or web store pages.';
    } else if (statusCalc.status === 'custom') {
      subtitle.textContent = `Custom overrides enabled (${statusCalc.enabledOverridesCount} feature${statusCalc.enabledOverridesCount === 1 ? '' : 's'} active).`;
    } else if (statusCalc.status === 'disabled') {
      subtitle.textContent = `All HoldTab features and gestures are disabled on ${statusCalc.domain || currentTabHostname}.`;
    } else {
      subtitle.textContent = `All gestures, shortcuts, and toolbar features are enabled on ${statusCalc.domain || currentTabHostname || 'this site'}.`;
    }
  }

  // Toggle button on Rules tab
  if (toggleBtn) {
    if (currentTabHostname && !statusCalc.isRestricted) {
      toggleBtn.style.display = 'inline-block';
      const isExcluded = (typeof isSiteExcluded === 'function')
        ? isSiteExcluded(currentSettings, currentTabHostname)
        : (currentSettings.excludedDomains || []).includes(currentTabHostname);

      if (isExcluded) {
        toggleBtn.textContent = `✓ Remove ${currentTabHostname} from Exclusions`;
        toggleBtn.classList.add('btn-subtle-remove');
        toggleBtn.title = `Enable HoldTab on ${currentTabHostname}`;
      } else {
        toggleBtn.textContent = `+ Exclude ${currentTabHostname}`;
        toggleBtn.classList.remove('btn-subtle-remove');
        toggleBtn.title = `Disable HoldTab on ${currentTabHostname}`;
      }
    } else {
      toggleBtn.style.display = 'none';
    }
  }

  // Per-Site Feature Overrides Card
  const targetOverrideDomain = (typeof normalizeDomain === 'function')
    ? normalizeDomain(selectedOverrideDomain || currentTabHostname)
    : (selectedOverrideDomain || currentTabHostname);

  const isTargetExcluded = targetOverrideDomain && (typeof isSiteExcluded === 'function')
    ? isSiteExcluded(currentSettings, targetOverrideDomain)
    : (currentSettings.excludedDomains || []).includes(targetOverrideDomain);

  if (overridesCard) {
    if (isTargetExcluded && targetOverrideDomain) {
      overridesCard.style.display = 'block';
      if (overrideDomainPill) {
        overrideDomainPill.textContent = targetOverrideDomain;
      }

      const overrides = (typeof getSiteOverrides === 'function')
        ? getSiteOverrides(currentSettings, targetOverrideDomain)
        : (currentSettings.siteOverrides?.[targetOverrideDomain] || {});

      const tbToggle = document.getElementById('overrideToolbarToggle');
      const lhToggle = document.getElementById('overrideLinkHoldToggle');
      const tcToggle = document.getElementById('overrideTabCycleToggle');
      const taToggle = document.getElementById('overrideTextActionsToggle');
      const qsToggle = document.getElementById('overrideQuickSearchToggle');

      if (tbToggle) tbToggle.checked = overrides.toolbar === true;
      if (lhToggle) lhToggle.checked = overrides.linkHold === true;
      if (tcToggle) tcToggle.checked = overrides.tabCycle === true;
      if (taToggle) taToggle.checked = overrides.textActions === true;
      if (qsToggle) qsToggle.checked = overrides.quickSearch === true;

      const count = (typeof countEnabledOverrides === 'function')
        ? countEnabledOverrides(overrides)
        : [overrides.toolbar, overrides.linkHold, overrides.tabCycle, overrides.textActions, overrides.quickSearch].filter(Boolean).length;

      if (overrideBadge) {
        if (count > 0) {
          overrideBadge.textContent = `Custom (${count})`;
          overrideBadge.className = 'badge badge-custom';
        } else {
          overrideBadge.textContent = 'All Disabled';
          overrideBadge.className = 'badge badge-disabled';
        }
      }
    } else {
      overridesCard.style.display = 'none';
    }
  }
}

// Show/hide sliders according to active gesture mode
function updateGestureVisibility(mode) {
  const dragGroup = document.getElementById('dragDistanceGroup');
  const testDesc = document.querySelector('.arena-desc');

  if (mode === 'hold') {
    if (dragGroup) dragGroup.style.display = 'none';
    if (testDesc) testDesc.textContent = 'Test your hold gesture below:';
  } else if (mode === 'drag') {
    if (dragGroup) dragGroup.style.display = 'flex';
    if (testDesc) testDesc.textContent = 'Test your flick/drag gesture below:';
  } else {
    // 'both'
    if (dragGroup) dragGroup.style.display = 'flex';
    if (testDesc) testDesc.textContent = 'Test either hold or flick gesture below:';
  }
}

// Render domain tag pills
function renderExcludedTags() {
  const container = document.getElementById('excludedList');
  if (!container) return;
  container.innerHTML = '';

  const list = currentSettings.excludedDomains || [];
  if (list.length === 0) {
    container.innerHTML = '<span class="no-tags">No websites excluded</span>';
    return;
  }

  const activeNorm = (typeof normalizeDomain === 'function')
    ? normalizeDomain(selectedOverrideDomain || currentTabHostname)
    : (selectedOverrideDomain || currentTabHostname);

  list.forEach((domain) => {
    const norm = (typeof normalizeDomain === 'function') ? normalizeDomain(domain) : domain;
    const overrides = (typeof getSiteOverrides === 'function') ? getSiteOverrides(currentSettings, norm) : {};
    const count = (typeof countEnabledOverrides === 'function') ? countEnabledOverrides(overrides) : 0;

    const tag = document.createElement('span');
    const isSelected = activeNorm === norm;
    tag.className = `tag ${isSelected ? 'tag-selected' : ''}`;
    tag.style.cursor = 'pointer';

    const customBadge = count > 0 ? `<span style="color:#FF9800;font-weight:700;margin-left:3px;" title="${count} override(s) enabled">(${count})</span>` : '';

    tag.innerHTML = `
      <span class="tag-domain-name" title="Click to view/edit custom overrides">${escapeHtml(domain)}${customBadge}</span>
      <span class="tag-remove" data-domain="${escapeHtml(domain)}" title="Remove exclusion">&times;</span>
    `;

    // Click tag to select for overrides
    tag.querySelector('.tag-domain-name')?.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedOverrideDomain = norm;
      renderExcludedTags();
      updateSiteStatusUI();
    });

    container.appendChild(tag);
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

// Save settings to chrome.storage
async function saveSettings(partial) {
  currentSettings = { ...currentSettings, ...partial };
  try {
    await chrome.storage.sync.set(currentSettings);
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

// Setup input listeners
function setupEventListeners() {
  // Master switch
  const masterToggle = document.getElementById('masterToggle');
  if (masterToggle) {
    masterToggle.addEventListener('change', async (e) => {
      await saveSettings({ enabled: e.target.checked });
      updateSiteStatusUI();
      try {
        chrome.runtime.sendMessage({ action: 'updateAllIcons' });
      } catch (_) {}
    });
  }

  // Hold Duration slider
  const durationSlider = document.getElementById('holdDuration');
  const durationValue = document.getElementById('durationValue');
  if (durationSlider && durationValue) {
    durationSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      durationValue.textContent = `${val} ms`;
    });
    durationSlider.addEventListener('change', (e) => {
      saveSettings({ holdDuration: parseInt(e.target.value, 10) });
    });
  }

  // Site Search Hold Duration slider
  const siteSearchDurationSlider = document.getElementById('siteSearchHoldDuration');
  const siteSearchDurationValue = document.getElementById('siteSearchHoldDurationValue');
  if (siteSearchDurationSlider && siteSearchDurationValue) {
    siteSearchDurationSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      siteSearchDurationValue.textContent = `${val} ms`;
    });
    siteSearchDurationSlider.addEventListener('change', (e) => {
      saveSettings({ siteSearchHoldDuration: parseInt(e.target.value, 10) });
    });
  }

  // Web Text Search Hold Duration slider
  const textSearchDurationSlider = document.getElementById('textSearchHoldDuration');
  const textSearchDurationValue = document.getElementById('textSearchHoldDurationValue');
  if (textSearchDurationSlider && textSearchDurationValue) {
    textSearchDurationSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      textSearchDurationValue.textContent = `${val} ms`;
    });
    textSearchDurationSlider.addEventListener('change', (e) => {
      saveSettings({ textSearchHoldDuration: parseInt(e.target.value, 10) });
    });
  }

  // Flick Distance slider
  const dragSlider = document.getElementById('dragDistance');
  const dragValue = document.getElementById('dragDistanceValue');
  if (dragSlider && dragValue) {
    dragSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      dragValue.textContent = `${val} px`;
    });
    dragSlider.addEventListener('change', (e) => {
      saveSettings({ dragDistance: parseInt(e.target.value, 10) });
    });
  }

  // Gesture mode radio
  document.querySelectorAll('input[name="gestureMode"]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const mode = e.target.value;
      updateGestureVisibility(mode);
      saveSettings({ gestureMode: mode });
    });
  });

  // Tab position radio
  document.querySelectorAll('input[name="tabPosition"]').forEach((el) => {
    el.addEventListener('change', (e) => {
      saveSettings({ tabPosition: e.target.value });
    });
  });

  // Tab focus radio
  document.querySelectorAll('input[name="tabFocus"]').forEach((el) => {
    el.addEventListener('change', (e) => {
      saveSettings({ tabFocus: e.target.value });
    });
  });

  // Modifier select
  const modifierSelect = document.getElementById('requireModifier');
  if (modifierSelect) {
    modifierSelect.addEventListener('change', (e) => {
      saveSettings({ requireModifier: e.target.value });
    });
  }

  // Tab cycling toggles
  const wheelToggle = document.getElementById('tabCycleWheelToggle');
  if (wheelToggle) {
    wheelToggle.addEventListener('change', (e) => {
      saveSettings({ tabCycleWheel: e.target.checked });
      const wheelSpeedGroup = document.getElementById('tabCycleWheelSpeedGroup');
      if (wheelSpeedGroup) {
        wheelSpeedGroup.style.display = e.target.checked ? 'block' : 'none';
      }
    });
  }

  const wheelSpeedSlider = document.getElementById('tabCycleWheelSpeed');
  const wheelSpeedVal = document.getElementById('tabCycleWheelSpeedValue');
  if (wheelSpeedSlider && wheelSpeedVal) {
    wheelSpeedSlider.addEventListener('input', (e) => {
      wheelSpeedVal.textContent = `${e.target.value} ms`;
    });
    wheelSpeedSlider.addEventListener('change', (e) => {
      saveSettings({ tabCycleWheelSpeed: parseInt(e.target.value, 10) });
    });
  }

  const swipeToggle = document.getElementById('tabCycleSwipeToggle');
  if (swipeToggle) {
    swipeToggle.addEventListener('change', (e) => {
      saveSettings({ tabCycleSwipe: e.target.checked });
    });
  }

  const hudToggle = document.getElementById('tabCycleHudToggle');
  if (hudToggle) {
    hudToggle.addEventListener('change', (e) => {
      saveSettings({ tabCycleHud: e.target.checked });
    });
  }

  // Rocker gestures toggle
  const rockerToggle = document.getElementById('tabCycleRockerToggle');
  if (rockerToggle) {
    rockerToggle.addEventListener('change', (e) => {
      saveSettings({ tabCycleRocker: e.target.checked });
    });
  }

  // Alt + Two-finger scroll toggle
  const altScrollToggle = document.getElementById('tabCycleAltScrollToggle');
  if (altScrollToggle) {
    altScrollToggle.addEventListener('change', (e) => {
      saveSettings({ tabCycleAltScroll: e.target.checked });
    });
  }

  // Keyboard tab cycle shortcut toggle & interactive custom key recording
  const altKeysToggle = document.getElementById('tabCycleAltKeysToggle');
  const tabCycleKeyShortcutGroup = document.getElementById('tabCycleKeyShortcutGroup');
  if (altKeysToggle) {
    altKeysToggle.addEventListener('change', (e) => {
      saveSettings({ tabCycleAltKeys: e.target.checked });
      if (tabCycleKeyShortcutGroup) {
        tabCycleKeyShortcutGroup.style.opacity = e.target.checked ? '1' : '0.45';
        tabCycleKeyShortcutGroup.style.pointerEvents = e.target.checked ? 'auto' : 'none';
      }
    });
  }

  // Setup custom shortcut recorders for Previous Tab, Next Tab, and Close Tab
  setupShortcutRecorder('recordPrevShortcutBtn', 'tabCyclePrevShortcutBadge', 'tabCyclePrevShortcut', 'Alt + <', 'resetPrevShortcutBtn');
  setupShortcutRecorder('recordNextShortcutBtn', 'tabCycleNextShortcutBadge', 'tabCycleNextShortcut', 'Alt + >', 'resetNextShortcutBtn');

  // Close tab shortcut toggle & interactive custom key recording
  const closeTabShortcutToggle = document.getElementById('closeTabShortcutToggle');
  const closeTabShortcutGroup = document.getElementById('closeTabShortcutGroup');
  if (closeTabShortcutToggle) {
    closeTabShortcutToggle.addEventListener('change', (e) => {
      saveSettings({ closeTabShortcutEnabled: e.target.checked });
      if (closeTabShortcutGroup) {
        closeTabShortcutGroup.style.opacity = e.target.checked ? '1' : '0.45';
        closeTabShortcutGroup.style.pointerEvents = e.target.checked ? 'auto' : 'none';
      }
    });
  }

  setupShortcutRecorder('recordCloseTabShortcutBtn', 'closeTabShortcutBadge', 'closeTabShortcut', 'Alt + /', 'resetCloseTabShortcutBtn');

  // Swipe device mode radio
  document.querySelectorAll('input[name="swipeDeviceMode"]').forEach((el) => {
    el.addEventListener('change', (e) => {
      saveSettings({ swipeDeviceMode: e.target.value });
    });
  });

  // Double right-click close toggle
  const closeTabToggle = document.getElementById('closeTabOnDoubleRightClickToggle');
  if (closeTabToggle) {
    closeTabToggle.addEventListener('change', (e) => {
      saveSettings({ closeTabOnDoubleRightClick: e.target.checked });
    });
  }

  // Hold selected text to search toggle
  const textSearchToggle = document.getElementById('textSearchHoldToggle');
  if (textSearchToggle) {
    textSearchToggle.addEventListener('change', (e) => {
      saveSettings({ textSearchHold: e.target.checked });
    });
  }

  // Double-click copy & cut toggle (NEW)
  const doubleClickCopyCutToggle = document.getElementById('textDoubleClickCopyCutToggle');
  if (doubleClickCopyCutToggle) {
    doubleClickCopyCutToggle.addEventListener('change', (e) => {
      saveSettings({ textDoubleClickCopyCut: e.target.checked });
    });
  }

  // Double-click in input to paste toggle (NEW)
  const inputDoubleClickPasteToggle = document.getElementById('inputDoubleClickPasteToggle');
  if (inputDoubleClickPasteToggle) {
    inputDoubleClickPasteToggle.addEventListener('change', (e) => {
      saveSettings({ inputDoubleClickPaste: e.target.checked });
    });
  }

  // Alt + Double-Click to fill site search toggle (NEW)
  const altDoubleClickFillSearchToggle = document.getElementById('altDoubleClickFillSearchToggle');
  if (altDoubleClickFillSearchToggle) {
    altDoubleClickFillSearchToggle.addEventListener('change', (e) => {
      saveSettings({ altDoubleClickFillSearch: e.target.checked });
    });
  }

  // Alt + Hold to Search Site toggle (NEW)
  const altHoldSearchSiteToggle = document.getElementById('altHoldSearchSiteToggle');
  if (altHoldSearchSiteToggle) {
    altHoldSearchSiteToggle.addEventListener('change', (e) => {
      saveSettings({ altHoldSearchSite: e.target.checked });
    });
  }

  // Animation & Visual controls (NEW)
  bindToggleWithSlider('animLinkHoldToggle', 'animLinkHold', 'animLinkHoldDelay', 'animLinkHoldDelayValue', 'animLinkHoldDelayGroup', 'animLinkHoldDelay');
  bindToggleWithSlider('animSiteSearchToggle', 'animSiteSearch', 'animSiteSearchDelay', 'animSiteSearchDelayValue', 'animSiteSearchDelayGroup', 'animSiteSearchDelay');
  bindToggleWithSlider('animTextSearchToggle', 'animTextSearch', 'animTextSearchDelay', 'animTextSearchDelayValue', 'animTextSearchDelayGroup', 'animTextSearchDelay');

  const animFlickDragToggle = document.getElementById('animFlickDragToggle');
  if (animFlickDragToggle) {
    animFlickDragToggle.addEventListener('change', (e) => {
      saveSettings({ animFlickDrag: e.target.checked });
    });
  }

  const animHudBadgesToggle = document.getElementById('animHudBadgesToggle');
  if (animHudBadgesToggle) {
    animHudBadgesToggle.addEventListener('change', (e) => {
      saveSettings({ animHudBadges: e.target.checked });
    });
  }

  // Add domain
  const addBtn = document.getElementById('addDomainBtn');
  const input = document.getElementById('newDomainInput');

  function handleAddDomain() {
    if (!input) return;
    const raw = (typeof normalizeDomain === 'function')
      ? normalizeDomain(input.value)
      : input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!raw) return;

    const list = currentSettings.excludedDomains || [];
    if (!list.includes(raw)) {
      list.push(raw);
      selectedOverrideDomain = raw;
      saveSettings({ excludedDomains: list }).then(() => {
        renderExcludedTags();
        updateSiteStatusUI();
        try {
          chrome.runtime.sendMessage({ action: 'updateAllIcons' });
        } catch (_) {}
      });
    }
    input.value = '';
  }

  if (addBtn) addBtn.addEventListener('click', handleAddDomain);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAddDomain();
    });
  }

  // Remove domain tag
  const excludedList = document.getElementById('excludedList');
  if (excludedList) {
    excludedList.addEventListener('click', async (e) => {
      if (e.target.classList.contains('tag-remove')) {
        const domainToRemove = e.target.getAttribute('data-domain');
        const list = (currentSettings.excludedDomains || []).filter((d) => d !== domainToRemove);
        if (selectedOverrideDomain === domainToRemove) {
          selectedOverrideDomain = '';
        }
        await saveSettings({ excludedDomains: list });
        renderExcludedTags();
        updateSiteStatusUI();
        try {
          chrome.runtime.sendMessage({ action: 'updateAllIcons' });
        } catch (_) {}
      }
    });
  }

  // Toggle active tab exclusion (shared between Sites tab and Header banner)
  async function toggleActiveTabExclusion() {
    if (!currentTabHostname) return;
    const norm = (typeof normalizeDomain === 'function') ? normalizeDomain(currentTabHostname) : currentTabHostname;
    const list = [...(currentSettings.excludedDomains || [])];
    const index = list.findIndex((d) => {
      const nd = (typeof normalizeDomain === 'function') ? normalizeDomain(d) : d;
      return nd === norm;
    });

    if (index === -1) {
      list.push(norm || currentTabHostname);
      selectedOverrideDomain = norm || currentTabHostname;
    } else {
      list.splice(index, 1);
      if (selectedOverrideDomain === norm) {
        selectedOverrideDomain = '';
      }
    }

    await saveSettings({ excludedDomains: list });
    renderExcludedTags();
    updateSiteStatusUI();
    try {
      chrome.runtime.sendMessage({ action: 'updateAllIcons' });
    } catch (_) {}
  }

  const toggleDomainBtn = document.getElementById('toggleCurrentDomainBtn');
  if (toggleDomainBtn) {
    toggleDomainBtn.addEventListener('click', toggleActiveTabExclusion);
  }

  const quickSiteActionBtn = document.getElementById('quickSiteActionBtn');
  if (quickSiteActionBtn) {
    quickSiteActionBtn.addEventListener('click', toggleActiveTabExclusion);
  }

  // Per-site override feature checkboxes
  const overrideFeatureMap = [
    { id: 'overrideToolbarToggle', feat: 'toolbar' },
    { id: 'overrideLinkHoldToggle', feat: 'linkHold' },
    { id: 'overrideTabCycleToggle', feat: 'tabCycle' },
    { id: 'overrideTextActionsToggle', feat: 'textActions' },
    { id: 'overrideQuickSearchToggle', feat: 'quickSearch' }
  ];

  overrideFeatureMap.forEach(({ id, feat }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', async (e) => {
        const domain = (typeof normalizeDomain === 'function')
          ? normalizeDomain(selectedOverrideDomain || currentTabHostname)
          : (selectedOverrideDomain || currentTabHostname);
        if (!domain) return;

        const siteOverrides = { ...(currentSettings.siteOverrides || {}) };
        if (!siteOverrides[domain]) siteOverrides[domain] = {};
        siteOverrides[domain] = { ...siteOverrides[domain], [feat]: e.target.checked };

        await saveSettings({ siteOverrides });
        updateSiteStatusUI();
        renderExcludedTags();
        try {
          chrome.runtime.sendMessage({ action: 'updateAllIcons' });
        } catch (_) {}
      });
    }
  });

  // Reset to Defaults Button with safe inline confirmation
  let resetConfirmTimeout = null;
  const resetBtn = document.getElementById('resetDefaultsBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (resetBtn.dataset.confirming === 'true') {
        clearTimeout(resetConfirmTimeout);
        delete resetBtn.dataset.confirming;
        currentSettings = { ...DEFAULT_SETTINGS };
        await chrome.storage.sync.set(currentSettings);
        renderUI();
        resetBtn.textContent = '✓ Reset Done!';
        resetBtn.classList.remove('btn-reset-confirm');
        resetBtn.classList.add('btn-reset-success');
        setTimeout(() => {
          resetBtn.textContent = '↺ Reset Defaults';
          resetBtn.classList.remove('btn-reset-success');
        }, 1800);
      } else {
        resetBtn.dataset.confirming = 'true';
        resetBtn.textContent = 'Click to Confirm';
        resetBtn.classList.add('btn-reset-confirm');
        resetConfirmTimeout = setTimeout(() => {
          delete resetBtn.dataset.confirming;
          resetBtn.textContent = '↺ Reset Defaults';
          resetBtn.classList.remove('btn-reset-confirm');
        }, 3000);
      }
    });
  }

  // Setup Text Selection Toolbar listeners
  setupToolbarEventListeners();
}

let editingWebsiteId = null;
let websiteDuplicateConfirmed = false;
let captureDuplicateConfirmed = false;

// Known domain to branded display name dictionary
const KNOWN_DOMAIN_NAMES = {
  'duckduckgo.com': 'DuckDuckGo',
  'bing.com': 'Bing',
  'yahoo.com': 'Yahoo',
  'baidu.com': 'Baidu',
  'ecosia.org': 'Ecosia',
  'brave.com': 'Brave Search',
  'startpage.com': 'Startpage',
  'kagi.com': 'Kagi',
  'x.com': 'X (Twitter)',
  'twitter.com': 'Twitter',
  'stackoverflow.com': 'Stack Overflow',
  'pinterest.com': 'Pinterest',
  'ebay.com': 'eBay',
  'netflix.com': 'Netflix',
  'spotify.com': 'Spotify',
  'imdb.com': 'IMDb',
  'twitch.tv': 'Twitch',
  'github.com': 'GitHub',
  'reddit.com': 'Reddit',
  'youtube.com': 'YouTube',
  'wikipedia.org': 'Wikipedia',
  'amazon.com': 'Amazon',
  'amazon.in': 'Amazon India',
  'amazon.co.uk': 'Amazon UK',
  'amazon.de': 'Amazon Germany',
  'amazon.ca': 'Amazon Canada',
  'amazon.co.jp': 'Amazon Japan',
  'amazon.com.au': 'Amazon Australia',
  'google.com': 'Google',
  'google.co.in': 'Google India',
  'google.co.uk': 'Google UK',
  'google.de': 'Google Germany',
  'google.ca': 'Google Canada',
  'steamdb.info': 'SteamDB',
  'steampowered.com': 'Steam',
  'nexusmods.com': 'Nexus Mods',
  'gog.com': 'GOG',
  'epicgames.com': 'Epic Games',
  'ycombinator.com': 'Hacker News'
};

// Automatically infers a clean website name from a URL or domain string
function deriveNameFromUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    let clean = rawUrl.trim();
    if (!/^https?:\/\//i.test(clean)) {
      clean = 'https://' + clean;
    }
    const parsed = new URL(clean);
    const host = parsed.hostname.toLowerCase().replace(/^www\./i, '');

    for (const [domain, brandName] of Object.entries(KNOWN_DOMAIN_NAMES)) {
      if (host === domain || host.endsWith('.' + domain)) {
        return brandName;
      }
    }

    const parts = host.split('.');
    const mainPart = parts.length > 2 && parts[0] === 'search' ? parts[1] : parts[0];
    if (mainPart) {
      return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
    }
  } catch (_) {}
  return '';
}

// Automatically normalizes any website or search URL into a working search template with {query}
function normalizeSearchTemplate(rawUrl) {
  let url = (rawUrl || '').trim();
  if (!url) return '';

  // 1. Ensure http:// or https:// protocol
  if (!/^https?:\/\//i.test(url)) {
    if (url.startsWith('//')) {
      url = 'https:' + url;
    } else {
      url = 'https://' + url;
    }
  }

  // 2. If it already contains {query} (case-insensitive), normalize to lowercase {query}
  if (/\{query\}/i.test(url)) {
    return url.replace(/\{query\}/gi, '{query}');
  }

  // 3. Known popular search engines & platforms
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./i, '');

    const knownTemplates = [
      { pattern: /(^|\.)duckduckgo\.com$/i, template: 'https://duckduckgo.com/?q={query}' },
      { pattern: /(^|\.)bing\.com$/i, template: 'https://www.bing.com/search?q={query}' },
      { pattern: /(^|\.)yahoo\.com$/i, template: 'https://search.yahoo.com/search?p={query}' },
      { pattern: /(^|\.)baidu\.com$/i, template: 'https://www.baidu.com/s?wd={query}' },
      { pattern: /(^|\.)ecosia\.org$/i, template: 'https://www.ecosia.org/search?q={query}' },
      { pattern: /(^|\.)brave\.com$/i, template: 'https://search.brave.com/search?q={query}' },
      { pattern: /(^|\.)startpage\.com$/i, template: 'https://www.startpage.com/sp/search?query={query}' },
      { pattern: /(^|\.)kagi\.com$/i, template: 'https://kagi.com/search?q={query}' },
      { pattern: /(^|\.)(twitter|x)\.com$/i, template: 'https://x.com/search?q={query}' },
      { pattern: /(^|\.)stackoverflow\.com$/i, template: 'https://stackoverflow.com/search?q={query}' },
      { pattern: /(^|\.)pinterest\.com$/i, template: 'https://www.pinterest.com/search/pins/?q={query}' },
      { pattern: /(^|\.)ebay\.com$/i, template: 'https://www.ebay.com/sch/i.html?_nkw={query}' },
      { pattern: /(^|\.)twitch\.tv$/i, template: 'https://www.twitch.tv/search?term={query}' },
      { pattern: /(^|\.)github\.com$/i, template: 'https://github.com/search?q={query}' },
      { pattern: /(^|\.)reddit\.com$/i, template: 'https://www.reddit.com/search/?q={query}' },
      { pattern: /(^|\.)youtube\.com$/i, template: 'https://www.youtube.com/results?search_query={query}' },
      { pattern: /(^|\.)wikipedia\.org$/i, template: 'https://en.wikipedia.org/w/index.php?search={query}' },
      { pattern: /(^|\.)amazon\.com$/i, template: 'https://www.amazon.com/s?k={query}' },
      { pattern: /(^|\.)google\.com$/i, template: 'https://www.google.com/search?q={query}' },
      { pattern: /(^|\.)steamdb\.info$/i, template: 'https://steamdb.info/search/?q={query}' },
      { pattern: /(^|\.)steampowered\.com$/i, template: 'https://store.steampowered.com/search/?term={query}' },
      { pattern: /(^|\.)nexusmods\.com$/i, template: 'https://www.nexusmods.com/search/?gsearch={query}' },
      { pattern: /(^|\.)gog\.com$/i, template: 'https://www.gog.com/en/games?query={query}' },
      { pattern: /(^|\.)imdb\.com$/i, template: 'https://www.imdb.com/find/?q={query}' }
    ];

    if ((parsed.pathname === '/' || !parsed.pathname) && !parsed.search) {
      for (const entry of knownTemplates) {
        if (entry.pattern.test(host)) {
          return entry.template;
        }
      }
    }

    // 4. If URL has query parameters, check if any parameter is a search term to replace
    const searchKeys = [
      'q', 'query', 'search', 'search_query', 'searchquery', 'search_term',
      'searchterm', 'term', 'k', 'p', 's', 'wd', 'text', 'keyword',
      'keywords', '_nkw', 'find'
    ];

    let foundSearchParam = false;
    for (const key of searchKeys) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, '{query}');
        foundSearchParam = true;
        break;
      }
    }

    if (foundSearchParam) {
      return parsed.toString().replace(/%7Bquery%7D/gi, '{query}');
    }

    // If there is only one query parameter in the URL, replace its value with {query}
    const allKeys = Array.from(parsed.searchParams.keys());
    if (allKeys.length === 1) {
      parsed.searchParams.set(allKeys[0], '{query}');
      return parsed.toString().replace(/%7Bquery%7D/gi, '{query}');
    }

    // If query string exists but doesn't have an obvious search key, append &q={query}
    if (parsed.search) {
      return parsed.toString() + '&q={query}';
    }

    // 5. If no query parameters exist:
    // If the path looks like a search route (/search, /s, /find, /results, etc.)
    if (/\/(search|s|find|results|query)\/?$/i.test(parsed.pathname)) {
      parsed.search = 'q={query}';
      return parsed.toString().replace(/%7Bquery%7D/gi, '{query}');
    }

    // Otherwise, for standard websites, search is located on /search/?q={query}
    if (parsed.pathname === '/' || !parsed.pathname) {
      return `${parsed.origin}/search/?q={query}`;
    }
    return `${parsed.origin}${parsed.pathname}?q={query}`;
  } catch (_) {
    if (url.includes('?')) {
      const joiner = (url.endsWith('?') || url.endsWith('&')) ? '' : '&';
      return `${url}${joiner}q={query}`;
    }
    return `${url}?q={query}`;
  }
}

// Capture Search URL Session configuration
const CAPTURE_SESSION_KEY = 'holdtab_active_capture_session';
const CAPTURE_SESSION_TTL = 20 * 60 * 1000; // 20 minutes

// Helper to escape regex special characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Safely constructs and validates search URL from a template and query
function buildSearchUrl(template, query) {
  if (!template || typeof template !== 'string') {
    return { valid: false, error: 'Please enter a search URL template.' };
  }
  let cleanTemplate = template.trim();
  if (!cleanTemplate) {
    return { valid: false, error: 'Template is empty.' };
  }
  if (!/^https?:\/\//i.test(cleanTemplate)) {
    return { valid: false, error: 'Search URL must begin with http:// or https://' };
  }
  if (/^(javascript|data|file|vbscript|blob):/i.test(cleanTemplate)) {
    return { valid: false, error: 'Unsafe URL scheme detected (javascript:, data:, etc. are not allowed).' };
  }
  if (!cleanTemplate.includes('{query}')) {
    return { valid: false, error: 'Template must contain the {query} placeholder.' };
  }

  const cleanQuery = (typeof query === 'string' ? query : '').trim();

  try {
    const qIndex = cleanTemplate.indexOf('{query}');
    const questionIndex = cleanTemplate.indexOf('?');

    let encodedQuery;
    // If {query} appears before '?' or no '?' exists, it is in the URL pathname
    if (questionIndex === -1 || (qIndex !== -1 && qIndex < questionIndex)) {
      // In path: spaces must be encoded as %20 (not +)
      encodedQuery = encodeURIComponent(cleanQuery);
    } else {
      // In query parameters: standard form search query, spaces as '+'
      encodedQuery = encodeURIComponent(cleanQuery).replace(/%20/g, '+');
    }

    const finalUrl = cleanTemplate.replace(/\{query\}/gi, encodedQuery);
    new URL(finalUrl);

    return { valid: true, url: finalUrl };
  } catch (err) {
    return { valid: false, error: err.message || 'Invalid search URL structure' };
  }
}

// Retrieve active capture session if unexpired
async function getActiveCaptureSession() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(CAPTURE_SESSION_KEY);
      const session = res[CAPTURE_SESSION_KEY];
      if (session && typeof session === 'object') {
        if (session.expiresAt && Date.now() < session.expiresAt) {
          return session;
        } else {
          await chrome.storage.local.remove(CAPTURE_SESSION_KEY);
        }
      }
    }
  } catch (_) {}
  return null;
}

// Persist active capture session with expiration
async function saveActiveCaptureSession(data) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const session = {
        ...data,
        updatedAt: Date.now(),
        expiresAt: Date.now() + CAPTURE_SESSION_TTL
      };
      await chrome.storage.local.set({ [CAPTURE_SESSION_KEY]: session });
    }
  } catch (_) {}
}

// Discard / clear active capture session
async function clearActiveCaptureSession() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.remove(CAPTURE_SESSION_KEY);
    }
  } catch (_) {}
}

// Generates an unpredictable test search marker
function generateSearchMarker() {
  const rand = Math.random().toString(36).substring(2, 7);
  return `holdtab_test_${rand}`;
}

// Generates a regex that matches the marker and any separator variations (e.g. underscores converted to hyphens/pluses/spaces)
function getMarkerRegex(marker) {
  if (!marker || typeof marker !== 'string') return null;
  const raw = marker.trim();
  if (!raw) return null;

  const parts = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    return new RegExp(escapeRegex(parts[0]), 'gi');
  }

  // Matches parts separated by one or more common URL/slug separators:
  // hyphens (-), underscores (_), pluses (+), dots (.), spaces (\s),
  // or URL-encoded equivalents (%20, %5F, %2D, %2B)
  const sep = '(?:[-_+.\\s]|%20|%5[fF]|%2[dD]|%2[bB])+';
  const pattern = parts.map((p) => escapeRegex(p)).join(sep);
  return new RegExp(pattern, 'gi');
}

// Generates common variations of marker strings
function getMarkerVariants(marker) {
  if (!marker || typeof marker !== 'string') return [];
  const raw = marker.trim();
  if (!raw) return [];

  const variants = new Set();
  variants.add(raw);
  variants.add(raw.toLowerCase());

  const parts = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length > 1) {
    variants.add(parts.join('_'));
    variants.add(parts.join('-'));
    variants.add(parts.join('+'));
    variants.add(parts.join(' '));
    variants.add(parts.join('%20'));
    variants.add(parts.join('%5f'));
    variants.add(parts.join('%5F'));
    variants.add(parts.join('%2d'));
    variants.add(parts.join('%2D'));
    variants.add(parts.join('.'));
    variants.add(parts.join(''));
  }

  try {
    variants.add(encodeURIComponent(raw));
    variants.add(encodeURIComponent(parts.join('-')));
    variants.add(encodeURIComponent(parts.join('+')));
  } catch (_) {}

  return Array.from(variants).filter(Boolean);
}

// Finds all occurrences of the marker (or its slugified/converted variants) in a URL
function findMarkerMatchesInUrl(tabUrl, marker) {
  if (!tabUrl || !marker) return [];
  const matches = [];

  const regex = getMarkerRegex(marker);
  if (regex) {
    let m;
    while ((m = regex.exec(tabUrl)) !== null) {
      matches.push({
        index: m.index,
        text: m[0],
        length: m[0].length
      });
      if (m.index === regex.lastIndex) regex.lastIndex++;
    }
  }

  // Fallback: Check variants (including stripped separator e.g. holdtabtesthfb3w)
  if (matches.length === 0) {
    const variants = getMarkerVariants(marker);
    const urlLower = tabUrl.toLowerCase();
    for (const v of variants) {
      const vLower = v.toLowerCase();
      let idx = 0;
      let foundAny = false;
      while ((idx = urlLower.indexOf(vLower, idx)) !== -1) {
        matches.push({
          index: idx,
          text: tabUrl.substring(idx, idx + vLower.length),
          length: vLower.length
        });
        idx += vLower.length;
        foundAny = true;
      }
      if (foundAny) break;
    }
  }

  return matches;
}

// Checks if a URL contains the search marker or any transformed variant
function urlMatchesSearchMarker(tabUrl, marker) {
  if (!tabUrl || !marker) return false;
  return findMarkerMatchesInUrl(tabUrl, marker).length > 0;
}

// Analyzes captured tab URL and replaces marker with {query}
// Resilient to websites converting underscores to hyphens, pluses, or spaces
function deriveTemplateFromCapturedUrl(tabUrl, marker) {
  if (!tabUrl || !marker) return null;
  const matches = findMarkerMatchesInUrl(tabUrl, marker);
  if (matches.length === 0) return null;

  const multipleOccurrences = matches.length > 1;

  if (multipleOccurrences) {
    // Check if one of the occurrences is inside a recognized search query parameter
    try {
      const parsed = new URL(tabUrl);
      const searchKeys = [
        'q', 'query', 'k', 'search_query', 'searchquery', 'term', 'search_term',
        'search', 's', 'p', 'keyword', 'keywords', 'text', 'find', '_nkw', 'wd'
      ];

      let targetKey = null;
      for (const key of searchKeys) {
        if (parsed.searchParams.has(key)) {
          const val = parsed.searchParams.get(key) || '';
          const paramMatches = findMarkerMatchesInUrl(val, marker);
          if (paramMatches.length > 0) {
            targetKey = key;
            break;
          }
        }
      }

      // If no recognized searchKey, check any query parameter containing the marker
      if (!targetKey) {
        for (const [key, val] of parsed.searchParams.entries()) {
          const paramMatches = findMarkerMatchesInUrl(val, marker);
          if (paramMatches.length > 0) {
            targetKey = key;
            break;
          }
        }
      }

      if (targetKey) {
        const originalVal = parsed.searchParams.get(targetKey) || '';
        const paramMatches = findMarkerMatchesInUrl(originalVal, marker);
        if (paramMatches.length > 0) {
          const pm = paramMatches[0];
          const replacedVal = originalVal.substring(0, pm.index) + '{query}' + originalVal.substring(pm.index + pm.length);
          parsed.searchParams.set(targetKey, replacedVal);
          return {
            template: parsed.toString().replace(/%7Bquery%7D/gi, '{query}'),
            multipleOccurrences: true
          };
        }
      }
    } catch (_) {}
  }

  // Exact slice replacement preserving original casing and rest of the URL
  const match = matches[0];
  const template = tabUrl.substring(0, match.index) + '{query}' + tabUrl.substring(match.index + match.length);

  return {
    template,
    multipleOccurrences
  };
}

// Hide all website cards (capture, preview, manual form)
function hideAllWebsiteCards() {
  const captureCard = document.getElementById('captureSearchCard');
  const previewCard = document.getElementById('capturePreviewCard');
  const formCard = document.getElementById('websiteFormCard');
  if (captureCard) captureCard.style.display = 'none';
  if (previewCard) previewCard.style.display = 'none';
  if (formCard) formCard.style.display = 'none';
  const websiteDupWarn = document.getElementById('websiteDuplicateWarning');
  if (websiteDupWarn) websiteDupWarn.style.display = 'none';
  const captureDupWarn = document.getElementById('captureDuplicateWarning');
  if (captureDupWarn) captureDupWarn.style.display = 'none';
  websiteDuplicateConfirmed = false;
  captureDuplicateConfirmed = false;
  editingWebsiteId = null;
}

// Display Step 1 capture dialog
function showCaptureDialog(marker, fallbackNoticeHtml = null) {
  hideAllWebsiteCards();
  const card = document.getElementById('captureSearchCard');
  const markerDisplay = document.getElementById('captureMarkerDisplay');
  const copyBtn = document.getElementById('copyMarkerBtn');
  const statusMsg = document.getElementById('captureStatusMessage');
  const captureBtn = document.getElementById('captureActiveUrlBtn');
  const spinner = document.getElementById('captureSpinner');
  const btnText = document.getElementById('captureBtnText');
  const fallbackNotice = document.getElementById('captureFallbackNotice');
  const fallbackText = document.getElementById('captureFallbackNoticeText');

  if (markerDisplay) markerDisplay.textContent = marker;
  if (copyBtn) {
    copyBtn.textContent = '📋 Copy Keyword';
    copyBtn.classList.remove('copied');
  }
  if (statusMsg) {
    statusMsg.style.display = 'none';
    statusMsg.innerHTML = '';
  }
  if (fallbackNotice && fallbackText) {
    if (fallbackNoticeHtml) {
      fallbackText.innerHTML = fallbackNoticeHtml;
      fallbackNotice.style.display = 'flex';
    } else {
      fallbackNotice.style.display = 'none';
    }
  }
  if (captureBtn) captureBtn.disabled = false;
  if (spinner) spinner.style.display = 'none';
  if (btnText) btnText.textContent = '🔍 Capture Current URL';

  if (card) card.style.display = 'block';
}

// Display Step 2 preview dialog
function showCapturePreview(data) {
  hideAllWebsiteCards();
  const card = document.getElementById('capturePreviewCard');
  const nameInput = document.getElementById('captureNameInput');
  const templateInput = document.getElementById('captureTemplateInput');
  const testQueryInput = document.getElementById('captureTestQueryInput');
  const multipleWarning = document.getElementById('captureMultipleWarning');
  const errorBox = document.getElementById('capturePreviewError');
  const successBox = document.getElementById('capturePreviewSuccess');
  const autoSuccessBadge = document.getElementById('captureAutoSuccessBadge');

  if (nameInput) nameInput.value = data.siteName || '';
  if (templateInput) templateInput.value = data.template || '';
  if (testQueryInput) testQueryInput.value = data.testQuery || 'wireless headphones';

  if (multipleWarning) {
    multipleWarning.style.display = data.multipleOccurrences ? 'block' : 'none';
  }
  if (autoSuccessBadge) {
    if (data.autoCaptured) {
      const badgeText = autoSuccessBadge.querySelector('.info-pill-body');
      if (badgeText) {
        badgeText.innerHTML = data.isBackgroundTab
          ? `<strong>Auto-captured in background tab!</strong> Search bar was detected and URL template derived in a pinned background tab, which was closed automatically.`
          : `<strong>Auto-captured in 1 click!</strong> The search URL and query parameter were detected automatically.`;
      }
      autoSuccessBadge.style.display = 'flex';
    } else {
      autoSuccessBadge.style.display = 'none';
    }
  }
  if (errorBox) errorBox.style.display = 'none';
  if (successBox) successBox.style.display = 'none';

  populateCategorySelects();
  const captureCatInput = document.getElementById('captureCategoryInput');
  if (captureCatInput) {
    captureCatInput.value = data.categoryId || '';
  }
  const dupWarning = document.getElementById('captureDuplicateWarning');
  if (dupWarning) dupWarning.style.display = 'none';
  captureDuplicateConfirmed = false;

  updateCapturePreviewUi();
  if (card) card.style.display = 'block';
  if (nameInput) nameInput.focus();
}

// Update preview box and icon preview
function updateCapturePreviewUi() {
  const nameInput = document.getElementById('captureNameInput');
  const templateInput = document.getElementById('captureTemplateInput');
  const testQueryInput = document.getElementById('captureTestQueryInput');
  const previewBox = document.getElementById('capturePreviewUrlBox');
  const iconContainer = document.getElementById('captureIconPreview');
  const errorBox = document.getElementById('capturePreviewError');

  if (!templateInput || !previewBox) return;

  const templateVal = templateInput.value.trim();
  const testQueryVal = testQueryInput ? testQueryInput.value : 'wireless headphones';
  const siteName = nameInput ? nameInput.value.trim() : '';

  if (iconContainer) {
    iconContainer.innerHTML = getWebsiteIconHtml({
      icon: 'custom',
      template: templateVal,
      name: siteName || 'Custom Search'
    });
    attachIconErrorFallbacks(iconContainer);
  }

  const result = buildSearchUrl(templateVal, testQueryVal);
  if (result.valid) {
    previewBox.textContent = result.url;
    if (errorBox) errorBox.style.display = 'none';
  } else {
    previewBox.innerHTML = `<span style="color: #ef4444;">⚠️ ${escapeHtml(result.error)}</span>`;
  }
}

// Capture current active tab URL and process marker
async function captureActiveTabUrl() {
  const captureBtn = document.getElementById('captureActiveUrlBtn');
  const spinner = document.getElementById('captureSpinner');
  const btnText = document.getElementById('captureBtnText');
  const statusMsg = document.getElementById('captureStatusMessage');

  if (statusMsg) {
    statusMsg.style.display = 'none';
    statusMsg.innerHTML = '';
  }

  if (captureBtn) captureBtn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';
  if (btnText) btnText.textContent = '🔍 Reading active tab...';

  function resetCaptureBtn() {
    if (captureBtn) captureBtn.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent = '🔍 Capture Current URL';
  }

  function showCaptureError(html) {
    resetCaptureBtn();
    if (statusMsg) {
      statusMsg.innerHTML = html;
      statusMsg.style.display = 'block';
    }
  }

  try {
    const session = await getActiveCaptureSession();
    const marker = session ? session.marker : (document.getElementById('captureMarkerDisplay')?.textContent || '').trim();

    if (!marker || marker === 'holdtab_test_...') {
      showCaptureError('⚠️ No active test keyword found. Please click <strong>Capture Search URL</strong> above to start a fresh capture session.');
      return;
    }

    if (!chrome.tabs || !chrome.tabs.query) {
      showCaptureError('⚠️ Browser tab access is unavailable.');
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        if (!tabs || !tabs[0] || !tabs[0].url) {
          showCaptureError('⚠️ Could not read the active tab URL. Please make sure the search results tab is currently selected in your browser window.');
          return;
        }

        const tabUrl = tabs[0].url;

        // Check for internal/restricted pages
        if (!/^https?:\/\//i.test(tabUrl)) {
          const scheme = (tabUrl.split(':')[0] || 'internal') + '://';
          showCaptureError(`⚠️ Restricted browser page detected (<code>${escapeHtml(scheme)}</code>).<br>Please switch to the target website tab where you searched for <strong>${escapeHtml(marker)}</strong>, then click Capture again.`);
          return;
        }

        const derived = deriveTemplateFromCapturedUrl(tabUrl, marker);
        if (!derived) {
          showCaptureError(`
            <div style="font-weight: 600; margin-bottom: 4px;">⚠️ Test keyword not found in current tab's URL:</div>
            <div style="font-family: monospace; font-size: 9.5px; color: var(--text-muted); word-break: break-all; margin-bottom: 6px;">${escapeHtml(tabUrl)}</div>
            <div><strong>How to fix:</strong></div>
            <ol style="margin: 4px 0 6px 16px; padding: 0;">
              <li>Go to the website in your active tab.</li>
              <li>Paste <code>${escapeHtml(marker)}</code> into the search box and press Enter.</li>
              <li>Reopen this popup and click <strong>Capture Current URL</strong>.</li>
            </ol>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">
              Does this website use JavaScript/POST requests without updating the address bar?
              <a href="#" id="captureErrorManualLink" style="color: #38bdf8; text-decoration: underline;">Enter URL manually instead</a>
            </div>
          `);

          const manualLink = document.getElementById('captureErrorManualLink');
          if (manualLink) {
            manualLink.addEventListener('click', (e) => {
              e.preventDefault();
              hideAllWebsiteCards();
              const formCard = document.getElementById('websiteFormCard');
              if (formCard) formCard.style.display = 'block';
            });
          }
          return;
        }

        const siteName = deriveNameFromUrl(tabUrl) || 'Custom Search';
        const sessionData = {
          marker,
          step: 'preview',
          capturedUrl: tabUrl,
          siteName,
          template: derived.template,
          testQuery: 'wireless headphones',
          multipleOccurrences: Boolean(derived.multipleOccurrences)
        };

        await saveActiveCaptureSession(sessionData);
        resetCaptureBtn();
        showCapturePreview(sessionData);
      } catch (err) {
        showCaptureError(`⚠️ An error occurred while capturing: ${escapeHtml(err.message || String(err))}`);
      }
    });
  } catch (err) {
    showCaptureError(`⚠️ Could not complete capture: ${escapeHtml(err.message || String(err))}`);
  }
}

// Resume active capture session if unexpired
async function resumeCaptureSessionIfActive() {
  const session = await getActiveCaptureSession();
  if (!session) return;

  // Auto-switch to tab-toolbar so the user resumes immediately
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabs.forEach((t) => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  panels.forEach((p) => p.classList.remove('active'));

  const toolbarTab = document.querySelector('.nav-tab[data-tab="tab-toolbar"]');
  const toolbarPanel = document.getElementById('tab-toolbar');
  if (toolbarTab && toolbarPanel) {
    toolbarTab.classList.add('active');
    toolbarTab.setAttribute('aria-selected', 'true');
    toolbarPanel.classList.add('active');
  }

  if (session.step === 'preview') {
    showCapturePreview(session);
  } else {
    showCaptureDialog(session.marker);
  }
}

// Setup Text Selection Toolbar event listeners
function setupToolbarEventListeners() {
  const toolbarEnabledToggle = document.getElementById('toolbarEnabledToggle');
  if (toolbarEnabledToggle) {
    toolbarEnabledToggle.addEventListener('change', (e) => {
      saveSettings({ toolbarEnabled: e.target.checked });
    });
  }

  // Display mode
  document.querySelectorAll('input[name="toolbarMode"]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const mode = e.target.value;
      const modGroup = document.getElementById('toolbarModifierGroup');
      if (modGroup) {
        modGroup.style.display = (mode === 'demand') ? 'block' : 'none';
      }
      saveSettings({ toolbarMode: mode });
    });
  });

  // Activation key
  const modifierSelect = document.getElementById('toolbarModifier');
  if (modifierSelect) {
    modifierSelect.addEventListener('change', (e) => {
      saveSettings({ toolbarModifier: e.target.value });
    });
  }

  // Appearance delay
  const delaySlider = document.getElementById('toolbarDelay');
  const delayVal = document.getElementById('toolbarDelayValue');
  if (delaySlider && delayVal) {
    delaySlider.addEventListener('input', (e) => {
      delayVal.textContent = `${e.target.value} ms`;
    });
    delaySlider.addEventListener('change', (e) => {
      saveSettings({ toolbarDelay: parseInt(e.target.value, 10) });
    });
  }

  // Minimum length
  const minLenSlider = document.getElementById('toolbarMinLength');
  const minLenVal = document.getElementById('toolbarMinLengthValue');
  if (minLenSlider && minLenVal) {
    minLenSlider.addEventListener('input', (e) => {
      minLenVal.textContent = `${e.target.value} chars`;
    });
    minLenSlider.addEventListener('change', (e) => {
      saveSettings({ toolbarMinLength: parseInt(e.target.value, 10) });
    });
  }

  // Submenu toggle
  const submenuToggle = document.getElementById('toolbarSearchSubmenuToggle');
  if (submenuToggle) {
    submenuToggle.addEventListener('change', (e) => {
      saveSettings({ toolbarSearchSubmenu: e.target.checked });
    });
  }

  // Quick Search settings listeners
  const quickSearchToggle = document.getElementById('quickSearchEnabledToggle');
  if (quickSearchToggle) {
    quickSearchToggle.addEventListener('change', (e) => {
      saveSettings({ quickSearchEnabled: e.target.checked });
    });
  }

  const defaultEngineSelect = document.getElementById('quickSearchDefaultEngineSelect');
  if (defaultEngineSelect) {
    defaultEngineSelect.addEventListener('change', (e) => {
      saveSettings({ quickSearchDefaultEngine: e.target.value });
    });
  }

  const quickSearchMouseToggle = document.getElementById('quickSearchMouseShortcutToggle');
  if (quickSearchMouseToggle) {
    quickSearchMouseToggle.addEventListener('change', (e) => {
      saveSettings({ quickSearchMouseShortcut: e.target.checked });
    });
  }

  const shortcutBtn = document.getElementById('openShortcutConfigBtn');
  if (shortcutBtn) {
    shortcutBtn.addEventListener('click', () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }, () => {
            if (chrome.runtime.lastError) {
              try {
                chrome.tabs.create({ url: 'about:addons' });
              } catch (_) {}
            }
          });
        }
      } catch (_) {}
    });
  }

  // Capture Search URL buttons & inputs
  const startCaptureBtn = document.getElementById('startCaptureBtn');
  const copyMarkerBtn = document.getElementById('copyMarkerBtn');
  const captureActiveUrlBtn = document.getElementById('captureActiveUrlBtn');
  const cancelCaptureBtn = document.getElementById('cancelCaptureBtn');
  const switchToManualBtn = document.getElementById('switchToManualBtn');

  const testSearchBtn = document.getElementById('testSearchBtn');
  const saveCapturedWebsiteBtn = document.getElementById('saveCapturedWebsiteBtn');
  const cancelCapturePreviewBtn = document.getElementById('cancelCapturePreviewBtn');
  const backToCaptureBtn = document.getElementById('backToCaptureBtn');

  const captureNameInput = document.getElementById('captureNameInput');
  const captureTemplateInput = document.getElementById('captureTemplateInput');
  const captureTestQueryInput = document.getElementById('captureTestQueryInput');

  if (startCaptureBtn) {
    startCaptureBtn.addEventListener('click', async () => {
      const origHtml = startCaptureBtn.innerHTML;
      startCaptureBtn.disabled = true;
      startCaptureBtn.innerHTML = `<span>⏳</span> Capturing in background tab...`;

      const marker = generateSearchMarker();
      let activeTab = null;
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTab = tabs && tabs[0] ? tabs[0] : null;
      } catch (_) {}

      const isHttp = activeTab && activeTab.url && /^https?:\/\//i.test(activeTab.url);
      if (!isHttp) {
        await saveActiveCaptureSession({
          marker,
          step: 'capturing',
          tabId: activeTab ? activeTab.id : null,
          isBackgroundTab: false,
          createdAt: Date.now()
        });
        startCaptureBtn.disabled = false;
        startCaptureBtn.innerHTML = origHtml;
        showCaptureDialog(marker, '⚡ Auto-capture is unavailable on internal or restricted browser pages. Follow the quick manual capture steps below.');
        return;
      }

      // Open a pinned background tab for non-intrusive in-background capture
      let bgTab = null;
      try {
        bgTab = await chrome.tabs.create({
          url: activeTab.url,
          active: false,
          pinned: true
        });
      } catch (err) {
        console.warn('HoldTab: Failed to open pinned background tab:', err);
      }

      const targetTabId = bgTab ? bgTab.id : activeTab.id;
      const isBg = !!bgTab;

      await saveActiveCaptureSession({
        marker,
        step: 'capturing',
        tabId: targetTabId,
        isBackgroundTab: isBg,
        createdAt: Date.now()
      });

      let autoSubmitted = false;
      let captured = false;

      try {
        // Wait for background tab's content script to be ready and submit the marker
        const pollStart = Date.now();
        while (Date.now() - pollStart < 5000) {
          await new Promise((r) => setTimeout(r, 250));
          if (isBg) {
            const check = await chrome.tabs.get(bgTab.id).catch(() => null);
            if (!check) break; // User or browser closed tab
          }

          try {
            const resp = await chrome.tabs.sendMessage(targetTabId, {
              action: 'autoSubmitSearchMarker',
              marker
            });
            if (resp && resp.filled) {
              autoSubmitted = true;
              break;
            }
          } catch (_) {
            // Content script in background tab still loading
          }
        }

        if (autoSubmitted) {
          // Tab submitted search form! Poll for URL containing marker
          const submitStart = Date.now();
          while (Date.now() - submitStart < 5000) {
            await new Promise((r) => setTimeout(r, 200));
            const currentTab = await chrome.tabs.get(targetTabId).catch(() => null);
            if (currentTab && currentTab.url && urlMatchesSearchMarker(currentTab.url, marker)) {
              const derived = deriveTemplateFromCapturedUrl(currentTab.url, marker);
              if (derived && derived.template) {
                const detectedName = deriveNameFromUrl(currentTab.url) || currentTab.title || 'Custom Search';
                const sessionData = {
                  marker,
                  step: 'preview',
                  siteName: detectedName.replace(/\s*[-–|].*$/, '').trim(),
                  template: derived.template,
                  testQuery: 'wireless headphones',
                  capturedUrl: currentTab.url,
                  multipleOccurrences: derived.multipleOccurrences || false,
                  autoCaptured: true,
                  isBackgroundTab: isBg,
                  createdAt: Date.now()
                };
                await saveActiveCaptureSession(sessionData);
                showCapturePreview(sessionData);
                captured = true;
                break;
              }
            }
          }
        }
      } catch (err) {
        console.warn('HoldTab: Error during background capture:', err);
      } finally {
        // ALWAYS close the pinned background tab after the process is done
        if (isBg && bgTab && bgTab.id) {
          try {
            await chrome.tabs.remove(bgTab.id);
          } catch (_) {}
          bgTab = null;
        }

        startCaptureBtn.disabled = false;
        startCaptureBtn.innerHTML = origHtml;
      }

      if (!captured) {
        if (autoSubmitted) {
          showCaptureDialog(marker, '⚡ Auto-submit was sent in the background tab, but the search URL did not update automatically. Follow the manual capture steps below.');
        } else {
          showCaptureDialog(marker, '⚡ Search bar could not be auto-detected in the background tab. No problem! Follow the quick 2-step manual capture below.');
        }
      }
    });
  }

  // Reactive listener for storage updates (e.g. background service worker auto-captured URL)
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.activeCaptureSession) {
        const session = changes.activeCaptureSession.newValue;
        if (session && session.step === 'preview') {
          showCapturePreview(session);
        }
      }
    });
  }

  if (copyMarkerBtn) {
    copyMarkerBtn.addEventListener('click', async () => {
      const markerEl = document.getElementById('captureMarkerDisplay');
      const marker = markerEl ? markerEl.textContent.trim() : '';
      if (!marker) return;

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(marker);
        } else {
          const ta = document.createElement('textarea');
          ta.value = marker;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        copyMarkerBtn.textContent = '✓ Copied!';
        copyMarkerBtn.classList.add('copied');
        setTimeout(() => {
          copyMarkerBtn.textContent = '📋 Copy Keyword';
          copyMarkerBtn.classList.remove('copied');
        }, 1800);
      } catch (_) {}
    });
  }

  if (captureActiveUrlBtn) {
    captureActiveUrlBtn.addEventListener('click', () => {
      captureActiveTabUrl();
    });
  }

  if (cancelCaptureBtn) {
    cancelCaptureBtn.addEventListener('click', async () => {
      await clearActiveCaptureSession();
      hideAllWebsiteCards();
    });
  }

  if (switchToManualBtn) {
    switchToManualBtn.addEventListener('click', () => {
      hideAllWebsiteCards();
      const formCard = document.getElementById('websiteFormCard');
      if (formCard) formCard.style.display = 'block';
      const urlInput = document.getElementById('websiteUrlInput');
      if (urlInput) urlInput.focus();
    });
  }

  if (captureTemplateInput) {
    captureTemplateInput.addEventListener('input', () => {
      captureDuplicateConfirmed = false;
      const dupWarn = document.getElementById('captureDuplicateWarning');
      if (dupWarn) dupWarn.style.display = 'none';
      updateCapturePreviewUi();
    });
    captureTemplateInput.addEventListener('blur', updateCapturePreviewUi);
  }

  if (captureTestQueryInput) {
    captureTestQueryInput.addEventListener('input', updateCapturePreviewUi);
    captureTestQueryInput.addEventListener('blur', updateCapturePreviewUi);
  }

  if (captureNameInput) {
    captureNameInput.addEventListener('input', updateCapturePreviewUi);
  }

  if (testSearchBtn) {
    testSearchBtn.addEventListener('click', () => {
      const template = captureTemplateInput ? captureTemplateInput.value.trim() : '';
      const query = captureTestQueryInput ? captureTestQueryInput.value.trim() : 'wireless headphones';
      const errorBox = document.getElementById('capturePreviewError');
      const successBox = document.getElementById('capturePreviewSuccess');

      if (errorBox) errorBox.style.display = 'none';
      if (successBox) successBox.style.display = 'none';

      const res = buildSearchUrl(template, query);
      if (!res.valid) {
        if (errorBox) {
          errorBox.textContent = res.error;
          errorBox.style.display = 'block';
        }
        return;
      }

      try {
        chrome.runtime.sendMessage({
          action: 'openLink',
          url: res.url,
          tabFocus: 'background'
        });
        if (successBox) {
          successBox.textContent = '✓ Test search opened in background tab! Switch tabs to inspect results.';
          successBox.style.display = 'block';
          setTimeout(() => {
            if (successBox) successBox.style.display = 'none';
          }, 4000);
        }
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = `Could not open tab: ${err.message}`;
          errorBox.style.display = 'block';
        }
      }
    });
  }

  if (saveCapturedWebsiteBtn) {
    saveCapturedWebsiteBtn.addEventListener('click', async () => {
      const rawTemplate = captureTemplateInput ? captureTemplateInput.value.trim() : '';
      let name = captureNameInput ? captureNameInput.value.trim() : '';
      const errorBox = document.getElementById('capturePreviewError');

      if (errorBox) errorBox.style.display = 'none';

      if (!rawTemplate) {
        if (errorBox) {
          errorBox.textContent = 'Please enter a search URL template.';
          errorBox.style.display = 'block';
        }
        return;
      }

      const testRes = buildSearchUrl(rawTemplate, 'test');
      if (!testRes.valid) {
        if (errorBox) {
          errorBox.textContent = testRes.error;
          errorBox.style.display = 'block';
        }
        return;
      }

      if (!name) {
        name = deriveNameFromUrl(rawTemplate) || 'Custom Search';
      }

      if (!captureDuplicateConfirmed) {
        const dup = findDuplicateWebsite(rawTemplate, name, null);
        if (dup.duplicate) {
          const warnBox = document.getElementById('captureDuplicateWarning');
          const warnMsg = document.getElementById('captureDuplicateMsg');
          const addAnywayBtn = document.getElementById('captureDuplicateAddAnywayBtn');
          const cancelDupBtn = document.getElementById('captureDuplicateCancelBtn');

          if (warnBox && warnMsg) {
            warnMsg.textContent = dup.message;
            warnBox.style.display = 'block';

            if (addAnywayBtn) {
              addAnywayBtn.onclick = () => {
                captureDuplicateConfirmed = true;
                warnBox.style.display = 'none';
                saveCapturedWebsiteBtn.click();
              };
            }
            if (cancelDupBtn) {
              cancelDupBtn.onclick = () => {
                warnBox.style.display = 'none';
                if (cancelCapturePreviewBtn) cancelCapturePreviewBtn.click();
              };
            }
            return;
          }
        }
      }
      captureDuplicateConfirmed = false;

      const captureCatInput = document.getElementById('captureCategoryInput');
      const categoryId = captureCatInput && captureCatInput.value ? captureCatInput.value : null;

      const sites = Array.isArray(currentSettings.toolbarSearchWebsites)
        ? [...currentSettings.toolbarSearchWebsites]
        : [...DEFAULT_SEARCH_WEBSITES];

      const id = 'custom_' + Date.now();
      sites.push({ id, name, template: rawTemplate, enabled: true, icon: 'custom', categoryId });

      currentSettings.toolbarSearchWebsites = sites;
      saveSettings({ toolbarSearchWebsites: sites });

      await clearActiveCaptureSession();
      hideAllWebsiteCards();
      renderToolbarWebsitesList();
  renderCategoriesList();
  populateCategorySelects();
    });
  }

  if (cancelCapturePreviewBtn) {
    cancelCapturePreviewBtn.addEventListener('click', async () => {
      await clearActiveCaptureSession();
      hideAllWebsiteCards();
    });
  }

  if (backToCaptureBtn) {
    backToCaptureBtn.addEventListener('click', async () => {
      const session = await getActiveCaptureSession();
      const marker = session ? session.marker : generateSearchMarker();
      await saveActiveCaptureSession({
        marker,
        step: 'capturing',
        createdAt: Date.now()
      });
      showCaptureDialog(marker);
    });
  }

  // Keyboard shortcut: Escape cancels any open capture or manual card
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const captureCard = document.getElementById('captureSearchCard');
      const previewCard = document.getElementById('capturePreviewCard');
      const formCard = document.getElementById('websiteFormCard');
      if (
        (captureCard && captureCard.style.display !== 'none') ||
        (previewCard && previewCard.style.display !== 'none') ||
        (formCard && formCard.style.display !== 'none')
      ) {
        clearActiveCaptureSession();
        hideAllWebsiteCards();
      }
    }
  });

  // Manual website management buttons
  const addBtn = document.getElementById('addWebsiteBtn');
  const cancelBtn = document.getElementById('cancelWebsiteBtn');
  const saveBtn = document.getElementById('saveWebsiteBtn');
  const restoreBtn = document.getElementById('restoreWebsitesBtn');
  const formCard = document.getElementById('websiteFormCard');
  const formTitle = document.getElementById('websiteFormTitle');
  const nameInput = document.getElementById('websiteNameInput');
  const urlInput = document.getElementById('websiteUrlInput');
  const formError = document.getElementById('websiteFormError');

  if (addBtn && formCard) {
    addBtn.addEventListener('click', () => {
      hideAllWebsiteCards();
      clearActiveCaptureSession();
      editingWebsiteId = null;
      if (formTitle) formTitle.textContent = 'Add Custom Website';
      if (nameInput) nameInput.value = '';
      if (urlInput) urlInput.value = '';
      if (formError) formError.style.display = 'none';
      formCard.style.display = 'block';

      try {
        if (chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0] && tabs[0].url && !editingWebsiteId) {
              const currentUrl = tabs[0].url;
              if (/^https?:\/\//i.test(currentUrl)) {
                const detectedName = deriveNameFromUrl(currentUrl);
                const detectedTemplate = normalizeSearchTemplate(currentUrl);
                if (urlInput && !urlInput.value && detectedTemplate) {
                  urlInput.value = detectedTemplate;
                }
                if (nameInput && !nameInput.value && detectedName) {
                  nameInput.value = detectedName;
                }
              }
            }
          });
        }
      } catch (_) {}

      if (urlInput) urlInput.focus();
    });
  }

  if (cancelBtn && formCard) {
    cancelBtn.addEventListener('click', () => {
      hideAllWebsiteCards();
      if (formError) formError.style.display = 'none';
    });
  }

  // Real-time auto-formatting on URL input
  if (urlInput) {
    urlInput.addEventListener('blur', () => {
      const val = urlInput.value.trim();
      if (val && !val.includes('{query}')) {
        const normalized = normalizeSearchTemplate(val);
        if (normalized) {
          urlInput.value = normalized;
        }
      }
      if (nameInput && !nameInput.value.trim() && val) {
        const autoName = deriveNameFromUrl(val);
        if (autoName) nameInput.value = autoName;
      }
    });

    urlInput.addEventListener('input', () => {
      websiteDuplicateConfirmed = false;
      const dupWarn = document.getElementById('websiteDuplicateWarning');
      if (dupWarn) dupWarn.style.display = 'none';
      if (formError && formError.style.display !== 'none') {
        formError.style.display = 'none';
      }
      const val = urlInput.value.trim();
      if (nameInput && !nameInput.value.trim() && val) {
        const autoName = deriveNameFromUrl(val);
        if (autoName) nameInput.value = autoName;
      }
    });
  }

  if (saveBtn && formCard) {
    saveBtn.addEventListener('click', () => {
      let name = nameInput ? nameInput.value.trim() : '';
      const rawUrl = urlInput ? urlInput.value.trim() : '';

      if (!rawUrl) {
        showWebsiteFormError('Please enter a website or search URL.');
        if (urlInput) urlInput.focus();
        return;
      }

      // Automatically normalize URL and add {query} placeholder
      let template = normalizeSearchTemplate(rawUrl);

      if (!template || !/^https?:\/\//i.test(template)) {
        showWebsiteFormError('Please enter a valid website URL (http:// or https://).');
        return;
      }

      // Guarantee {query} is present in template
      if (!template.includes('{query}')) {
        const joiner = template.includes('?')
          ? (template.endsWith('?') || template.endsWith('&') ? '' : '&')
          : '?';
        template = `${template}${joiner}q={query}`;
      }

      // If user left website name blank, automatically detect name from URL
      if (!name) {
        name = deriveNameFromUrl(rawUrl) || 'Search Engine';
        if (nameInput) nameInput.value = name;
      }

      if (!editingWebsiteId && !websiteDuplicateConfirmed) {
        const dup = findDuplicateWebsite(template, name, null);
        if (dup.duplicate) {
          const warnBox = document.getElementById('websiteDuplicateWarning');
          const warnMsg = document.getElementById('websiteDuplicateMsg');
          const addAnywayBtn = document.getElementById('websiteDuplicateAddAnywayBtn');
          const cancelDupBtn = document.getElementById('websiteDuplicateCancelBtn');

          if (warnBox && warnMsg) {
            warnMsg.textContent = dup.message;
            warnBox.style.display = 'block';

            if (addAnywayBtn) {
              addAnywayBtn.onclick = () => {
                websiteDuplicateConfirmed = true;
                warnBox.style.display = 'none';
                saveBtn.click();
              };
            }
            if (cancelDupBtn) {
              cancelDupBtn.onclick = () => {
                warnBox.style.display = 'none';
                if (cancelWebsiteBtn) cancelWebsiteBtn.click();
              };
            }
            return;
          }
        }
      }
      websiteDuplicateConfirmed = false;

      const catInput = document.getElementById('websiteCategoryInput');
      const categoryId = catInput && catInput.value ? catInput.value : null;

      const sites = Array.isArray(currentSettings.toolbarSearchWebsites)
        ? [...currentSettings.toolbarSearchWebsites]
        : [...DEFAULT_SEARCH_WEBSITES];

      if (editingWebsiteId) {
        const idx = sites.findIndex((s) => s.id === editingWebsiteId);
        if (idx !== -1) {
          sites[idx] = { ...sites[idx], name, template, categoryId };
        }
      } else {
        const id = 'custom_' + Date.now();
        sites.push({ id, name, template, enabled: true, icon: 'custom', categoryId });
      }

      currentSettings.toolbarSearchWebsites = sites;
      saveSettings({ toolbarSearchWebsites: sites });
      hideAllWebsiteCards();
      renderToolbarWebsitesList();
  renderCategoriesList();
  populateCategorySelects();
    });
  }

  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      const restored = JSON.parse(JSON.stringify(DEFAULT_SEARCH_WEBSITES));
      currentSettings.toolbarSearchWebsites = restored;
      saveSettings({ toolbarSearchWebsites: restored });
      hideAllWebsiteCards();
      renderToolbarWebsitesList();
  renderCategoriesList();
  populateCategorySelects();
    });
  }

  // Delegated clicks for website list items (reorder, edit, delete, toggle)
  const listContainer = document.getElementById('toolbarWebsitesList');
  if (listContainer) {
    listContainer.addEventListener('change', (e) => {
      const catSelect = e.target.closest('.website-category-select');
      if (catSelect) {
        const id = catSelect.dataset.id;
        const sites = Array.isArray(currentSettings.toolbarSearchWebsites)
          ? [...currentSettings.toolbarSearchWebsites]
          : [...DEFAULT_SEARCH_WEBSITES];
        const site = sites.find((s) => s.id === id);
        if (site) {
          site.categoryId = catSelect.value || null;
          currentSettings.toolbarSearchWebsites = sites;
          saveSettings({ toolbarSearchWebsites: sites });
          renderCategoriesList();
        }
      }
    });

    listContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      const toggle = e.target.closest('.site-toggle');

      const sites = Array.isArray(currentSettings.toolbarSearchWebsites)
        ? [...currentSettings.toolbarSearchWebsites]
        : [...DEFAULT_SEARCH_WEBSITES];

      if (toggle) {
        const id = toggle.dataset.id;
        const site = sites.find((s) => s.id === id);
        if (site) {
          site.enabled = toggle.checked;
          currentSettings.toolbarSearchWebsites = sites;
          saveSettings({ toolbarSearchWebsites: sites });
          renderToolbarWebsitesList();
  renderCategoriesList();
  populateCategorySelects();
        }
        return;
      }

      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const index = parseInt(btn.dataset.index, 10);

      if (action === 'up' && index > 0) {
        const targetIndex = e.shiftKey ? 0 : index - 1;
        const [moved] = sites.splice(index, 1);
        sites.splice(targetIndex, 0, moved);
        currentSettings.toolbarSearchWebsites = sites;
        saveSettings({ toolbarSearchWebsites: sites });
        renderToolbarWebsitesList();
        renderCategoriesList();
        populateCategorySelects();
        return;
      }

      if (action === 'down' && index < sites.length - 1) {
        const targetIndex = e.shiftKey ? sites.length - 1 : index + 1;
        const [moved] = sites.splice(index, 1);
        sites.splice(targetIndex, 0, moved);
        currentSettings.toolbarSearchWebsites = sites;
        saveSettings({ toolbarSearchWebsites: sites });
        renderToolbarWebsitesList();
        renderCategoriesList();
        populateCategorySelects();
        return;
      }

      if (action === 'edit' && id) {
        const site = sites.find((s) => s.id === id);
        if (site && formCard) {
          hideAllWebsiteCards();
          editingWebsiteId = id;
          if (formTitle) formTitle.textContent = `Edit "${site.name}"`;
          if (nameInput) nameInput.value = site.name;
          if (urlInput) urlInput.value = site.template;
          const catInput = document.getElementById('websiteCategoryInput');
          if (catInput) catInput.value = site.categoryId || '';
          if (formError) formError.style.display = 'none';
          formCard.style.display = 'block';
          if (nameInput) nameInput.focus();
        }
        return;
      }

      if (action === 'delete' && id) {
        const filtered = sites.filter((s) => s.id !== id);
        currentSettings.toolbarSearchWebsites = filtered;
        saveSettings({ toolbarSearchWebsites: filtered });
        if (editingWebsiteId === id && formCard) {
          formCard.style.display = 'none';
          editingWebsiteId = null;
        }
        renderToolbarWebsitesList();
        renderCategoriesList();
        populateCategorySelects();
      }
    });

    initListDragAndDrop(listContainer, '.website-item', (fromIdx, toIdx) => {
      const sites = Array.isArray(currentSettings.toolbarSearchWebsites)
        ? [...currentSettings.toolbarSearchWebsites]
        : [...DEFAULT_SEARCH_WEBSITES];
      const [moved] = sites.splice(fromIdx, 1);
      sites.splice(toIdx, 0, moved);
      currentSettings.toolbarSearchWebsites = sites;
      saveSettings({ toolbarSearchWebsites: sites });
      renderToolbarWebsitesList();
      renderCategoriesList();
      populateCategorySelects();
    });
  }

  setupCategoryEventListeners();
}

function showWebsiteFormError(msg) {
  const formError = document.getElementById('websiteFormError');
  if (formError) {
    formError.textContent = msg;
    formError.style.display = 'block';
  }
}

const DRAG_HANDLE_SVG = `
  <div class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">
    <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
      <circle cx="2" cy="2" r="1.2" />
      <circle cx="6" cy="2" r="1.2" />
      <circle cx="2" cy="7" r="1.2" />
      <circle cx="6" cy="7" r="1.2" />
      <circle cx="2" cy="12" r="1.2" />
      <circle cx="6" cy="12" r="1.2" />
    </svg>
  </div>
`;

// Reusable native drag-and-drop handler for reordering list items
function initListDragAndDrop(container, itemSelector, onReorder) {
  if (!container) return;

  let draggedItem = null;
  let sourceIndex = -1;

  container.addEventListener('dragstart', (e) => {
    // If user clicked inside interactive controls (like buttons, selects, or toggles), do not start drag
    const interactive = e.target.closest('button, input, select, label, .slider, .website-actions, .category-actions');
    if (interactive && !e.target.closest('.drag-handle')) {
      e.preventDefault();
      return;
    }

    const item = e.target.closest(itemSelector);
    if (!item) return;

    draggedItem = item;
    sourceIndex = parseInt(item.dataset.index, 10);
    item.classList.add('is-dragging');

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(sourceIndex));
    }
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggedItem) return;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }

    const targetItem = e.target.closest(itemSelector);
    if (!targetItem) return;

    const rect = targetItem.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    container.querySelectorAll(itemSelector).forEach((el) => {
      if (el !== targetItem) {
        el.classList.remove('drag-over-above', 'drag-over-below');
      }
    });

    if (targetItem !== draggedItem) {
      if (e.clientY < midY) {
        targetItem.classList.add('drag-over-above');
        targetItem.classList.remove('drag-over-below');
      } else {
        targetItem.classList.add('drag-over-below');
        targetItem.classList.remove('drag-over-above');
      }
    }
  });

  container.addEventListener('dragleave', (e) => {
    const targetItem = e.target.closest(itemSelector);
    if (targetItem && !targetItem.contains(e.relatedTarget)) {
      targetItem.classList.remove('drag-over-above', 'drag-over-below');
    }
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!draggedItem) return;

    const targetItem = e.target.closest(itemSelector);
    container.querySelectorAll(itemSelector).forEach((el) => {
      el.classList.remove('drag-over-above', 'drag-over-below');
    });

    if (!targetItem || targetItem === draggedItem) {
      return;
    }

    const fromIdx = sourceIndex;
    let toIdx = parseInt(targetItem.dataset.index, 10);
    if (isNaN(fromIdx) || isNaN(toIdx)) return;

    const rect = targetItem.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const dropBelow = e.clientY >= midY;

    if (dropBelow && toIdx < fromIdx) {
      toIdx += 1;
    } else if (!dropBelow && toIdx > fromIdx) {
      toIdx -= 1;
    }

    if (fromIdx !== toIdx) {
      onReorder(fromIdx, toIdx);
    }
  });

  container.addEventListener('dragend', () => {
    if (draggedItem) {
      draggedItem.classList.remove('is-dragging');
      draggedItem = null;
    }
    sourceIndex = -1;
    container.querySelectorAll(itemSelector).forEach((el) => {
      el.classList.remove('drag-over-above', 'drag-over-below');
    });
  });
}

// Render the list of configurable search engines in the popup
function renderToolbarWebsitesList() {
  const container = document.getElementById('toolbarWebsitesList');
  if (!container) return;
  container.innerHTML = '';

  const sites = Array.isArray(currentSettings.toolbarSearchWebsites)
    ? currentSettings.toolbarSearchWebsites
    : DEFAULT_SEARCH_WEBSITES;

  // Auto-heal legacy or misformatted templates (e.g. steamdb.info without /search/)
  let sitesUpdated = false;
  sites.forEach((site) => {
    if (site.template && site.template.includes('steamdb.info/?q=')) {
      site.template = site.template.replace('steamdb.info/?q=', 'steamdb.info/search/?q=');
      sitesUpdated = true;
    }
  });
  if (sitesUpdated) {
    currentSettings.toolbarSearchWebsites = sites;
    saveSettings({ toolbarSearchWebsites: sites });
  }

  if (sites.length === 0) {
    container.innerHTML = '<div style="padding: 8px; font-size: 11px; color: var(--text-muted); text-align: center;">No search engines configured. Click Defaults to restore.</div>';
    return;
  }

  const categories = Array.isArray(currentSettings.searchCategories)
    ? [...currentSettings.searchCategories]
    : [...DEFAULT_SEARCH_CATEGORIES];
  categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  sites.forEach((site, index) => {
    const item = document.createElement('div');
    item.className = `website-item ${site.enabled === false ? 'website-disabled' : ''}`;
    item.setAttribute('draggable', 'true');
    item.dataset.index = index;
    item.innerHTML = `
      ${DRAG_HANDLE_SVG}
      <div class="website-icon-preview">
        ${getWebsiteIconHtml(site)}
      </div>
      <div class="website-info">
        <div class="website-name">${escapeHtml(site.name)}</div>
        <div class="website-template" title="${escapeHtml(site.template)}">${escapeHtml(site.template)}</div>
      </div>
      <select class="website-category-select select-dropdown" data-id="${escapeHtml(site.id)}" title="Category">
        <option value="" ${!site.categoryId || site.categoryId === 'uncategorized' ? 'selected' : ''}>Uncategorized</option>
        ${categories.map((cat) => `
          <option value="${escapeHtml(cat.id)}" ${site.categoryId === cat.id ? 'selected' : ''}>
            ${escapeHtml(cat.name)}
          </option>
        `).join('')}
      </select>
      <div class="website-actions">
        <label class="switch switch-sm" title="Enable or disable this search engine">
          <input type="checkbox" class="site-toggle" data-id="${escapeHtml(site.id)}" ${site.enabled !== false ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        <button type="button" class="btn-icon-action" data-action="edit" data-id="${escapeHtml(site.id)}" title="Edit Search Engine">✏️</button>
        <button type="button" class="btn-icon-action btn-delete" data-action="delete" data-id="${escapeHtml(site.id)}" title="Delete Search Engine">🗑️</button>
      </div>
    `;
    container.appendChild(item);
  });

  attachIconErrorFallbacks(container);

  renderQuickSearchEnginesDropdown();
}

// Populate Default Engine dropdown for Quick Search
function renderQuickSearchEnginesDropdown() {
  const select = document.getElementById('quickSearchDefaultEngineSelect');
  if (!select) return;
  select.innerHTML = '';

  const sites = Array.isArray(currentSettings.toolbarSearchWebsites) && currentSettings.toolbarSearchWebsites.length > 0
    ? currentSettings.toolbarSearchWebsites.filter((s) => s.enabled !== false)
    : DEFAULT_SEARCH_WEBSITES;

  if (sites.length === 0) {
    const opt = document.createElement('option');
    opt.value = 'google';
    opt.textContent = 'Google (Default)';
    select.appendChild(opt);
    return;
  }

  sites.forEach((site) => {
    const opt = document.createElement('option');
    opt.value = site.id;
    opt.textContent = site.name;
    select.appendChild(opt);
  });

  const currentDefault = currentSettings.quickSearchDefaultEngine || 'google';
  if (sites.some((s) => s.id === currentDefault)) {
    select.value = currentDefault;
  } else if (sites.length > 0) {
    select.value = sites[0].id;
  }
}

// Render categories management list in the Categories tab
function renderCategoriesList() {
  const container = document.getElementById('categoriesList');
  if (!container) return;
  container.innerHTML = '';

  const categories = Array.isArray(currentSettings.searchCategories)
    ? [...currentSettings.searchCategories]
    : [...DEFAULT_SEARCH_CATEGORIES];

  categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const sites = Array.isArray(currentSettings.toolbarSearchWebsites)
    ? currentSettings.toolbarSearchWebsites
    : DEFAULT_SEARCH_WEBSITES;

  // Count engines assigned to each category
  const counts = {};
  let uncategorizedCount = 0;
  const knownCatIds = new Set(categories.map((c) => c.id));

  sites.forEach((site) => {
    if (!site.categoryId || site.categoryId === 'uncategorized' || !knownCatIds.has(site.categoryId)) {
      uncategorizedCount++;
    } else {
      counts[site.categoryId] = (counts[site.categoryId] || 0) + 1;
    }
  });

  const countBadge = document.getElementById('categoryCountBadge');
  if (countBadge) {
    countBadge.textContent = `${categories.length} ${categories.length === 1 ? 'Category' : 'Categories'}`;
  }

  if (categories.length === 0) {
    container.innerHTML = '<div style="padding: 10px; font-size: 11px; color: var(--text-muted); text-align: center;">No custom categories created. Use the form above to create one.</div>';
  } else {
    categories.forEach((cat, index) => {
      const item = document.createElement('div');
      item.className = 'category-item';
      item.setAttribute('draggable', 'true');
      item.dataset.index = index;
      const engineCount = counts[cat.id] || 0;
      const countLabel = `${engineCount} ${engineCount === 1 ? 'engine' : 'engines'}`;

      item.innerHTML = `
        ${DRAG_HANDLE_SVG}
        <span class="category-color-dot" style="background: ${escapeHtml(cat.color || '#818cf8')}; color: ${escapeHtml(cat.color || '#818cf8')};"></span>
        <div class="category-title-box">
          <span class="category-name-text" title="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</span>
          <span class="category-count-badge">${countLabel}</span>
        </div>
        <div class="category-actions">
          <button type="button" class="btn-icon-action" data-action="cat-edit" data-id="${escapeHtml(cat.id)}" title="Edit Category">✏️</button>
          <button type="button" class="btn-icon-action btn-delete" data-action="cat-delete" data-id="${escapeHtml(cat.id)}" title="Delete Category">🗑️</button>
        </div>
      `;
      container.appendChild(item);
    });
  }

  // Update Uncategorized summary card
  const uncatCard = document.getElementById('uncategorizedSummaryCard');
  const uncatText = document.getElementById('uncategorizedCountText');
  if (uncatCard && uncatText) {
    uncatText.textContent = `${uncategorizedCount} ${uncategorizedCount === 1 ? 'engine' : 'engines'}`;
    uncatCard.style.display = uncategorizedCount > 0 ? 'flex' : 'none';
  }

  populateCategorySelects();
}

// Populate Category dropdowns in Add/Edit and Captured Review forms
function populateCategorySelects() {
  const selects = [
    document.getElementById('websiteCategoryInput'),
    document.getElementById('captureCategoryInput')
  ].filter(Boolean);

  if (selects.length === 0) return;

  const categories = Array.isArray(currentSettings.searchCategories)
    ? [...currentSettings.searchCategories]
    : [...DEFAULT_SEARCH_CATEGORIES];
  categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  selects.forEach((catSelect) => {
    const currentVal = catSelect.value;
    catSelect.innerHTML = '<option value="">Uncategorized</option>';
    categories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      catSelect.appendChild(opt);
    });
    if (currentVal && categories.some((c) => c.id === currentVal)) {
      catSelect.value = currentVal;
    }
  });
}

// Setup event listeners for Category management
function setupCategoryEventListeners() {
  const saveBtn = document.getElementById('saveCategoryBtn');
  const cancelBtn = document.getElementById('cancelCategoryEditBtn');
  const nameInput = document.getElementById('categoryNameInput');
  const colorSelect = document.getElementById('categoryColorSelect');
  const errorBox = document.getElementById('categoryFormError');
  const listContainer = document.getElementById('categoriesList');
  const restoreBtn = document.getElementById('restoreDefaultCategoriesBtn');
  const formTitle = document.getElementById('categoryFormTitle');

  function showCatError(msg) {
    if (errorBox) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    }
  }
  function hideCatError() {
    if (errorBox) errorBox.style.display = 'none';
  }

  if (nameInput) {
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (saveBtn) saveBtn.click();
      } else if (e.key === 'Escape' && editingCategoryId) {
        if (cancelBtn) cancelBtn.click();
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      hideCatError();
      const rawName = nameInput ? nameInput.value : '';
      const name = rawName.trim();
      const color = colorSelect ? colorSelect.value : '#818cf8';

      if (!name) {
        showCatError('Category name cannot be empty.');
        if (nameInput) nameInput.focus();
        return;
      }

      if (name.length > 30) {
        showCatError('Category name must be 30 characters or fewer.');
        return;
      }

      const categories = Array.isArray(currentSettings.searchCategories)
        ? [...currentSettings.searchCategories]
        : [...DEFAULT_SEARCH_CATEGORIES];

      // Duplicate name check (case-insensitive)
      const isDuplicate = categories.some((c) =>
        c.id !== editingCategoryId && c.name.toLowerCase() === name.toLowerCase()
      );
      if (isDuplicate) {
        showCatError(`A category named "${name}" already exists.`);
        return;
      }

      if (editingCategoryId) {
        // Edit existing category
        const idx = categories.findIndex((c) => c.id === editingCategoryId);
        if (idx !== -1) {
          categories[idx] = {
            ...categories[idx],
            name,
            color
          };
          delete categories[idx].icon;
        }
        editingCategoryId = null;
        if (formTitle) formTitle.textContent = '➕ Add New Category';
        if (cancelBtn) cancelBtn.style.display = 'none';
      } else {
        // Check plan limits (prepared for future Free/Pro entitlement)
        const limit = getCategoryPlanLimit();
        if (categories.length >= limit) {
          showCatError(`Category limit reached (${limit} max on Free plan).`);
          return;
        }

        const id = 'cat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        categories.push({
          id,
          name,
          color,
          order: categories.length,
          createdAt: Date.now()
        });
      }

      currentSettings.searchCategories = categories;
      saveSettings({ searchCategories: categories });

      if (nameInput) nameInput.value = '';
      hideCatError();
      renderCategoriesList();
      renderToolbarWebsitesList();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      editingCategoryId = null;
      if (nameInput) nameInput.value = '';
      if (formTitle) formTitle.textContent = '➕ Add New Category';
      cancelBtn.style.display = 'none';
      hideCatError();
    });
  }

  if (listContainer) {
    listContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const index = parseInt(btn.dataset.index, 10);

      const categories = Array.isArray(currentSettings.searchCategories)
        ? [...currentSettings.searchCategories]
        : [...DEFAULT_SEARCH_CATEGORIES];
      categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      if (action === 'cat-up' && index > 0) {
        const targetIndex = e.shiftKey ? 0 : index - 1;
        const [moved] = categories.splice(index, 1);
        categories.splice(targetIndex, 0, moved);
        categories.forEach((c, idx) => { c.order = idx; });
        currentSettings.searchCategories = categories;
        saveSettings({ searchCategories: categories });
        renderCategoriesList();
        renderToolbarWebsitesList();
        return;
      }

      if (action === 'cat-down' && index < categories.length - 1) {
        const targetIndex = e.shiftKey ? categories.length - 1 : index + 1;
        const [moved] = categories.splice(index, 1);
        categories.splice(targetIndex, 0, moved);
        categories.forEach((c, idx) => { c.order = idx; });
        currentSettings.searchCategories = categories;
        saveSettings({ searchCategories: categories });
        renderCategoriesList();
        renderToolbarWebsitesList();
        return;
      }

      if (action === 'cat-edit' && id) {
        const cat = categories.find((c) => c.id === id);
        if (cat) {
          editingCategoryId = id;
          if (nameInput) nameInput.value = cat.name;
          if (colorSelect && cat.color) colorSelect.value = cat.color;
          if (formTitle) formTitle.textContent = `✏️ Edit "${cat.name}"`;
          if (cancelBtn) cancelBtn.style.display = 'inline-block';
          hideCatError();
          if (nameInput) nameInput.focus();
        }
        return;
      }

      if (action === 'cat-delete' && id) {
        const cat = categories.find((c) => c.id === id);
        if (!cat) return;

        const sites = Array.isArray(currentSettings.toolbarSearchWebsites)
          ? [...currentSettings.toolbarSearchWebsites]
          : [...DEFAULT_SEARCH_WEBSITES];

        const assignedCount = sites.filter((s) => s.categoryId === id).length;
        const confirmMsg = assignedCount > 0
          ? `Delete category "${cat.name}"?\n\n${assignedCount} engine${assignedCount > 1 ? 's' : ''} in this category will be moved to Uncategorized.`
          : `Delete category "${cat.name}"?`;

        if (confirm(confirmMsg)) {
          const remainingCats = categories.filter((c) => c.id !== id);
          remainingCats.forEach((c, idx) => { c.order = idx; });

          // Reassign affected engines to uncategorized without modifying other properties
          const updatedSites = sites.map((s) => {
            if (s.categoryId === id) {
              return { ...s, categoryId: null };
            }
            return s;
          });

          if (editingCategoryId === id) {
            editingCategoryId = null;
            if (nameInput) nameInput.value = '';
            if (formTitle) formTitle.textContent = '➕ Add New Category';
            if (cancelBtn) cancelBtn.style.display = 'none';
          }

          currentSettings.searchCategories = remainingCats;
          currentSettings.toolbarSearchWebsites = updatedSites;
          saveSettings({
            searchCategories: remainingCats,
            toolbarSearchWebsites: updatedSites
          });
          renderCategoriesList();
          renderToolbarWebsitesList();
        }
      }
    });

    initListDragAndDrop(listContainer, '.category-item', (fromIdx, toIdx) => {
      const categories = Array.isArray(currentSettings.searchCategories)
        ? [...currentSettings.searchCategories]
        : [...DEFAULT_SEARCH_CATEGORIES];
      categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const [moved] = categories.splice(fromIdx, 1);
      categories.splice(toIdx, 0, moved);
      categories.forEach((c, idx) => { c.order = idx; });
      currentSettings.searchCategories = categories;
      saveSettings({ searchCategories: categories });
      renderCategoriesList();
      renderToolbarWebsitesList();
    });
  }

  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      if (confirm('Restore default categories (Gaming, Work, Movies, Shopping, Research)?')) {
        const restored = JSON.parse(JSON.stringify(DEFAULT_SEARCH_CATEGORIES));
        currentSettings.searchCategories = restored;
        saveSettings({ searchCategories: restored });
        if (editingCategoryId) {
          editingCategoryId = null;
          if (nameInput) nameInput.value = '';
          if (formTitle) formTitle.textContent = '➕ Add New Category';
          if (cancelBtn) cancelBtn.style.display = 'none';
        }
        renderCategoriesList();
        renderToolbarWebsitesList();
      }
    });
  }
}

// Display configured browser shortcut for Quick Search
function updateQuickSearchShortcutDisplay() {
  const badge = document.getElementById('quickSearchShortcutBadge');
  if (!badge) return;
  try {
    if (typeof chrome !== 'undefined' && chrome.commands && chrome.commands.getAll) {
      chrome.commands.getAll((commands) => {
        if (Array.isArray(commands)) {
          const cmd = commands.find((c) => c.name === 'quick-search');
          if (cmd && cmd.shortcut) {
            badge.textContent = cmd.shortcut;
            return;
          }
        }
        badge.textContent = navigator.platform && navigator.platform.toUpperCase().includes('MAC')
          ? 'Command + Shift + K'
          : 'Ctrl + Shift + K';
      });
      return;
    }
  } catch (_) {}
  badge.textContent = 'Ctrl + Shift + K';
}

/**
 * Interactive keyboard shortcut recorder for custom shortcuts (Close Tab, Prev Tab, Next Tab).
 * Records key combination when user clicks 'Change', and saves to storage.
 */
function setupShortcutRecorder(btnId, badgeId, settingKey, defaultVal, resetBtnId) {
  const btn = document.getElementById(btnId);
  const badge = document.getElementById(badgeId);
  const resetBtn = resetBtnId ? document.getElementById(resetBtnId) : null;
  if (!btn || !badge) return;

  let isRecording = false;

  function stopRecording(restoreCurrent = false) {
    if (!isRecording) return;
    isRecording = false;
    badge.classList.remove('shortcut-recording');
    btn.textContent = '⚙️ Change';
    if (restoreCurrent) {
      badge.textContent = currentSettings[settingKey] || defaultVal;
    }
    window.removeEventListener('keydown', handleKeydown, true);
  }

  function handleKeydown(e) {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      stopRecording(true);
      return;
    }

    const isModifierOnly = ['Alt', 'Control', 'Shift', 'Meta'].includes(e.key);
    if (isModifierOnly) {
      const mods = [];
      if (e.ctrlKey) mods.push('Ctrl');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      if (e.metaKey) mods.push('Cmd');
      badge.textContent = mods.length > 0 ? mods.join(' + ') + ' + ...' : 'Press keys...';
      return;
    }

    // Capture non-modifier with any held modifiers
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Cmd');

    let keyName = e.key;
    if (keyName === ' ') keyName = 'Space';
    else if (keyName === 'ArrowLeft') keyName = 'Left';
    else if (keyName === 'ArrowRight') keyName = 'Right';
    else if (keyName === 'ArrowUp') keyName = 'Up';
    else if (keyName === 'ArrowDown') keyName = 'Down';
    else if (keyName === ',') keyName = '<';
    else if (keyName === '.') keyName = '>';
    else if (keyName.length === 1) keyName = keyName.toUpperCase();

    parts.push(keyName);
    const shortcutStr = parts.join(' + ');

    currentSettings[settingKey] = shortcutStr;
    saveSettings({ [settingKey]: shortcutStr });
    badge.textContent = shortcutStr;
    stopRecording(false);
  }

  btn.addEventListener('click', () => {
    if (isRecording) {
      stopRecording(true);
    } else {
      isRecording = true;
      badge.classList.add('shortcut-recording');
      badge.textContent = 'Press keys...';
      btn.textContent = 'Cancel';
      window.addEventListener('keydown', handleKeydown, true);
    }
  });

  // Also allow clicking directly on badge to record
  badge.addEventListener('click', () => {
    if (!isRecording) {
      btn.click();
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (isRecording) stopRecording(false);
      currentSettings[settingKey] = defaultVal;
      saveSettings({ [settingKey]: defaultVal });
      badge.textContent = defaultVal;
    });
  }
}

// Standard globe icon fallback SVG for search engines without usable logo
const GLOBE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ht-globe-fallback" style="width: 16px; height: 16px; flex-shrink: 0;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

// Helper to attach error listener to images to replace with globe fallback cleanly without CSP issues
function attachIconErrorFallbacks(container) {
  if (!container) return;
  const imgs = container.querySelectorAll('img');
  imgs.forEach((img) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const fallback = img.nextElementSibling;
      if (fallback && fallback.tagName && fallback.tagName.toLowerCase() === 'svg') {
        fallback.style.display = 'inline-block';
      } else {
        img.insertAdjacentHTML('afterend', GLOBE_ICON_SVG);
      }
    }, { once: true });
  });
}

// Helpers for duplicate website detection
function getDomainFromUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return '';
  try {
    const fixed = urlStr.includes('://') ? urlStr : 'https://' + urlStr;
    const parsed = new URL(fixed);
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch (e) {
    return '';
  }
}

function normalizeUrlForDuplicateCheck(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return '';
  let cleaned = urlStr.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  cleaned = cleaned.replace(/^www\./i, '');
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
}

function findDuplicateWebsite(candidateTemplate, candidateName, excludeId = null) {
  const sites = Array.isArray(currentSettings.toolbarSearchWebsites)
    ? currentSettings.toolbarSearchWebsites
    : DEFAULT_SEARCH_WEBSITES;

  const candidateNorm = normalizeUrlForDuplicateCheck(candidateTemplate);
  const candidateDomain = getDomainFromUrl(candidateTemplate);
  const candidateNameLower = (candidateName || '').trim().toLowerCase();

  for (const site of sites) {
    if (excludeId && site.id === excludeId) continue;

    const siteNorm = normalizeUrlForDuplicateCheck(site.template || site.url);
    const siteDomain = getDomainFromUrl(site.template || site.url);
    const siteNameLower = (site.name || '').trim().toLowerCase();

    // 1. Exact template match
    if (candidateNorm && siteNorm && candidateNorm === siteNorm) {
      return {
        duplicate: true,
        type: 'exact',
        existingSite: site,
        message: `This website already exists in your list ("${site.name}").`
      };
    }

    // 2. Same domain with different search configuration
    if (candidateDomain && siteDomain && candidateDomain === siteDomain) {
      return {
        duplicate: true,
        type: 'domain',
        existingSite: site,
        message: `This website already exists in your list ("${site.name}") with a different search configuration.`
      };
    }

    // 3. Same name match
    if (candidateNameLower && siteNameLower && candidateNameLower === siteNameLower) {
      return {
        duplicate: true,
        type: 'name',
        existingSite: site,
        message: `A search engine named "${site.name}" already exists in your list.`
      };
    }
  }

  return { duplicate: false };
}

// Inline SVG icons for standard search engines with high contrast
function getWebsiteIconHtml(site) {
  const id = (site.icon || site.id || '').toLowerCase();
  if (id === 'google') {
    return `<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.9c2.28-2.1 3.645-5.2 3.645-9.14z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.9-3.05c-1.08.72-2.45 1.16-4.03 1.16-3.1 0-5.73-2.1-6.67-4.93H1.28v3.15C3.26 21.3 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.33 14.27c-.24-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.28C.46 8.2 0 10.04 0 12s.46 3.8 1.28 5.42l4.05-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.7 1.28 6.58l4.05 3.15c.94-2.83 3.57-4.98 6.67-4.98z"/></svg>`;
  }
  if (id === 'youtube') {
    return `<svg viewBox="0 0 24 24"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
  }
  if (id === 'wikipedia') {
    return `<svg viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12.09 13.002l3.05-7.05h2.46l-5.01 11.025-4.5-9.975-4.5 9.975L-1.5 5.952h2.46l3.05 7.05 2.5-5.55h1.98l2.5 5.55z"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`;
  }
  if (id === 'reddit') {
    return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#FF4500"/><path fill="#FFF" d="M19.5 12c0-.8-.7-1.5-1.5-1.5-.4 0-.8.2-1.1.5-1.1-.8-2.6-1.3-4.3-1.4l.7-3.4 2.4.5c0 .7.6 1.3 1.4 1.3.8 0 1.4-.6 1.4-1.4s-.6-1.4-1.4-1.4c-.6 0-1.1.4-1.3.9l-2.7-.6c-.2 0-.3.1-.4.3l-.9 4.1c-1.8.1-3.3.6-4.4 1.4-.3-.3-.7-.5-1.1-.5-.8 0-1.5.7-1.5 1.5 0 .6.4 1.1.9 1.3-.1.4-.1.8-.1 1.2 0 2.5 2.9 4.5 6.5 4.5s6.5-2 6.5-4.5c0-.4 0-.8-.1-1.2.5-.2.9-.7.9-1.3zm-10.5 1c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm6 4c-.9.9-2.6.9-3 0-.1-.1 0-.3.1-.4.1-.1.3 0 .4.1.3.6 1.8.6 2.1 0 .1-.1.3-.1.4 0 .1.1.1.2 0 .3zm-.5-3c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z"/></svg>`;
  }
  if (id === 'github') {
    return `<svg viewBox="0 0 24 24" fill="#FFFFFF"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`;
  }
  if (id === 'amazon') {
    return `<svg viewBox="0 0 24 24" fill="#FF9900"><path d="M13.88 15.63c-2.36 1.83-5.8 2.8-8.8 2.8-4.22 0-8.02-1.62-10.88-4.33-.23-.22-.03-.52.24-.35 3.1 1.9 6.94 3.05 10.9 3.05 2.65 0 5.61-.71 8.28-2.19.41-.23.67.24.26 1.02zM15.42 14.18c-.3-.39-1.99-.18-2.75-.09-.23.03-.27-.15-.06-.29 1.37-.97 3.63-.69 3.9-.34.27.35-.07 2.63-1.37 3.69-.2.16-.38.07-.3-.14.28-.73.88-2.44.58-2.83z"/><path d="M14.6 9.87c0-1.74-.88-2.76-2.5-2.76-1.57 0-2.46.97-2.72 1.92-.05.18.06.33.24.35l1.64.12c.15.01.29-.09.33-.23.13-.44.47-.73.96-.73.65 0 1.03.38 1.03 1.15v.42c-.88.08-2.1.23-3.08.63-1.28.53-1.95 1.55-1.95 2.8 0 1.74 1.2 2.67 2.68 2.67 1.25 0 2.05-.6 2.5-1.33h.06v1.07c0 .16.1.28.25.29l1.45.02c.16 0 .28-.13.28-.29V11.5c0-.52-.04-1.07-.08-1.63zm-2.02 4.12c-.38.45-.94.75-1.55.75-.7 0-1.12-.46-1.12-1.2 0-.96.65-1.5 1.8-1.65.37-.05.65-.05.87-.03v2.13z" fill="#FFFFFF"/></svg>`;
  }
  if (site.icon && (/^https?:\/\//i.test(site.icon) || site.icon.startsWith('data:'))) {
    return `<img src="${escapeHtml(site.icon)}" alt="${escapeHtml(site.name)}" class="ht-website-icon-img"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ht-globe-fallback" style="display: none; width: 16px; height: 16px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
  }
  let domain = '';
  try {
    const raw = site.template || site.url || '';
    const u = new URL(raw.replace(/\{query\}/g, 'test').includes('://') ? raw.replace(/\{query\}/g, 'test') : 'https://' + raw.replace(/\{query\}/g, 'test'));
    domain = u.hostname;
  } catch (_) {}
  if (domain) {
    return `<img src="https://${escapeHtml(domain)}/favicon.ico" alt="${escapeHtml(site.name)}" class="ht-website-icon-img"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ht-globe-fallback" style="display: none; width: 16px; height: 16px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
  }
  return GLOBE_ICON_SVG;
}

// Helper to bind animation toggle with delay slider
function bindToggleWithSlider(toggleId, toggleKey, sliderId, valueId, groupId, delayKey) {
  const toggle = document.getElementById(toggleId);
  const slider = document.getElementById(sliderId);
  const valueDisplay = document.getElementById(valueId);
  const group = document.getElementById(groupId);

  if (toggle) {
    toggle.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      saveSettings({ [toggleKey]: isChecked });
      if (group) group.style.opacity = isChecked ? '1' : '0.4';
    });
  }

  if (slider && valueDisplay) {
    slider.addEventListener('input', (e) => {
      valueDisplay.textContent = `${e.target.value} ms`;
    });
    slider.addEventListener('change', (e) => {
      saveSettings({ [delayKey]: parseInt(e.target.value, 10) });
    });
  }
}

// Interactive Live Test Arena
function setupTestArena() {
  const testLink = document.getElementById('testLink');
  const testStatus = document.getElementById('testStatus');
  if (!testLink || !testStatus) return;

  let testTimer = null;
  let testTriggered = false;
  let startX = 0;
  let startY = 0;
  let isDown = false;
  let activeButton = 0;

  testLink.addEventListener('mousedown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();

    testTriggered = false;
    isDown = true;
    activeButton = e.button;
    startX = e.clientX;
    startY = e.clientY;

    const mode = currentSettings.gestureMode || 'hold';
    const duration = parseInt(document.getElementById('holdDuration')?.value, 10) || 450;
    const threshold = parseInt(document.getElementById('dragDistance')?.value, 10) || 35;

    testLink.classList.remove('test-success', 'test-success-right', 'test-holding', 'test-holding-right');
    testStatus.classList.remove('success', 'success-right');

    if (e.button === 2) {
      testLink.classList.add('test-holding-right');
      testStatus.textContent = `🟣 Right-Holding... (${duration}ms ➔ Open & Go)`;
      testTimer = setTimeout(() => {
        if (isDown && !testTriggered) {
          testTriggered = true;
          testLink.classList.remove('test-holding-right');
          testLink.classList.add('test-success-right');
          testStatus.classList.add('success-right');
          testStatus.textContent = '🟣 Right-Hold complete! Opened & moved to new tab (simulated)';
        }
      }, duration);
      return;
    }

    testLink.classList.add('test-holding');

    if (mode === 'hold') {
      testStatus.textContent = `Holding... (${duration}ms)`;
    } else if (mode === 'drag') {
      testStatus.textContent = `Drag/Flick ${threshold}px ➔`;
    } else {
      testStatus.textContent = `Holding (${duration}ms) or Flick (${threshold}px) ➔`;
    }

    if (mode === 'hold' || mode === 'both') {
      testTimer = setTimeout(() => {
        if (isDown && !testTriggered) {
          testTriggered = true;
          testLink.classList.remove('test-holding');
          testLink.classList.add('test-success');
          testStatus.classList.add('success');
          testStatus.textContent = '🎉 Hold complete! Background tab opened (simulated)';
        }
      }, duration);
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDown || testTriggered || activeButton !== 0) return;
    const mode = currentSettings.gestureMode || 'hold';
    if (mode === 'hold') return; // In hold-only mode, dragging does not trigger flick

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dist = Math.hypot(dx, dy);
    const threshold = parseInt(document.getElementById('dragDistance')?.value, 10) || 35;

    if (dist >= threshold) {
      testTriggered = true;
      if (testTimer) clearTimeout(testTimer);
      testLink.classList.remove('test-holding');
      testLink.classList.add('test-success');
      testStatus.classList.add('success');
      testStatus.textContent = `⚡ Flick detected (${Math.round(dist)}px)! Background tab opened (simulated)`;
    } else if (dist >= 6) {
      testStatus.textContent = `Dragging... (${Math.round(dist)}/${threshold}px)`;
    }
  });

  function cancelTest() {
    isDown = false;
    if (testTimer) {
      clearTimeout(testTimer);
      testTimer = null;
    }
    testLink.classList.remove('test-holding', 'test-holding-right');
    if (!testTriggered) {
      const mode = currentSettings.gestureMode || 'hold';
      const threshold = parseInt(document.getElementById('dragDistance')?.value, 10) || 35;
      testStatus.classList.remove('success', 'success-right');
      if (mode === 'drag' && activeButton === 0) {
        testStatus.textContent = `Released early! Flick at least ${threshold}px to trigger.`;
      } else {
        testStatus.textContent = 'Released early! Try holding or flicking to completion.';
      }
    }
  }

  testLink.addEventListener('mouseup', cancelTest);
  testLink.addEventListener('mouseleave', cancelTest);
  testLink.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
  testLink.addEventListener('click', (e) => {
    e.preventDefault(); // Don't actually navigate inside popup
  });

  const openPlaygroundBtn = document.getElementById('openPlaygroundBtn');
  if (openPlaygroundBtn) {
    openPlaygroundBtn.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('test.html') });
    });
  }
}
