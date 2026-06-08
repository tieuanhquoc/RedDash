/**
 * Redmine API client — routes through the Tauri Rust backend (no CORS, no
 * browser-side network exposure of the API token).
 */

import type { RedmineUser, RedmineActivity, RedmineIssue, RedmineTimeEntry } from './types';
import { secureGet, secureSet } from './storage';

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
let _invokeCache: InvokeFn | null = null;
async function getInvoke(): Promise<InvokeFn> {
  if (_invokeCache) return _invokeCache;
  const mod = await import('@tauri-apps/api/core');
  _invokeCache = mod.invoke as InvokeFn;
  return _invokeCache;
}

interface RequestOptions {
  redmineUrl: string;
  apiToken: string;
}

async function apiFetch<T>(
  opts: RequestOptions,
  path: string,
  params: Record<string, string | number> = {},
  init: RequestInit = {},
): Promise<T> {
  const target = new URL(`${opts.redmineUrl.replace(/\/$/, '')}${path}.json`);
  Object.entries(params).forEach(([k, v]) => target.searchParams.set(k, String(v)));

  const method = (init.method ?? 'GET').toUpperCase();
  const body = init.body ? JSON.parse(init.body as string) : null;
  const invoke = await getInvoke();
  const resp = await invoke<{ status: number; body: unknown }>('redmine_request', {
    args: {
      method,
      url: target.toString(),
      apiToken: opts.apiToken,
      body,
    },
  });
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`HTTP ${resp.status}: ${JSON.stringify(resp.body)}`);
  }
  return resp.body as T;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function fetchCurrentUser(opts: RequestOptions): Promise<RedmineUser> {
  const data = await apiFetch<{ user: RedmineUser }>(opts, '/users/current');
  return data.user;
}

interface RedmineProject { id: number; name: string; identifier: string }
interface RedmineMembership { user?: { id: number; name: string } }

const USERS_CACHE_KEY = 'redmine_users_cache';
const USERS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

async function readUsersCache(redmineUrl: string): Promise<RedmineUser[] | null> {
  try {
    const raw = await secureGet(USERS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url: string; ts: number; users: RedmineUser[] };
    if (parsed.url !== redmineUrl) return null;
    if (Date.now() - parsed.ts > USERS_CACHE_TTL) return null;
    return parsed.users;
  } catch { return null; }
}

async function writeUsersCache(redmineUrl: string, users: RedmineUser[]) {
  try {
    await secureSet(USERS_CACHE_KEY, JSON.stringify({ url: redmineUrl, ts: Date.now(), users }));
  } catch { /* quota or disabled — ignore */ }
}

