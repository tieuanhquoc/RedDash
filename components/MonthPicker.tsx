'use client';

/**
 * MonthPicker — custom month+year picker. WKWebView (Safari) doesn't
 * render a popup for <input type="month">, so we build our own.
 *
 * Behaviour:
 * - Closed pill shows "Tháng 6 năm 2026" / "June 2026".
 * - Click opens a popup below the pill: year spinner (‹ year ›) + 4×3
 *   grid of months + a "Tháng này" / "This month" button to jump to
 *   the current month.
 * - Click outside closes. Year range is capped: max = current year
 *   (so future months are unreachable), min = current year - 10.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useI18n } from '@/lib/i18n';

export interface MonthPickerProps {
  year: number;
  month: number;            // 1-12
  onChange: (year: number, month: number) => void;
  /** Inclusive lower bound. Default: current year - 10. */
  minYear?: number;
  /** Inclusive upper bound. Default: current year. */
  maxYear?: number;
  /** When provided, "This month" / "Tháng này" is hidden. */
  hideCurrentShortcut?: boolean;
  pillStyle?: React.CSSProperties;
}

const MONTH_KEYS_VI = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

function monthLabel(locale: string, m: number): string {
  if (locale === 'vi') return MONTH_KEYS_VI[m - 1];
  const name = new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  // "Jun" → "Jun" (keep 3-letter form, matches Apple's month grid)
  return name;
}

export default function MonthPicker({
  year, month, onChange,
  minYear, maxYear, hideCurrentShortcut, pillStyle,
}: MonthPickerProps) {
  const { locale, t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Year shown in the popup header. Independent of the committed `year`
  // so the user can browse years without committing until they click a
  // month. Defaults to the committed value.
  const [viewYear, setViewYear] = useState(year);

  const curY = new Date().getFullYear();
  const curM = new Date().getMonth() + 1;
  const minY = minYear ?? curY - 10;
  const maxY = maxYear ?? curY;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // When opening, reset the spinner year to the committed year.
  useEffect(() => {
    if (open) setViewYear(year);
  }, [open, year]);

  // Disable months that are in the future (only the current year, since
  // maxY === curY caps the year range).
  const isMonthDisabled = useCallback(
    (y: number, m: number) => y > curY || (y === curY && m > curM),
    [curY, curM],
  );

  const isSelected = (m: number) => viewYear === year && m === month;
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="selectPill"
        onClick={() => setOpen(v => !v)}
        style={{
          textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          ...pillStyle,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {monthLabel(locale, month)} {year}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.5" style={{ opacity: 0.5, flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="monthPickerPopup" role="dialog" aria-label={t('calendar.selectMonth')}>
          {/* Year header with prev/next spinners */}
          <div className="monthPickerHeader">
            <button
              type="button"
              className="monthPickerSpinner"
              onClick={() => setViewYear(y => Math.max(minY, y - 1))}
              disabled={viewYear <= minY}
              aria-label="Previous year"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="monthPickerYear">{viewYear}</div>
            <button
              type="button"
              className="monthPickerSpinner"
              onClick={() => setViewYear(y => Math.min(maxY, y + 1))}
              disabled={viewYear >= maxY}
              aria-label="Next year"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* 4 cols × 3 rows month grid */}
          <div className="monthPickerGrid">
            {Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              const isThisMonth = viewYear === curY && m === curM;
              const isFuture = isMonthDisabled(viewYear, m);
              return (
                <button
                  key={m}
                  type="button"
                  className={[
                    'monthPickerCell',
                    isSelected(m) ? 'monthPickerCellActive' : '',
                    isThisMonth && !isSelected(m) ? 'monthPickerCellToday' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={isFuture}
                  onClick={() => {
                    onChange(viewYear, m);
                    setOpen(false);
                  }}
                >
                  {monthLabel(locale, m)}
                </button>
              );
            })}
          </div>

          {/* Footer: jump to current month */}
          {!hideCurrentShortcut && (
            <div className="monthPickerFooter">
              <button
                type="button"
                className="monthPickerFooterBtn monthPickerFooterBtnPrimary"
                onClick={() => {
                  onChange(curY, curM);
                  setOpen(false);
                }}
              >
                {locale === 'vi' ? 'Tháng này' : 'This month'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
