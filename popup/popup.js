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

  // Excluded domains
  renderExcludedTags();
}

// Show/hide sliders according to active gesture mode
function updateGestureVisibility(mode) {
  const holdGroup = document.getElementById('holdDurationGroup');
  const dragGroup = document.getElementById('dragDistanceGroup');
  const testDesc = document.querySelector('.arena-desc');

  if (mode === 'hold') {
    if (holdGroup) holdGroup.style.display = 'flex';
    if (dragGroup) dragGroup.style.display = 'none';
    if (testDesc) testDesc.textContent = 'Test your hold gesture below:';
  } else if (mode === 'drag') {
    if (holdGroup) holdGroup.style.display = 'none';
    if (dragGroup) dragGroup.style.display = 'flex';
    if (testDesc) testDesc.textContent = 'Test your flick/drag gesture below:';
  } else {
    // 'both'
    if (holdGroup) holdGroup.style.display = 'flex';
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
