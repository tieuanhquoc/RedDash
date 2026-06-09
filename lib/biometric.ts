/**
 * Biometric wrapper — Touch ID / Windows Hello via robius-authentication,
 * random key stored in the OS keychain via the `keyring` crate.
 */

import { invoke } from '@tauri-apps/api/core';

function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export async function biometricAvailable(): Promise<boolean> {
  if (!isTauri()) return false;
  try { return await invoke<boolean>('biometric_available'); }
  catch { return false; }
}

export async function biometricEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try { return await invoke<boolean>('biometric_is_enabled'); }
  catch { return false; }
}

export async function biometricEnroll(): Promise<string> {
  return await invoke<string>('biometric_enroll');
}

export async function biometricUnlock(): Promise<string> {
  return await invoke<string>('biometric_unlock');
}

export async function biometricGetKeySilent(): Promise<string | null> {
  if (!isTauri()) return null;
  try { return await invoke<string | null>('biometric_get_key_silent'); }
  catch { return null; }
}

export async function biometricDisable(): Promise<void> {
  await invoke('biometric_disable');
}
