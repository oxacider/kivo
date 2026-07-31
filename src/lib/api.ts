import { isNative } from '@/lib/capacitor';

/**
 * Configurable API base URL.
 *
 * - Web: empty string (relative URLs, same-origin via Caddy gateway)
 * - Native: also relative — Capacitor WebView resolves against server.url
 *   from capacitor.config.ts, so relative paths just work.
 *
 * Override with NEXT_PUBLIC_API_BASE_URL if you need a different origin
 * (e.g. separate API server for native).
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

type RequestOptions = {
  token?: string | null;
  body?: unknown;
  method?: string;
};

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, body, method = body ? 'POST' : 'GET' } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Request failed');
  return json.data as T;
}

/**
 * api() variant for file uploads (FormData, no Content-Type header).
 */
export async function apiUpload<T = unknown>(path: string, options: { token?: string | null; body: FormData; method?: string }): Promise<T> {
  const { token, body, method = 'POST' } = options;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body,
  });

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Upload failed');
  return json.data as T;
}
