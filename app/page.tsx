'use client';

import React, { useEffect } from 'react';
import { AppProvider, useApp } from '@/components/AppContext';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { ThemeProvider, LiquidGlassProvider } from '@/lib/theme';
import SettingsModal from '@/components/SettingsModal';
import { AppShell } from '@/components/Shell';
import Toast from '@/components/Toast';
import TitleBar from '@/components/TitleBar';
import { checkForUpdate } from '@/lib/updater';

function App() {
  const { state } = useApp();
  const { t } = useI18n();

  // Silent update check on launch + expose for Help menu trigger from Rust.
  useEffect(() => {
    (window as unknown as { __rdash_check_update__?: (manual: boolean) => void })
      .__rdash_check_update__ = (manual: boolean) => { void checkForUpdate(manual); };
    void checkForUpdate(false);
  }, []);

  // Block native browser context menu, but keep it on text inputs so users
  // can paste API tokens, passwords, search text, etc.
  useEffect(() => {
    function onCtx(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
    }
    document.addEventListener('contextmenu', onCtx);
    return () => document.removeEventListener('contextmenu', onCtx);
  }, []);

  // Pull macOS native background colors from Rust and apply as CSS
  // variables. `get_native_bg_colors` returns two RGBA tuples:
  //   [0] = NSColor.controlBackgroundColor    → --app-bg-control (sidebar, modal)
  //   [1] = NSColor.underPageBackgroundColor   → --app-bg-card    (content cards)
  // Lets the Liquid Glass surfaces match the user's system appearance
  // (light/dark + Increase Contrast, Reduce Transparency). Silently
  // no-ops on Windows / Linux where the command isn't registered.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tauri = await import('@tauri-apps/api/core');
        const tuple = await tauri.invoke<[[number, number, number, number], [number, number, number, number]]>(
          'get_native_bg_colors',
        );
        if (cancelled) return;
        const [control, card] = tuple;
        const html = document.documentElement;
        const toRgba = ([r, g, b, a]: [number, number, number, number]) =>
          `rgba(${r}, ${g}, ${b}, ${a})`;
        html.style.setProperty('--app-bg-control', toRgba(control));
        html.style.setProperty('--app-bg-card', toRgba(card));
      } catch {
        /* not macOS or command not available — keep CSS fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {/* Custom title bar — mimics the macOS Overlay title (traffic lights
          stay OS-drawn at the top-left; this strips adds the centered
          title text + full-width drag region). Always rendered so it
          works on every screen (unlock modal too). */}
      <TitleBar title={t('common.appName')} />
      <SettingsModal />
      {state.currentUser && <AppShell />}
      <Toast />
    </>
  );
}

export default function Page() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <LiquidGlassProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </LiquidGlassProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
