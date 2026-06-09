'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from './AppContext';
import {
  getFavorites, toggleFavorite, FAVORITES_MAX, type FavoriteIssue,
} from '@/lib/favorites';
import IssueSearchInput, { type IssueOption } from './IssueSearchInput';
import { useT } from '@/lib/i18n';

interface FavoritesViewProps {
  /** Open Log Time modal — optionally with date pre-selected & issue pre-filled. */
  onLog: (date?: string | null, issue?: { id: number; subject: string } | null) => void;
}

export default function FavoritesView({ onLog }: FavoritesViewProps) {
  const t = useT();
  const { state, showToast } = useApp();
  const [favorites, setFavorites] = useState<FavoriteIssue[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (state.currentUser && state.config) getFavorites(state.config.redmineUrl, state.currentUser.id).then(setFavorites);
  }, [state.currentUser, state.config]);

  function addFavorite(issue: IssueOption) {
    if (!state.currentUser || !state.config) return;
    if (favorites.length >= FAVORITES_MAX && !favorites.some(f => f.id === issue.id)) {
      showToast(t('favorites.limitToast', { max: FAVORITES_MAX }), 'error');
      return;
    }
    toggleFavorite(state.config.redmineUrl, state.currentUser.id, issue).then(setFavorites);
    setSearch('');
    showToast(t('favorites.pinnedToast', { id: issue.id }), 'success');
  }

  function removeFavorite(issue: FavoriteIssue) {
    if (!state.currentUser || !state.config) return;
    toggleFavorite(state.config.redmineUrl, state.currentUser.id, issue).then(setFavorites);
  }

  return (
    <div className="viewPane">
      <div className="viewHeader">
        <div className="headerLeft">
          <h1 className="viewTitle">{t('favorites.title')}</h1>
          <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>
            {favorites.length} / {FAVORITES_MAX}
          </span>
        </div>
      </div>

      <div className="fieldGroup" style={{ marginBottom: '1rem' }}>
        <label className="fieldLabel">{t('favorites.addLabel')}</label>
        <IssueSearchInput
          value={search}
          onChange={(text) => setSearch(text)}
          onSelect={addFavorite}
          onToggleFav={(issue) => {
            if (!state.currentUser || !state.config) return;
            toggleFavorite(state.config.redmineUrl, state.currentUser.id, issue).then(setFavorites);
          }}
          favorites={favorites}
          placeholder={t('favorites.addPlaceholder')}
        />
      </div>

      {favorites.length === 0 ? (
        <div style={{
          padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)',
          background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-xl)',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📌</div>
          <p style={{ marginBottom: '.4rem' }}>{t('favorites.emptyText')}</p>
          <p style={{ fontSize: '.82rem' }}>
            {t('favorites.emptyDesc', { max: FAVORITES_MAX })}
          </p>
        </div>
      ) : (
        <div className="favList">
          {favorites.map((f, i) => (
            <div key={f.id} className="favItem">
              <span className="favOrder">{i + 1}</span>
              <span className="issueId">#{f.id}</span>
              <span className="favSubject" title={f.subject} style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.subject}</span>
                {f.project?.name && (
                  <span style={{ display: 'block', fontSize: '.73rem', color: 'var(--text-muted)', marginTop: 1 }}>{f.project.name}</span>
                )}
              </span>
              <button
                type="button"
                className="favLogBtn"
                onClick={() => onLog(null, { id: f.id, subject: f.subject })}
                title={t('favorites.logTimeTitle')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {t('common.log')}
              </button>
              <button
                type="button"
                className="favRemoveBtn"
                onClick={() => removeFavorite(f)}
                title={t('favorites.unpinTitle')}
                aria-label={t('common.delete')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
