'use client';

/**
 * TitleBar — custom macOS-style title bar for the RedDash window.
 *
 * Mimics the macOS Overlay title bar:
 *  - traffic lights (close/min/max) drawn by the OS at top-left
 *  - centered app title "RedDash"
 *  - full-width drag region (data-tauri-drag-region)
 *
 * Why custom: with `titleBarStyle: "Overlay"` + `transparent: true`, the
 * webview fills the entire window including the area where macOS would
 * draw the title text. The OS still draws the traffic lights (they're
 * layer-above), but the title disappears — so we render it ourselves.
 * The `data-tauri-drag-region` attribute makes the entire strip
 * draggable (Tauri runtime translates it to NSWindow drag).
 */

import React from 'react';
import { useI18n } from '@/lib/i18n';

export interface TitleBarProps {
  title: string;
}

export default function TitleBar({ title }: TitleBarProps) {
  const { t } = useI18n();
  return (
    <div
      className="titleBar"
      data-tauri-drag-region
      role="banner"
      aria-label={t('common.appName')}
    >
      {/* Left spacer reserves the traffic-light area so the centered
          title+icon group sits truly centered (not offset right). */}
      <div className="titleBarSpacer" />
      <div className="titleBarCenter">
        <img src="/logo.png" alt="" className="titleBarIcon" draggable={false} />
        <span className="titleBarTitle">{title}</span>
      </div>
      <div className="titleBarSpacer" />
    </div>
  );
}
