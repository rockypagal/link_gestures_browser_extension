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
  excludedDomains: []
};

let currentSettings = { ...DEFAULT_SETTINGS };
let currentTabHostname = '';

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentTabInfo();
  await loadAndRenderSettings();
  setupEventListeners();
  setupTestArena();
});

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
  if (currentTabHostname) {
    toggleBtn.textContent = `+ Exclude ${currentTabHostname}`;
  } else {
    toggleBtn.style.display = 'none';
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
  document.getElementById('masterToggle').checked = currentSettings.enabled;

  // Duration
  const durationSlider = document.getElementById('holdDuration');
  durationSlider.value = currentSettings.holdDuration;
  document.getElementById('durationValue').textContent = `${currentSettings.holdDuration} ms`;

  // Gesture mode
  const gestureRadio = document.querySelector(`input[name="gestureMode"][value="${currentSettings.gestureMode}"]`);
  if (gestureRadio) gestureRadio.checked = true;

  // Tab position
  const posRadio = document.querySelector(`input[name="tabPosition"][value="${currentSettings.tabPosition}"]`);
  if (posRadio) posRadio.checked = true;

  // Tab focus
  const focusRadio = document.querySelector(`input[name="tabFocus"][value="${currentSettings.tabFocus}"]`);
  if (focusRadio) focusRadio.checked = true;

  // Modifier key
  document.getElementById('requireModifier').value = currentSettings.requireModifier || 'none';

  // Excluded domains
  renderExcludedTags();
}

// Render domain tag pills
function renderExcludedTags() {
  const container = document.getElementById('excludedList');
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
  document.getElementById('masterToggle').addEventListener('change', (e) => {
    saveSettings({ enabled: e.target.checked });
  });

  // Hold Duration slider
  const durationSlider = document.getElementById('holdDuration');
  const durationValue = document.getElementById('durationValue');
  durationSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    durationValue.textContent = `${val} ms`;
  });
  durationSlider.addEventListener('change', (e) => {
    saveSettings({ holdDuration: parseInt(e.target.value, 10) });
  });

  // Gesture mode radio
  document.querySelectorAll('input[name="gestureMode"]').forEach((el) => {
    el.addEventListener('change', (e) => {
      saveSettings({ gestureMode: e.target.value });
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
  document.getElementById('requireModifier').addEventListener('change', (e) => {
    saveSettings({ requireModifier: e.target.value });
  });

  // Add domain
  const addBtn = document.getElementById('addDomainBtn');
  const input = document.getElementById('newDomainInput');

  function handleAddDomain() {
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

  addBtn.addEventListener('click', handleAddDomain);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddDomain();
  });

  // Remove domain tag
  document.getElementById('excludedList').addEventListener('click', (e) => {
    if (e.target.classList.contains('tag-remove')) {
      const domainToRemove = e.target.getAttribute('data-domain');
      const list = (currentSettings.excludedDomains || []).filter((d) => d !== domainToRemove);
      saveSettings({ excludedDomains: list });
      renderExcludedTags();
    }
  });

  // Quick toggle current domain
  document.getElementById('toggleCurrentDomainBtn').addEventListener('click', () => {
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

// Interactive Live Test Arena
function setupTestArena() {
  const testLink = document.getElementById('testLink');
  const testStatus = document.getElementById('testStatus');
  let testTimer = null;
  let testTriggered = false;

  testLink.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    testTriggered = false;
    const duration = parseInt(document.getElementById('holdDuration').value, 10) || 450;

    testLink.classList.remove('test-success');
    testLink.classList.add('test-holding');
    testStatus.classList.remove('success');
    testStatus.textContent = `Holding... (${duration}ms)`;

    testTimer = setTimeout(() => {
      testTriggered = true;
      testLink.classList.remove('test-holding');
      testLink.classList.add('test-success');
      testStatus.classList.add('success');
      testStatus.textContent = '🎉 Triggered! Background tab opened (simulated)';
    }, duration);
  });

  function cancelTest() {
    if (testTimer) {
      clearTimeout(testTimer);
      testTimer = null;
    }
    testLink.classList.remove('test-holding');
    if (!testTriggered) {
      testStatus.classList.remove('success');
      testStatus.textContent = 'Released early! Hold until it completes.';
    }
  }

  testLink.addEventListener('mouseup', cancelTest);
  testLink.addEventListener('mouseleave', cancelTest);
  testLink.addEventListener('click', (e) => {
    e.preventDefault(); // Don't actually navigate to example.com inside popup
  });
}
