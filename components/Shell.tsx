'use client';

import React, { useState } from 'react';
import { useApp } from './AppContext';
import CalendarView from './CalendarView';
import BulkLogModal from './BulkLogModal';
import StatsView from './StatsView';
import TeamView from './TeamView';
import FavoritesView from './FavoritesView';
import { useEffect } from 'react';
import { fetchTimeEntries } from '@/lib/redmine';

// ─── Sidebar ─────────────────────────────────────────────────────────────────
interface SidebarProps {
  onBulkOpen: () => void;
}

export default function Sidebar({ onBulkOpen }: SidebarProps) {
  const { state, dispatch } = useApp();
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
          Lịch
        </button>
        <button
          className={`navItem${state.view === 'stats' ? ' navItemActive' : ''}`}
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'stats' })}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          Thống kê
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
          Team
        </button>
        <button
          className={`navItem${state.view === 'favorites' ? ' navItemActive' : ''}`}
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'favorites' })}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          Pin
        </button>

        <div style={{ height: '1px', background: 'var(--border)', margin: '.35rem 0' }} />

        {isViewingSelf && (
          <button
            className="navItem"
            style={{ color: 'var(--amber)' }}
            onClick={onBulkOpen}
            title="Log Time (⌘L)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Log Time
            <span style={{ marginLeft: 'auto', fontSize: '.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>⌘L</span>
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
          className="iconBtn"
          onClick={() => dispatch({ type: 'LOGOUT' })}
          title="Đăng xuất / đổi kết nối"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

// ─── Main content + modals ───────────────────────────────────────────────────
export function AppShell() {
  const { state, dispatch } = useApp();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkInitialDate, setBulkInitialDate] = useState<string | null>(null);
  const [bulkInitialIssue, setBulkInitialIssue] = useState<{ id: number; subject: string } | null>(null);
  const isViewingSelf = (state.viewUserId ?? state.currentUser?.id) === state.currentUser?.id;

  function openLog(date?: string | null, issue?: { id: number; subject: string } | null) {
    setBulkInitialDate(date ?? null);
    setBulkInitialIssue(issue ?? null);
    setBulkOpen(true);
  }

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
