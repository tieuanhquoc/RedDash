'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { RedmineUser } from '@/lib/types';

interface UserPickerProps {
  currentUser: RedmineUser;
  users: RedmineUser[];
  value: number;
  onChange: (userId: number) => void;
}

function fullName(u: RedmineUser): string {
  return `${u.firstname ?? ''} ${u.lastname ?? ''}`.trim() || u.login || `#${u.id}`;
}

export default function UserPicker({ currentUser, users, value, onChange }: UserPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const merged = useMemo(() => {
    const others = users.filter(u => u.id !== currentUser.id);
    return [currentUser, ...others];
  }, [users, currentUser]);

  const selected = merged.find(u => u.id === value) ?? currentUser;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter(u => {
      const name = fullName(u).toLowerCase();
      const login = (u.login ?? '').toLowerCase();
      const mail = (u.mail ?? '').toLowerCase();
      return name.includes(q) || login.includes(q) || mail.includes(q);
    });
  }, [merged, query]);

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
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  function pick(userId: number) {
    onChange(userId);
    setOpen(false);
    setQuery('');
  }

  const displayLabel = selected.id === currentUser.id
    ? `${fullName(currentUser)} (bạn)`
    : fullName(selected);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {!open ? (
        <button
          type="button"
          className="selectPill"
          onClick={() => setOpen(true)}
          title="Chọn user"
          style={{
            maxWidth: 220,
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayLabel}
          </span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5 }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ) : (
        <input
          ref={inputRef}
          className="selectPill"
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Tìm user…"
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setQuery(''); }
            if (e.key === 'Enter' && filtered[0]) { pick(filtered[0].id); }
          }}
          style={{ maxWidth: 220 }}
        />
      )}

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            minWidth: 220,
            maxHeight: 280,
            overflowY: 'auto',
            background: 'var(--card, #FFFFFF)',
            border: '1px solid var(--border, rgba(55,53,47,.12))',
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(15,15,15,.10), 0 1px 4px rgba(15,15,15,.06)",
            zIndex: 50,
            padding: 4,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', color: 'var(--text-muted, #6B6B68)', fontSize: '.85rem' }}>
              Không tìm thấy user
            </div>
          ) : (
            filtered.map(u => {
              const isSelected = u.id === selected.id;
              const isSelf = u.id === currentUser.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => pick(u.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
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
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fullName(u)}{isSelf ? ' (bạn)' : ''}
                  </span>
                  {u.mail && (
                    <span style={{ fontSize: '.7rem', opacity: 0.6, marginLeft: 8 }}>
                      {u.mail}
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
