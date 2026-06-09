/**
 * Encrypted credential vault — Argon2id + AES-GCM-256.
 *
 * File:   <appLocalDataDir>/vault.json
 * Format (v1):
 *   {
 *     v: 1,
 *     kdf: 'Argon2id' | 'PBKDF2-SHA256',
 *     // Argon2id params:                    PBKDF2 params:
 *     m?: number, t?: number, p?: number,    iterations?: number,
 *     salt: b64, iv: b64, data: b64,         // payload encrypted by password-derived key
 *   }
 * Plaintext payload: JSON { url, token, encKey }
 *
 * Default for new vaults: Argon2id (OWASP option 2: m=19456 KiB, t=2, p=1).
 * Old PBKDF2 vaults are still readable. They upgrade to Argon2id on next save.
 *
 * AAD binds kdf + params so an attacker can't downgrade them in the file.
 */

import { argon2idAsync } from '@noble/hashes/argon2.js';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import {
  exists, remove, readTextFile, writeTextFile, BaseDirectory,
} from '@tauri-apps/plugin-fs';
import { setStorageEncKey } from './storage';
import { biometricGetKeySilent, biometricDisable } from './biometric';

const VAULT_FILE = 'vault.json';
const LEGACY_STRONGHOLD = 'redmine-dashboard.hold';
const VAULT_VERSION = 1;

// Default KDF for new vaults — Argon2id, OWASP option 2.
const DEFAULT_KDF = 'Argon2id' as const;
const ARGON2ID_M = 19456;  // KiB (19 MiB)
const ARGON2ID_T = 2;
const ARGON2ID_P = 1;

// Legacy KDF (still readable):
const LEGACY_PBKDF2_ITERATIONS = 600_000;

async function vaultPath(): Promise<string> {
  return await join(await appLocalDataDir(), VAULT_FILE);
}
async function legacyPath(): Promise<string> {
  return await join(await appLocalDataDir(), LEGACY_STRONGHOLD);
}

export async function vaultExists(): Promise<boolean> {
  try { return await exists(await vaultPath()); } catch { return false; }
}

/** True if vault.json has a bio blob — no keychain access. */
export async function vaultHasBio(): Promise<boolean> {
  try { return !!(await readBlob()).bio; } catch { return false; }
}


export interface Credentials {
  url: string;
  token: string;
}

function b64encode(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

interface KdfParams {
  kdf: 'Argon2id' | 'PBKDF2-SHA256';
  m?: number; t?: number; p?: number;  // Argon2id
  iterations?: number;                  // PBKDF2
}

function aad(params: KdfParams): Uint8Array {
  const tag = params.kdf === 'Argon2id'
    ? `Argon2id:m=${params.m}:t=${params.t}:p=${params.p}`
    : `PBKDF2-SHA256:${params.iterations}`;
  return new TextEncoder().encode(`RedDash:vault:v${VAULT_VERSION}:${tag}`);
}

async function deriveRawKey(password: string, salt: Uint8Array, params: KdfParams): Promise<Uint8Array> {
  if (params.kdf === 'Argon2id') {
    return await argon2idAsync(password, salt, {
      m: params.m!, t: params.t!, p: params.p!, dkLen: 32,
    });
  }
  // PBKDF2 (legacy)
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: params.iterations!, hash: 'SHA-256' },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
  );
}

async function generateStorageEncKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  return b64encode(new Uint8Array(raw));
}

async function importStorageEncKey(b64: string): Promise<void> {
  const raw = b64decode(b64);
  const key = await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  setStorageEncKey(key);
}

interface VaultBlob {
  v: number;
  kdf: 'Argon2id' | 'PBKDF2-SHA256';
  m?: number; t?: number; p?: number;
  iterations?: number;
  salt: string;
  iv: string;
  data: string;
  bio?: { iv: string; data: string };
}
interface VaultPayload { url: string; token: string; encKey: string }

function paramsFromBlob(blob: VaultBlob): KdfParams {
  if (blob.kdf === 'Argon2id') {
    return { kdf: 'Argon2id', m: blob.m, t: blob.t, p: blob.p };
  }
  return { kdf: 'PBKDF2-SHA256', iterations: blob.iterations ?? LEGACY_PBKDF2_ITERATIONS };
}

async function readBlob(): Promise<VaultBlob> {
  const raw = await readTextFile(VAULT_FILE, { baseDir: BaseDirectory.AppLocalData });
  const blob = JSON.parse(raw) as VaultBlob;
  if (blob.v !== VAULT_VERSION) throw new Error(`unsupported vault version ${blob.v}`);
  // Default kdf for ancient blobs without the field.
  if (!blob.kdf) blob.kdf = 'PBKDF2-SHA256';
  return blob;
}

async function writeBlob(blob: VaultBlob): Promise<void> {
  await writeTextFile(VAULT_FILE, JSON.stringify(blob), { baseDir: BaseDirectory.AppLocalData });
}

