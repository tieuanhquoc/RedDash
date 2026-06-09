'use client';

import React from 'react';
import { useApp } from './AppContext';
import { useT } from '@/lib/i18n';

interface Props {
  x: number;
  y: number;
  hasEntries: boolean;
  canLog?: boolean;
  onLog: () => void;
  onView: () => void;
  onClose: () => void;
}

export default function ContextMenu({ x, y, hasEntries, canLog = true, onLog, onView, onClose }: Props) {
  const t = useT();

  // Clamp to viewport
  const itemCount = (canLog ? 1 : 0) + (hasEntries ? 1 : 0);
  const mw = 180, mh = Math.max(44, itemCount * 44);
  const left = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth  : 1200) - mw - 8);
  const top  = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 900)  - mh - 8);

  return (
    <>
      {/* Invisible backdrop to close on outside click */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 998 }}
        onContextMenu={e => { e.preventDefault(); onClose(); }}
        onClick={onClose}
      />
      <div
        className="contextMenu"
        style={{ left, top, zIndex: 999 }}
        role="menu"
      >
        {canLog && (
          <button className="ctxItem" onClick={onLog} role="menuitem">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {t('calendar.ctxLogTime')}
          </button>
        )}
        {hasEntries && (
          <button className="ctxItem" onClick={onView} role="menuitem">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            {t('calendar.ctxViewDetails')}
          </button>
        )}
      </div>
    </>
  );
}
