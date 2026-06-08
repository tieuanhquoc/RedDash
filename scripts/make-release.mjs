#!/usr/bin/env node
// Generates a Tauri updater `latest.json` from the freshly built bundles.
//
// Run AFTER `npm run tauri:build` (which signs each installer and writes a
// matching `.sig` file). Output goes to `release/latest.json` and is meant
// to be uploaded to the corresponding GitHub Release alongside the installers.
//
// Usage:
//   node scripts/make-release.mjs [--notes "release notes here"]

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;
const repo = 'tieuanhquoc/RedDash';
const bundleDir = resolve(root, 'src-tauri', 'target', 'release', 'bundle');

const notesIdx = process.argv.indexOf('--notes');
const notes = notesIdx >= 0 ? process.argv[notesIdx + 1] : `RedDash ${version}`;

function findSigned(subdir, suffixes) {
  const dir = resolve(bundleDir, subdir);
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir)) {
    if (suffixes.some(s => f.endsWith(s)) && existsSync(resolve(dir, f + '.sig'))) {
      const sig = readFileSync(resolve(dir, f + '.sig'), 'utf8').trim();
      return { file: f, sig };
    }
  }
  return null;
}

const platforms = {};

// macOS — Tauri produces .app.tar.gz for the updater (DMG can't be patched in place)
const macAarch = findSigned('macos', ['.app.tar.gz']);
if (macAarch && process.arch === 'arm64') {
  platforms['darwin-aarch64'] = {
    signature: macAarch.sig,
    url: `https://github.com/${repo}/releases/download/v${version}/${macAarch.file}`,
  };
}
if (macAarch && process.arch === 'x64') {
  platforms['darwin-x86_64'] = {
    signature: macAarch.sig,
    url: `https://github.com/${repo}/releases/download/v${version}/${macAarch.file}`,
  };
}

// Windows — .msi or .exe (NSIS)
const win = findSigned('msi', ['.msi']) ?? findSigned('nsis', ['.exe']);
if (win) {
  platforms['windows-x86_64'] = {
    signature: win.sig,
    url: `https://github.com/${repo}/releases/download/v${version}/${win.file}`,
  };
}

// Linux — AppImage
const linux = findSigned('appimage', ['.AppImage']);
if (linux) {
  platforms['linux-x86_64'] = {
    signature: linux.sig,
    url: `https://github.com/${repo}/releases/download/v${version}/${linux.file}`,
  };
}

if (Object.keys(platforms).length === 0) {
  console.error('No signed bundles found in', bundleDir);
  console.error('Did you run `npm run tauri:build` with TAURI_SIGNING_PRIVATE_KEY set?');
  process.exit(1);
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

const out = resolve(root, 'release');
mkdirSync(out, { recursive: true });
const outFile = resolve(out, 'latest.json');
writeFileSync(outFile, JSON.stringify(manifest, null, 2));

console.log('Wrote', outFile);
console.log('Platforms:', Object.keys(platforms).join(', '));
console.log('\nNext steps:');
console.log(`  gh release create v${version} \\`);
const assets = Object.values(platforms).map(p => basename(p.url));
console.log(`    ${[...new Set(assets), 'release/latest.json'].join(' \\\n    ')} \\`);
console.log(`    --notes ${JSON.stringify(notes)}`);