export async function fetchUsers(opts: RequestOptions, force = false): Promise<RedmineUser[]> {
  if (!force) {
    const cached = await readUsersCache(opts.redmineUrl);
    if (cached && cached.length > 0) return cached;
  }

  // Primary: collect users from recent time entries (no user_id filter).
  // Each entry includes user: {id, name}. 1 API call, covers anyone who
  // logged time in the last 90 days. No admin or special permission needed.
  try {
    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const data = await apiFetch<{ time_entries: Array<{ user?: { id: number; name: string } }> }>(
      opts, '/time_entries',
      { from: fmt(ninetyDaysAgo), to: fmt(today), limit: 100 },
    );
    const seen = new Map<number, RedmineUser>();
    for (const e of data.time_entries ?? []) {
      if (e.user && !seen.has(e.user.id)) {
        const [firstname, ...rest] = e.user.name.split(' ');
        seen.set(e.user.id, {
          id: e.user.id,
          login: '',
          firstname: firstname ?? '',
          lastname: rest.join(' '),
          mail: '',
        });
      }
    }
    if (seen.size > 0) {
      const users = Array.from(seen.values()).sort((a, b) =>
        `${a.firstname} ${a.lastname}`.localeCompare(`${b.firstname} ${b.lastname}`),
      );
      writeUsersCache(opts.redmineUrl, users);
      return users;
    }
  } catch {
    /* fall through */
  }

  // Secondary: try Redmine internal /queries/filter (session cookie required).
  try {
    const raw = await apiFetch<unknown>(
      opts, '/queries/filter',
      { type: 'TimeEntryQuery', name: 'user_id' },
    );

    let arr: unknown[] = [];
    if (Array.isArray(raw)) {
      arr = raw;
    } else if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.values)) {
        arr = obj.values as unknown[];
      } else if (obj.user_id && typeof obj.user_id === 'object'
                 && Array.isArray((obj.user_id as { values?: unknown[] }).values)) {
        arr = (obj.user_id as { values: unknown[] }).values;
      }
    }

    const users: RedmineUser[] = [];
    for (const item of arr) {
      if (!Array.isArray(item) || item.length < 2) continue;
      const label = String(item[0] ?? '').trim();
      const idRaw = item[1];
      const userId = typeof idRaw === 'number' ? idRaw : parseInt(String(idRaw), 10);
      if (!Number.isFinite(userId) || userId <= 0) continue;
      if (/^anonymous$/i.test(label)) continue;
      const [firstname, ...rest] = label.split(' ');
      users.push({
        id: userId,
        login: '',
        firstname: firstname ?? '',
        lastname: rest.join(' '),
        mail: '',
      });
    }
    if (users.length > 0) {
      users.sort((a, b) =>
        `${a.firstname} ${a.lastname}`.localeCompare(`${b.firstname} ${b.lastname}`),
      );
      writeUsersCache(opts.redmineUrl, users);
      return users;
    }
  } catch {
    /* fall through to admin / memberships approaches */
  }

  // Try /users.json (admin-only). Fall back to collecting users from
  // project memberships, which project leaders/members can access.
  try {
    const all: RedmineUser[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const data = await apiFetch<{ users: RedmineUser[] }>(
        opts, '/users', { limit, offset, status: 1 },
      );
      const batch = data.users ?? [];
      all.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
      if (offset > 1000) break;
    }
    if (all.length > 0) {
      writeUsersCache(opts.redmineUrl, all);
      return all;
    }
  } catch {
    /* fall through */
  }

  // Fallback: walk projects → memberships
  try {
    const projects: RedmineProject[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const data = await apiFetch<{ projects: RedmineProject[] }>(
        opts, '/projects', { limit, offset },
      );
      const batch = data.projects ?? [];
      projects.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
      if (offset > 500) break;
    }

    const seen = new Map<number, RedmineUser>();
    // Parallel walk with concurrency cap to avoid hammering Redmine.
    const CONCURRENCY = 10;
    for (let i = 0; i < projects.length; i += CONCURRENCY) {
      const batch = projects.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (p) => {
        try {
          const data = await apiFetch<{ memberships: RedmineMembership[] }>(
            opts, `/projects/${p.id}/memberships`, { limit: 100 },
          );
          for (const m of data.memberships ?? []) {
            if (m.user && !seen.has(m.user.id)) {
              const [firstname, ...rest] = m.user.name.split(' ');
              seen.set(m.user.id, {
                id: m.user.id,
                login: '',
                firstname: firstname ?? '',
                lastname: rest.join(' '),
                mail: '',
              });
            }
          }
        } catch {
          /* skip projects we can't read */
        }
      }));
    }
    const result = Array.from(seen.values()).sort((a, b) =>
      `${a.firstname} ${a.lastname}`.localeCompare(`${b.firstname} ${b.lastname}`),
    );
    if (result.length > 0) writeUsersCache(opts.redmineUrl, result);
    return result;
  } catch {
    return [];
  }
}

export async function fetchActivities(opts: RequestOptions): Promise<RedmineActivity[]> {
  const data = await apiFetch<{ time_entry_activities: RedmineActivity[] }>(
    opts, '/enumerations/time_entry_activities',
  );
  return data.time_entry_activities ?? [];
}

