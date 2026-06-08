import { invoke } from '@tauri-apps/api/core';

export async function openExternal(url: string) {
  try {
    await invoke('open_url', { url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
