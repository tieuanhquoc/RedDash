'use client';

import React, { useEffect } from 'react';
import { AppProvider, useApp } from '@/components/AppContext';
import { I18nProvider } from '@/lib/i18n';
import SettingsModal from '@/components/SettingsModal';
import { AppShell } from '@/components/Shell';
import Toast from '@/components/Toast';
import { checkForUpdate } from '@/lib/updater';

function App() {
  const { state } = useApp();

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

  return (
    <>
      <SettingsModal />
      {state.currentUser && <AppShell />}
      <Toast />
    </>
  );
}

export default function Page() {
  return (
    <I18nProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </I18nProvider>
  );
}
