'use client';

import React from 'react';
import { useApp } from './AppContext';

export default function Toast() {
  const { state } = useApp();
  if (!state.toast) return null;
  const { message, type } = state.toast;
  const cls = type === 'success' ? 'toastSuccess' : type === 'error' ? 'toastError' : 'toastInfo';
  return (
    <div className={`toast ${cls}`} role="alert" aria-live="polite">
      {message}
    </div>
  );
}
