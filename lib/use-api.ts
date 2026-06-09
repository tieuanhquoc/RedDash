'use client';

/**
 * Generic async-call manager hook. Use for any API call that needs
 * loading / error / retry state without writing the boilerplate every time.
 *
 *   const { data, error, loading, retry, call } = useApi(
 *     () => fetchTimeEntries(opts, userId, from, to),
 *     [opts, userId, from, to],
 *   );
 *
 * Pass `{ immediate: false }` if you don't want it to run on mount —
 * trigger manually via `call()`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorToMessage } from './api-error';

export interface UseApiOptions {
  /** Run on mount + when deps change. Default true. */
  immediate?: boolean;
}

export interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-run the call manually. */
  call: () => Promise<T | null>;
  /** Alias for `call`. */
  retry: () => Promise<T | null>;
  /** Clear current data + error. */
  reset: () => void;
}

export function useApi<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList,
  opts: UseApiOptions = {},
): UseApiResult<T> {
  const { immediate = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(immediate);
  const runIdRef = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const call = useCallback(async (): Promise<T | null> => {
    const id = ++runIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (id !== runIdRef.current) return null; // superseded
      setData(result);
      return result;
    } catch (err) {
      if (id !== runIdRef.current) return null;
      setError(errorToMessage(err));
      return null;
    } finally {
      if (id === runIdRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    runIdRef.current++;
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (immediate) void call();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, call, retry: call, reset };
}
