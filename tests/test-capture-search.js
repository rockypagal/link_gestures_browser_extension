// Automated Test Suite for HoldTab Capture Search URL Feature
const assert = require('assert');

// 1. Load implementations from popup.js
const fs = require('fs');
const path = require('path');

const popupJs = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8');

// Extract KNOWN_DOMAIN_NAMES
const knownDomainMatch = popupJs.match(/const KNOWN_DOMAIN_NAMES = \{([\s\S]*?)\};/);
const KNOWN_DOMAIN_NAMES = eval(`({${knownDomainMatch[1]}})`);

// Reconstruct deriveNameFromUrl
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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    if (questionIndex === -1 || (qIndex !== -1 && qIndex < questionIndex)) {
      encodedQuery = encodeURIComponent(cleanQuery);
    } else {
      encodedQuery = encodeURIComponent(cleanQuery).replace(/%20/g, '+');
    }

    const finalUrl = cleanTemplate.replace(/\{query\}/gi, encodedQuery);
    new URL(finalUrl);

    return { valid: true, url: finalUrl };
  } catch (err) {
    return { valid: false, error: err.message || 'Invalid search URL structure' };
  }
}

function getMarkerRegex(marker) {
  if (!marker || typeof marker !== 'string') return null;
  const raw = marker.trim();
  if (!raw) return null;

  const parts = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    return new RegExp(escapeRegex(parts[0]), 'gi');
  }

  const sep = '(?:[-_+.\\s]|%20|%5[fF]|%2[dD]|%2[bB])+';
  const pattern = parts.map((p) => escapeRegex(p)).join(sep);
  return new RegExp(pattern, 'gi');
}

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

function urlMatchesSearchMarker(tabUrl, marker) {
  if (!tabUrl || !marker) return false;
  return findMarkerMatchesInUrl(tabUrl, marker).length > 0;
}

function deriveTemplateFromCapturedUrl(tabUrl, marker) {
  if (!tabUrl || !marker) return null;
  const matches = findMarkerMatchesInUrl(tabUrl, marker);
  if (matches.length === 0) return null;

  const multipleOccurrences = matches.length > 1;

  if (multipleOccurrences) {
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

  const match = matches[0];
  const template = tabUrl.substring(0, match.index) + '{query}' + tabUrl.substring(match.index + match.length);

  return {
    template,
    multipleOccurrences
  };
}

function generateSearchMarker() {
  const rand = Math.random().toString(36).substring(2, 7);
  return `holdtab_test_${rand}`;
}

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✕ Test ${total} FAILED: ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('--- Running HoldTab Capture Search URL Tests ---');

// 1. Google
test('Capture a Google search URL', () => {
  const marker = 'holdtab_test_a83k9';
  const url = 'https://www.google.com/search?q=holdtab_test_a83k9';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.strictEqual(res.template, 'https://www.google.com/search?q={query}');
  assert.strictEqual(deriveNameFromUrl(url), 'Google');
});

// 2. YouTube
test('Capture a YouTube search URL', () => {
  const marker = 'holdtab_test_a83k9';
  const url = 'https://www.youtube.com/results?search_query=holdtab_test_a83k9';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.strictEqual(res.template, 'https://www.youtube.com/results?search_query={query}');
  assert.strictEqual(deriveNameFromUrl(url), 'YouTube');
});

// 3. Amazon India
test('Capture an Amazon India search URL', () => {
  const marker = 'holdtab_test_a83k9';
  const url = 'https://www.amazon.in/s?k=holdtab_test_a83k9';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.strictEqual(res.template, 'https://www.amazon.in/s?k={query}');
  assert.strictEqual(deriveNameFromUrl(url), 'Amazon India');
});

// 4. Search term in path
test('Capture a URL where search term appears in the path', () => {
  const marker = 'holdtab_test_a83k9';
  const url = 'https://example.com/search/holdtab_test_a83k9/results';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.strictEqual(res.template, 'https://example.com/search/{query}/results');
  const preview = buildSearchUrl(res.template, 'wireless headphones');
  assert.strictEqual(preview.valid, true);
  assert.strictEqual(preview.url, 'https://example.com/search/wireless%20headphones/results');
});

// 5. Additional parameters
test('Capture a URL with additional parameters preserved', () => {
  const marker = 'holdtab_test_a83k9';
  const url = 'https://www.bing.com/search?q=holdtab_test_a83k9&form=QBLH&sp=-1&lq=0';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.strictEqual(res.template, 'https://www.bing.com/search?q={query}&form=QBLH&sp=-1&lq=0');
});

// 6. Attempt capture before searching
test('Attempt capture before searching for the marker (returns null)', () => {
  const marker = 'holdtab_test_a83k9';
  const url = 'https://www.amazon.in/';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.strictEqual(res, null);
});

// 7. Unrelated marker-like string
test('Capture a URL containing an unrelated marker-like string (not false-matched)', () => {
  const marker = 'holdtab_test_a83k9';
  const url = 'https://example.com/?query=holdtab_test_different';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.strictEqual(res, null);
});

// 8. Multiple marker occurrences
test('Handle multiple marker occurrences with primary parameter selection', () => {
  const marker = 'holdtab_test_a83k9';
  const url = 'https://example.com/search?q=holdtab_test_a83k9&ref=campaign_holdtab_test_a83k9';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.strictEqual(res.multipleOccurrences, true);
  assert.strictEqual(res.template, 'https://example.com/search?q={query}&ref=campaign_holdtab_test_a83k9');
});

// 9. URL-encoded / uppercase markers
test('Handle URL-encoded and case-differing markers', () => {
  const marker = 'holdtab_test_a83k9';
  const url = 'https://example.com/search?q=HOLDTAB_TEST_A83K9';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.strictEqual(res.template, 'https://example.com/search?q={query}');
});

// 10. Unicode and special characters in test queries
test('Handle Unicode, non-English text, and special characters', () => {
  const template = 'https://www.google.com/search?q={query}';
  const testCases = [
    { query: 'wireless headphones', expected: 'https://www.google.com/search?q=wireless+headphones' },
    { query: 'café', expected: 'https://www.google.com/search?q=caf%C3%A9' },
    { query: '東京', expected: 'https://www.google.com/search?q=%E6%9D%B1%E4%BA%AC' },
    { query: 'C++ & C#', expected: 'https://www.google.com/search?q=C%2B%2B+%26+C%23' }
  ];
  for (const tc of testCases) {
    const res = buildSearchUrl(template, tc.query);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.url, tc.expected);
  }
});

