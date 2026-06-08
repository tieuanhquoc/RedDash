/**
 * Encrypted localStorage wrapper using AES-256-GCM.
 *
 * The encryption key lives in Tauri Stronghold and must be loaded via
 * setStorageEncKey() after vault unlock. Reads and writes before the key
 * is set are silently no-ops (returns null / does nothing).
 */

let _vaultKey: CryptoKey | null = null;

export function setStorageEncKey(key: CryptoKey): void {
  _vaultKey = key;
}

function toB64(buf: ArrayBuffer): string {
  let s = '';
  new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _vaultKey!, new TextEncoder().encode(plain));
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), 12);
  return toB64(combined.buffer);
}

async function tryDecrypt(raw: string): Promise<string | null> {
  try {
    const combined = fromB64(raw);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, _vaultKey!, combined.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export async function secureGet(key: string): Promise<string | null> {
  if (typeof window === 'undefined' || !_vaultKey) return null;
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  return tryDecrypt(raw);
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined' || !_vaultKey) return;
  localStorage.setItem(key, await encrypt(value));
}

export function secureRemove(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
}
