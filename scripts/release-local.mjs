#!/usr/bin/env node
// Local end-to-end release: build → sign → checksum → upload via gh CLI.
//
//   TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/reddash.key) \
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD='your-passphrase' \
//   node scripts/release-local.mjs [--notes "Release notes"]
//
// Requires: gh CLI (brew install gh && gh auth login) and the Tauri toolchain.
// Detects current OS and uploads only that platform's bundles. Run on each OS
// you want to ship for; the release is created on first run and assets are
// appended on subsequent runs.

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;

const notesIdx = process.argv.indexOf('--notes');
const notes = notesIdx >= 0 ? process.argv[notesIdx + 1] : `RedDash ${version}`;

const skipBuild = process.argv.includes('--skip-build');

function sh(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

function shCapture(cmd) {
  return execSync(cmd, { cwd: root }).toString().trim();
}

if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !skipBuild) {
  console.error('Missing TAURI_SIGNING_PRIVATE_KEY. Set it:\n');
  console.error('  export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/reddash.key)"');
  console.error('  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<passphrase>"\n');
  process.exit(1);
}

// 1. Build (unless --skip-build).
// `--no-dmg` skips the DMG step (which needs Finder Automation permission on
// macOS) and ships just the .app + .app.tar.gz that the updater needs.
const noDmg = process.argv.includes('--no-dmg');
const simpleDmg = process.argv.includes('--simple-dmg');
if (!skipBuild) {
  if (process.platform === 'darwin' && (noDmg || simpleDmg)) {
    // `app` bundle implicitly emits the updater .app.tar.gz + .sig when
    // plugins.updater.pubkey is set in tauri.conf.json.
    sh('npm run tauri:build -- --bundles app');
  } else {
    sh('npm run tauri:build');
  }
}

// Optional: hand-roll a DMG via hdiutil — no AppleScript, no Finder needed.
// Visually plain but functionally identical for users (drag .app to Applications).
if (process.platform === 'darwin' && simpleDmg) {
  const appDir = resolve(root, 'src-tauri', 'target', 'release', 'bundle', 'macos');
  const apps = readdirSync(appDir).filter(f => f.endsWith('.app'));
  if (apps.length) {
    const appName = apps[0];
    const dmgDir = resolve(root, 'src-tauri', 'target', 'release', 'bundle', 'dmg');
    mkdirSync(dmgDir, { recursive: true });
    const dmgPath = resolve(dmgDir, `RedDash_${version}_aarch64.dmg`);
    if (existsSync(dmgPath)) execSync(`rm -f "${dmgPath}"`);
    sh(`hdiutil create -volname RedDash -srcfolder "${resolve(appDir, appName)}" -ov -format UDZO "${dmgPath}"`);
  }
}

// 2. Locate the produced bundles for THIS platform
const bundleDir = resolve(root, 'src-tauri', 'target', 'release', 'bundle');
const assets = [];

function add(...paths) {
  for (const p of paths) {
    if (p && existsSync(p)) assets.push(p);
  }
}

function findFiles(subdir, suffixes) {
  const dir = resolve(bundleDir, subdir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => suffixes.some(s => f.endsWith(s)))
    .map(f => resolve(dir, f));
}

const platform = process.platform;
if (platform === 'darwin') {
  if (!noDmg) add(...findFiles('dmg', ['.dmg']));
  add(...findFiles('macos', ['.app.tar.gz', '.app.tar.gz.sig']));
  // .app folder bundled as a tarball for users who don't want DMG drag-flow
  const appDir = resolve(bundleDir, 'macos');
  if (existsSync(appDir)) {
    for (const f of readdirSync(appDir)) {
      if (f.endsWith('.app')) {
        // ship the tar.gz only — .app folder itself isn't a single uploadable file
      }
    }
  }
} else if (platform === 'win32') {
  add(...findFiles('msi', ['.msi', '.msi.sig']));
  add(...findFiles('nsis', ['-setup.exe', '-setup.exe.sig']));
  // Portable raw binary
  const releaseDir = resolve(root, 'src-tauri', 'target', 'release');
  const exes = readdirSync(releaseDir).filter(f => f.endsWith('.exe'));
  if (exes.length) {
    const stagedDir = resolve(root, 'release');
    mkdirSync(stagedDir, { recursive: true });
    const portable = resolve(stagedDir, `RedDash-${version}-portable.exe`);
    copyFileSync(resolve(releaseDir, exes[0]), portable);
    add(portable);
  }
} else if (platform === 'linux') {
  add(...findFiles('appimage', ['.AppImage', '.AppImage.sig']));
  add(...findFiles('deb', ['.deb']));
}

if (assets.length === 0) {
  console.error(`\nNo build artifacts found for platform ${platform}.`);
  console.error('Did the build step complete? Check src-tauri/target/release/bundle/');
  process.exit(1);
}

console.log(`\n${assets.length} assets to upload:`);
assets.forEach(a => console.log('  -', basename(a), `(${(statSync(a).size / 1024 / 1024).toFixed(2)} MB)`));

// 3. SHA256SUMS
const stagedDir = resolve(root, 'release');
mkdirSync(stagedDir, { recursive: true });
const sumsFile = resolve(stagedDir, `SHA256SUMS-${platform}.txt`);
const lines = [];
for (const f of assets) {
  if (f.endsWith('.sig')) continue;
  const h = createHash('sha256').update(readFileSync(f)).digest('hex');
  lines.push(`${h}  ${basename(f)}`);
}
writeFileSync(sumsFile, lines.join('\n') + '\n');
console.log(`\nWrote ${sumsFile}`);
assets.push(sumsFile);

// 4. latest.json — merge with existing platforms on the release (e.g. Windows
// built earlier via Actions) so one manifest covers every OS.
sh('node scripts/make-release.mjs --merge --notes ' + JSON.stringify(notes));
assets.push(resolve(stagedDir, 'latest.json'));

// 5. Create or upload to release via gh
try {
  shCapture(`gh release view ${tag}`);
  console.log(`\nRelease ${tag} exists — uploading assets (clobber)`);
  sh(`gh release upload ${tag} --clobber ${assets.map(a => `"${a}"`).join(' ')}`);
} catch {
  console.log(`\nCreating draft release ${tag}`);
  sh(`gh release create ${tag} --draft --title "RedDash ${version}" --notes ${JSON.stringify(notes)} ${assets.map(a => `"${a}"`).join(' ')}`);
}

console.log(`\n✓ Done. View at: https://github.com/tieuanhquoc/RedDash/releases/tag/${tag}`);
console.log('Run on the other OS to add its platform, then publish from the GitHub web UI.');
