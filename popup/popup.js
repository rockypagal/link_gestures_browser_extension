// HoldTab - Popup Controller

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
      testStatus.textContent = `🔴 Right-Holding... (${duration}ms ➔ Open & Go)`;
      testTimer = setTimeout(() => {
        if (isDown && !testTriggered) {
          testTriggered = true;
          testLink.classList.remove('test-holding-right');
          testLink.classList.add('test-success-right');
          testStatus.classList.add('success-right');
          testStatus.textContent = '🔴 Right-Hold complete! Opened & moved to new tab (simulated)';
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
}
