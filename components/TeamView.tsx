'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from './AppContext';
import { fetchAllTimeEntries, fetchUsers } from '@/lib/redmine';
import { secureGet, secureSet } from '@/lib/storage';
import type { RedmineTimeEntry } from '@/lib/types';
import { useT, useI18n } from '@/lib/i18n';

const TEAM_FILTER_KEY_PREFIX = 'team_view_user_ids';

type Period = 'week' | 'month';

function padDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function fmt(v: number): string {
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, '');
}

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const dow = (date.getDay() + 6) % 7; // Mon=0
  date.setDate(date.getDate() - dow);
  date.setHours(0, 0, 0, 0);
  return date;
}

function pctColor(pct: number): { bg: string; fg: string } {
  if (pct >= 90) return { bg: 'rgba(79,179,125,.16)', fg: '#0F7B6C' };
  if (pct >= 70) return { bg: 'rgba(217,115,13,.14)', fg: '#9A5C0F' };
  return { bg: 'rgba(224,62,62,.12)', fg: '#A53030' };
}

export default function TeamView() {
  const { state, dispatch, showToast } = useApp();
  const t = useT();
  const { locale } = useI18n();
  const { config, users } = state;

  // Namespace filter key by domain so different Redmine instances don't share user selections
  const teamFilterKey = useMemo(() => {
    try { return `${TEAM_FILTER_KEY_PREFIX}_${new URL(config?.redmineUrl ?? '').hostname}`; }
    catch { return TEAM_FILTER_KEY_PREFIX; }
  }, [config?.redmineUrl]);

  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [entries, setEntries] = useState<RedmineTimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [filterLoaded, setFilterLoaded] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);

  // Ensure user list is loaded (needed for filter dropdown)
  useEffect(() => {
    if (!config || users.length > 0) return;
    fetchUsers(config).then(list => dispatch({ type: 'SET_USERS', payload: list })).catch(() => {});
  }, [config, users.length, dispatch]);

  // Load saved filter selection (empty by default — nothing shown until user picks)
  useEffect(() => {
    setFilterLoaded(false);
    secureGet(teamFilterKey).then(raw => {
      try { setSelectedUserIds(new Set(raw ? JSON.parse(raw) as number[] : [])); }
      catch { setSelectedUserIds(new Set()); }
      setFilterLoaded(true);
    });
  }, [teamFilterKey]);

  // Persist filter selection (AES-GCM via vault key)
  useEffect(() => {
    if (!filterLoaded) return;
    secureSet(teamFilterKey, JSON.stringify(Array.from(selectedUserIds)));
  }, [selectedUserIds, teamFilterKey, filterLoaded]);

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!filterOpen) return;
    function onDoc(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [filterOpen]);

  function toggleUser(id: number) {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Resolve range
  const { from, to, dates, label } = useMemo(() => {
    if (period === 'week') {
      const monday = getMondayOfWeek(anchor);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        dates.push(padDate(d.getFullYear(), d.getMonth() + 1, d.getDate()));
      }
      const mondayStr = monday.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit' });
      const sundayStr = sunday.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit' });
      const lbl = t('team.weekLabel', { start: mondayStr, end: sundayStr });
      return { from: dates[0], to: dates[6], dates, label: lbl };
    } else {
      const y = anchor.getFullYear();
      const m = anchor.getMonth() + 1;
      const lastDay = new Date(y, m, 0).getDate();
      const dates: string[] = [];
      for (let d = 1; d <= lastDay; d++) dates.push(padDate(y, m, d));
      const lbl = anchor.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' });
      return { from: dates[0], to: dates[dates.length - 1], dates, label: lbl };
    }
  }, [anchor, period, t, locale]);

  // Fetch only when at least one user is selected — avoids hammering server on empty filter
  useEffect(() => {
    if (!config) return;
    if (selectedUserIds.size === 0) { setEntries([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await fetchAllTimeEntries(config, from, to);
        if (!cancelled) setEntries(data);
      } catch (err: unknown) {
        if (!cancelled) showToast(t('team.loadError', { msg: err instanceof Error ? err.message : String(err) }), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [from, to, config, selectedUserIds.size]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aggregate: user.id → { name, byDate: Map<date, hours>, total }
  const userMap = useMemo(() => {
    const m = new Map<number, { name: string; byDate: Map<string, number>; total: number }>();
    for (const e of entries) {
      if (!e.user) continue;
      const uid = e.user.id;
      const cur = m.get(uid) ?? { name: e.user.name, byDate: new Map(), total: 0 };
      const h = parseFloat(String(e.hours || 0));
      cur.byDate.set(e.spent_on, (cur.byDate.get(e.spent_on) ?? 0) + h);
      cur.total += h;
      m.set(uid, cur);
    }
    return m;
  }, [entries]);

  // Sort users by total hours desc; also include users list from filter (zero-hours users at bottom)
  const sortedRows = useMemo(() => {
    const rows = Array.from(userMap.entries()).map(([id, info]) => ({ id, ...info }));
    // Add users known but with 0 entries
    for (const u of users) {
      if (!userMap.has(u.id)) {
        rows.push({
          id: u.id,
          name: `${u.firstname} ${u.lastname}`.trim() || u.login || `#${u.id}`,
          byDate: new Map(),
          total: 0,
        });
      }
    }
    rows.sort((a, b) => b.total - a.total);
    // Nothing selected → render nothing (avoid loading full team by default)
    if (selectedUserIds.size === 0) return [];
    return rows.filter(r => selectedUserIds.has(r.id));
  }, [userMap, users, selectedUserIds]);

  // Filter dropdown user list (search applied)
  const filterUsers = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    const all = users.map(u => ({
      id: u.id,
      name: `${u.firstname} ${u.lastname}`.trim() || u.login || `#${u.id}`,
    }));
    if (!q) return all;
    return all.filter(u => u.name.toLowerCase().includes(q));
  }, [users, filterSearch]);

  // Working days only (exclude weekends from display and calculation)
  const weekDates = useMemo(() => dates.filter(d => {
    const dow = new Date(d).getDay();
    return dow !== 0 && dow !== 6;
  }), [dates]);
  const workingDaysInRange = weekDates.length;
  const targetHours = workingDaysInRange * 8;

  function navigate(delta: number) {
    const next = new Date(anchor);
    if (period === 'week') next.setDate(next.getDate() + 7 * delta);
    else next.setMonth(next.getMonth() + delta);
    setAnchor(next);
  }

  const today = padDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

  return (
    <div className="viewPane">
      <div className="viewHeader">
        <div className="headerLeft">
          <h1 className="viewTitle">{t('team.title')}</h1>
          <div className="monthNav">
            <button className="navBtn" onClick={() => navigate(-1)} aria-label={t('common.prev')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="monthLabel">{label}</span>
            {loading && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spinning" style={{ opacity: .5 }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>}
            <button className="navBtn" onClick={() => navigate(1)} aria-label={t('common.next')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
        <div className="headerRight">
          <div ref={filterRef} style={{ position: 'relative' }}>
            <button
              className="selectPill"
              onClick={() => setFilterOpen(o => !o)}
              title={t('team.selectUser')}
              style={selectedUserIds.size > 0 ? { background: 'var(--accent-glow)', color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4, verticalAlign: -1 }}>
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              {selectedUserIds.size > 0 ? t('team.filterLabel', { n: selectedUserIds.size }) : t('team.selectUser')}
            </button>
            {filterOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                minWidth: 260, maxHeight: 360, overflow: 'auto',
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: 'var(--shadow-modal)', zIndex: 50, padding: 6,
              }}>
                <input
                  type="text"
                  placeholder={t('team.searchUserPlaceholder')}
                  value={filterSearch}
                  onChange={e => setFilterSearch(e.target.value)}
                  className="fieldInput"
                  style={{ marginBottom: 4, fontSize: '.82rem' }}
                  autoFocus
                />
                {selectedUserIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds(new Set())}
                    style={{
                      width: '100%', padding: '.4rem', fontSize: '.78rem',
                      background: 'transparent', border: 'none', color: 'var(--red)',
                      cursor: 'pointer', borderRadius: 4, marginBottom: 4,
                    }}
                  >{t('team.deselectAll')}</button>
                )}
                {filterUsers.length === 0 ? (
                  <div style={{ padding: 8, color: 'var(--text-muted)', fontSize: '.82rem', textAlign: 'center' }}>
                    {t('team.noUserFound')}
                  </div>
                ) : filterUsers.map(u => {
                  const checked = selectedUserIds.has(u.id);
                  return (
                    <label key={u.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '.4rem .55rem', borderRadius: 4, cursor: 'pointer',
                      fontSize: '.85rem',
                      background: checked ? 'var(--accent-bg)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--hover)'; }}
                    onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUser(u.id)}
                      />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="selectPill"
              onClick={() => setPeriod('week')}
              style={period === 'week' ? { background: 'var(--accent-glow)', color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
            >{t('team.periodWeek')}</button>
            <button
              className="selectPill"
              onClick={() => setPeriod('month')}
              style={period === 'month' ? { background: 'var(--accent-glow)', color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
            >{t('team.periodMonth')}</button>
          </div>
          <button className="btnToday" onClick={() => setAnchor(new Date())}>{t('common.today')}</button>
        </div>
      </div>

      <div className="summaryStrip">
        <div className="summaryCard">
          <span className="summaryLabel">{t('team.memberCount')}</span>
          <span className="summaryVal">{sortedRows.length}</span>
        </div>
        <div className="summaryCard">
          <span className="summaryLabel">{t('team.workingDays')}</span>
          <span className="summaryVal">{workingDaysInRange}</span>
        </div>
        <div className="summaryCard">
          <span className="summaryLabel">{t('team.targetPerUser')}</span>
          <span className="summaryVal">{targetHours}h</span>
        </div>
        <div className="summaryCard">
          <span className="summaryLabel">{t('team.totalTeamHours')}</span>
          <span className="summaryVal">{fmt(sortedRows.reduce((s, r) => s + r.total, 0))}h</span>
        </div>
      </div>

      {!loading && sortedRows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('team.noData')}</p>
      ) : (
        <div className="teamTableWrap" style={loading ? { opacity: 0.45, pointerEvents: 'none', transition: 'opacity .15s' } : { transition: 'opacity .15s' }}>
          <table className="teamTable">
            <thead>
              <tr>
                <th className="teamCellName">{t('team.tableHeaderUser')}</th>
                {weekDates.map(d => {
                  const [, mm, dd] = d.split('-');
                  const isToday = d === today;
                  return (
                    <th
                       key={d}
                      className={`teamCellDate${isToday ? ' teamCellToday' : ''}`}
                    >
                      {dd}/{mm}
                    </th>
                  );
                })}
                <th className="teamCellTotal">{t('team.tableHeaderTotal')}</th>
                <th className="teamCellPct">%</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => {
                const pct = targetHours > 0 ? Math.round((row.total / targetHours) * 100) : 0;
                const c = pctColor(pct);
                return (
                  <tr key={row.id}>
                    <td className="teamCellName" title={row.name}>{row.name}</td>
                    {weekDates.map(d => {
                      const h = row.byDate.get(d) ?? 0;
                      return (
                        <td
                          key={d}
                          className="teamCellHour"
                          style={h > 0 ? {
                            background: h >= 8 ? 'rgba(79,179,125,.16)' : 'rgba(217,115,13,.10)',
                            color: h >= 8 ? '#0F7B6C' : '#9A5C0F',
                            fontWeight: 600,
                          } : undefined}
                        >
                          {h > 0 ? fmt(h) : ''}
                        </td>
                      );
                    })}
                    <td className="teamCellTotal" style={{ fontWeight: 700 }}>{fmt(row.total)}h</td>
                    <td className="teamCellPct" style={{ background: c.bg, color: c.fg, fontWeight: 700 }}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
