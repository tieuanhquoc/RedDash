'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from './AppContext';
import Select from './Select';
import { loadCredentials, vaultHasBio, enrollBiometricBlob, removeBiometricBlob, destroyVault } from '@/lib/vault';
import {
  biometricAvailable, biometricEnroll, biometricDisable,
} from '@/lib/biometric';
import { openExternal } from '@/lib/open-url';
import { useI18n, AVAILABLE_LOCALES } from '@/lib/i18n';
import { useTheme, useLiquidGlass } from '@/lib/theme';

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

export default function SecurityView() {
  const { state, dispatch, showToast } = useApp();
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { effective: lg, choice: lgChoice, setChoice: setLgChoice } = useLiquidGlass();
  const [appVersion, setAppVersion] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const autoLockOptions = [
    { value: 0, label: t('settings.security.autoLockOff') },
    { value: -1, label: t('settings.security.autoLockOnBlur') },
    { value: -2, label: t('settings.security.autoLockOnHide') },
    { value: 1, label: t('settings.security.autoLockMinutes', { n: 1 }) },
    { value: 5, label: t('settings.security.autoLockMinutes', { n: 5 }) },
    { value: 15, label: t('settings.security.autoLockMinutes', { n: 15 }) },
    { value: 30, label: t('settings.security.autoLockMinutes', { n: 30 }) },
    { value: 60, label: t('settings.security.autoLockHour', { n: 1 }) },
  ];

  async function handleResetAll() {
    setResetBusy(true);
    try {
      await destroyVault();
      // Clear app-level settings stored in localStorage.
      try {
        localStorage.removeItem('app.autoLockMinutes');
        localStorage.removeItem('redmine_logger_cfg');
      } catch { /* */ }
      showToast(t('settings.reset.toast'), 'info');
      dispatch({ type: 'LOGOUT' });
    } catch (err: unknown) {
      showToast(t('common.errorMsg', { msg: err instanceof Error ? err.message : String(err) }), 'error');
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
    const label = autoLockOptions.find(o => o.value === min)?.label;
    showToast(
      min === 0 ? t('settings.security.autoLockToastOff')
        : min < 0 ? t('settings.security.autoLockToastEvent', { label: label ?? '' })
        : t('settings.security.autoLockToastOn', { label: label ?? '' }),
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
      if (!creds) { setError(t('unlock.errVaultEmpty')); return; }
      const bioKey = await biometricEnroll();
      await enrollBiometricBlob(password, bioKey);
      setEnabled(true); setShowForm(false); setPassword('');
      showToast(t('settings.security.bioToastOn'), 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel|user.*denied/i.test(msg)) { setError(''); return; }
      const isBadKey = /BadPassword/i.test(msg);
      setError(isBadKey ? t('unlock.wrongPassword') : t('common.errorMsg', { msg }));
    } finally { vanity_workaround: setBusy(false); }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await biometricDisable();
      await removeBiometricBlob();
      setEnabled(false);
      showToast(t('settings.security.bioToastOff'), 'info');
    } catch (err: unknown) {
      showToast(t('common.errorMsg', { msg: err instanceof Error ? err.message : String(err) }), 'error');
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
      <h1 className="viewTitle" style={{ marginBottom: '.25rem' }}>{t('settings.title')}</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '.88rem', marginBottom: '1.5rem' }}>
        {t('settings.subtitle')}
      </p>

      {/* ─── Tài khoản ──────────────────────────────────────────────────── */}
      <Section title={t('settings.account.section')}>
        <Row
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          }
          iconBg="rgba(20,184,166,.12)" iconColor="#0D9488"
          title={`${userName || t('settings.account.notLoggedIn')}${u?.mail ? ` — ${u.mail}` : ''}`}
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
              title={t('settings.account.logoutTitle')}
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
              {t('settings.account.logoutBtn')}
            </button>
          }
        />
      </Section>

      {/* ─── Ngôn ngữ ─────────────────────────────────────────────────── */}
      <Section title={t('settings.language.section')}>
        <Row
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          }
          iconBg="rgba(59,130,246,.12)" iconColor="#3B82F6"
          title={t('settings.language.title')}
          description={t('settings.language.desc')}
          right={
            <Select
              options={AVAILABLE_LOCALES.map(l => ({ value: l.code, label: `${l.flag}  ${l.label}` }))}
              value={locale}
              onChange={setLocale}
              pillStyle={{ minWidth: 140 }}
            />
          }
        />
      </Section>

      {/* ─── Giao diện ──────────────────────────────────────────────── */}
      <Section title={t('settings.theme.section')}>
        <Row
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
            </svg>
          }
          iconBg="rgba(168,85,247,.12)" iconColor="#A855F7"
          title={t('settings.theme.title')}
          description={t('settings.theme.desc')}
          right={
            <Select
              options={[
                { value: 'light',  label: `☀  ${t('settings.theme.light')}` },
                { value: 'dark',   label: `☾  ${t('settings.theme.dark')}` },
                { value: 'system', label: `◐  ${t('settings.theme.system')}` },
              ]}
              value={theme}
              onChange={setTheme}
              pillStyle={{ minWidth: 160 }}
            />
          }
        />
        {/* Liquid Glass — tạm ẩn cho đến khi mở lại tính năng.
        <div style={{ borderTop: '1px solid var(--border)' }} />
        <Row
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3a9 9 0 1 0 0 18 5 5 0 0 1 0-10 5 5 0 0 0 0-8z" />
            </svg>
          }
          iconBg="rgba(56,189,248,.12)" iconColor="#0EA5E9"
          title={t('settings.liquidGlass.title')}
          description={t('settings.liquidGlass.desc')}
          right={
            <Select
              options={[
                { value: 'auto', label: `◐  ${t('settings.liquidGlass.autoOn')}${lgChoice === null && lg === 'on' ? ' · ON' : lgChoice === null && lg === 'off' ? ' · OFF' : ''}` },
                { value: 'on',   label: `●  ${t('settings.liquidGlass.toastOn')}` },
                { value: 'off',  label: `○  ${t('settings.liquidGlass.toastOff')}` },
              ]}
              value={lgChoice ?? 'auto'}
              onChange={(v) => {
                setLgChoice(v === 'auto' ? null : v);
                if (v === 'auto') {
                  showToast(t('settings.liquidGlass.toastAuto', { state: lg }), 'info');
                } else {
                  showToast(v === 'on' ? t('settings.liquidGlass.toastOn') : t('settings.liquidGlass.toastOff'), 'info');
                }
              }}
              pillStyle={{ minWidth: 180 }}
            />
          }
        />
        */}
      </Section>

      {/* ─── Bảo mật ────────────────────────────────────────────────────── */}
      <Section title={t('settings.security.section')}>
        <Row
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          iconBg="rgba(99,102,241,.12)" iconColor="#6366F1"
          title={t('settings.security.autoLockTitle')}
          description={t('settings.security.autoLockDesc')}
          right={
            <Select
              options={autoLockOptions}
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
          title={t('settings.security.bioTitle')}
          description={
            available === null ? t('settings.security.bioChecking')
              : available === false ? t('settings.security.bioUnavailable')
                : t('settings.security.bioDesc')
          }
          right={available ? (
            <Toggle
              checked={enabled}
              disabled={busy}
              onChange={() => {
                if (enabled) handleDisable();
                else { setError(''); setShowForm(v => !v); }
              }}
              title={enabled ? t('settings.security.bioToggleOnTooltip') : (showForm ? t('settings.security.bioToggleFormOpenTooltip') : t('settings.security.bioToggleFormClosedTooltip'))}
            />
          ) : null}
          expanded={
            <>
              {available && !enabled && showForm && (
                <form onSubmit={handleEnable} style={{ marginTop: 14 }}>
                  <label className="fieldLabel" htmlFor="bio-pwd">{t('settings.security.bioConfirmLabel')}</label>
                  <div className="inputWithIcon" style={{ marginTop: 4 }}>
                    <input
                      id="bio-pwd" className="fieldInput" required autoFocus
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('settings.security.bioConfirmPlaceholder')}
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
                      {busy ? t('settings.security.bioConfirmLoading') : t('settings.security.bioConfirmBtn')}
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
          {t('settings.about.author')}{' '}
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
              <span style={{ color: 'var(--red, #E03E3E)' }}>{t('settings.reset.confirmText')}</span>
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
                {t('common.cancel')}
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
                {resetBusy ? t('settings.reset.loading') : t('settings.reset.confirmBtn')}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              title={t('settings.reset.title')}
              style={{
                fontSize: '.65rem', padding: 0,
                border: 'none', background: 'transparent',
                color: 'var(--red, #E03E3E)', opacity: 0.55, cursor: 'pointer',
              }}
            >
              {t('settings.reset.btn')}
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
