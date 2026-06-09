/**
 * Typed API error with friendly Vietnamese messages.
 *
 * Replaces the previous `throw new Error("HTTP 401: …")` pattern so callers
 * can render meaningful UI ("Sai API token") instead of raw status codes.
 */

import { getDict } from './i18n';

export class ApiError extends Error {
  status: number;
  rawBody: unknown;
  /** True if the issue is on the user's side (auth, validation, missing). */
  isClientError: boolean;
  /** True if the issue is the server/network. */
  isServerError: boolean;
  /** True if the request never reached the server (timeout, offline, DNS). */
  isNetworkError: boolean;

  constructor(opts: {
    status: number; rawBody?: unknown;
    message: string;
    isNetworkError?: boolean;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.rawBody = opts.rawBody;
    this.isNetworkError = !!opts.isNetworkError;
    this.isClientError = opts.status >= 400 && opts.status < 500;
    this.isServerError = opts.status >= 500;
  }
}

/** Map common Redmine + HTTP errors to user-friendly Vietnamese. */
export function friendlyMessage(status: number, rawBody: unknown): string {
  // Try to pluck a Redmine error array first: { errors: ["...", ...] }
  if (rawBody && typeof rawBody === 'object' && 'errors' in rawBody) {
    const errs = (rawBody as { errors: unknown }).errors;
    if (Array.isArray(errs) && errs.length > 0) {
      return errs.map(e => String(e)).join('. ');
    }
  }
  const dict = getDict();
  switch (status) {
    case 0:        return dict.errors.network;
    case 400:      return dict.errors.badRequest;
    case 401:      return dict.errors.badToken;
    case 403:      return dict.errors.forbidden;
    case 404:      return dict.errors.notFound;
    case 408:      return dict.errors.timeout;
    case 422:      return dict.errors.validation;
    case 429:      return dict.errors.rateLimit;
    case 500:      return dict.errors.server;
    case 502:
    case 503:
    case 504:      return dict.errors.maintenance;
    default:
      if (status >= 500) return dict.errors.serverError;
      if (status >= 400) return dict.errors.clientError;
      return dict.errors.unknown;
  }
}

/** Convert an arbitrary thrown value into a user-friendly string. */
export function errorToMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) {
    // Network-level errors from invoke / reqwest.
    if (/network|connect|timeout|dns|resolve/i.test(err.message)) {
      return getDict().errors.network;
    }
    return err.message;
  }
  return String(err);
}
