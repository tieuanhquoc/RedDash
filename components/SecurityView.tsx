'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from './AppContext';
import Select from './Select';
import { loadCredentials, vaultHasBio, enrollBiometricBlob, removeBiometricBlob, destroyVault } from '@/lib/vault';
import {
  biometricAvailable, biometricEnroll, biometricDisable,
} from '@/lib/biometric';
import { openExternal } from '@/lib/open-url';

// ─── reusable bits ───────────────────────────────────────────────────────────

function Toggle({
  checked, onChange, disabled, title,
}: { checked: boolean; onChange: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => { if (!disabled) onChange(); }}
      disabled={disabled}
      title={title}
      style={{
        position: 'relative',
        width: 42, height: 24, padding: 0, flexShrink: 0,
        borderRadius: 999, border: 'none',
        background: checked ? '#22C55E' : 'var(--border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background .15s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2, left: checked ? 20 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          transition: 'left .15s ease',
        }}
      />
    </button>
  );
}

function Section({
  title, children,
}: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '1.75rem' }}>
      <h2 style={{
        fontSize: '.78rem', fontWeight: 600, letterSpacing: '.04em',
        color: 'var(--text-muted)', textTransform: 'uppercase',
        margin: '0 0 .55rem .25rem',
      }}>{title}</h2>
      <div style={{
        background: 'var(--bg-elevated, #fff)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}>
        {children}
      </div>
    </section>
  );
}

function Row({
  icon, iconBg, iconColor, title, description, right, expanded,
}: {
  icon: React.ReactNode;
  iconBg: string; iconColor: string;
  title: string; description: React.ReactNode;
  right?: React.ReactNode;
  expanded?: React.ReactNode;
}) {
  return (
    <div style={{ padding: '1.1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8,
          background: iconBg, color: iconColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '.98rem' }}>{title}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '.82rem', marginTop: 2 }}>{description}</div>
            </div>
            {right}
          </div>
          {expanded}
        </div>
      </div>
    </div>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

export const LS_AUTO_LOCK_MINUTES = 'app.autoLockMinutes';

const AUTO_LOCK_OPTIONS = [
  { value: 0, label: 'Tắt' },
  { value: -1, label: 'Khoá ngay khi chuyển ứng dụng' },
  { value: -2, label: 'Khoá ngay khi ẩn' },
  { value: 1, label: '1 phút' },
  { value: 5, label: '5 phút' },
  { value: 15, label: '15 phút' },
  { value: 30, label: '30 phút' },
  { value: 60, label: '1 giờ' },
];

