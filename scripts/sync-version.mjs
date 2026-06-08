#!/usr/bin/env node
// Syncs the version in src-tauri/Cargo.toml to match package.json.
// tauri.conf.json reads "../package.json" directly, so no extra work there.
// Cargo.toml has no native import mechanism — this script rewrites it.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pkgPath = resolve(root, 'package.json');
const cargoPath = resolve(root, 'src-tauri', 'Cargo.toml');

const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));
if (!version) {
  console.error('package.json has no version field');
  process.exit(1);
}

const cargo = readFileSync(cargoPath, 'utf8');
const updated = cargo.replace(/^(version\s*=\s*)"[^"]*"/m, `$1"${version}"`);

if (updated === cargo) {
  console.log(`Cargo.toml already at ${version}`);
} else {
  writeFileSync(cargoPath, updated);
  console.log(`Cargo.toml → ${version}`);
}
