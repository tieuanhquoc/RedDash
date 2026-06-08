'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from './AppContext';
import { fetchTimeEntries } from '@/lib/redmine';
import type { RedmineTimeEntry } from '@/lib/types';
import PieChart from './PieChart';

type Period = 'month' | 'quarter' | 'half' | 'year' | 'custom';

function fmtH(h: number | string) {
  const v = parseFloat(String(h) || '0');
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, '');
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function padDate(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}`; }

function buildBarData(entries: RedmineTimeEntry[], keyFn: (e: RedmineTimeEntry) => string) {
  const map: Record<string, number> = {};
  entries.forEach(e => {
    const k = keyFn(e);
    map[k] = (map[k] || 0) + parseFloat(String(e.hours || 0));
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

interface BarCardProps {
  title: string;
  rows: [string, number][];
  color: string;
}

function BarCard({ title, rows, color }: BarCardProps) {
  const max = rows[0]?.[1] || 1;
  return (
    <div className="statCard">
      <div className="statCardTitle">{title}</div>
      {rows.slice(0, 10).map(([label, val]) => (
        <div key={label} className="statBarRow">
          <span className="statBarLabel" title={label}>{label}</span>
          <div className="statBarWrap">
            <div className="statBarFill" style={{ width: `${Math.round((val / max) * 100)}%`, background: color }} />
          </div>
          <span className="statBarVal">{fmtH(val)}h</span>
        </div>
      ))}
    </div>
  );
}

function resolveRange(period: Period, anchorYear: number, anchorMonth: number, customFrom: string, customTo: string): { from: string; to: string; label: string } {
  if (period === 'custom') {
    return { from: customFrom, to: customTo, label: `${customFrom} → ${customTo}` };
  }
  if (period === 'year') {
    return { from: `${anchorYear}-01-01`, to: `${anchorYear}-12-31`, label: `Năm ${anchorYear}` };
  }
  if (period === 'half') {
    if (anchorMonth <= 6) {
      return { from: `${anchorYear}-01-01`, to: `${anchorYear}-06-30`, label: `Nửa đầu ${anchorYear} (T1–T6)` };
    }
    return { from: `${anchorYear}-07-01`, to: `${anchorYear}-12-31`, label: `Nửa cuối ${anchorYear} (T7–T12)` };
  }
  if (period === 'quarter') {
    const q = Math.floor((anchorMonth - 1) / 3) + 1; // 1..4
    const m1 = (q - 1) * 3 + 1;
    const m2 = m1 + 2;
    const lastDay = new Date(anchorYear, m2, 0).getDate();
    return {
      from: padDate(anchorYear, m1, 1),
      to: padDate(anchorYear, m2, lastDay),
      label: `Q${q} ${anchorYear} (T${m1}–T${m2})`,
    };
  }
  // month
  const lastDay = new Date(anchorYear, anchorMonth, 0).getDate();
  return {
    from: padDate(anchorYear, anchorMonth, 1),
    to: padDate(anchorYear, anchorMonth, lastDay),
    label: new Date(anchorYear, anchorMonth - 1, 1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' }),
  };
}

export default function StatsView() {
  const { state, dispatch, showToast } = useApp();
  const { config, currentUser, viewUserId } = state;
  const effectiveUserId = viewUserId ?? currentUser?.id ?? null;

  const [period, setPeriod] = useState<Period>('month');
  const [anchorYear, setAnchorYear] = useState(state.year);
  const [anchorMonth, setAnchorMonth] = useState(state.month);
  const [customFrom, setCustomFrom] = useState(padDate(state.year, state.month, 1));
  const [customTo, setCustomTo]     = useState(padDate(state.year, state.month, new Date(state.year, state.month, 0).getDate()));
  const [entries, setEntries] = useState<RedmineTimeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const { from, to, label } = resolveRange(period, anchorYear, anchorMonth, customFrom, customTo);

  // Fetch on range/user change
  useEffect(() => {
    if (!config || effectiveUserId == null || !from || !to || from > to) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await fetchTimeEntries(config, effectiveUserId, from, to);
        if (cancelled) return;
        setEntries(data);
        // Also push to global state for DetailModal use
        dispatch({ type: 'SET_TIME_ENTRIES', payload: data });
      } catch (err: unknown) {
        if (!cancelled) showToast('Lỗi tải dữ liệu: ' + (err instanceof Error ? err.message : String(err)), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [from, to, effectiveUserId, config]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;

  function navigateAnchor(delta: number) {
    if (period === 'year') {
      const ny = anchorYear + delta;
      if (ny > curY) return;
      setAnchorYear(ny);
    } else if (period === 'half') {
      // Cycle 4 halves: (Y, 1-6) -> (Y, 7-12) -> (Y+1, 1-6) -> ...
      let m = anchorMonth <= 6 ? 1 : 7;
      m += delta * 6;
      let y = anchorYear;
      while (m < 1)  { m += 12; y--; }
      while (m > 12) { m -= 12; y++; }
      if (y > curY || (y === curY && m > curM)) return;
      setAnchorYear(y); setAnchorMonth(m);
    } else if (period === 'quarter') {
      let q = Math.floor((anchorMonth - 1) / 3) + delta + 1;
      let y = anchorYear;
      while (q < 1)  { q += 4; y--; }
      while (q > 4)  { q -= 4; y++; }
      const m = (q - 1) * 3 + 1;
      if (y > curY || (y === curY && m > curM)) return;
      setAnchorYear(y); setAnchorMonth(m);
    } else {
      // month
      let m = anchorMonth + delta;
      let y = anchorYear;
      while (m < 1)  { m += 12; y--; }
      while (m > 12) { m -= 12; y++; }
      if (y > curY || (y === curY && m > curM)) return;
      setAnchorYear(y); setAnchorMonth(m);
    }
  }

  const allEntries = entries;
  const totalH = allEntries.reduce((s, e) => s + parseFloat(String(e.hours || 0)), 0);
  const daysLogged = useMemo(() => new Set(allEntries.map(e => e.spent_on)).size, [allEntries]);
  const fullDays = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of allEntries) {
      byDate.set(e.spent_on, (byDate.get(e.spent_on) ?? 0) + parseFloat(String(e.hours || 0)));
    }
    return Array.from(byDate.values()).filter(h => h >= 8).length;
  }, [allEntries]);

  return (
    <div className="viewPane">
      <div className="viewHeader">
        <div className="headerLeft">
          <h1 className="viewTitle">Thống kê</h1>
          <div className="monthNav">
            {period !== 'custom' && (
              <>
                <button className="navBtn" onClick={() => navigateAnchor(-1)} aria-label="Trước">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span className="monthLabel" style={{ minWidth: 220 }}>{label}</span>
                <button className="navBtn" onClick={() => navigateAnchor(1)} aria-label="Sau">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </>
            )}
            {period === 'custom' && (
              <span className="monthLabel" style={{ minWidth: 220 }}>{label}</span>
            )}
          </div>
        </div>
        <div className="headerRight">
          <div style={{ display: 'flex', gap: 4 }}>
            {(['month','quarter','half','year','custom'] as Period[]).map(p => (
              <button key={p}
                className="selectPill"
                onClick={() => setPeriod(p)}
                style={period === p ? { background: 'var(--accent-glow)', color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
              >
                {p === 'month' ? 'Tháng' : p === 'quarter' ? 'Quý' : p === 'half' ? 'Nửa năm' : p === 'year' ? 'Năm' : 'Tuỳ chọn'}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <>
              <input type="date" className="selectPill" value={customFrom} onChange={e => setCustomFrom(e.target.value)} max={customTo} />
              <span style={{ color: 'var(--text-muted)' }}>→</span>
              <input type="date" className="selectPill" value={customTo} onChange={e => setCustomTo(e.target.value)} min={customFrom} max={padDate(curY, curM, new Date(curY, curM, 0).getDate())} />
            </>
          )}
          <button
            className="btnToday"
            onClick={() => {
              setAnchorYear(curY); setAnchorMonth(curM);
              const lastDay = new Date(curY, curM, 0).getDate();
              setCustomFrom(padDate(curY, curM, 1));
              setCustomTo(padDate(curY, curM, lastDay));
            }}
          >Hôm nay</button>
        </div>
      </div>

      <div className="summaryStrip">
        <div className="summaryCard">
          <span className="summaryLabel">Tổng giờ</span>
          <span className="summaryVal">{fmtH(totalH)}h</span>
        </div>
        <div className="summaryCard">
          <span className="summaryLabel">Ngày có log</span>
          <span className="summaryVal">{daysLogged}</span>
        </div>
        <div className="summaryCard">
          <span className="summaryLabel">Ngày đủ 8h</span>
          <span className="summaryVal">{fullDays}</span>
        </div>
        <div className="summaryCard">
          <span className="summaryLabel">TB / ngày log</span>
          <span className="summaryVal">{daysLogged > 0 ? fmtH(totalH / daysLogged) : '--'}h</span>
        </div>
      </div>

      {loading ? (
        <div className="loadingState">
          <div className="loadingSpinner" />
          <p>Đang tải dữ liệu…</p>
        </div>
      ) : allEntries.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>
          Không có dữ liệu trong khoảng này.
        </p>
      ) : (
        <div className="statsGrid">
          <PieChart
            title="Tỉ lệ giờ theo Issue"
            rows={buildBarData(allEntries, e => e.issue ? `#${e.issue.id} ${e.issue.name ?? ''}`.trim() : 'No issue')}
          />
          <PieChart
            title="Tỉ lệ giờ theo Project"
            rows={buildBarData(allEntries, e => e.project?.name ?? 'Unknown')}
          />
          <PieChart
            title="Tỉ lệ giờ theo Activity"
            rows={buildBarData(allEntries, e => e.activity?.name ?? 'Unknown')}
          />
          <BarCard
            title="Theo Issue"
            rows={buildBarData(allEntries, e => e.issue ? `#${e.issue.id} ${e.issue.name ?? ''}`.trim() : 'No issue')}
            color="var(--accent)"
          />
          <BarCard
            title="Theo Activity"
            rows={buildBarData(allEntries, e => e.activity?.name ?? 'Unknown')}
            color="var(--green)"
          />
          <BarCard
            title="Theo Project"
            rows={buildBarData(allEntries, e => e.project?.name ?? 'Unknown')}
            color="var(--blue)"
          />
        </div>
      )}
    </div>
  );
}