export default function SecurityView() {
  const { state, dispatch, showToast } = useApp();
  const [appVersion, setAppVersion] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  async function handleResetAll() {
    setResetBusy(true);
    try {
      await destroyVault();
      // Clear app-level settings stored in localStorage.
      try {
        localStorage.removeItem('app.autoLockMinutes');
        localStorage.removeItem('redmine_logger_cfg');
      } catch { /* */ }
      showToast('Đã xoá toàn bộ cài đặt. Khởi động lại cấu hình từ đầu.', 'info');
      dispatch({ type: 'LOGOUT' });
    } catch (err: unknown) {
      showToast(`Lỗi: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setResetBusy(false);
      setConfirmReset(false);
    }
  }
  useEffect(() => {
    (async () => {
      try {
        const v = await (await import('@tauri-apps/api/app')).getVersion();
        setAppVersion(v);
      } catch { /* browser mode */ }
    })();
  }, []);
  const u = state.currentUser;
  const userName = u ? (`${u.firstname ?? ''} ${u.lastname ?? ''}`.trim() || u.login) : '';
  const redmineUrl = state.config?.redmineUrl ?? '';

  // Security — auto-lock.
  const [autoLockMin, setAutoLockMin] = useState(0);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_AUTO_LOCK_MINUTES);
      const n = raw == null ? 0 : parseInt(raw, 10);
      setAutoLockMin(Number.isFinite(n) ? n : 0);
    } catch { /* */ }
  }, []);
  function changeAutoLock(min: number) {
    setAutoLockMin(min);
    try { localStorage.setItem(LS_AUTO_LOCK_MINUTES, String(min)); } catch { /* */ }
    window.dispatchEvent(new CustomEvent('rdash:auto-lock-changed', { detail: min }));
    const label = AUTO_LOCK_OPTIONS.find(o => o.value === min)?.label;
    showToast(
      min === 0 ? 'Đã tắt tự động khoá'
        : min < 0 ? `Đã bật: ${label}`
        : `Tự động khoá sau ${label} không thao tác`,
      'info',
    );
  }

  // Security — biometric.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const ok = await biometricAvailable();
      setAvailable(ok);
      if (ok) setEnabled(await vaultHasBio());
    })();
  }, []);

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const creds = await loadCredentials(password);
      if (!creds) { setError('Vault rỗng hoặc lỗi đọc.'); return; }
      const bioKey = await biometricEnroll();
      await enrollBiometricBlob(password, bioKey);
      setEnabled(true); setShowForm(false); setPassword('');
      showToast('Đã bật mở khoá bằng sinh trắc học', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel|user.*denied/i.test(msg)) { setError(''); return; }
      const isBadKey = /BadPassword/i.test(msg);
      setError(isBadKey ? 'Mật khẩu không đúng' : `Lỗi: ${msg}`);
    } finally { setBusy(false); }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await biometricDisable();
      await removeBiometricBlob();
      setEnabled(false);
      showToast('Đã tắt mở khoá bằng sinh trắc học', 'info');
    } catch (err: unknown) {
      showToast(`Lỗi: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally { setBusy(false); }
  }

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      padding: '1.5rem 2rem',
    }}>
      <div style={{
        maxWidth: 720,
        width: '100%',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
      }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '.25rem' }}>Cài đặt</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '.88rem', marginBottom: '1.5rem' }}>
        Tùy chỉnh hành vi và bảo mật của ứng dụng.
      </p>

      {/* ─── Tài khoản ──────────────────────────────────────────────────── */}
      <Section title="Tài khoản">
        <Row
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          }
          iconBg="rgba(20,184,166,.12)" iconColor="#0D9488"
          title={`${userName || 'Chưa đăng nhập'}${u?.mail ? ` — ${u.mail}` : ''}`}
          description={
            <span style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', fontSize: '.78rem' }}>
              {redmineUrl || '—'}
            </span>
          }
          right={
            <button
              type="button"
              className="btnSecondary"
              onClick={() => dispatch({ type: 'LOGOUT' })}
              title="Đăng xuất / đổi kết nối"
              style={{
                fontSize: '.82rem', padding: '.4rem .8rem',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Đăng xuất
            </button>
          }
        />
      </Section>

      {/* ─── Bảo mật ────────────────────────────────────────────────────── */}
      <Section title="Bảo mật">
        <Row
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          iconBg="rgba(99,102,241,.12)" iconColor="#6366F1"
          title="Tự động khoá"
          description="Khoá app khi không có thao tác trong khoảng thời gian đã chọn"
          right={
            <Select
              options={AUTO_LOCK_OPTIONS}
              value={autoLockMin}
              onChange={changeAutoLock}
              pillStyle={{ minWidth: 120 }}
            />
          }
        />
        <div style={{ borderTop: '1px solid var(--border)' }} />
        <Row
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4" />
              <path d="M5 19.5C5.5 18 6 15 6 12c0-3.3 2.7-6 6-6 1 0 2 .3 3 .8" />
              <path d="M12 10c-1.7 0-3 1.3-3 3 0 2.7-1.3 5-3 6" />
              <path d="M22 12c0 1-.5 2-1 3" />
              <path d="M15 13c0 4-1 6.5-2 8" />
            </svg>
          }
          iconBg="rgba(99,102,241,.12)" iconColor="#6366F1"
          title="Mở khoá bằng sinh trắc học"
          description={
            available === null ? 'Đang kiểm tra…'
              : available === false ? 'Không khả dụng trên hệ điều hành này'
                : 'Dùng Touch ID / Windows Hello để mở khoá vault không cần nhập mật khẩu'
          }
          right={available ? (
            <Toggle
              checked={enabled}
              disabled={busy}
              onChange={() => {
                if (enabled) handleDisable();
                else { setError(''); setShowForm(v => !v); }
              }}
              title={enabled ? 'Đang bật — nhấn để tắt' : (showForm ? 'Nhấn để thu gọn' : 'Nhấn để bật')}
            />
          ) : null}
          expanded={
            <>
              {available && !enabled && showForm && (
                <form onSubmit={handleEnable} style={{ marginTop: 14 }}>
                  <label className="fieldLabel" htmlFor="bio-pwd">Nhập mật khẩu vault để xác nhận</label>
                  <div className="inputWithIcon" style={{ marginTop: 4 }}>
                    <input
                      id="bio-pwd" className="fieldInput" required autoFocus
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mật khẩu vault hiện tại"
                      value={password} onChange={e => setPassword(e.target.value)}
                      autoComplete="off"
                    />
                    <button type="button" className="iconBtn" onClick={() => setShowPassword(v => !v)}>
                      {showPassword
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
                    </button>
                  </div>
                  {error && <div className="errorBanner" style={{ marginTop: 10 }}>{error}</div>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <button type="submit" className="btnPrimary" disabled={busy} style={{ fontSize: '.85rem' }}>
                      {busy ? 'Đang xác thực…' : 'Xác nhận & xác thực sinh trắc học'}
                    </button>
                  </div>
                </form>
              )}
            </>
          }
        />
      </Section>

      {/* ─── Giới thiệu ──────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 'auto',
        padding: '1.5rem 0 .5rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '.78rem',
        lineHeight: 1.7,
      }}>
        <div style={{ marginBottom: 4 }}>
          <strong style={{ color: 'var(--text, #37352F)' }}>RedDash</strong>
          {appVersion && <span> · v{appVersion}</span>}
        </div>
        <div>
          Tác giả{' '}
          <a
            href="https://tieuanhquoc.info/"
            onClick={(e) => { e.preventDefault(); void openExternal('https://tieuanhquoc.info/'); }}
            style={{ color: 'var(--accent, #6366F1)', textDecoration: 'none' }}
          >
            Tieu Anh Quoc
          </a>
          {' · '}
          <a
            href="https://github.com/tieuanhquoc/RedDash"
            onClick={(e) => { e.preventDefault(); void openExternal('https://github.com/tieuanhquoc/RedDash'); }}
            style={{ color: 'var(--accent, #6366F1)', textDecoration: 'none' }}
          >
            GitHub
          </a>
        </div>
        <div style={{ marginTop: 10 }}>
          {confirmReset ? (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: 'var(--red, #E03E3E)' }}>Xoá toàn bộ cài đặt?</span>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                disabled={resetBusy}
                style={{
                  fontSize: '.72rem', padding: '.2rem .55rem',
                  border: '1px solid var(--border)', borderRadius: 4,
                  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                disabled={resetBusy}
                style={{
                  fontSize: '.72rem', padding: '.2rem .55rem',
                  border: '1px solid var(--red, #E03E3E)', borderRadius: 4,
                  background: 'var(--red, #E03E3E)', color: '#fff', cursor: 'pointer',
                }}
              >
                {resetBusy ? 'Đang xoá…' : 'Xác nhận'}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              title="Xoá vault + tắt biometric + reset tuỳ chọn"
              style={{
                fontSize: '.65rem', padding: 0,
                border: 'none', background: 'transparent',
                color: 'var(--red, #E03E3E)', opacity: 0.55, cursor: 'pointer',
              }}
            >
              Xoá toàn bộ cài đặt
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