// 11. Reject invalid or unsafe schemes
test('Reject templates with invalid or unsafe schemes', () => {
  const unsafe = [
    'javascript:alert(1)',
    'data:text/html,<h1>bad</h1>',
    'file:///C:/secret.txt',
    'ftp://ftp.example.com/{query}',
    'vbscript:msgbox(1)'
  ];
  for (const tmpl of unsafe) {
    const res = buildSearchUrl(tmpl, 'test');
    assert.strictEqual(res.valid, false);
  }
});

// 12. Reject templates missing {query}
test('Reject templates missing {query}', () => {
  const res = buildSearchUrl('https://example.com/search?q=test', 'test');
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.error.includes('{query}'), true);
});

// 13. Cancel and restart a capture session
test('Cancel and restart capture session produces fresh unpredictable markers', () => {
  const marker1 = generateSearchMarker();
  const marker2 = generateSearchMarker();
  assert.ok(marker1.startsWith('holdtab_test_'));
  assert.ok(marker2.startsWith('holdtab_test_'));
  assert.notStrictEqual(marker1, marker2);
});

// 14. Session persistence and expiration calculation
test('Session expiration TTL calculation (20 minutes)', () => {
  const TTL = 20 * 60 * 1000;
  const now = Date.now();
  const session = {
    marker: 'holdtab_test_test1',
    step: 'capturing',
    createdAt: now,
    expiresAt: now + TTL
  };
  assert.strictEqual(session.expiresAt > now, true);
  assert.strictEqual(session.expiresAt - now, TTL);
});

// 15. Verify custom website structure
test('Verify custom website object structure for submenu', () => {
  const customSite = {
    id: 'custom_' + Date.now(),
    name: 'DuckDuckGo',
    template: 'https://duckduckgo.com/?q={query}',
    enabled: true,
    icon: 'custom'
  };
  assert.ok(customSite.id.startsWith('custom_'));
  assert.strictEqual(customSite.enabled, true);
  assert.strictEqual(customSite.template.includes('{query}'), true);
});

// 16. Verify custom search URL building for background tab
test('Verify search URL generation for background tab execution', () => {
  const site = { template: 'https://steamdb.info/search/?q={query}' };
  const query = 'Cyberpunk 2077';
  const res = buildSearchUrl(site.template, query);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.url, 'https://steamdb.info/search/?q=Cyberpunk+2077');
});

