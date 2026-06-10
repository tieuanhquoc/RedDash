'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useT } from '@/lib/i18n';

export interface SearchableSelectProps<T> {
  items: T[];
  value: T | null;
  onChange: (item: T) => void;
  getKey: (item: T) => string | number;
  getLabel: (item: T) => string;
  /** Optional secondary text (rendered muted, right-aligned). */
  getSubLabel?: (item: T) => string | undefined;
  /** Custom filter; default = substring match on label/subLabel. */
  filterFn?: (item: T, query: string) => boolean;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** Max dropdown height (px). */
  maxHeight?: number;
  /** Inline style for the closed-state pill button. */
  pillStyle?: React.CSSProperties;
}

export default function SearchableSelect<T>({
  items,
  value,
  onChange,
  getKey,
  getLabel,
  getSubLabel,
  filterFn,
  placeholder,
  emptyMessage,
  disabled,
  required,
  className = 'selectPill',
  maxHeight = 280,
  pillStyle,
}: SearchableSelectProps<T>) {
  const t = useT();
  const actualPlaceholder = placeholder ?? t('common.select');
  const actualEmptyMessage = emptyMessage ?? t('common.noResults');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultFilter = useCallback((item: T, q: string) => {
    const l = q.toLowerCase();
    return getLabel(item).toLowerCase().includes(l)
      || (getSubLabel?.(item) ?? '').toLowerCase().includes(l);
  }, [getLabel, getSubLabel]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    const f = filterFn ?? defaultFilter;
    return items.filter(item => f(item, q));
  }, [items, query, filterFn, defaultFilter]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function pick(item: T) {
    onChange(item);
    setOpen(false);
    setQuery('');
  }

  const displayLabel = value ? getLabel(value) : '';

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {!open ? (
        <button
          type="button"
          className={className}
          onClick={() => !disabled && setOpen(true)}
          disabled={disabled}
          aria-required={required}
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
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                         color: value ? undefined : 'var(--text-muted, #6B6B68)' }}>
            {displayLabel || actualPlaceholder}
          </span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5, flexShrink: 0 }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ) : (
        <input
          ref={inputRef}
          className={className}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('common.searchWithName', { name: actualPlaceholder.toLowerCase() })}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setQuery(''); }
            if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); pick(filtered[0]); }
          }}
        />
      )}

      {open && (
        <div
          className="dropdownPopup"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            minWidth: 200,
            maxHeight,
            overflowY: 'auto',
            border: '1px solid var(--border, rgba(55,53,47,.12))',
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(15,15,15,.10), 0 1px 4px rgba(15,15,15,.06)",
            zIndex: 1000,
            padding: 4,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', color: 'var(--text-muted, #6B6B68)', fontSize: '.85rem' }}>
              {actualEmptyMessage}
            </div>
          ) : (
            filtered.map(item => {
              const key = getKey(item);
              const label = getLabel(item);
              const sub = getSubLabel?.(item);
              const isSelected = value !== null && getKey(value) === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pick(item)}
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
                    {label}
                  </span>
                  {sub && (
                    <span style={{ fontSize: '.7rem', opacity: 0.6, marginLeft: 8, flexShrink: 0 }}>
                      {sub}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
