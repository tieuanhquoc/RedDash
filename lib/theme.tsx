'use client';

/**
 * Theme — 1 file quản lý chế độ Sáng / Tối / Hệ thống.
 *
 *   const { theme, resolved, setTheme } = useTheme();
 *   setTheme('dark');                 // 'light' | 'dark' | 'system'
 *   setTheme('system');               // theo prefers-color-scheme
 *
 * Lưu ý:
 * - User choice persist trong localStorage (`app.theme`).
 * - Khi chọn 'system', lắng nghe MediaQueryList('prefers-color-scheme: dark')
 *   để tự động đổi khi OS đổi theme.
 * - Áp dụng lên `<html>` qua attribute `data-theme` ("light" | "dark"), và đồng
 *   thời set `color-scheme` để native UI (scrollbar, form controls) cũng theo.
 */

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const LS_KEY = 'app.theme';
const DEFAULT_CHOICE: ThemeChoice = 'system';

function readStored(): ThemeChoice {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch { /* */ }
  return DEFAULT_CHOICE;
}

function systemPrefers(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyResolved(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}

interface ThemeCtx {
  /** User-selected mode. */
  theme: ThemeChoice;
  /** Actually rendered value (always 'light' or 'dark'). */
  resolved: ResolvedTheme;
  setTheme: (next: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(DEFAULT_CHOICE);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('light');

  // Hydrate from localStorage and start listening to system preference.
  useEffect(() => {
    setThemeState(readStored());
    setSystemTheme(systemPrefers());

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    // Modern API uses addEventListener; older Safari still has addListener.
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  const resolved: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => { applyResolved(resolved); }, [resolved]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    try { localStorage.setItem(LS_KEY, next); } catch { /* */ }
  }, []);

  const value = useMemo<ThemeCtx>(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/* ============================================================================
   Liquid Glass — Apple-style frosted material.
   - Persist user choice in localStorage (`app.liquidGlass`: 'on' | 'off').
   - If unset, auto-enable on macOS, off elsewhere (Linux, Windows, browser).
   - Apply `data-liquid-glass="on|off"` on <html>; CSS in app/liquid-glass.css
     reads the attribute to opt-in overrides.
   ========================================================================== */

export type LiquidGlassChoice = 'on' | 'off';

const LS_LG_KEY = 'app.liquidGlass';
const LG_ATTR = 'data-liquid-glass';

function detectMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // macOS / iPadOS-on-Intel reports "Macintosh"; iOS-on-iPad with desktop UA
  // is rare in a Tauri WebView but we accept it.
  return /Macintosh|Mac OS X/.test(ua);
}

function readLgStored(): LiquidGlassChoice | null {
  try {
    const raw = localStorage.getItem(LS_LG_KEY);
    if (raw === 'on' || raw === 'off') return raw;
  } catch { /* */ }
  return null;
}

function applyLgAttr(choice: LiquidGlassChoice | null) {
  if (typeof document === 'undefined') return;
  const value = choice ?? (detectMacOS() ? 'on' : 'off');
  document.documentElement.setAttribute(LG_ATTR, value);
}

interface LiquidGlassCtx {
  choice: LiquidGlassChoice | null;   // null = auto (not yet set)
  effective: LiquidGlassChoice;        // 'on' | 'off' — what we're actually using
  setChoice: (next: LiquidGlassChoice | null) => void;
}

const LgContext = createContext<LiquidGlassCtx | null>(null);

export function LiquidGlassProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<LiquidGlassChoice | null>(null);
  // Re-render when system theme (e.g. macOS) flips so 'auto' stays correct.
  const [isMac, setIsMac] = useState<boolean>(false);

  useEffect(() => {
    setIsMac(detectMacOS());
    setChoiceState(readLgStored());
  }, []);

  // Liquid Glass tạm tắt — luôn 'off' bất kể lựa chọn / hệ điều hành.
  // Bỏ comment block dưới khi mở lại tính năng.
  void isMac;
  const effective: LiquidGlassChoice = 'off';
  // const effective: LiquidGlassChoice = choice ?? (isMac ? 'on' : 'off');

  useEffect(() => { applyLgAttr(effective); }, [effective]);

  const setChoice = useCallback((next: LiquidGlassChoice | null) => {
    setChoiceState(next);
    try {
      if (next === null) localStorage.removeItem(LS_LG_KEY);
      else localStorage.setItem(LS_LG_KEY, next);
    } catch { /* */ }
  }, []);

  const value = useMemo<LiquidGlassCtx>(
    () => ({ choice, effective, setChoice }),
    [choice, effective, setChoice],
  );
  return <LgContext.Provider value={value}>{children}</LgContext.Provider>;
}

export function useLiquidGlass(): LiquidGlassCtx {
  const ctx = useContext(LgContext);
  if (!ctx) throw new Error('useLiquidGlass must be used within LiquidGlassProvider');
  return ctx;
}
