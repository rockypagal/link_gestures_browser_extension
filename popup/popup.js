// HoldTab - Popup Controller

const DEFAULT_SEARCH_WEBSITES = [
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q={query}', enabled: true, icon: 'google' },
  { id: 'youtube', name: 'YouTube', template: 'https://www.youtube.com/results?search_query={query}', enabled: true, icon: 'youtube' },
  { id: 'wikipedia', name: 'Wikipedia', template: 'https://en.wikipedia.org/w/index.php?search={query}', enabled: true, icon: 'wikipedia' },
  { id: 'reddit', name: 'Reddit', template: 'https://www.reddit.com/search/?q={query}', enabled: true, icon: 'reddit' },
  { id: 'github', name: 'GitHub', template: 'https://github.com/search?q={query}', enabled: true, icon: 'github' },
  { id: 'amazon', name: 'Amazon', template: 'https://www.amazon.com/s?k={query}', enabled: true, icon: 'amazon' }
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
  tabCycleSwipe: true,
  tabCycleRocker: true,
  tabCycleAltScroll: true,
  tabCycleAltKeys: true,
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
  excludedDomains: []
};

let currentSettings = { ...DEFAULT_SETTINGS };
let currentTabHostname = '';

document.addEventListener('DOMContentLoaded', async () => {
  setupTabNavigation();
  await loadCurrentTabInfo();
  await loadAndRenderSettings();
  setupEventListeners();
  setupTestArena();
});

// Setup organized tab switching
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');

  const savedTab = localStorage.getItem('holdtab_active_tab');
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

// Detect current active tab hostname
async function loadCurrentTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        currentTabHostname = url.hostname;
      }
    }
  } catch (err) {
    console.debug('Could not determine active tab domain:', err);
  }

  const toggleBtn = document.getElementById('toggleCurrentDomainBtn');
  if (toggleBtn) {
    if (currentTabHostname) {
      toggleBtn.textContent = `+ Exclude ${currentTabHostname}`;
    } else {
      toggleBtn.style.display = 'none';
    }
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

  // Alt + < / > keybinds toggle
  const altKeysToggle = document.getElementById('tabCycleAltKeysToggle');
  if (altKeysToggle) altKeysToggle.checked = currentSettings.tabCycleAltKeys !== false;

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

  // Excluded domains
  renderExcludedTags();
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

  list.forEach((domain) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `
      ${escapeHtml(domain)}
      <span class="tag-remove" data-domain="${escapeHtml(domain)}" title="Remove">&times;</span>
    `;
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
    masterToggle.addEventListener('change', (e) => {
      saveSettings({ enabled: e.target.checked });
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

  // Alt + < / > keybinds toggle
  const altKeysToggle = document.getElementById('tabCycleAltKeysToggle');
  if (altKeysToggle) {
    altKeysToggle.addEventListener('change', (e) => {
      saveSettings({ tabCycleAltKeys: e.target.checked });
    });
  }

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
    const raw = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!raw) return;

    const list = currentSettings.excludedDomains || [];
    if (!list.includes(raw)) {
      list.push(raw);
      saveSettings({ excludedDomains: list });
      renderExcludedTags();
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
    excludedList.addEventListener('click', (e) => {
      if (e.target.classList.contains('tag-remove')) {
        const domainToRemove = e.target.getAttribute('data-domain');
        const list = (currentSettings.excludedDomains || []).filter((d) => d !== domainToRemove);
        saveSettings({ excludedDomains: list });
        renderExcludedTags();
      }
    });
  }

  // Quick toggle current domain
  const toggleDomainBtn = document.getElementById('toggleCurrentDomainBtn');
  if (toggleDomainBtn) {
    toggleDomainBtn.addEventListener('click', () => {
      if (!currentTabHostname) return;
      const list = currentSettings.excludedDomains || [];
      const index = list.indexOf(currentTabHostname);
      if (index === -1) {
        list.push(currentTabHostname);
      } else {
        list.splice(index, 1);
      }
      saveSettings({ excludedDomains: list });
      renderExcludedTags();
    });
  }

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
  'google.com': 'Google',
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

  // 3. Known popular search engines
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
      { pattern: /(^|\.)google\.com$/i, template: 'https://www.google.com/search?q={query}' }
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

    // Otherwise, append ?q={query}
    if (parsed.pathname === '/' || !parsed.pathname) {
      return `${parsed.origin}/?q={query}`;
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

  // Website management buttons
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
      editingWebsiteId = null;
      if (formTitle) formTitle.textContent = 'Add Custom Website';
      if (nameInput) nameInput.value = '';
      if (urlInput) urlInput.value = '';
      if (formError) formError.style.display = 'none';
      formCard.style.display = 'block';
      if (urlInput) urlInput.focus();
    });
  }

  if (cancelBtn && formCard) {
    cancelBtn.addEventListener('click', () => {
      editingWebsiteId = null;
      formCard.style.display = 'none';
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

      const sites = Array.isArray(currentSettings.toolbarSearchWebsites)
        ? [...currentSettings.toolbarSearchWebsites]
        : [...DEFAULT_SEARCH_WEBSITES];

      if (editingWebsiteId) {
        const idx = sites.findIndex((s) => s.id === editingWebsiteId);
        if (idx !== -1) {
          sites[idx] = { ...sites[idx], name, template };
        }
      } else {
        const id = 'custom_' + Date.now();
        sites.push({ id, name, template, enabled: true, icon: 'custom' });
      }

      currentSettings.toolbarSearchWebsites = sites;
      saveSettings({ toolbarSearchWebsites: sites });
      formCard.style.display = 'none';
      editingWebsiteId = null;
      renderToolbarWebsitesList();
    });
  }

  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      const restored = JSON.parse(JSON.stringify(DEFAULT_SEARCH_WEBSITES));
      currentSettings.toolbarSearchWebsites = restored;
      saveSettings({ toolbarSearchWebsites: restored });
      if (formCard) formCard.style.display = 'none';
      editingWebsiteId = null;
      renderToolbarWebsitesList();
    });
  }

  // Delegated clicks for website list items (reorder, edit, delete, toggle)
  const listContainer = document.getElementById('toolbarWebsitesList');
  if (listContainer) {
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
        }
        return;
      }

      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const index = parseInt(btn.dataset.index, 10);

      if (action === 'up' && index > 0) {
        const temp = sites[index];
        sites[index] = sites[index - 1];
        sites[index - 1] = temp;
        currentSettings.toolbarSearchWebsites = sites;
        saveSettings({ toolbarSearchWebsites: sites });
        renderToolbarWebsitesList();
        return;
      }

      if (action === 'down' && index < sites.length - 1) {
        const temp = sites[index];
        sites[index] = sites[index + 1];
        sites[index + 1] = temp;
        currentSettings.toolbarSearchWebsites = sites;
        saveSettings({ toolbarSearchWebsites: sites });
        renderToolbarWebsitesList();
        return;
      }

      if (action === 'edit' && id) {
        const site = sites.find((s) => s.id === id);
        if (site && formCard) {
          editingWebsiteId = id;
          if (formTitle) formTitle.textContent = `Edit "${site.name}"`;
          if (nameInput) nameInput.value = site.name;
          if (urlInput) urlInput.value = site.template;
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
      }
    });
  }
}

