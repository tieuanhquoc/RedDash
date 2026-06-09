/**
 * Auto-update flow for the Tauri desktop build.
 *
 *   silent  → on launch, check in the background; only prompt if a new
 *             version is available.
 *   manual  → triggered from Help → Kiểm tra cập nhật; always notifies,
 *             including "đã là bản mới nhất".
 */

import { getDict } from './i18n';

function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export async function checkForUpdate(manual = false): Promise<void> {
  if (!isTauri()) return;
  const dict = getDict();
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const { ask, message } = await import('@tauri-apps/plugin-dialog');
    const { relaunch } = await import('@tauri-apps/plugin-process');

    const update = await check();
    if (!update) {
      if (manual) await message(dict.updater.currentVersion, { title: 'RedDash', kind: 'info' });
      return;
    }

    const promptText = dict.updater.newVersionPrompt
      .replace('{version}', update.version)
      .replace('{body}', update.body ?? '');

    const yes = await ask(
      promptText,
      {
        title: dict.updater.newVersionTitle,
        kind: 'info',
        okLabel: dict.updater.updateBtn,
        cancelLabel: dict.updater.laterBtn,
      },
    );
    if (!yes) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (err) {
    if (manual) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      const errorMsg = dict.updater.updateFailed.replace('{msg}', err instanceof Error ? err.message : String(err));
      await message(errorMsg, { title: 'RedDash', kind: 'error' });
    }
    // Silent mode: swallow — don't spam users on flaky network / no pubkey yet.
  }
}
