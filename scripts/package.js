const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const zipFile = path.join(rootDir, 'holdtab-addon.zip');

if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

// Files to package with forward slashes for cross-platform compatibility (Firefox AMO & Chrome Web Store)
const files = [
  'manifest.json',
  'background/service-worker.js',
  'content/content.js',
  'content/content.css',
  'icons/icon-16.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'popup/popup.html',
  'popup/popup.js',
  'popup/popup.css'
];

try {
  // Use Windows built-in tar.exe which uses standard POSIX forward slashes in ZIP archives
  execSync(`tar.exe -a -c -f holdtab-addon.zip ${files.join(' ')}`, {
    cwd: rootDir,
    stdio: 'inherit'
  });
  console.log(`Successfully created: ${zipFile}`);
} catch (err) {
  console.error('Packaging failed:', err);
}