function showWebsiteFormError(msg) {
  const formError = document.getElementById('websiteFormError');
  if (formError) {
    formError.textContent = msg;
    formError.style.display = 'block';
  }
}

// Render the list of configurable search engines in the popup
function renderToolbarWebsitesList() {
  const container = document.getElementById('toolbarWebsitesList');
  if (!container) return;
  container.innerHTML = '';

  const sites = Array.isArray(currentSettings.toolbarSearchWebsites)
    ? currentSettings.toolbarSearchWebsites
    : DEFAULT_SEARCH_WEBSITES;

  if (sites.length === 0) {
    container.innerHTML = '<div style="padding: 8px; font-size: 11px; color: var(--text-muted); text-align: center;">No search engines configured. Click Defaults to restore.</div>';
    return;
  }

  sites.forEach((site, index) => {
    const item = document.createElement('div');
    item.className = `website-item ${site.enabled === false ? 'website-disabled' : ''}`;
    item.innerHTML = `
      <div class="website-reorder">
        <button type="button" class="btn-reorder" data-action="up" data-index="${index}" ${index === 0 ? 'disabled' : ''} title="Move Up">▲</button>
        <button type="button" class="btn-reorder" data-action="down" data-index="${index}" ${index === sites.length - 1 ? 'disabled' : ''} title="Move Down">▼</button>
      </div>
      <div class="website-icon-preview">
        ${getWebsiteIconHtml(site)}
      </div>
      <div class="website-info">
        <div class="website-name">${escapeHtml(site.name)}</div>
        <div class="website-template" title="${escapeHtml(site.template)}">${escapeHtml(site.template)}</div>
      </div>
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
  let domain = '';
  try {
    const u = new URL(site.template.replace(/\{query\}/g, 'test'));
    domain = u.hostname;
  } catch (_) {}
  if (domain) {
    return `<img src="https://${escapeHtml(domain)}/favicon.ico" alt="${escapeHtml(site.name)}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-flex';"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
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
