/**
 * Per-user favorite Redmine issues, persisted in encrypted localStorage.
 * Keyed by domain + userId so different Redmine instances don't share data.
 */

import { secureGet, secureSet } from './storage';

const KEY_PREFIX = 'redmine_favorite_issues';
export const FAVORITES_MAX = 20;

export interface FavoriteIssue {
  id: number;
  subject: string;
  project?: { id: number; name: string };
}

function toDomain(redmineUrl: string): string {
  try { return new URL(redmineUrl).hostname; } catch { return redmineUrl; }
}

function storageKey(redmineUrl: string, userId: number): string {
  return `${KEY_PREFIX}_${toDomain(redmineUrl)}_${userId}`;
}

export async function getFavorites(redmineUrl: string, userId: number): Promise<FavoriteIssue[]> {
  try {
    const raw = await secureGet(storageKey(redmineUrl, userId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(x => typeof x?.id === 'number') : [];
  } catch { return []; }
}

/** Sync check against an already-loaded favorites array — use in render. */
export function isFavoriteInList(favorites: FavoriteIssue[], issueId: number): boolean {
  return favorites.some(f => f.id === issueId);
}

export async function toggleFavorite(redmineUrl: string, userId: number, issue: FavoriteIssue): Promise<FavoriteIssue[]> {
  const cur = await getFavorites(redmineUrl, userId);
  const exists = cur.find(f => f.id === issue.id);
  const next: FavoriteIssue[] = exists
    ? cur.filter(f => f.id !== issue.id)
    : [{ id: issue.id, subject: issue.subject }, ...cur].slice(0, FAVORITES_MAX);
  await secureSet(storageKey(redmineUrl, userId), JSON.stringify(next));
  return next;
}
