import { isNative } from '@/lib/capacitor';
import { auth } from '@/lib/firebase';

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
  body?: unknown;
  method?: string;
  /** Set false for public (unauthenticated) endpoints, e.g. forgot/reset password. */
  auth?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Centralized authenticated fetch                                    */
/* ------------------------------------------------------------------ */

let signOutInFlight = false;

/**
 * Sign the user out and redirect to the welcome/login screen.
 * Used when a 401 survives a forced token refresh — the session is
 * genuinely invalid (expired, revoked, or deleted account).
 */
async function handleAuthFailure(): Promise<void> {
  if (signOutInFlight) return;
  signOutInFlight = true;
  try {
    const { useAuthStore } = await import('@/stores/auth-store');
    useAuthStore.getState().logout();
    const { useUIStore } = await import('@/stores/ui-store');
    useUIStore.getState().setView('welcome');
    useUIStore.getState().setSplashDone(true);
  } catch {
    // Ignore — best effort redirect.
  } finally {
    setTimeout(() => {
      signOutInFlight = false;
    }, 1500);
  }
}

/**
 * Centralized authenticated fetch.
 *
 * - Never caches Firebase ID tokens — always obtains a FRESH token via
 *   `auth.currentUser.getIdToken()` right before sending the request.
 * - On a 401 response, force-refreshes the token (`getIdToken(true)`) and
 *   retries the request ONCE.
 * - If the retry also 401s, signs the user out and redirects to login.
 *
 * Throws if there is no authenticated Firebase user.
 */
export interface AuthFetchOptions {
  /**
   * When false, a 401 that survives the forced-refresh retry throws WITHOUT
   * signing the user out. Used by session-hydration flows (sign-in restore,
   * onAuthStateChanged) where a 401 from /auth/me simply means "no DB record
   * yet" for an otherwise valid session. Defaults to true.
   */
  autoSignOut?: boolean;
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts: AuthFetchOptions = {}
): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const doFetch = (token: string) =>
    fetch(input, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        Authorization: `Bearer ${token}`,
      },
    });

  // 1) Fresh token for every request.
  const token = await user.getIdToken();
  let res = await doFetch(token);

  // 2) 401 → force refresh + retry ONCE.
  if (res.status === 401) {
    const refreshed = await user.getIdToken(true);
    res = await doFetch(refreshed);
    if (res.status === 401) {
      // 3) Retry failed — session is invalid.
      if (opts.autoSignOut !== false) {
        await handleAuthFailure();
      }
      throw new Error('Session expired. Please sign in again.');
    }
  }

  return res;
}

/**
 * Sign the user out and land on the welcome/login screen.
 * Used by non-fetch call sites (e.g. the XHR media upload) when a 401
 * survives a forced token refresh.
 */
export async function signOutAndRedirect(): Promise<void> {
  await handleAuthFailure();
}

/**
 * Parse a JSON response and normalize the `{ success: false, error }` shape.
 * Non-JSON bodies (proxies, HTML error pages) fall back to a generic error.
 */
async function parseJson<T = unknown>(res: Response): Promise<{ success: boolean; error?: string; data?: T }> {
  try {
    return await res.json();
  } catch {
    return { success: false, error: `Request failed (${res.status})` };
  }
}

/** Standard authenticated API call. Attaches a fresh Firebase ID token. */
export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, method = body ? 'POST' : 'GET', auth: needsAuth = true } = options;
  const url = `${API_BASE}/api${path}`;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = needsAuth
    ? await authFetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    : await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

  const json = await parseJson<T>(res);
  if (!json.success) throw new Error(json.error || 'Request failed');
  return json.data as T;
}

/** api() variant for file uploads (FormData, no Content-Type header). */
export async function apiUpload<T = unknown>(path: string, options: { body: FormData; method?: string }): Promise<T> {
  const { body, method = 'POST' } = options;
  const res = await authFetch(`${API_BASE}/api${path}`, { method, body });
  const json = await parseJson<T>(res);
  if (!json.success) throw new Error(json.error || 'Upload failed');
  return json.data as T;
}
