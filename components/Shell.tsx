'use client';

import React, { useState } from 'react';
import { useApp } from './AppContext';
import CalendarView from './CalendarView';
import BulkLogModal from './BulkLogModal';
import StatsView from './StatsView';
import TeamView from './TeamView';
import FavoritesView from './FavoritesView';
import SecurityView, { LS_AUTO_LOCK_MINUTES } from './SecurityView';
import { useEffect } from 'react';
import { fetchTimeEntries } from '@/lib/redmine';
import { useI18n } from '@/lib/i18n';

// ─── Sidebar ─────────────────────────────────────────────────────────────────
interface SidebarProps {
  onBulkOpen: () => void;
}

export default function Sidebar({ onBulkOpen }: SidebarProps) {
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  if (!state.currentUser) return null;

  const u = state.currentUser;
  const initials = ((u.firstname || '')[0] || '') + ((u.lastname || '')[0] || '');
  const isViewingSelf = (state.viewUserId ?? u.id) === u.id;

  return (
    <aside className="sidebar">
      <div className="sidebarBrand">
        <img src="/logo.png" width={28} height={28} alt="RedDash" style={{ borderRadius: 6, flexShrink: 0 }} />
        <span className="brandName">RedDash</span>
      </div>

      <nav className="sidebarNav">
        <button
          className={`navItem${state.view === 'calendar' ? ' navItemActive' : ''}`}
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'calendar' })}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {t('sidebar.calendar')}
        </button>
        <button
          className={`navItem${state.view === 'stats' ? ' navItemActive' : ''}`}
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'stats' })}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          {t('sidebar.stats')}
        </button>
        <button
          className={`navItem${state.view === 'team' ? ' navItemActive' : ''}`}
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'team' })}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {t('sidebar.team')}
        </button>
        <button
          className={`navItem${state.view === 'favorites' ? ' navItemActive' : ''}`}
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'favorites' })}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {t('sidebar.favorites')}
        </button>

        {isViewingSelf && (
          <button
            className="sidebarCta sidebarCtaActive"
            onClick={onBulkOpen}
            title={t('sidebar.logTimeTooltip')}
            style={{ marginTop: '.35rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{t('sidebar.logTime')}</span>
            <span style={{ marginLeft: 'auto', fontSize: '.7rem', opacity: 0.75, fontWeight: 500 }}>⌘L</span>
          </button>
        )}
      </nav>

      <div className="sidebarFooter">
        <div className="userCard">
          <div className="userAvatar">{initials.toUpperCase() || 'U'}</div>
          <div className="userInfo">
            <span className="userName">{`${u.firstname} ${u.lastname}`.trim() || u.login}</span>
            <span className="userEmail">{u.mail || ''}</span>
          </div>
        </div>
        <button
          className="iconBtn sidebarSettingsBtn"
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'security' })}
          title={t('sidebar.settingsTitle')}
          style={state.view === 'security' ? { color: 'var(--accent, #6366F1)' } : undefined}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

