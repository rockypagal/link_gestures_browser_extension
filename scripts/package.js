const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const version = manifest.version || '1.2.0';

const zipFiles = [
  path.join(rootDir, 'holdtab-addon.zip'),
  path.join(rootDir, 'holdtab-firefox.zip')
];

zipFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
});

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
  // Also create a copy specifically named holdtab-firefox.zip
  fs.copyFileSync(path.join(rootDir, 'holdtab-addon.zip'), path.join(rootDir, 'holdtab-firefox.zip'));

  console.log(`\nSuccessfully created extension packages (v${version}):`);
  console.log(`  📦 ${path.join(rootDir, 'holdtab-firefox.zip')}  <-- (Upload to Firefox AMO)`);
  console.log(`  📦 ${path.join(rootDir, 'holdtab-addon.zip')}    <-- (Universal package)`);
} catch (err) {
  console.error('Packaging failed:', err);
}
