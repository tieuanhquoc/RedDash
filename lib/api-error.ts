/**
 * Typed API error with friendly Vietnamese messages.
 *
 * Replaces the previous `throw new Error("HTTP 401: …")` pattern so callers
 * can render meaningful UI ("Sai API token") instead of raw status codes.
 */

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
  switch (status) {
    case 0:        return 'Không kết nối được Redmine. Kiểm tra mạng hoặc URL.';
    case 400:      return 'Dữ liệu gửi không hợp lệ.';
    case 401:      return 'API token không đúng hoặc đã bị thu hồi.';
    case 403:      return 'Không có quyền thực hiện thao tác này.';
    case 404:      return 'Không tìm thấy tài nguyên (issue, user, hoặc URL sai).';
    case 408:      return 'Redmine phản hồi quá lâu, thử lại sau.';
    case 422:      return 'Dữ liệu không hợp lệ (Redmine từ chối lưu).';
    case 429:      return 'Quá nhiều request — chờ một chút rồi thử lại.';
    case 500:      return 'Redmine gặp lỗi nội bộ. Thử lại sau ít phút.';
    case 502:
    case 503:
    case 504:      return 'Redmine đang bảo trì hoặc tạm thời không phản hồi.';
    default:
      if (status >= 500) return 'Lỗi máy chủ Redmine — thử lại sau.';
      if (status >= 400) return 'Yêu cầu bị từ chối.';
      return 'Có lỗi không xác định khi gọi Redmine.';
  }
}

/** Convert an arbitrary thrown value into a user-friendly string. */
export function errorToMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) {
    // Network-level errors from invoke / reqwest.
    if (/network|connect|timeout|dns|resolve/i.test(err.message)) {
      return 'Không kết nối được Redmine. Kiểm tra mạng hoặc URL.';
    }
    return err.message;
  }
  return String(err);
}
