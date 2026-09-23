import type { ApiErrorBody } from '@zakisu-tickets/shared';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody | undefined) {
    super(body?.error?.message ?? `Request failed (${status})`);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = body?.error?.code ?? 'INTERNAL_ERROR';
    this.details = body?.error?.details;
  }

  get isStaleUpdate(): boolean {
    return this.code === 'STALE_UPDATE';
  }
  get isUnauthenticated(): boolean {
    return this.code === 'UNAUTHENTICATED' || this.status === 401;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiClientError(0, { error: { code: 'INTERNAL_ERROR', message: 'Network error — check your connection' } });
  }

  if (res.status === 204) return undefined as T;

  let json: unknown = undefined;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/login') && !url.startsWith('/api/auth/register')) {
      // Session expired: let the router react via the auth context listeners.
      window.dispatchEvent(new CustomEvent('zt:session-expired'));
    }
    throw new ApiClientError(res.status, json as ApiErrorBody);
  }
  return json as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  delete: <T>(url: string) => request<T>('DELETE', url),
};
