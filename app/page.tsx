'use client';

import React, { useEffect } from 'react';
import { AppProvider, useApp } from '@/components/AppContext';
import SettingsModal from '@/components/SettingsModal';
import { AppShell } from '@/components/Shell';
import Toast from '@/components/Toast';

function App() {
  const { state } = useApp();

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
    <AppProvider>
      <App />
    </AppProvider>
  );
}
