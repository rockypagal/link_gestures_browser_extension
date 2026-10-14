const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version || '1.3.0';

// Clean up any old zip packages so only the firefox zip file exists
const oldZipFiles = [
  path.join(rootDir, 'holdtab-addon.zip'),
  path.join(rootDir, 'holdtab-firefox.zip')
];

oldZipFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
    } catch (_) {}
  }
});

// Auto-sync popup.html version with manifest.json
const popupHtmlPath = path.join(rootDir, 'popup', 'popup.html');
if (fs.existsSync(popupHtmlPath)) {
  let popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');
  const versionRegex = /<span>v\d+\.\d+\.\d+\s*&bull;/g;
  if (versionRegex.test(popupHtml)) {
    popupHtml = popupHtml.replace(versionRegex, `<span>v${version} &bull;`);
    fs.writeFileSync(popupHtmlPath, popupHtml, 'utf8');
  }
}

// Files to package with forward slashes for Firefox AMO
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
  'popup/popup.css',
  'test.html',
  'test.js'
];

try {
  // Use Windows built-in tar.exe to generate holdtab-firefox.zip
  const zipName = 'holdtab-firefox.zip';
  execSync(`tar.exe -a -c -f ${zipName} ${files.join(' ')}`, {
    cwd: rootDir,
    stdio: 'inherit'
  });

  const zipPath = path.join(rootDir, zipName);
  console.log(`\nSuccessfully created Firefox extension package (v${version}):`);
  console.log(`  📦 ${zipPath}  <-- (Upload to Firefox AMO)\n`);
} catch (err) {
  console.error('Packaging failed:', err);
}