// ─── Main content + modals ───────────────────────────────────────────────────
export function AppShell() {
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkInitialDate, setBulkInitialDate] = useState<string | null>(null);
  const [bulkInitialIssue, setBulkInitialIssue] = useState<{ id: number; subject: string } | null>(null);
  const isViewingSelf = (state.viewUserId ?? state.currentUser?.id) === state.currentUser?.id;

  function openLog(date?: string | null, issue?: { id: number; subject: string } | null) {
    setBulkInitialDate(date ?? null);
    setBulkInitialIssue(issue ?? null);
    setBulkOpen(true);
  }

  // Update tray menu's "Hôm nay" label whenever today's entries change.
  useEffect(() => {
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const entries = state.timeEntries[todayKey] ?? [];
    const totalHours = entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
    const text = entries.length === 0
      ? t('tray.todayEmpty')
      : t('tray.todayLabel', { hours: totalHours.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') });
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('update_tray_total', { text });
      } catch { /* browser mode */ }
    })();
  }, [state.timeEntries, state.currentUser, t]);

  // Tray menu events from Rust → JS actions.
  useEffect(() => {
    let unlistenQuickLog: (() => void) | null = null;
    let unlistenDash: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const u1 = await listen('tray://quick-log', () => {
          const n = new Date();
          const ds = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
          openLog(ds);
        });
        const u2 = await listen('tray://open-dashboard', () => {
          dispatch({ type: 'SET_VIEW', payload: 'calendar' });
        });
        if (cancelled) { u1(); u2(); }
        else { unlistenQuickLog = u1; unlistenDash = u2; }
      } catch { /* browser mode */ }
    })();
    return () => {
      cancelled = true;
      if (unlistenQuickLog) unlistenQuickLog();
      if (unlistenDash) unlistenDash();
    };
  }, [dispatch]);

  // Window close (X button) → always hide to background instead of quitting.
  // Dock icon stays; click to reopen (handled in Rust via RunEvent::Reopen).
  // To fully quit: Cmd+Q / app menu → Quit.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const win = await import('@tauri-apps/api/window').then(m => m.getCurrentWindow());
        const un = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          await win.hide();
        });
        if (cancelled) un(); else unlisten = un;
      } catch { /* browser mode */ }
    })();
    return () => { cancelled = true; if (unlisten) unlisten(); };
  }, []);

  // Auto-lock — dispatch LOGOUT based on configured mode (Cài đặt → Bảo mật):
  //   0   → off
  //   -1  → lock when window loses focus (switch to another app)
  //   -2  → lock when window hidden (minimize / hide)
  //   >0  → lock after N minutes of inactivity
  useEffect(() => {
    if (!state.currentUser) return;

    function readMode(): number {
      try {
        const raw = localStorage.getItem(LS_AUTO_LOCK_MINUTES);
        const n = raw == null ? 0 : parseInt(raw, 10);
        return Number.isFinite(n) ? n : 0;
      } catch { return 0; }
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let mode = readMode();
    let tauriUnlisten: (() => void) | null = null;
    let cancelled = false;

    function lockNow() { dispatch({ type: 'LOGOUT' }); }
    function armIdleTimer() {
      if (timer) clearTimeout(timer);
      if (mode > 0) timer = setTimeout(lockNow, mode * 60 * 1000);
    }
    function onActivity() { if (mode > 0) armIdleTimer(); }
    function onBlurDom() { if (mode === -1) lockNow(); }
    function onVisibility() { if (mode === -2 && document.hidden) lockNow(); }
    function onConfigChange(e: Event) {
      const detail = (e as CustomEvent<number>).detail;
      mode = Number.isFinite(detail) ? detail : 0;
      armIdleTimer();
    }

    // Listen to native Tauri window focus event for reliable cross-app blur
    // detection (DOM 'blur' can be flaky inside the webview).
    (async () => {
      try {
        const win = await import('@tauri-apps/api/window').then(m => m.getCurrentWindow());
        const raw = await win.onFocusChanged(({ payload: focused }) => {
          if (cancelled) return;
          if (!focused && mode === -1) lockNow();
        });
        // Idempotent + error-tolerant unlisten — guards against React
        // StrictMode double cleanup and races where the listener record was
        // already removed by Tauri (causes 'listeners[eventId].handlerId').
        let unlistened = false;
        const un = () => {
          if (unlistened) return;
          unlistened = true;
          try { raw(); } catch { /* already gone */ }
        };
        if (cancelled) un(); else tauriUnlisten = un;
      } catch { /* browser mode — fall back to DOM 'blur' only */ }
    })();

    armIdleTimer();
    const idleEvents: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];
    idleEvents.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    window.addEventListener('blur', onBlurDom);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('rdash:auto-lock-changed', onConfigChange as EventListener);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (tauriUnlisten) tauriUnlisten();
      idleEvents.forEach(ev => window.removeEventListener(ev, onActivity));
      window.removeEventListener('blur', onBlurDom);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('rdash:auto-lock-changed', onConfigChange as EventListener);
    };
  }, [state.currentUser, dispatch]);

  // ⌘L / Ctrl+L → open Log Time for today (only when viewing self)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l' && isViewingSelf) {
        e.preventDefault();
        const now = new Date();
        const ds = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        openLog(ds);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isViewingSelf]);

  if (!state.currentUser) return null;

  async function handleBulkSuccess(loggedDates: string[]) {
    if (!state.config || !state.currentUser || loggedDates.length === 0) return;
    const userId = state.currentUser.id;
    const sorted = [...loggedDates].sort();
    try {
      const entries = await fetchTimeEntries(state.config, userId, sorted[0], sorted[sorted.length - 1]);
      const byDate: Record<string, typeof entries> = {};
      entries.forEach(e => { (byDate[e.spent_on] ??= []).push(e); });
      sorted.forEach(d => dispatch({ type: 'SET_DAY_ENTRIES', payload: { date: d, entries: byDate[d] ?? [] } }));
    } catch { /* silent */ }
  }

  return (
    <div className="appShell">
      <Sidebar onBulkOpen={() => openLog(null)} />
      <main className="mainContent">
        {state.view === 'calendar' && <CalendarView onBulkOpen={openLog} />}
        {state.view === 'stats' && <StatsView />}
        {state.view === 'team' && <TeamView />}
        {state.view === 'favorites' && <FavoritesView onLog={openLog} />}
        {state.view === 'security' && <SecurityView />}
      </main>
      <BulkLogModal
        isOpen={bulkOpen}
        initialDate={bulkInitialDate}
        initialIssue={bulkInitialIssue}
        onClose={() => { setBulkOpen(false); setBulkInitialDate(null); setBulkInitialIssue(null); }}
        onSuccess={handleBulkSuccess}
      />
    </div>
  );
}
