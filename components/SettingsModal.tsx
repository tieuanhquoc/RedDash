'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from './AppContext';
import { fetchCurrentUser, fetchActivities, fetchTimeEntries, fetchUsers } from '@/lib/redmine';
import {
  vaultExists, saveCredentials, loadCredentials, destroyVault,
} from '@/lib/vault';

const LS_FALLBACK_KEY = 'redmine_logger_cfg';

function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export default function SettingsModal() {
  const { state, dispatch, showToast } = useApp();
  const [vaultReady, setVaultReady] = useState<boolean | null>(null);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const isOpen = !state.currentUser;

  // Detect environment + check vault on mount
  useEffect(() => {
    if (!isOpen) return;
    if (isTauri()) {
      vaultExists().then(setVaultReady).catch(() => setVaultReady(false));
    } else {
      // Browser mode: no vault, fall back to localStorage
      setVaultReady(false);
      try {
        const saved = JSON.parse(localStorage.getItem(LS_FALLBACK_KEY) || '{}');
        if (saved.url) setUrl(saved.url);
        if (saved.token) setToken(saved.token);
      } catch { /* ignore */ }
    }
  }, [isOpen]);

  async function bootstrapSession(config: { redmineUrl: string; apiToken: string }) {
    const user = await fetchCurrentUser(config);
    const activities = await fetchActivities(config);
    dispatch({ type: 'SET_CONFIG',     payload: config });
    dispatch({ type: 'SET_USER',       payload: user });
    dispatch({ type: 'SET_ACTIVITIES', payload: activities });
    fetchUsers(config).then(users => dispatch({ type: 'SET_USERS', payload: users }));

    const now = new Date();
    const yr = now.getFullYear();
    const mo = now.getMonth() + 1;
    const from = `${yr}-${String(mo).padStart(2,'0')}-01`;
    const lastDay = new Date(yr, mo, 0).getDate();
    const to = `${yr}-${String(mo).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    const entries = await fetchTimeEntries(config, user.id, from, to);
    dispatch({ type: 'SET_TIME_ENTRIES', payload: entries });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isTauri() && vaultReady) {
        // Unlock existing vault
        if (!password.trim()) { setError('Nhập mật khẩu để mở khoá vault.'); return; }
        const creds = await loadCredentials(password);
        if (!creds) { setError('Vault rỗng hoặc lỗi đọc.'); return; }
        await bootstrapSession({ redmineUrl: creds.url.replace(/\/$/, ''), apiToken: creds.token });
        showToast('Mở khoá thành công!', 'success');
      } else if (isTauri()) {
        // Create new vault
        const cleanUrl = url.trim().replace(/\/$/, '');
        const cleanToken = token.trim();
        if (!cleanUrl || !cleanToken) { setError('Nhập đầy đủ URL và API token.'); return; }
        if (password.length < 4)     { setError('Mật khẩu vault phải ≥ 4 ký tự.'); return; }
        await bootstrapSession({ redmineUrl: cleanUrl, apiToken: cleanToken });
        await saveCredentials(password, { url: cleanUrl, token: cleanToken });
        showToast('Đã tạo vault mã hoá!', 'success');
      } else {
        // Browser fallback — plain localStorage
        const cleanUrl = url.trim().replace(/\/$/, '');
        const cleanToken = token.trim();
        if (!cleanUrl || !cleanToken) { setError('Nhập đầy đủ URL và API token.'); return; }
        await bootstrapSession({ redmineUrl: cleanUrl, apiToken: cleanToken });
        localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify({ url: cleanUrl, token: cleanToken }));
        showToast('Kết nối thành công (browser mode, không mã hoá)!', 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Stronghold reports wrong password as a BadFileKey / age decryption error.
      // Surface a friendly message instead of the raw crate-level string.
      const isBadKey = /BadFileKey|decrypt age|failed to decode/i.test(msg);
      setError(isBadKey ? 'Không xác thực bảo mật' : `Lỗi: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetVault() {
    try {
      await destroyVault();
      setVaultReady(false);
      setPassword('');
      setError('');
      setConfirmReset(false);
      showToast('Đã xoá vault. Nhập lại thông tin để tạo mới.', 'info');
    } catch (err: unknown) {
      setError(`Không xoá được vault: ${err instanceof Error ? err.message : String(err)}`);
      setConfirmReset(false);
    }
  }

  if (!isOpen) return null;
  if (vaultReady === null) {
    return (
      <div className="modalOverlay" role="dialog" aria-modal aria-label="Đang khởi tạo">
        <div className="modalBox settingsBox" style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="loadingSpinner" />
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Đang kiểm tra vault…</p>
        </div>
      </div>
    );
  }

  const tauriMode = isTauri();
  const unlockMode = tauriMode && vaultReady;

  return (
    <div className="modalOverlay" role="dialog" aria-modal aria-label="Kết nối Redmine">
      <form className="modalBox settingsBox" onSubmit={handleSubmit}>
        <div className="modalHeader">
          <div className="modalIcon">
            {unlockMode ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            )}
          </div>
          <div>
            <h2 className="modalTitle">{unlockMode ? 'Mở khoá vault' : 'Kết nối Redmine'}</h2>
            <p className="modalSubtitle">
              {unlockMode
                ? 'Nhập mật khẩu để giải mã token đã lưu'
                : tauriMode
                  ? 'Tạo vault mã hoá để lưu token an toàn'
                  : 'Browser mode — token sẽ lưu plaintext (chỉ test)'}
            </p>
          </div>
        </div>

        {!unlockMode && (
          <>
            <div className="fieldGroup">
              <label className="fieldLabel" htmlFor="cfg-url">Redmine URL</label>
              <input
                id="cfg-url" className="fieldInput" type="url" required
                placeholder="https://redmine.example.com"
                value={url} onChange={e => setUrl(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel" htmlFor="cfg-token">API Token</label>
              <div className="inputWithIcon">
                <input
                  id="cfg-token" className="fieldInput" required
                  type={showToken ? 'text' : 'password'}
                  placeholder="Nhập API token của bạn"
                  value={token} onChange={e => setToken(e.target.value)}
                  autoComplete="off"
                />
                <button type="button" className="iconBtn" onClick={() => setShowToken(v => !v)}>
                  {showToken
                    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>
          </>
        )}

        {tauriMode && (
          <div className="fieldGroup">
            <label className="fieldLabel" htmlFor="cfg-password">
              {unlockMode ? 'Mật khẩu vault' : 'Tạo mật khẩu vault (≥ 4 ký tự)'}
            </label>
            <div className="inputWithIcon">
              <input
                id="cfg-password" className="fieldInput" required
                type={showPassword ? 'text' : 'password'}
                placeholder={unlockMode ? 'Nhập mật khẩu để mở khoá' : 'Đặt mật khẩu mã hoá'}
                value={password} onChange={e => setPassword(e.target.value)}
                autoComplete="off"
                autoFocus={unlockMode}
              />
              <button type="button" className="iconBtn" onClick={() => setShowPassword(v => !v)}>
                {showPassword
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>
        )}

        {error && <div className="errorBanner">{error}</div>}

        {unlockMode && confirmReset && (
          <div style={{
            background: 'rgba(224,62,62,.08)', border: '1px solid rgba(224,62,62,.3)',
            borderRadius: 8, padding: '.75rem 1rem', fontSize: '.84rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <span style={{ color: 'var(--red, #E03E3E)' }}>Xoá vault? Token sẽ mất và phải nhập lại.</span>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button type="button" className="btnSecondary" style={{ padding: '.3rem .7rem', fontSize: '.8rem' }}
                onClick={() => setConfirmReset(false)}>Huỷ</button>
              <button type="button" className="btnPrimary" style={{ padding: '.3rem .7rem', fontSize: '.8rem', background: 'var(--red, #E03E3E)', borderColor: 'var(--red, #E03E3E)' }}
                onClick={handleResetVault} disabled={loading}>Xoá vault</button>
            </div>
          </div>
        )}

        <div className="modalActions" style={{ justifyContent: 'space-between' }}>
          {unlockMode && !confirmReset && (
            <button
              type="button"
              className="iconBtn"
              style={{ fontSize: '.8rem', color: 'var(--red, #E03E3E)', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setConfirmReset(true)}
              disabled={loading}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              Reset vault
            </button>
          )}
          <button type="submit" className="btnPrimary" disabled={loading} style={{ marginLeft: 'auto' }}>
            {loading ? <span className="spinner" /> : null}
            {loading
              ? (unlockMode ? 'Đang mở khoá…' : 'Đang kết nối…')
              : (unlockMode ? 'Mở khoá' : 'Kết nối')}
          </button>
        </div>
      </form>
    </div>
  );
}
