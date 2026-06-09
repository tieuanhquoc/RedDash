'use client';

import React, { useState } from 'react';
import { useApp } from './AppContext';
import { deleteTimeEntry } from '@/lib/redmine';
import type { RedmineTimeEntry } from '@/lib/types';
import { useT, useI18n } from '@/lib/i18n';

interface Props {
  date: string | null;
  onClose: () => void;
  onAddEntry: () => void;
}

function fmtHours(h: number | string) {
  const v = parseFloat(String(h) || '0');
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, '');
}

export default function DetailModal({ date, onClose, onAddEntry }: Props) {
  const { state, dispatch, showToast } = useApp();
  const t = useT();
  const { locale } = useI18n();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  if (!date) return null;
  const isViewingSelf = (state.viewUserId ?? state.currentUser?.id) === state.currentUser?.id;

  const entries: RedmineTimeEntry[] = state.timeEntries[date] ?? [];
  const total = entries.reduce((s, e) => s + parseFloat(String(e.hours || 0)), 0);
  const dateLabel = (() => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  })();

  async function confirmDelete(entry: RedmineTimeEntry) {
    if (!state.config || !date) return;
    setConfirmId(null);
    setDeletingId(entry.id);
    try {
      await deleteTimeEntry(state.config, entry.id);
      dispatch({ type: 'REMOVE_TIME_ENTRY', payload: { date, entryId: entry.id } });
      showToast(t('log.deleteSuccess'), 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('403')) {
        showToast(t('log.deleteForbidden'), 'error');
      } else {
        showToast(t('log.deleteError', { msg }), 'error');
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modalBox detailBox">
        <div className="modalHeader">
          <div className="modalIcon modalIconBlue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div>
            <h2 className="modalTitle">{dateLabel}</h2>
            <p className="modalSubtitle">{t('log.totalLabel')}: <strong style={{ color: 'var(--green)' }}>{fmtHours(total)}h</strong> · {entries.length === 1 ? `1 ${t('log.entrySingle')}` : `${entries.length} ${t('log.entryPlural')}`}</p>
          </div>
          <button className="closeBtn" onClick={onClose} aria-label={t('common.close')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="detailList">
          {entries.length === 0
            ? <p className="detailEmpty">{t('common.noData')}</p>
            : entries.map(e => (
              <div key={e.id} className="detailEntry">
                <div className="detailEntryHeader">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="detailIssueName">
                      {e.issue ? (e.issue.name || `Issue #${e.issue.id}`) : t('log.noIssue')}
                    </div>
                    {e.issue && <div className="detailIssueId">#{e.issue.id}</div>}
                  </div>
                  <span className="detailHoursBadge">{fmtHours(e.hours)}h</span>
                  {isViewingSelf && (
                    <button
                      type="button"
                      onClick={() => setConfirmId(e.id)}
                      disabled={deletingId === e.id}
                      title={t('common.delete')}
                      aria-label={t('common.delete')}
                      style={{
                        background: 'transparent', border: 'none',
                        cursor: deletingId === e.id ? 'wait' : 'pointer',
                        color: 'var(--red, #E03E3E)', padding: 4, borderRadius: 4,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        opacity: deletingId === e.id ? 0.4 : 0.65, transition: 'opacity .12s, background .12s',
                      }}
                      onMouseEnter={ev => { ev.currentTarget.style.opacity = '1'; ev.currentTarget.style.background = 'rgba(224,62,62,.10)'; }}
                      onMouseLeave={ev => { ev.currentTarget.style.opacity = deletingId === e.id ? '0.4' : '0.65'; ev.currentTarget.style.background = 'transparent'; }}
                    >
                      {deletingId === e.id
                        ? <span className="spinner" style={{ width: 12, height: 12 }} />
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                      }
                    </button>
                  )}
                </div>
                {confirmId === e.id && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 6, marginTop: 6,
                    background: 'rgba(224,62,62,.08)', border: '1px solid rgba(224,62,62,.25)',
                    fontSize: '.8rem', color: 'var(--red, #E03E3E)',
                  }}>
                    <span style={{ flex: 1 }}>{t('log.confirmDeleteHours', { hours: fmtHours(e.hours) })}</span>
                    <button type="button" onClick={() => setConfirmId(null)}
                      style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: '.8rem', color: 'var(--text-sec)' }}>
                      {t('common.cancel')}
                    </button>
                    <button type="button" onClick={() => confirmDelete(e)}
                      style={{ background: 'var(--red, #E03E3E)', border: 'none', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: '.8rem', color: '#fff', fontWeight: 600 }}>
                      {t('common.delete')}
                    </button>
                  </div>
                )}
                <div className="detailMeta">
                  <span>{e.activity?.name ?? '--'}</span>
                  {e.project && <span>· {e.project.name}</span>}
                </div>
                {e.comments && <div className="detailComment">{e.comments}</div>}
              </div>
            ))
          }
        </div>

        <div className="modalActions">
          <button className="btnSecondary" onClick={onClose}>{t('common.close')}</button>
          {isViewingSelf && (
            <button className="btnPrimary btnPrimaryGreen" onClick={onAddEntry}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {t('log.addEntryBtn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
