'use client';

/**
 * Shared issue search input used across Log Time modal, Pin page, and Calendar.
 * Dropdown shows: issue ID · subject · project · parent issue.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from './AppContext';
import { searchIssues } from '@/lib/redmine';
import { isFavoriteInList, type FavoriteIssue } from '@/lib/favorites';
import type { RedmineIssue } from '@/lib/types';

export interface IssueOption {
  id: number;
  subject: string;
  project?: { id: number; name: string };
}

interface Props {
  /** Controlled text value */
  value: string;
  /**
   * Called when text changes or user picks an issue.
   * issueId is non-null only when the user picked from dropdown.
   */
  onChange: (text: string, issueId: number | null) => void;
  /**
   * When provided, called on row click instead of filling the input.
   * Useful when selection means something other than populating a text field (e.g. adding to favorites).
   */
  onSelect?: (issue: IssueOption) => void;
  /** Favorites list for ★ indicator and pinned section */
  favorites?: FavoriteIssue[];
  /** Recent issues shown when input is empty */
  recentIssues?: { id: number; subject: string }[];
  onToggleFav?: (issue: IssueOption) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  inputId?: string;
  required?: boolean;
}

function IssueItem({
  issue,
  isFav,
  badge,
  onSelect,
  onToggleFav,
  disabled,
}: {
  issue: { id: number; subject: string; project?: { id: number; name: string }; parent?: { id: number; subject?: string } };
  isFav?: boolean;
  badge?: React.ReactNode;
  onSelect: () => void;
  onToggleFav?: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  const meta = [
    issue.project?.name,
    issue.parent?.subject ? `↑ ${issue.parent.subject}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      className="dropdownItem"
      onClick={onSelect}
      disabled={disabled}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      <span className="issueId">#{issue.id}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {issue.subject}
        </span>
        {meta && (
          <span style={{ display: 'block', fontSize: '.73rem', color: 'var(--text-muted)', marginTop: 1 }}>
            {meta}
          </span>
        )}
      </span>
      {badge}
      {onToggleFav && (
        <span
          className="favStar"
          onClick={e => { e.stopPropagation(); onToggleFav(e); }}
          title={isFav ? 'Bỏ pin' : 'Pin issue này'}
        >
          {isFav ? '★' : '☆'}
        </span>
      )}
    </button>
  );
}

export default function IssueSearchInput({
  value,
  onChange,
  onSelect,
  favorites = [],
  recentIssues = [],
  onToggleFav,
  disabled,
  placeholder = 'ID hoặc tìm kiếm…',
  autoFocus,
  inputId,
  required,
}: Props) {
  const { state } = useApp();
  const [suggestions, setSuggestions] = useState<RedmineIssue[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!showDrop) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowDrop(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showDrop]);

  const handleInput = useCallback((text: string) => {
    onChange(text, null);
    clearTimeout(searchTimer.current);
    setShowDrop(true);
    if (!text.trim() || !state.config) { setSuggestions([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchIssues(state.config!, text.trim(), state.currentUser!.id);
        setSuggestions(results);
      } catch { setSuggestions([]); }
    }, 300);
  }, [state.config, state.currentUser, onChange]);

  function selectIssue(issue: { id: number; subject: string; project?: { id: number; name: string } }) {
    if (onSelect) {
      onSelect(issue);
    } else {
      onChange(`#${issue.id} — ${issue.subject}`, issue.id);
    }
    setShowDrop(false);
    setSuggestions([]);
  }

  const hasQuery = value.trim().length > 0;
  const showFavSection = !hasQuery && favorites.length > 0;
  const showRecentSection = !hasQuery && recentIssues.filter(r => !favorites.some(f => f.id === r.id)).length > 0;

  return (
    <div className="autocompleteWrap" ref={wrapRef}>
      <input
        id={inputId}
        className="fieldInput"
        type="text"
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => setShowDrop(true)}
        onKeyDown={e => e.key === 'Escape' && setShowDrop(false)}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
      />

      {showDrop && (
        <div className="dropdown">
          {/* Search results */}
          {hasQuery && suggestions.map(issue => (
            <IssueItem
              key={`s-${issue.id}`}
              issue={issue}
              isFav={isFavoriteInList(favorites, issue.id)}
              onSelect={() => selectIssue(issue)}
              onToggleFav={onToggleFav ? e => { e.stopPropagation(); onToggleFav(issue); } : undefined}
            />
          ))}
          {hasQuery && suggestions.length === 0 && (
            <div className="dropdownEmpty">Không tìm thấy kết quả</div>
          )}

          {/* Pinned */}
          {showFavSection && (
            <>
              <div className="dropdownHeader">⭐ Pin</div>
              {favorites.map(f => (
                <IssueItem
                  key={`f-${f.id}`}
                  issue={f}
                  isFav
                  onSelect={() => selectIssue(f)}
                  onToggleFav={onToggleFav ? e => { e.stopPropagation(); onToggleFav(f); } : undefined}
                />
              ))}
            </>
          )}

          {/* Recent */}
          {showRecentSection && (
            <>
              <div className="dropdownHeader">🕒 Gần đây</div>
              {recentIssues
                .filter(r => !favorites.some(f => f.id === r.id))
                .map(r => (
                  <IssueItem
                    key={`r-${r.id}`}
                    issue={r}
                    isFav={isFavoriteInList(favorites, r.id)}
                    onSelect={() => selectIssue(r)}
                    onToggleFav={onToggleFav ? e => { e.stopPropagation(); onToggleFav(r); } : undefined}
                  />
                ))}
            </>
          )}

          {!hasQuery && !showFavSection && !showRecentSection && (
            <div className="dropdownEmpty">Gõ để tìm issue, hoặc pin issue thường dùng (★)</div>
          )}
        </div>
      )}
    </div>
  );
}
