'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from './AppContext';
import { createTimeEntry, fetchTimeEntries } from '@/lib/redmine';
import { getFavorites, toggleFavorite, type FavoriteIssue } from '@/lib/favorites';
import type { RedmineActivity } from '@/lib/types';
import SearchableSelect from './SearchableSelect';
import IssueSearchInput, { type IssueOption } from './IssueSearchInput';
import { useI18n } from '@/lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (loggedDates: string[]) => void;
  /** If provided, pre-select this date in the picker and jump to its month. */
  initialDate?: string | null;
  /** If provided, pre-fill the issue input. */
  initialIssue?: { id: number; subject: string } | null;
}

function padDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

type SubmitStatus = 'idle' | 'running' | 'done';

export default function BulkLogModal({ isOpen, onClose, onSuccess, initialDate, initialIssue }: Props) {
  const { state, showToast } = useApp();
  const { locale, t } = useI18n();

  // Form fields
  const [issueText, setIssueText] = useState('');
  const [issueId, setIssueId] = useState<number | null>(null);
  const [hours, setHours] = useState('');
  const [activityId, setActivityId] = useState<number>(
    state.activities.find(a => a.is_default)?.id ?? state.activities[0]?.id ?? 0,
  );
  const [comment, setComment] = useState('');

  // Date picker state (follows current app month but can navigate independently)
  const [pickerYear, setPickerYear] = useState(state.year);
  const [pickerMonth, setPickerMonth] = useState(state.month);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Favorites
  const [favorites, setFavorites] = useState<FavoriteIssue[]>([]);

  // Submit progress
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [error, setError] = useState('');

  // Days already logged for the selected issue in the picker month
  const [loggedDates, setLoggedDates] = useState<Map<string, number>>(new Map());
  const [loadingLogged, setLoadingLogged] = useState(false);

  // Sync picker to app month (or initialDate) when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (initialDate) {
      const [y, m] = initialDate.split('-').map(Number);
      setPickerYear(y); setPickerMonth(m);
    } else {
      setPickerYear(state.year); setPickerMonth(state.month);
    }
  }, [isOpen, initialDate, state.year, state.month]);

  // Reset form on open + pre-select initialDate / initialIssue if provided
  useEffect(() => {
    if (!isOpen) return;
    if (initialIssue) {
      setIssueText(`#${initialIssue.id} — ${initialIssue.subject}`);
      setIssueId(initialIssue.id);
    } else {
      setIssueText(''); setIssueId(null);
    }
    setHours(''); setComment('');
    setSelected(initialDate ? new Set([initialDate]) : new Set());
    setError(''); setStatus('idle'); setProgress({ done: 0, total: 0, errors: 0 });
    setLoggedDates(new Map());
    const def = state.activities.find(a => a.is_default) ?? state.activities[0];
    if (def) setActivityId(def.id);
    if (state.currentUser && state.config) getFavorites(state.config.redmineUrl, state.currentUser.id).then(setFavorites);
  }, [isOpen, initialDate, initialIssue, state.activities, state.currentUser]);

  // Recent issues from current month entries
  const recentIssues: FavoriteIssue[] = (() => {
    if (!state.currentUser) return [];
    const counts = new Map<number, { count: number; subject: string }>();
    for (const dayEntries of Object.values(state.timeEntries)) {
      for (const e of dayEntries) {
        if (!e.issue?.id) continue;
        const cur = counts.get(e.issue.id) ?? { count: 0, subject: e.issue.name ?? `#${e.issue.id}` };
        cur.count++;
        counts.set(e.issue.id, cur);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([id, info]) => ({ id, subject: info.subject }));
  })();

  function handleToggleFav(issue: IssueOption) {
    if (!state.currentUser || !state.config) return;
    toggleFavorite(state.config.redmineUrl, state.currentUser.id, issue).then(setFavorites);
  }

  // Load days where current user already logged time for the selected issue
  // in the picker month — visual marker on the mini calendar.
  useEffect(() => {
    if (!isOpen || !issueId || !state.config || !state.currentUser) {
      setLoggedDates(new Map());
      return;
    }
    let cancelled = false;
    setLoadingLogged(true);
    (async () => {
      try {
        const from = padDate(pickerYear, pickerMonth, 1);
        const to = padDate(pickerYear, pickerMonth, new Date(pickerYear, pickerMonth, 0).getDate());
        const entries = await fetchTimeEntries(state.config!, state.currentUser!.id, from, to);
        if (cancelled) return;
        const map = new Map<string, number>();
        for (const e of entries) {
          if (e.issue?.id !== issueId) continue;
          const h = parseFloat(String(e.hours || 0));
          map.set(e.spent_on, (map.get(e.spent_on) ?? 0) + h);
        }
        setLoggedDates(map);
      } catch {
        if (!cancelled) setLoggedDates(new Map());
      } finally {
        if (!cancelled) setLoadingLogged(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, issueId, pickerYear, pickerMonth, state.config, state.currentUser]);

  // Calendar picker helpers
  const nowForPicker = new Date();
  const nowPickerY = nowForPicker.getFullYear();
  const nowPickerM = nowForPicker.getMonth() + 1;
  const isPickerAtCurrentMonth = pickerYear === nowPickerY && pickerMonth === nowPickerM;

  function navMonth(delta: number) {
    let m = pickerMonth + delta, y = pickerYear;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    if (y > nowPickerY || (y === nowPickerY && m > nowPickerM)) return;
    setPickerYear(y); setPickerMonth(m);
  }

  function toggleDate(dateStr: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(dateStr) ? next.delete(dateStr) : next.add(dateStr);
      return next;
    });
  }

  function selectWeekdays() {
    const todayRef = padDate(nowPickerY, nowPickerM, nowForPicker.getDate());
    const daysInMonth = new Date(pickerYear, pickerMonth, 0).getDate();
    setSelected(prev => {
      const next = new Set(prev);
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = padDate(pickerYear, pickerMonth, d);
        const dow = new Date(pickerYear, pickerMonth - 1, d).getDay();
        if (dow !== 0 && dow !== 6 && ds <= todayRef) next.add(ds);
      }
      return next;
    });
  }

  function clearSelection() { setSelected(new Set()); }

  // Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const h = parseFloat(hours);
    if (!h || h <= 0) { setError(t('log.errInvalidHours')); return; }
    if (!activityId) { setError(t('log.errMissingActivity')); return; }
    if (selected.size === 0) { setError(t('log.errNoDaysSelected')); return; }
    if (!state.config) return;

    let finalIssueId = issueId;
    if (!finalIssueId) {
      const m = issueText.match(/#?(\d+)/);
      if (m) finalIssueId = parseInt(m[1], 10);
    }

    const dates = Array.from(selected).sort();
    setStatus('running');
    setProgress({ done: 0, total: dates.length, errors: 0 });

    let errorCount = 0;
    for (const dateStr of dates) {
      try {
        await createTimeEntry(state.config, {
          spent_on: dateStr,
          hours: h,
          activity_id: activityId,
          comments: comment,
          ...(finalIssueId ? { issue_id: finalIssueId } : {}),
        });
      } catch {
        errorCount++;
      }
      setProgress(p => ({ ...p, done: p.done + 1, errors: errorCount }));
    }

    setStatus('done');
    const successCount = dates.length - errorCount;
    if (successCount > 0) {
      showToast(t('log.toastSuccess', { done: successCount, total: dates.length }), 'success');
      onSuccess(dates);
      onClose();
    }
    if (errorCount > 0) {
      showToast(t('log.toastError', { errors: errorCount }), 'error');
    }
  }

  if (!isOpen) return null;

  // Build calendar cells
  const firstDow = (new Date(pickerYear, pickerMonth - 1, 1).getDay() + 6) % 7;
  const daysInMo = new Date(pickerYear, pickerMonth, 0).getDate();
  const daysInPrev = new Date(pickerYear, pickerMonth - 1, 0).getDate();
  const todayStr = padDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

  type PCell = { day: number; dateStr: string; cur: boolean; dow: number };
  const cells: PCell[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    const pm = pickerMonth === 1 ? 12 : pickerMonth - 1;
    const py = pickerMonth === 1 ? pickerYear - 1 : pickerYear;
    cells.push({ day: daysInPrev - i, dateStr: padDate(py, pm, daysInPrev - i), cur: false, dow: cells.length % 7 });
  }
  for (let d = 1; d <= daysInMo; d++) {
    cells.push({ day: d, dateStr: padDate(pickerYear, pickerMonth, d), cur: true, dow: cells.length % 7 });
  }
  while (cells.length % 7 !== 0) {
    const nm = pickerMonth === 12 ? 1 : pickerMonth + 1;
    const ny = pickerMonth === 12 ? pickerYear + 1 : pickerYear;
    const d = cells.length - firstDow - daysInMo + 1;
    cells.push({ day: d, dateStr: padDate(ny, nm, d), cur: false, dow: cells.length % 7 });
  }

  const pickerLabel = new Date(pickerYear, pickerMonth - 1, 1).toLocaleDateString(
    locale === 'vi' ? 'vi-VN' : 'en-US',
    { month: 'long', year: 'numeric' }
  );

  return (
    <div
      className="modalOverlay"
      role="dialog" aria-modal aria-label={t('sidebar.logTime')}
      onClick={e => e.target === e.currentTarget && status !== 'running' && onClose()}
    >
      <form className="modalBox bulkBox" onSubmit={handleSubmit}>
        <div className="modalHeader">
          <div className="modalIcon bulkIcon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="8" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="13" y2="18" />
            </svg>
          </div>
          <div>
            <h2 className="modalTitle">{t('sidebar.logTime')}</h2>
            <p className="modalSubtitle">{t('log.subtitle')}</p>
          </div>
          <button type="button" className="closeBtn" onClick={onClose} disabled={status === 'running'} aria-label={t('common.close')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="bulkLayout">
          {/* ─── Left: Form fields ─── */}
          <div className="bulkLeft">
            <div className="fieldGroup">
              <label className="fieldLabel" htmlFor="bulk-issue">Issue</label>
              <IssueSearchInput
                inputId="bulk-issue"
                value={issueText}
                onChange={(text, id) => { setIssueText(text); setIssueId(id); }}
                favorites={favorites}
                recentIssues={recentIssues}
                onToggleFav={handleToggleFav}
                disabled={status === 'running'}
              />
            </div>

            <div className="formRow">
              <div className="fieldGroup flex1">
                <label className="fieldLabel" htmlFor="bulk-hours">{t('log.hoursPerDay')}</label>
                <input
                  id="bulk-hours" className="fieldInput" type="number"
                  min="0.25" max="24" step="0.25" placeholder="e.g. 8"
                  value={hours} onChange={e => setHours(e.target.value)}
                  disabled={status === 'running'} required
                />
              </div>
              <div className="fieldGroup flex1">
                <label className="fieldLabel">Activity</label>
                <SearchableSelect<RedmineActivity>
                  items={state.activities}
                  value={state.activities.find(a => a.id === activityId) ?? null}
                  onChange={a => setActivityId(a.id)}
                  getKey={a => a.id}
                  getLabel={a => a.name}
                  placeholder={t('log.selectActivity')}
                  required
                  disabled={status === 'running'}
                  className="fieldInput fieldSelect"
                />
              </div>
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel" htmlFor="bulk-comment">{t('log.descriptionLabel')}</label>
              <textarea
                id="bulk-comment" className="fieldInput fieldTextarea"
                placeholder={t('log.descriptionPlaceholder')} rows={3}
                value={comment} onChange={e => setComment(e.target.value)}
                disabled={status === 'running'}
              />
            </div>

            {/* Progress bar */}
            {status !== 'idle' && (
              <div className="bulkProgress">
                <div className="bulkProgressHeader">
                  <span>
                    {status === 'running'
                      ? t('log.progressLogging', { done: progress.done, total: progress.total })
                      : progress.errors > 0
                        ? t('log.progressCompleteWithErrors', { success: progress.done - progress.errors, errors: progress.errors })
                        : t('log.progressCompleteSuccessOnly', { success: progress.done })
                    }
                  </span>
                  <span className="bulkProgressPct">{Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%</span>
                </div>
                <div className="bulkProgressTrack">
                  <div
                    className={`bulkProgressFill${progress.errors > 0 ? ' bulkProgressFillErr' : ''}`}
                    style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {error && <div className="errorBanner">{error}</div>}
          </div>

          {/* ─── Right: Date picker ─── */}
          <div className="bulkRight">
            <div className="pickerHeader">
              <button type="button" className="navBtn" onClick={() => navMonth(-1)} aria-label={t('calendar.prevMonth')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="pickerMonthLabel">{pickerLabel}</span>
              <button
                type="button" className="navBtn" onClick={() => navMonth(1)} aria-label={t('calendar.nextMonth')}
                disabled={isPickerAtCurrentMonth}
                style={isPickerAtCurrentMonth ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <div className="pickerActions">
              <button type="button" className="pickerActionBtn" onClick={selectWeekdays}>{t('log.weekdays')}</button>
              <button type="button" className="pickerActionBtn" onClick={clearSelection}>{t('log.clearSelection')}</button>
              <span className="pickerCount">
                {t('log.selectedDaysCount', { n: selected.size })}
              </span>
              {issueId && (
                <span
                  className="pickerCount"
                  style={{ color: 'var(--green, #10b981)', marginLeft: 'auto' }}
                  title={loadingLogged ? t('common.loading') : t('log.loggedTooltip', { n: loggedDates.size })}
                >
                  {loadingLogged ? '…' : t('log.loggedCount', { n: loggedDates.size })}
                </span>
              )}
            </div>

            <div className="miniCalHeader">
              {[
                t('calendar.mon'),
                t('calendar.tue'),
                t('calendar.wed'),
                t('calendar.thu'),
                t('calendar.fri'),
                t('calendar.sat'),
                t('calendar.sun'),
              ].map((d, i) => (
                <div key={d} className={`miniDow${i >= 5 ? ' miniDowWeekend' : ''}`}>{d}</div>
              ))}
            </div>

            <div className="miniCalGrid">
              {cells.map(({ day, dateStr, cur, dow }) => {
                const isSel = selected.has(dateStr);
                const isToday = dateStr === todayStr;
                const isWeekend = dow >= 5;
                const isFutureDate = dateStr > todayStr;
                const isDisabled = !cur || isWeekend || isFutureDate || status === 'running';
                const loggedHours = cur ? loggedDates.get(dateStr) : undefined;
                const hasLogged = loggedHours !== undefined && loggedHours > 0;
                return (
                  <button
                    key={dateStr + String(cur)}
                    type="button"
                    disabled={isDisabled}
                    className={[
                      'miniCell',
                      !cur ? 'miniCellOther' : '',
                      isWeekend ? 'miniCellWeekend' : '',
                      isFutureDate && cur ? 'miniCellOther' : '',
                      isToday ? 'miniCellToday' : '',
                      isSel ? 'miniCellSelected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => !isDisabled && toggleDate(dateStr)}
                    title={hasLogged
                      ? t('log.dayLoggedInfo', { dateStr, hours: loggedHours })
                      : dateStr}
                    style={hasLogged && !isSel ? {
                      boxShadow: 'inset 0 0 0 1.5px var(--green, #10b981)',
                    } : undefined}
                  >
                    {day}
                    {hasLogged && (
                      <span style={{
                        position: 'absolute',
                        bottom: 2,
                        right: 2,
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--green, #10b981)',
                      }} />
                    )}
                    {isSel && (
                      <span className="miniCheckmark">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modalActions">
          <button type="button" className="btnSecondary" onClick={onClose} disabled={status === 'running'}>
            {status === 'done' ? t('common.close') : t('common.cancel')}
          </button>
          {status !== 'done' && (
            <button type="submit" className="btnPrimary btnPrimaryAmber" disabled={status === 'running' || selected.size === 0}>
              {status === 'running'
                ? <><span className="spinner" /> {t('log.loggingBtn')}</>
                : <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="22 2 11 13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  {selected.size > 0 ? t('log.submitBtnCount', { n: selected.size }) : t('log.submitBtnBulk')}
                </>
              }
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
