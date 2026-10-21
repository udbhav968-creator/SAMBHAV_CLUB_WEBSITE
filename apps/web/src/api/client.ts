/**
 * Fetch wrapper.
 *  - Access token lives in memory only (never localStorage) → XSS can't exfiltrate a long-lived credential.
 *  - Refresh token is an httpOnly, SameSite=strict cookie scoped to /api/v1/auth.
 *  - On 401 the client performs ONE single-flight refresh and replays the request.
 */
export type Role = "ADMIN" | "COORDINATOR" | "MEMBER";
export interface User { id: string; email: string; username: string | null; phoneHint: string | null; passwordChangedAt: string | null; mustChangePassword?: boolean; passwordChangeRequired?: boolean; name: string; role: Role; rollNo: string | null; programme: string | null; year: number | null; title: string | null; credits: number; interests: string | null }
export class ApiError extends Error { constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); } }

let accessToken: string | null = null;
let onUserChange: (u: User | null) => void = () => {};
export const setAuthListener = (fn: (u: User | null) => void) => { onUserChange = fn; };
export const getAccessToken = () => accessToken;

let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" })
    .then(async (r) => { if (!r.ok) { accessToken = null; onUserChange(null); return false; } const b = await r.json(); accessToken = b.accessToken; onUserChange(b.user); return true; })
    .catch(() => false).finally(() => { refreshing = null; });
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; raw?: boolean } = {}, retry = true): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    credentials: "include",
    headers: { ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) { if (await refreshSession()) return api<T>(path, opts, false); }
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new ApiError(res.status, b?.error?.code ?? "error", b?.error?.message ?? `Request failed (${res.status})`, b?.error?.details);
  }
  if (opts.raw) return (await res.text()) as T;
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export async function login(identifier: string, password: string) {
  const b = await api<{ accessToken: string; user: User }>("/auth/login", { body: { identifier, password } });
  accessToken = b.accessToken; onUserChange(b.user); return b.user;
}
export async function register(input: { email: string; password: string; name: string; rollNo?: string; programme?: string; year?: number }) {
  const b = await api<{ accessToken: string; user: User }>("/auth/register", { body: input });
  accessToken = b.accessToken; onUserChange(b.user); return b.user;
}
export async function logout() { await api("/auth/logout", { method: "POST" }).catch(() => {}); accessToken = null; onUserChange(null); }
