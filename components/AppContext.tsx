'use client';

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { RedmineUser, RedmineActivity, RedmineTimeEntry, AppConfig } from '@/lib/types';

// ─── State ───────────────────────────────────────────────────────────────────
export interface AppState {
  config: AppConfig | null;
  currentUser: RedmineUser | null;
  users: RedmineUser[];         // visible users for the filter dropdown
  viewUserId: number | null;    // user whose entries we're displaying (null = currentUser)
  activities: RedmineActivity[];
  timeEntries: Record<string, RedmineTimeEntry[]>;  // keyed by "YYYY-MM-DD"
  year: number;
  month: number;   // 1-based
  loading: boolean;
  view: 'calendar' | 'stats' | 'team' | 'favorites';
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
}

const today = new Date();

const initialState: AppState = {
  config: null,
  currentUser: null,
  users: [],
  viewUserId: null,
  activities: [],
  timeEntries: {},
  year: today.getFullYear(),
  month: today.getMonth() + 1,
  loading: false,
  view: 'calendar',
  toast: null,
};

// ─── Actions ──────────────────────────────────────────────────────────────────
type Action =
  | { type: 'SET_CONFIG';       payload: AppConfig }
  | { type: 'SET_USER';         payload: RedmineUser }
  | { type: 'SET_USERS';        payload: RedmineUser[] }
  | { type: 'SET_VIEW_USER';    payload: number | null }
  | { type: 'SET_ACTIVITIES';   payload: RedmineActivity[] }
  | { type: 'SET_TIME_ENTRIES'; payload: RedmineTimeEntry[] }
  | { type: 'SET_DAY_ENTRIES';  payload: { date: string; entries: RedmineTimeEntry[] } }
  | { type: 'REMOVE_TIME_ENTRY'; payload: { date: string; entryId: number } }
  | { type: 'SET_YEAR_MONTH';   payload: { year: number; month: number } }
  | { type: 'SET_LOADING';      payload: boolean }
  | { type: 'SET_VIEW';         payload: 'calendar' | 'stats' | 'team' | 'favorites' }
  | { type: 'SET_TOAST';        payload: AppState['toast'] }
  | { type: 'LOGOUT' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_CONFIG':
      return { ...state, config: action.payload };
    case 'SET_USER':
      return { ...state, currentUser: action.payload, viewUserId: action.payload.id };
    case 'SET_USERS':
      return { ...state, users: action.payload };
    case 'SET_VIEW_USER':
      return { ...state, viewUserId: action.payload };
    case 'SET_ACTIVITIES':
      return { ...state, activities: action.payload };
    case 'SET_TIME_ENTRIES': {
      const map: Record<string, RedmineTimeEntry[]> = {};
      action.payload.forEach(e => {
        if (!map[e.spent_on]) map[e.spent_on] = [];
        map[e.spent_on].push(e);
      });
      return { ...state, timeEntries: map };
    }
    case 'SET_DAY_ENTRIES': {
      const { date, entries } = action.payload;
      const timeEntries = { ...state.timeEntries };
      if (entries.length === 0) { delete timeEntries[date]; }
      else { timeEntries[date] = entries; }
      return { ...state, timeEntries };
    }
    case 'REMOVE_TIME_ENTRY': {
      const { date, entryId } = action.payload;
      const remaining = (state.timeEntries[date] ?? []).filter(e => e.id !== entryId);
      const timeEntries = { ...state.timeEntries };
      if (remaining.length === 0) { delete timeEntries[date]; }
      else { timeEntries[date] = remaining; }
      return { ...state, timeEntries };
    }
    case 'SET_YEAR_MONTH':
      return { ...state, year: action.payload.year, month: action.payload.month };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    case 'SET_TOAST':
      return { ...state, toast: action.payload };
    case 'LOGOUT':
      return { ...initialState };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      dispatch({ type: 'SET_TOAST', payload: { message, type } });
      setTimeout(() => dispatch({ type: 'SET_TOAST', payload: null }), 3500);
    },
    [],
  );

  return (
    <AppContext.Provider value={{ state, dispatch, showToast }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
