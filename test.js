// HoldTab - Test Playground Interactive Handlers
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('testSearchForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('searchInput');
      const val = input ? input.value : '';
      const notice = document.getElementById('searchResultNotice');
      if (notice) {
        notice.style.display = 'block';
        notice.textContent = `✅ Search submitted successfully: "${val}"`;
      }
    });
  }

  const regularBtn = document.querySelector('.regular-btn');
  if (regularBtn) {
    regularBtn.addEventListener('click', () => {
      alert('Regular button clicked normally!');
    });
  }
});