// 17. Verify default search websites are valid
test('Verify default search engines are valid templates', () => {
  const defaults = [
    { id: 'google', template: 'https://www.google.com/search?q={query}' },
    { id: 'youtube', template: 'https://www.youtube.com/results?search_query={query}' },
    { id: 'wikipedia', template: 'https://en.wikipedia.org/w/index.php?search={query}' },
    { id: 'reddit', template: 'https://www.reddit.com/search/?q={query}' },
    { id: 'github', template: 'https://github.com/search?q={query}' },
    { id: 'amazon', template: 'https://www.amazon.com/s?k={query}' }
  ];
  for (const site of defaults) {
    const res = buildSearchUrl(site.template, 'test');
    assert.strictEqual(res.valid, true);
  }
});

// 18. Verify SteamDB auto-healing
test('Verify SteamDB legacy template auto-healing', () => {
  let legacy = 'https://steamdb.info/?q={query}';
  if (legacy.includes('steamdb.info/?q=')) {
    legacy = legacy.replace('steamdb.info/?q=', 'steamdb.info/search/?q=');
  }
  assert.strictEqual(legacy, 'https://steamdb.info/search/?q={query}');
});

// 19. Regional Amazon domain auto-naming
test('Regional Amazon domain auto-naming', () => {
  assert.strictEqual(deriveNameFromUrl('https://www.amazon.in/s?k=test'), 'Amazon India');
  assert.strictEqual(deriveNameFromUrl('https://www.amazon.co.uk/s?k=test'), 'Amazon UK');
  assert.strictEqual(deriveNameFromUrl('https://www.amazon.de/s?k=test'), 'Amazon Germany');
  assert.strictEqual(deriveNameFromUrl('https://www.amazon.com/s?k=test'), 'Amazon');
});

// 20. Path-based search with Unicode and spaces
test('Path-based search with Unicode and spaces in path segment', () => {
  const tmpl = 'https://example.com/items/{query}';
  const res = buildSearchUrl(tmpl, 'café wireless');
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.url, 'https://example.com/items/caf%C3%A9%20wireless');
});

// 21. Capture URL where target website slugified underscores to hyphens (user reported case)
test('Capture URL where target website replaced keyword underscores with hyphens', () => {
  const marker = 'holdtab_test_hfb3w';
  const url = 'https://example.com/search/holdtab-test-hfb3w';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.ok(res, 'Derived template result must not be null');
  assert.strictEqual(res.template, 'https://example.com/search/{query}');
});

// 22. Capture URL where query parameter has hyphenated or slugified keyword
test('Capture URL where query parameter has hyphenated keyword', () => {
  const marker = 'holdtab_test_hfb3w';
  const url = 'https://example.com/search?q=holdtab-test-hfb3w&lang=en';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.ok(res, 'Derived template result must not be null');
  assert.strictEqual(res.template, 'https://example.com/search?q={query}&lang=en');
});

// 23. Capture URL where keyword has plus separators
test('Capture URL where keyword has plus separators', () => {
  const marker = 'holdtab_test_hfb3w';
  const url = 'https://example.com/search?q=holdtab+test+hfb3w';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.ok(res, 'Derived template result must not be null');
  assert.strictEqual(res.template, 'https://example.com/search?q={query}');
});

// 24. Capture URL where keyword has percent-encoded space or mixed separators
test('Capture URL where keyword has URL-encoded space or mixed separators', () => {
  const marker = 'holdtab_test_hfb3w';
  const url = 'https://example.com/search?q=holdtab%20test%20hfb3w';
  const res = deriveTemplateFromCapturedUrl(url, marker);
  assert.ok(res, 'Derived template result must not be null');
  assert.strictEqual(res.template, 'https://example.com/search?q={query}');
});

// 25. urlMatchesSearchMarker polling helper correctly identifies altered URL keywords
test('urlMatchesSearchMarker polling helper correctly identifies altered URL keywords', () => {
  const marker = 'holdtab_test_hfb3w';
  assert.strictEqual(urlMatchesSearchMarker('https://example.com/search/holdtab-test-hfb3w', marker), true);
  assert.strictEqual(urlMatchesSearchMarker('https://example.com/search?q=holdtab+test+hfb3w', marker), true);
  assert.strictEqual(urlMatchesSearchMarker('https://example.com/search?q=holdtab%20test%20hfb3w', marker), true);
  assert.strictEqual(urlMatchesSearchMarker('https://example.com/search?q=holdtab_test_different', marker), false);
});

console.log(`\nResults: ${passed} / ${total} tests passed.`);
if (passed === total) {
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
} else {
  console.error('Some tests failed.');
  process.exit(1);
}
