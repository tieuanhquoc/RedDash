/**
 * Auto-update flow for the Tauri desktop build.
 *
 *   silent  → on launch, check in the background; only prompt if a new
 *             version is available.
 *   manual  → triggered from Help → Kiểm tra cập nhật; always notifies,
 *             including "đã là bản mới nhất".
 */

function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export async function checkForUpdate(manual = false): Promise<void> {
  if (!isTauri()) return;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const { ask, message } = await import('@tauri-apps/plugin-dialog');
    const { relaunch } = await import('@tauri-apps/plugin-process');

    const update = await check();
    if (!update) {
      if (manual) await message('Đang dùng bản mới nhất.', { title: 'RedDash', kind: 'info' });
      return;
    }

    const yes = await ask(
      `Có bản mới: ${update.version}\n\n${update.body ?? ''}\n\nTải về và cài đặt ngay?`,
      { title: 'RedDash — Cập nhật', kind: 'info', okLabel: 'Cập nhật', cancelLabel: 'Để sau' },
    );
    if (!yes) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (err) {
    if (manual) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(`Không kiểm tra được cập nhật: ${err instanceof Error ? err.message : String(err)}`,
        { title: 'RedDash', kind: 'error' });
    }
    // Silent mode: swallow — don't spam users on flaky network / no pubkey yet.
  }
}
