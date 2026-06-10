'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from './AppContext';
import { fetchTimeEntries } from '@/lib/redmine';
import { secureGet, secureSet } from '@/lib/storage';
import { openExternal } from '@/lib/open-url';
import DetailModal from './DetailModal';
import ContextMenu from './ContextMenu';
import UserPicker from './UserPicker';
import MonthPicker from './MonthPicker';
import { useI18n } from '@/lib/i18n';

function fmtHours(h: number | string) {
  const v = parseFloat(String(h) || '0');
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, '');
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function padDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

interface CtxState {
  x: number; y: number;
  date: string; hasEntries: boolean;
}

interface CalendarViewProps {
  onBulkOpen: (date?: string | null, issue?: { id: number; subject: string } | null) => void;
}

export default function CalendarView({ onBulkOpen }: CalendarViewProps) {
  const { state, dispatch, showToast } = useApp();
  const { locale, t } = useI18n();
  const { year, month, timeEntries, loading, config, currentUser, users, viewUserId } = state;
  const effectiveUserId = viewUserId ?? currentUser?.id ?? null;
  const isViewingSelf = effectiveUserId === currentUser?.id;

  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [showAllEntries, setShowAllEntries] = useState<boolean>(false);

  useEffect(() => {
    secureGet('cal_show_all_entries').then(v => { if (v !== null) setShowAllEntries(v === '1'); });
  }, []);

  useEffect(() => {
    secureSet('cal_show_all_entries', showAllEntries ? '1' : '0');
  }, [showAllEntries]);

  const today = toDateStr(new Date());

  // ── Reload entries ──────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!config || effectiveUserId == null) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const from = padDate(year, month, 1);
      const lastDay = new Date(year, month, 0).getDate();
      const to = padDate(year, month, lastDay);
      const entries = await fetchTimeEntries(config, effectiveUserId, from, to);
      dispatch({ type: 'SET_TIME_ENTRIES', payload: entries });
    } catch (err: unknown) {
      showToast(t('calendar.loadError', { msg: err instanceof Error ? err.message : String(err) }), 'error');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [config, effectiveUserId, year, month, dispatch, showToast, t]);

  // Reload only a specific set of dates — used after bulk log to avoid full month reload.
  const reloadDates = useCallback(async (dates: string[]) => {
    if (!config || effectiveUserId == null || dates.length === 0) return;
    const sorted = [...dates].sort();
    try {
      const entries = await fetchTimeEntries(config, effectiveUserId, sorted[0], sorted[sorted.length - 1]);
      const byDate: Record<string, typeof entries> = {};
      entries.forEach(e => { (byDate[e.spent_on] ??= []).push(e); });
      sorted.forEach(d => dispatch({ type: 'SET_DAY_ENTRIES', payload: { date: d, entries: byDate[d] ?? [] } }));
    } catch { /* silent — full reload still available via refresh button */ }
  }, [config, effectiveUserId, dispatch]);

  // ── Navigation (block future months) ────────────────────────────────────────
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const isCurrentMonth = year === curY && month === curM;
  const isFuture = year > curY || (year === curY && month > curM);

  function go(deltaMonth: number) {
    let m = month + deltaMonth;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    if (y > curY || (y === curY && m > curM)) return; // block future
    dispatch({ type: 'SET_YEAR_MONTH', payload: { year: y, month: m } });
  }

  // Trigger reload when year/month changes — handled in CalendarView via useEffect
  React.useEffect(() => { reload(); }, [year, month, effectiveUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Calendar cells ──────────────────────────────────────────────────────────
  const firstDay = new Date(year, month - 1, 1);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrev = new Date(year, month - 1, 0).getDate();

  type Cell = { day: number; dateStr: string; curMonth: boolean; dow: number };
  const cells: Cell[] = [];

  for (let i = startDow - 1; i >= 0; i--) {
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    cells.push({ day: daysInPrev - i, dateStr: padDate(py, pm, daysInPrev - i), curMonth: false, dow: cells.length % 7 });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: padDate(year, month, d), curMonth: true, dow: cells.length % 7 });
  }
  while (cells.length < 42) {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    const d = cells.length - startDow - daysInMonth + 1;
    cells.push({ day: d, dateStr: padDate(ny, nm, d), curMonth: false, dow: cells.length % 7 });
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const allEntries = Object.values(timeEntries).flat();
  const totalH = allEntries.reduce((s, e) => s + parseFloat(String(e.hours || 0)), 0);
  const logDays = Object.keys(timeEntries).length;
  const avgH = logDays > 0 ? totalH / logDays : 0;
  const todayH = (timeEntries[today] ?? []).reduce((s, e) => s + parseFloat(String(e.hours || 0)), 0);

  // Working days = Mon–Fri count in current month × 8h target
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) workingDays++;
  }
  const targetH = workingDays * 8;
  const pctH = targetH > 0 ? Math.round((totalH / targetH) * 100) : 0;

  // ── Missing days detection (self-view, current/past months only) ────────────
  const todayD = new Date();
  const isCurMonthOrPast = year < todayD.getFullYear() ||
    (year === todayD.getFullYear() && month <= todayD.getMonth() + 1);
  const emptyDays: string[] = [];
  const incompleteDays: { date: string; hours: number }[] = [];
  if (isViewingSelf && isCurMonthOrPast && !loading && currentUser) {
    const lastDay = (year === todayD.getFullYear() && month === todayD.getMonth() + 1)
      ? todayD.getDate()
      : daysInMonth;
    for (let d = 1; d <= lastDay; d++) {
      const cellDate = new Date(year, month - 1, d);
      const dow = cellDate.getDay();
      if (dow === 0 || dow === 6) continue;
      const ds = padDate(year, month, d);
      const dayEntries = timeEntries[ds];
      if (!dayEntries || dayEntries.length === 0) {
        emptyDays.push(ds);
      } else if (ds !== today) {
        const h = dayEntries.reduce((s, e) => s + parseFloat(String(e.hours || 0)), 0);
        if (h < 8) incompleteDays.push({ date: ds, hours: h });
      }
    }
  }
  const snoozeKey = `missing_snooze_${currentUser?.id ?? 0}_${year}_${month}`;
  const [isSnoozed, setIsSnoozed] = useState(false);
  useEffect(() => {
    secureGet(snoozeKey).then(raw => {
      setIsSnoozed(parseInt(raw || '0', 10) > Date.now());
    });
  }, [snoozeKey]);
  const showMissingBanner = (emptyDays.length > 0 || incompleteDays.length > 0) && !isSnoozed;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="viewPane">
      {/* ── Header ── */}
      <div className="viewHeader">
        <div className="headerLeft">
          <h1 className="viewTitle">{t('calendar.title')}</h1>
          <div className="monthNav">
            <button className="navBtn" onClick={() => go(-1)} aria-label={t('calendar.prevMonth')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="monthLabel" style={{ minWidth: 220 }}>
              {new Date(year, month - 1).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              className="navBtn"
              onClick={() => go(1)}
              aria-label={t('calendar.nextMonth')}
              disabled={isCurrentMonth || isFuture}
              style={(isCurrentMonth || isFuture) ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
        <div className="headerRight">
          {currentUser && (
            <UserPicker
              currentUser={currentUser}
              users={users}
              value={effectiveUserId ?? currentUser.id}
              onChange={id => dispatch({ type: 'SET_VIEW_USER', payload: id })}
            />
          )}
          {/* Custom month+year picker (WKWebView on macOS doesn't render
              a popup for native <input type="month">, so we ship our own
              grid + year spinner). */}
          <MonthPicker
            year={year}
            month={month}
            minYear={curY - 4}
            maxYear={curY}
            onChange={(y, m) => {
              if (y > curY || (y === curY && m > curM)) return;
              dispatch({ type: 'SET_YEAR_MONTH', payload: { year: y, month: m } });
            }}
            pillStyle={{ minWidth: 150 }}
          />
          <button
            className="btnToday"
            onClick={() => {
              const now = new Date();
              dispatch({ type: 'SET_YEAR_MONTH', payload: { year: now.getFullYear(), month: now.getMonth() + 1 } });
            }}
          >
            {t('calendar.todayBtn')}
          </button>
          <button
            className="btnRefresh"
            onClick={() => setShowAllEntries(v => !v)}
            title={showAllEntries ? t('calendar.collapseTooltip') : t('calendar.expandTooltip')}
            aria-label={t('calendar.toggleExpandAria')}
            style={showAllEntries ? { background: 'var(--accent-glow)', color: 'var(--accent)' } : undefined}
          >
            {showAllEntries ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
          <button className="btnRefresh" onClick={reload} title={t('calendar.refreshBtn')} disabled={loading}>
            <svg
              width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={loading ? 'spinning' : ''}
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Missing days alert (self-view, current/past months) ── */}
      {showMissingBanner && (
        <div className="missingBanner" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {emptyDays.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                <strong style={{ whiteSpace: 'nowrap' }}>{t('calendar.missingDays', { n: emptyDays.length })}</strong>
                {emptyDays.slice(0, 5).map(d => (
                  <button
                    key={d} type="button" className="missingChip"
                    onClick={() => onBulkOpen(d)} title={t('calendar.missingChipTooltip', { d })}
                  >
                    {d.split('-')[2]}/{d.split('-')[1]}
                  </button>
                ))}
                {emptyDays.length > 5 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>+{t('log.selectedDaysCount', { n: emptyDays.length - 5 })}</span>
                )}
              </div>
            )}
            {incompleteDays.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                <strong style={{ whiteSpace: 'nowrap', color: 'var(--amber, #b45309)' }}>{t('calendar.incompleteDays', { n: incompleteDays.length })}</strong>
                {incompleteDays.slice(0, 5).map(({ date: d, hours: h }) => (
                  <button
                    key={d} type="button" className="missingChip"
                    onClick={() => onBulkOpen(d)} title={t('calendar.incompleteChipTooltip', { d, h: fmtHours(h) })}
                    style={{ borderColor: 'var(--amber, #b45309)', color: 'var(--amber, #b45309)' }}
                  >
                    {d.split('-')[2]}/{d.split('-')[1]} · {fmtHours(h)}h
                  </button>
                ))}
                {incompleteDays.length > 5 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>+{t('log.selectedDaysCount', { n: incompleteDays.length - 5 })}</span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="missingDismiss"
            onClick={() => {
              secureSet(snoozeKey, String(Date.now() + 24 * 60 * 60 * 1000));
              setIsSnoozed(true);
            }}
            title={t('calendar.snoozeTooltip')}
            aria-label={t('calendar.snoozeAria')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Summary strip ── */}
      <div className="summaryStrip">
        <div className="summaryCard">
          <span className="summaryLabel">{t('calendar.totalMonth')}</span>
          <span className="summaryVal">
            {fmtHours(totalH)}<span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> / {targetH}h</span>
          </span>
          <span className="summaryLabel" style={{ textTransform: 'none', letterSpacing: 0, opacity: .8 }}>
            {t('calendar.workingDaysCount', { pct: pctH, days: workingDays })}
          </span>
        </div>
        <div className="summaryCard">
          <span className="summaryLabel">{t('calendar.averagePerDay')}</span>
          <span className="summaryVal">{fmtHours(avgH)}h</span>
        </div>
        <div className="summaryCard">
          <span className="summaryLabel">{t('calendar.loggedDaysCount')}</span>
          <span className="summaryVal">{logDays}</span>
        </div>
        <div className="summaryCard">
          <span className="summaryLabel">{t('calendar.todayLogged')}</span>
          <span className="summaryVal">{todayH > 0 ? `${fmtHours(todayH)}h` : '--'}</span>
        </div>
      </div>

      {/* ── Calendar ── */}
      <div className="calendarWrap">
        <div className="calHeaderRow">
          {[
            t('calendar.mon'),
            t('calendar.tue'),
            t('calendar.wed'),
            t('calendar.thu'),
            t('calendar.fri'),
            t('calendar.sat'),
            t('calendar.sun'),
          ].map((d, i) => (
            <div key={d} className={`calDow${i >= 5 ? ' calDowWeekend' : ''}`}>{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="loadingState">
            <div className="loadingSpinner" />
            <p>{t('calendar.loading')}</p>
          </div>
        ) : (
          <div className={`calGrid${showAllEntries ? ' calGridExpanded' : ''}`}>
            {cells.map(({ day, dateStr, curMonth, dow }) => {
              const entries = timeEntries[dateStr] ?? [];
              const hasEntries = entries.length > 0;
              const isToday = dateStr === today;
              const isWeekend = dow >= 5;
              const isFutureDate = dateStr > today;
              const canLogCell = isViewingSelf && !isWeekend && !isFutureDate;
              const total = entries.reduce((s, e) => s + parseFloat(String(e.hours || 0)), 0);

              const isIncomplete = curMonth && !isWeekend && hasEntries && total < 8;
              const cellClass = [
                'calCell',
                !curMonth ? 'calCellOtherMonth' : '',
                isWeekend ? 'calCellWeekend' : '',
                isToday ? 'calCellToday' : '',
                hasEntries ? 'calCellHasEntries' : '',
                isIncomplete ? 'calCellIncomplete' : '',
              ].filter(Boolean).join(' ');

              return (
                <div
                  key={dateStr + String(curMonth)}
                  className={cellClass}
                  onContextMenu={e => {
                    e.preventDefault();
                    setCtx({ x: e.clientX, y: e.clientY, date: dateStr, hasEntries });
                  }}
                  onClick={() => {
                    if (hasEntries) setDetailDate(dateStr);
                    else if (canLogCell && curMonth) onBulkOpen(dateStr);
                  }}
                >
                  <div className="calDate">{day}</div>

                  {hasEntries && (
                    <>
                      <div className="calEntries">
                        {(showAllEntries ? entries : entries.slice(0, 2)).map(e => {
                          const issueName = e.issue?.name || (e.issue ? `#${e.issue.id}` : 'No issue');
                          const issueId = e.issue?.id;
                          const parentId = e.issue?.parentId;
                          const issueUrl = issueId ? `${state.config?.redmineUrl}/issues/${issueId}` : null;
                          const parentUrl = parentId ? `${state.config?.redmineUrl}/issues/${parentId}` : null;
                          return (
                            <div
                              key={e.id}
                              className="calEntryTag"
                              onClick={ev => { ev.stopPropagation(); setDetailDate(dateStr); }}
                              title={issueName}
                            >
                              <div className="calEntryRow1">
                                {issueUrl
                                  ? <a className="calEntryId" href={issueUrl} onClick={ev => { ev.stopPropagation(); ev.preventDefault(); openExternal(issueUrl); }}>#{issueId}</a>
                                  : null
                                }
                                <span className="calEntryName">{issueName}</span>
                                <span className="calEntryHours">{fmtHours(e.hours)}h</span>
                              </div>
                            </div>
                          );
                        })}
                        {!showAllEntries && entries.length > 2 && (
                          <button
                            className="calEntryTag calEntryTagMore"
                            onClick={ev => { ev.stopPropagation(); setDetailDate(dateStr); }}
                          >
                            {t('calendar.moreCount', { n: entries.length - 2 })}
                          </button>
                        )}
                      </div>
                      <div className={`calTotal${total >= 8 ? ' calTotalHigh' : ''}`}>
                        {fmtHours(total)}h
                      </div>
                      {canLogCell && (
                        <button
                          className="calAddBtn"
                          onClick={ev => { ev.stopPropagation(); onBulkOpen(dateStr); }}
                          title={t('calendar.logMoreTooltip')}
                          aria-label={t('calendar.logMoreAria')}
                        >+</button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {ctx && (() => {
        const ctxDow = new Date(ctx.date).getDay();
        const ctxCanLog = isViewingSelf && ctxDow !== 0 && ctxDow !== 6 && ctx.date <= today;
        return (
          <ContextMenu
            x={ctx.x} y={ctx.y} hasEntries={ctx.hasEntries}
            canLog={ctxCanLog}
            onLog={() => { onBulkOpen(ctx.date); setCtx(null); }}
            onView={() => { setDetailDate(ctx.date); setCtx(null); }}
            onClose={() => setCtx(null)}
          />
        );
      })()}

      <DetailModal
        date={detailDate}
        onClose={() => setDetailDate(null)}
        onAddEntry={() => { onBulkOpen(detailDate); setDetailDate(null); }}
      />
    </div>
  );
}