async function decryptPayload(
  key: CryptoKey, iv: Uint8Array, data: Uint8Array, params: KdfParams,
): Promise<VaultPayload> {
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(params) as BufferSource },
      key,
      data as BufferSource,
    );
  } catch {
    throw new Error('BadPassword');
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as VaultPayload;
}

async function encryptPayload(
  key: CryptoKey, payload: VaultPayload, params: KdfParams,
): Promise<{ iv: Uint8Array; data: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const data = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(params) as BufferSource },
    key,
    plaintext as BufferSource,
  ));
  return { iv, data };
}

async function loadPayloadByPassword(password: string): Promise<{ payload: VaultPayload; blob: VaultBlob }> {
  const blob = await readBlob();
  const params = paramsFromBlob(blob);
  const rawKey = await deriveRawKey(password, b64decode(blob.salt), params);
  const key = await importAesKey(rawKey);
  const payload = await decryptPayload(
    key, b64decode(blob.iv), b64decode(blob.data), params,
  );
  return { payload, blob };
}

// ─── public API ──────────────────────────────────────────────────────────────

export async function saveCredentials(password: string, creds: Credentials): Promise<void> {
  // Reuse existing encKey if the current password can decrypt the vault.
  // Remember whether the vault had a bio blob — only then touch the keychain.
  let encKey: string | null = null;
  let prevBio: { iv: string; data: string } | undefined;
  if (await vaultExists()) {
    try {
      const prev = await loadPayloadByPassword(password);
      encKey = prev.payload.encKey;
      prevBio = prev.blob.bio;
    } catch { /* */ }
  }
  if (!encKey) encKey = await generateStorageEncKey();

  const params: KdfParams = {
    kdf: DEFAULT_KDF, m: ARGON2ID_M, t: ARGON2ID_T, p: ARGON2ID_P,
  };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const rawKey = await deriveRawKey(password, salt, params);
  const passwordKey = await importAesKey(rawKey);
  const payload: VaultPayload = { url: creds.url, token: creds.token, encKey };
  const main = await encryptPayload(passwordKey, payload, params);

  const blob: VaultBlob = {
    v: VAULT_VERSION,
    kdf: params.kdf,
    m: params.m, t: params.t, p: params.p,
    salt: b64encode(salt),
    iv: b64encode(main.iv),
    data: b64encode(main.data),
  };

  // If the vault was previously bio-enrolled, re-encrypt the bio blob with the
  // current keychain key (silent read). Fallback: preserve the previous one.
  if (prevBio) {
    const bioKeyB64 = await biometricGetKeySilent();
    if (bioKeyB64) {
      const bioKey = await importAesKey(b64decode(bioKeyB64));
      const bio = await encryptPayload(bioKey, payload, params);
      blob.bio = { iv: b64encode(bio.iv), data: b64encode(bio.data) };
    } else {
      blob.bio = prevBio;
    }
  }

  await writeBlob(blob);
  try { if (await exists(await legacyPath())) await remove(await legacyPath()); } catch { /* */ }
  await importStorageEncKey(encKey);
}

export async function loadCredentialsWithBioKey(bioKeyB64: string): Promise<Credentials | null> {
  const blob = await readBlob();
  if (!blob.bio) throw new Error('Vault chưa được enroll cho sinh trắc học');
  const params = paramsFromBlob(blob);
  const key = await importAesKey(b64decode(bioKeyB64));
  const payload = await decryptPayload(
    key, b64decode(blob.bio.iv), b64decode(blob.bio.data), params,
  );
  await importStorageEncKey(payload.encKey);
  if (!payload.url || !payload.token) return null;
  return { url: payload.url, token: payload.token };
}

export async function enrollBiometricBlob(password: string, bioKeyB64: string): Promise<void> {
  const { payload, blob } = await loadPayloadByPassword(password);
  const params = paramsFromBlob(blob);
  const bioKey = await importAesKey(b64decode(bioKeyB64));
  const bio = await encryptPayload(bioKey, payload, params);
  blob.bio = { iv: b64encode(bio.iv), data: b64encode(bio.data) };
  await writeBlob(blob);
}

export async function removeBiometricBlob(): Promise<void> {
  try {
    const blob = await readBlob();
    if (blob.bio) { delete blob.bio; await writeBlob(blob); }
  } catch { /* */ }
}

export async function loadCredentials(password: string): Promise<Credentials | null> {
  const { payload, blob } = await loadPayloadByPassword(password);
  await importStorageEncKey(payload.encKey);
  if (!payload.url || !payload.token) return null;
  const creds = { url: payload.url, token: payload.token };
  // Auto-upgrade legacy PBKDF2 vault to Argon2id on first successful login.
  if (blob.kdf !== DEFAULT_KDF) {
    try { await saveCredentials(password, creds); } catch { /* best-effort */ }
  }
  return creds;
}

export async function destroyVault(): Promise<void> {
  try { await remove(await vaultPath()); } catch { /* */ }
  try { if (await exists(await legacyPath())) await remove(await legacyPath()); } catch { /* */ }
  try { await biometricDisable(); } catch { /* */ }
}
