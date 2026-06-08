/**
 * Encrypted credential vault using Tauri Stronghold (Argon2 + ChaCha20).
 *
 * Layout:
 *   vault file: <appLocalDataDir>/redmine-dashboard.hold
 *   client:     "redmine"
 *   store keys: "url", "token"
 *
 * Failures (wrong password, no vault) bubble up as exceptions.
 */

import { Stronghold, Client, Store } from '@tauri-apps/plugin-stronghold';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { exists, remove } from '@tauri-apps/plugin-fs';
import { setStorageEncKey } from './storage';

const CLIENT_NAME = 'redmine';
const KEY_URL = 'url';
const KEY_TOKEN = 'token';
const KEY_STORAGE_ENC = 'storage_enc_key'; // 256-bit AES key, base64

async function vaultPath(): Promise<string> {
  return await join(await appLocalDataDir(), 'redmine-dashboard.hold');
}

export async function vaultExists(): Promise<boolean> {
  try {
    return await exists(await vaultPath());
  } catch {
    return false;
  }
}

async function openClient(password: string): Promise<{ stronghold: Stronghold; client: Client; store: Store }> {
  const path = await vaultPath();
  const stronghold = await Stronghold.load(path, password);
  let client: Client;
  try {
    client = await stronghold.loadClient(CLIENT_NAME);
  } catch {
    client = await stronghold.createClient(CLIENT_NAME);
  }
  return { stronghold, client, store: client.getStore() };
}

function encode(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}
function decode(bytes: number[] | Uint8Array | null): string | null {
  if (!bytes) return null;
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder().decode(u8);
}

export interface Credentials {
  url: string;
  token: string;
}

async function generateStorageEncKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  let s = '';
  new Uint8Array(raw).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
}

async function importStorageEncKey(b64: string): Promise<void> {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  setStorageEncKey(key);
}

export async function saveCredentials(password: string, creds: Credentials): Promise<void> {
  const { stronghold, store } = await openClient(password);
  // Generate storage encryption key if not already stored
  let encKeyB64: string | null = null;
  try { encKeyB64 = decode(await store.get(KEY_STORAGE_ENC)); } catch { /* not yet stored */ }
  if (!encKeyB64) {
    encKeyB64 = await generateStorageEncKey();
    await store.insert(KEY_STORAGE_ENC, encode(encKeyB64));
  }
  await store.insert(KEY_URL, encode(creds.url));
  await store.insert(KEY_TOKEN, encode(creds.token));
  await stronghold.save();
  await importStorageEncKey(encKeyB64);
}

export async function loadCredentials(password: string): Promise<Credentials | null> {
  const { stronghold, store } = await openClient(password);
  const url = decode(await store.get(KEY_URL));
  const token = decode(await store.get(KEY_TOKEN));
  if (!url || !token) return null;
  // Load storage encryption key — self-heal older vaults that pre-date this field
  let encKeyB64 = decode(await store.get(KEY_STORAGE_ENC));
  if (!encKeyB64) {
    encKeyB64 = await generateStorageEncKey();
    await store.insert(KEY_STORAGE_ENC, encode(encKeyB64));
    await stronghold.save();
  }
  await importStorageEncKey(encKeyB64);
  return { url, token };
}

/** Wipe the vault completely (forgot password recovery). */
export async function destroyVault(): Promise<void> {
  try {
    await remove(await vaultPath());
  } catch {
    /* file may not exist */
  }
}
