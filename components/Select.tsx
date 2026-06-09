'use client';

/**
 * Simple non-searchable dropdown — visually matches SearchableSelect's
 * closed pill + popup panel (used by issue picker, user picker, etc.).
 */

import React, { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';

export interface SelectOption<V extends string | number> {
  value: V;
  label: string;
  subLabel?: string;
}

export interface SelectProps<V extends string | number> {
  options: SelectOption<V>[];
  value: V;
  onChange: (value: V) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  pillStyle?: React.CSSProperties;
  /** Max dropdown height (px). */
  maxHeight?: number;
}

export default function Select<V extends string | number>({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  className = 'selectPill',
  pillStyle,
  maxHeight = 280,
}: SelectProps<V>) {
  const t = useT();
  const actualPlaceholder = placeholder ?? t('common.select');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(v: V) {
    onChange(v);
    setOpen(false);
  }

  const current = options.find(o => o.value === value);
  const displayLabel = current?.label ?? '';

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={className}
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        style={{
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: disabled ? 0.5 : 1,
          ...pillStyle,
        }}
      >
        <span style={{
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: current ? undefined : 'var(--text-muted, #6B6B68)',
        }}>
          {displayLabel || actualPlaceholder}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.5" style={{ opacity: 0.5, flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 160,
            maxHeight,
            overflowY: 'auto',
            background: 'var(--card, #FFFFFF)',
            border: '1px solid var(--border, rgba(55,53,47,.12))',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(15,15,15,.10), 0 1px 4px rgba(15,15,15,.06)',
            zIndex: 50,
            padding: 4,
          }}
        >
          {options.map(o => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  width: '100%',
                  padding: '8px 10px',
                  border: 0,
                  background: isSelected ? 'var(--accent-bg, rgba(35,131,226,.12))' : 'transparent',
                  color: 'var(--text, #37352F)',
                  cursor: 'pointer',
                  borderRadius: 6,
                  fontSize: '.85rem',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--hover, rgba(55,53,47,.06))'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {o.label}
                </span>
                {o.subLabel && (
                  <span style={{ fontSize: '.7rem', opacity: 0.6, marginLeft: 8, flexShrink: 0 }}>
                    {o.subLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