export async function fetchTimeEntries(
  opts: RequestOptions,
  userId: number,
  from: string,
  to: string,
): Promise<RedmineTimeEntry[]> {
  const all: RedmineTimeEntry[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const data = await apiFetch<{ time_entries: RedmineTimeEntry[] }>(
      opts, '/time_entries',
      { user_id: userId, from, to, limit, offset },
    );
    const batch = data.time_entries ?? [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  // Enrich issue.name + parentId (time_entries API only returns issue id).
  // Use a 7-day localStorage cache so the same issue isn't refetched across months.
  const issueIds = Array.from(new Set(
    all.map(e => e.issue?.id).filter((x): x is number => typeof x === 'number'),
  ));
  if (issueIds.length > 0) {
    const { subjects, parentIds: parentIdMap } = await readIssueSubjectCache(opts.redmineUrl);
    const subjectMap = new Map<number, string>(subjects);
    const missing = issueIds.filter(id => !subjectMap.has(id));
    if (missing.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < missing.length; i += chunkSize) {
        const chunk = missing.slice(i, i + chunkSize);
        try {
          const data = await apiFetch<{ issues: { id: number; subject: string; parent?: { id: number } }[] }>(
            opts, '/issues',
            { issue_id: chunk.join(','), status_id: '*', limit: chunkSize },
          );
          for (const it of data.issues ?? []) {
            subjectMap.set(it.id, it.subject);
            if (it.parent?.id) parentIdMap.set(it.id, it.parent.id);
          }
        } catch {
          /* skip chunk on error */
        }
      }
      await writeIssueSubjectCache(opts.redmineUrl, subjectMap, parentIdMap);
    }
    for (const e of all) {
      if (e.issue && subjectMap.has(e.issue.id)) {
        const parentId = parentIdMap.get(e.issue.id);
        e.issue = { ...e.issue, name: subjectMap.get(e.issue.id), ...(parentId ? { parentId } : {}) };
      }
    }
  }

  return all;
}

const ISSUE_SUBJECT_CACHE_KEY = 'redmine_issue_subjects';
const ISSUE_SUBJECT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

interface IssueSubjectCache {
  url: string; ts: number;
  data: Array<[number, string]>;
  parentIds?: Record<string, number>;
}

async function readIssueSubjectCache(redmineUrl: string): Promise<{ subjects: Array<[number, string]>; parentIds: Map<number, number> }> {
  try {
    const raw = await secureGet(ISSUE_SUBJECT_CACHE_KEY);
    if (!raw) return { subjects: [], parentIds: new Map() };
    const parsed = JSON.parse(raw) as IssueSubjectCache;
    if (parsed.url !== redmineUrl) return { subjects: [], parentIds: new Map() };
    if (Date.now() - parsed.ts > ISSUE_SUBJECT_CACHE_TTL) return { subjects: [], parentIds: new Map() };
    const parentIds = new Map<number, number>(
      Object.entries(parsed.parentIds ?? {}).map(([k, v]) => [Number(k), v]),
    );
    return { subjects: parsed.data, parentIds };
  } catch { return { subjects: [], parentIds: new Map() }; }
}

async function writeIssueSubjectCache(
  redmineUrl: string,
  subjectMap: Map<number, string>,
  parentIdMap: Map<number, number>,
) {
  try {
    const parentIds: Record<string, number> = {};
    parentIdMap.forEach((v, k) => { parentIds[String(k)] = v; });
    await secureSet(ISSUE_SUBJECT_CACHE_KEY, JSON.stringify({
      url: redmineUrl, ts: Date.now(),
      data: Array.from(subjectMap.entries()),
      parentIds,
    }));
  } catch { /* quota */ }
}

/** Fetch all time entries within a range (no user filter). Useful for team views. */
export async function fetchAllTimeEntries(
  opts: RequestOptions,
  from: string,
  to: string,
): Promise<RedmineTimeEntry[]> {
  const all: RedmineTimeEntry[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const data = await apiFetch<{ time_entries: RedmineTimeEntry[] }>(
      opts, '/time_entries',
      { from, to, limit, offset },
    );
    const batch = data.time_entries ?? [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
    if (offset > 5000) break; // safety
  }
  return all;
}

export async function deleteTimeEntry(opts: RequestOptions, entryId: number): Promise<void> {
  await apiFetch(opts, `/time_entries/${entryId}`, {}, { method: 'DELETE' });
}

export async function createTimeEntry(
  opts: RequestOptions,
  entry: {
    spent_on: string;
    hours: number;
    activity_id: number;
    comments: string;
    issue_id?: number;
  },
): Promise<void> {
  await apiFetch(opts, '/time_entries', {}, {
    method: 'POST',
    body: JSON.stringify({ time_entry: entry }),
  });
}

async function enrichWithParents(opts: RequestOptions, issues: RedmineIssue[]): Promise<RedmineIssue[]> {
  const parentIds = [...new Set(issues.filter(i => i.parent?.id).map(i => i.parent!.id))];
  if (parentIds.length === 0) return issues;
  const results = await Promise.allSettled(
    parentIds.map(id => apiFetch<{ issue: RedmineIssue }>(opts, `/issues/${id}`)),
  );
  const subjectMap = new Map<number, string>();
  for (const r of results) {
    if (r.status === 'fulfilled') subjectMap.set(r.value.issue.id, r.value.issue.subject);
  }
  return issues.map(issue =>
    issue.parent?.id && subjectMap.has(issue.parent.id)
      ? { ...issue, parent: { id: issue.parent.id, subject: subjectMap.get(issue.parent.id) } }
      : issue,
  );
}

export async function searchIssues(
  opts: RequestOptions,
  query: string,
  userId: number,
): Promise<RedmineIssue[]> {
  if (/^\d+$/.test(query)) {
    try {
      const data = await apiFetch<{ issue: RedmineIssue }>(opts, `/issues/${query}`);
      return enrichWithParents(opts, [data.issue]);
    } catch {
      return [];
    }
  }
  let issues: RedmineIssue[];
  try {
    const data = await apiFetch<{ issues: RedmineIssue[] }>(
      opts, '/issues',
      { subject: `~${query}`, limit: 10, assigned_to_id: userId },
    );
    issues = data.issues ?? [];
  } catch {
    const data = await apiFetch<{ issues: RedmineIssue[] }>(
      opts, '/issues',
      { subject: `~${query}`, limit: 10 },
    );
    issues = data.issues ?? [];
  }
  return enrichWithParents(opts, issues);
}
