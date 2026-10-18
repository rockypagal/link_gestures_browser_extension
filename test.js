// HoldTab - Test Playground Interactive Handlers
document.addEventListener('DOMContentLoaded', () => {
  // 1. Site Search Form Demo Handler
  const form = document.getElementById('testSearchForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('searchInput');
      const val = input ? input.value : '';
      const notice = document.getElementById('searchResultNotice');
      if (notice) {
        notice.style.display = 'block';
        notice.innerHTML = `✅ <strong>Search executed:</strong> Submitted query "<em>${escapeHtml(val)}</em>" successfully!`;
      }
    });
  }

  // 1b. Toolbar Demo Text Quick Select Helper
  const selectDemoTextBtn = document.getElementById('selectDemoTextBtn');
  const toolbarDemoTextEl = document.getElementById('toolbarDemoText');
  if (selectDemoTextBtn && toolbarDemoTextEl) {
    selectDemoTextBtn.addEventListener('click', () => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(toolbarDemoTextEl);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      selectDemoTextBtn.textContent = '✓ Selected!';
      setTimeout(() => {
        selectDemoTextBtn.textContent = '✨ Select Demo Sentence';
      }, 1500);
    });
  }

  // 1c. Toolbar Demo Clear Selection Helper
  const clearDemoSelectionBtn = document.getElementById('clearDemoSelectionBtn');
  if (clearDemoSelectionBtn) {
    clearDemoSelectionBtn.addEventListener('click', () => {
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
        document.dispatchEvent(new Event('selectionchange'));
      }
      clearDemoSelectionBtn.textContent = '✓ Cleared!';
      setTimeout(() => {
        clearDemoSelectionBtn.textContent = '✕ Clear Selection';
      }, 1500);
    });
  }

  // 2. Sample Text Quick Select Helper
  const selectSampleBtn = document.getElementById('selectSampleBtn');
  const sampleTextEl = document.getElementById('sampleText');
  if (selectSampleBtn && sampleTextEl) {
    selectSampleBtn.addEventListener('click', () => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(sampleTextEl);
      selection.removeAllRanges();
      selection.addRange(range);
      selectSampleBtn.textContent = '✓ Selected!';
      setTimeout(() => {
        selectSampleBtn.textContent = '✨ Quick Select Sample Text';
      }, 1500);
    });
  }

  // 2b. Clear / Deselect Text Helper
  const clearSelectionBtn = document.getElementById('clearSelectionBtn');
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', () => {
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
      clearSelectionBtn.textContent = '✓ Unselected!';
      setTimeout(() => {
        clearSelectionBtn.textContent = '✕ Deselect / Unselect Text';
      }, 1500);
    });
  }

  // 3. Reset Test Inputs Helper
  const resetInputsBtn = document.getElementById('resetInputsBtn');
  const editableInput = document.getElementById('editableInput');
  const pasteInput = document.getElementById('pasteInput');
  if (resetInputsBtn) {
    resetInputsBtn.addEventListener('click', () => {
      if (editableInput) {
        editableInput.value = 'Quickly cut and copy this text using double-clicks!';
      }
      if (pasteInput) {
        pasteInput.value = '';
      }
      const searchNotice = document.getElementById('searchResultNotice');
      if (searchNotice) {
        searchNotice.style.display = 'none';
      }
      resetInputsBtn.textContent = '✓ Reset Done!';
      setTimeout(() => {
        resetInputsBtn.textContent = '↺ Reset Test Inputs';
      }, 1500);
    });
  }

  // 4. Regular Non-Link Button Safety Test
  const regularBtn = document.getElementById('regularBtn');
  const regularStatus = document.getElementById('regularStatus');
  if (regularBtn) {
    regularBtn.addEventListener('click', () => {
      if (regularStatus) {
        regularStatus.style.display = 'block';
        regularStatus.textContent = '✅ Standard click event triggered normally without HoldTab interference!';
        setTimeout(() => {
          regularStatus.style.display = 'none';
        }, 3000);
      } else {
        alert('Regular button clicked normally!');
      }
    });
  }
});

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}
