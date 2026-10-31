// Rate alerts: a push notification when a pair from the list ("You convert"
// against each other currency) hits a 2-week high or low. The checking runs on a
// Cloudflare Worker (worker/); this side subscribes, keeps the Worker's copy of
// the list current, and unsubscribes. The Settings switch is AlertsSetting.tsx.

import { ALERTS_API } from './config';
import { currencyName, flagEmoji, isMetal } from './currencies';

const KEY_CACHE = 'alerts:key';
const SYNCED_KEY = 'alerts:synced'; // last list sent to the Worker, to skip repeats

export function cachedKey(): string | null {
  try { return localStorage.getItem(KEY_CACHE); } catch { return null; }
}

export async function fetchKey(): Promise<string> {
  const { publicKey } = await api<{ publicKey: string }>('GET', '/config');
  try { localStorage.setItem(KEY_CACHE, publicKey); } catch { /* ignore */ }
  return publicKey;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(ALERTS_API.replace(/\/$/, '') + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// ---- Keeping the Worker's list current -------------------------------------

/** Pairs as the notifications name them; metals read as a price (XAU/CAD). */
export function pairs(list: string[]): string[] {
  const [base, ...rest] = list;
  return rest.map((c) => (isMetal(c) && !isMetal(base) ? `${c}/${base}` : `${base}/${c}`));
}

function registration(sub: PushSubscription, list: string[]) {
  const names: Record<string, { name: string; flag: string }> = {};
  for (const c of list) {
    names[c] = { name: isMetal(c) ? currencyName(c).toLowerCase() : `the ${currencyName(c)}`, flag: flagEmoji(c) };
  }
  return {
    subscription: sub.toJSON(),
    base: list[0] ?? 'USD',
    codes: list,
    names,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export async function register(sub: PushSubscription, list: string[]): Promise<void> {
  const body = registration(sub, list);
  await api('PUT', '/subscription', body);
  try { localStorage.setItem(SYNCED_KEY, JSON.stringify(body)); } catch { /* ignore */ }
}

/** Send the list to the Worker if alerts are on and it changed since the last send. */
export async function syncList(reg: ServiceWorkerRegistration, list: string[]): Promise<void> {
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  let last = null;
  try { last = localStorage.getItem(SYNCED_KEY); } catch { /* ignore */ }
  if (JSON.stringify(registration(sub, list)) === last) return;
  await register(sub, list);
}

export function forgetSynced(): void {
  try { localStorage.removeItem(SYNCED_KEY); } catch { /* ignore */ }
}
