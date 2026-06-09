'use client';

/**
 * Drop-in loading / error renderer for API calls.
 *
 *   <ApiStatus loading={loading} error={error} onRetry={retry}>
 *     {data && <MyView data={data} />}
 *   </ApiStatus>
 *
 * Skips its overlay when nothing is loading and there's no error → children
 * render as normal.
 */

import React from 'react';

export interface ApiStatusProps {
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Show spinner inline (small) instead of full block. */
  compact?: boolean;
  children?: React.ReactNode;
}

export function ApiStatus({ loading, error, onRetry, compact, children }: ApiStatusProps) {
  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: compact ? '.45rem .7rem' : '.85rem 1rem',
          borderRadius: 8,
          background: 'rgba(224,62,62,.08)',
          border: '1px solid rgba(224,62,62,.25)',
          color: 'var(--red, #E03E3E)',
          fontSize: compact ? '.8rem' : '.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          margin: compact ? '.5rem 0' : '1rem 0',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ flex: 1 }}>{error}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              fontSize: '.78rem', padding: '.25rem .65rem',
              border: '1px solid currentColor', borderRadius: 6,
              background: 'transparent', color: 'inherit', cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Thử lại
          </button>
        )}
      </div>
    );
  }
  if (loading) {
    return (
      <div
        aria-busy
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: compact ? '.4rem .6rem' : '1.5rem',
          color: 'var(--text-muted)',
          fontSize: compact ? '.8rem' : '.88rem',
          justifyContent: compact ? 'flex-start' : 'center',
        }}
      >
        <span
          className="spinner"
          style={{
            width: compact ? 12 : 16, height: compact ? 12 : 16,
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'apiSpin 0.8s linear infinite',
          }}
        />
        Đang tải…
        <style jsx>{`
          @keyframes apiSpin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }
  return <>{children}</>;
}
