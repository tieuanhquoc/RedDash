'use client';

/**
 * i18n — 1 file 1 ngôn ngữ. Thêm ngôn ngữ mới = thêm 1 file vào `./locales/`
 * + 1 dòng vào `AVAILABLE_LOCALES` bên dưới.
 *
 *   const t = useT();
 *   t('settings.account.logoutBtn')                       // "Đăng xuất"
 *   t('security.autoLockMinutes', { n: 5 })               // "5 phút"
 *
 * Locale active được persist trong localStorage; lần đầu auto-detect từ
 * `navigator.language`.
 */

import React, {
  createContext, useContext, useEffect, useMemo, useState, useCallback,
} from 'react';
import vi from './locales/vi';
import en from './locales/en';
import type { Dict } from './types';

type DotPath<T, P extends string = ''> = {
  [K in keyof T]: T[K] extends object
    ? DotPath<T[K], `${P}${P extends '' ? '' : '.'}${K & string}`>
    : `${P}${P extends '' ? '' : '.'}${K & string}`;
}[keyof T];
export type TKey = DotPath<Dict>;

export interface LocaleMeta {
  code: string;
  label: string;
  flag: string;
  /** Lazy loader. */
  load: () => Promise<Dict>;
}

/** Add a language here to expose it in the picker. */
export const AVAILABLE_LOCALES: LocaleMeta[] = [
  {
    code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳',
    load: () => import('./locales/vi').then(m => m.default),
  },
  {
    code: 'en', label: 'English', flag: '🇬🇧',
    load: () => import('./locales/en').then(m => m.default),
  },
];

const DEFAULT_LOCALE = 'vi';
const LS_KEY = 'app.lang';

function detectInitial(): string {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored && AVAILABLE_LOCALES.some(l => l.code === stored)) return stored;
    const nav = typeof navigator !== 'undefined' ? navigator.language : DEFAULT_LOCALE;
    const short = nav.split('-')[0].toLowerCase();
    if (AVAILABLE_LOCALES.some(l => l.code === short)) return short;
  } catch { /* */ }
  return DEFAULT_LOCALE;
}

/** Pull a value from a dotted key, e.g. "settings.account.logoutBtn". */
function lookup(dict: Dict, key: string): string {
  const parts = key.split('.');
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return key; // missing — surface the key so it's obvious in UI
    }
  }
  return typeof cur === 'string' ? cur : key;
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    return v == null ? `{${name}}` : String(v);
  });
}

interface I18nCtx {
  locale: string;
  setLocale: (code: string) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<string>(DEFAULT_LOCALE);
  // Start with the synchronously-imported vi as fallback so UI can render
  // before the chosen locale finishes loading.
  const [dict, setDict] = useState<Dict>(vi);

  useEffect(() => {
    const initial = detectInitial();
    setLocaleState(initial);
    if (initial !== DEFAULT_LOCALE) {
      const meta = AVAILABLE_LOCALES.find(l => l.code === initial);
      meta?.load().then(setDict).catch(() => { /* keep default */ });
    }
  }, []);

  const setLocale = useCallback((code: string) => {
    const meta = AVAILABLE_LOCALES.find(l => l.code === code);
    if (!meta) return;
    try { localStorage.setItem(LS_KEY, code); } catch { /* */ }
    setLocaleState(code);
    meta.load().then(setDict).catch(() => { /* */ });
  }, []);

  const t = useCallback((key: TKey, vars?: Record<string, string | number>) => {
    return interpolate(lookup(dict, key as string), vars);
  }, [dict]);

  const value = useMemo<I18nCtx>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Shortcut to grab just `t`. */
export function useT() {
  return useI18n().t;
}

/** Get Dict helper for non-React code (e.g. updater, api-error). */
export function getDict(locale?: string): Dict {
  const code = locale || (typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null) || DEFAULT_LOCALE;
  return code === 'en' ? en : vi;
}
