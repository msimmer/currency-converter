// Rates alerts Worker.
//
// The app registers its push subscription and currency list here. Every hour a
// cron run checks each list's pairs ("You convert" currency against each other
// one) and pushes a notification for any pair at a new 2-week high or low:
// at most one per pair per day of rates, and only between 8 am and 9 pm in
// the phone's time zone.
//
// Storage (KV, binding ALERTS): "sub:<sha256 of endpoint>" -> a SubscriptionRecord.

import { alertPayload, findExtremes, loadHistory, type Names } from './alerts';
import { sendPush, type Subscription, type Vapid } from './webpush';

export interface Env {
  ALERTS: KVNamespace;
  ALLOWED_ORIGIN: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string; // a secret: `wrangler secret put VAPID_PRIVATE_KEY`
}

interface SubscriptionRecord {
  subscription: Subscription;
  base: string;
  codes: string[];
  names: Names;
  timeZone: string;
  sent: Record<string, string>; // pair -> date of the rates it last alerted on, e.g. { 'CAD/USD': '2026-10-23' }
}

// PUT /subscription, as sent by the app. Checked by validate().
interface RegistrationBody {
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  base?: unknown;
  codes?: unknown;
  names?: Record<string, { name?: unknown; flag?: unknown } | undefined>;
  timeZone?: unknown;
}

const QUIET_UNTIL = 8;
const QUIET_FROM = 21;
const MAX_CODES = 30;

// Only real push services, so this can't be used to POST to arbitrary URLs.
const PUSH_HOSTS = /(^|\.)push\.apple\.com$|^fcm\.googleapis\.com$|(^|\.)push\.services\.mozilla\.com$|\.notify\.windows\.com$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      return json({ error: err instanceof Error ? err.message : String(err) }, status, cors);
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runAlerts(env));
  },
} satisfies ExportedHandler<Env>;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const key = `${request.method} ${pathname}`;

  if (key === 'GET /config') return json({ publicKey: env.VAPID_PUBLIC_KEY });

  if (key === 'PUT /subscription') {
    const body = await readBody<RegistrationBody>(request);
    const valid = validate(body);
    const id = await subKey(valid.subscription.endpoint);
    const old = await env.ALERTS.get<SubscriptionRecord>(id, 'json');
    // Keep "already sent today" marks for pairs still in the list.
    const pairs = new Set(valid.codes.map((c) => `${valid.base}/${c}`));
    const sent = Object.fromEntries(Object.entries(old?.sent ?? {}).filter(([pair]) => pairs.has(pair)));
    const record: SubscriptionRecord = { ...valid, sent };
    await env.ALERTS.put(id, JSON.stringify(record));
    return json({ ok: true });
  }

  if (key === 'DELETE /subscription') {
    const { endpoint } = await readBody<{ endpoint?: unknown }>(request);
    if (typeof endpoint !== 'string') throw new HttpError(400, 'endpoint required');
    await env.ALERTS.delete(await subKey(endpoint));
    return json({ ok: true });
  }

  if (key === 'POST /test') {
    const { endpoint } = await readBody<{ endpoint?: unknown }>(request);
    const record = typeof endpoint === 'string' ? await env.ALERTS.get<SubscriptionRecord>(await subKey(endpoint), 'json') : null;
    if (!record) throw new HttpError(404, 'Not registered for alerts');
    const pairs = record.codes.filter((c) => c !== record.base).map((c) => `${record.base}/${c}`);
    const res = await sendPush(record.subscription, {
      title: 'Rate alerts are on',
      body: pairs.length ? `Watching ${listText(pairs)} for 2 week highs and lows.` : 'Add currencies to your list to get alerts.',
      tag: 'test',
    }, vapid(env));
    if (!res.ok) throw new HttpError(502, `Push service said ${res.status}: ${await res.text()}`);
    return json({ ok: true });
  }

  throw new HttpError(404, 'Not found');
}

async function readBody<T>(request: Request): Promise<T> {
  try {
    return await request.json<T>();
  } catch {
    throw new HttpError(400, 'Expected JSON');
  }
}

function validate(body: RegistrationBody): Omit<SubscriptionRecord, 'sent'> {
  const endpoint = body?.subscription?.endpoint;
  let host;
  try { host = new URL(String(endpoint)).hostname; } catch { /* checked below */ }
  if (typeof endpoint !== 'string' || !host || !endpoint.startsWith('https://') || !PUSH_HOSTS.test(host)) {
    throw new HttpError(400, 'Unsupported push endpoint');
  }
  const { p256dh, auth } = body.subscription?.keys ?? {};
  if (typeof p256dh !== 'string' || typeof auth !== 'string') throw new HttpError(400, 'Missing subscription keys');

  const isCode = (c: unknown): c is string => typeof c === 'string' && /^[A-Z]{3}$/.test(c);
  const codes = Array.isArray(body.codes) ? body.codes.filter(isCode).slice(0, MAX_CODES) : [];
  const { base } = body;
  if (!isCode(base)) throw new HttpError(400, 'base must be a currency code');

  const names: Names = {};
  for (const c of [base, ...codes]) {
    const n = body.names?.[c];
    names[c] = { name: String(n?.name ?? c).slice(0, 60), flag: String(n?.flag ?? '').slice(0, 8) };
  }

  let timeZone = 'UTC';
  if (typeof body.timeZone === 'string') {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: body.timeZone });
      timeZone = body.timeZone;
    } catch { /* keep UTC */ }
  }

  return { subscription: { endpoint, keys: { p256dh, auth } }, base, codes, names, timeZone };
}

async function subKey(endpoint: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return 'sub:' + [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function vapid(env: Env): Vapid {
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
}

function listText(items: string[]): string {
  return items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function localHour(timeZone: string, now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
}

async function allKeys(kv: KVNamespace): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: 'sub:', cursor });
    keys.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

export async function runAlerts(env: Env, now = new Date()): Promise<void> {
  const keys = await allKeys(env.ALERTS);
  if (!keys.length) return;
  const history = await loadHistory();
  const date = history[history.length - 1].date;

  for (const id of keys) {
    const record = await env.ALERTS.get<SubscriptionRecord>(id, 'json');
    if (!record) continue;
    const hour = localHour(record.timeZone, now);
    if (hour < QUIET_UNTIL || hour >= QUIET_FROM) continue;

    let changed = false;
    let gone = false;
    for (const extreme of findExtremes(history, record.base, record.codes)) {
      const pair = `${record.base}/${extreme.to}`;
      if (record.sent[pair] === date) continue;
      const res = await sendPush(record.subscription, alertPayload(record.base, extreme, record.names), vapid(env));
      // 404/410: the subscription is gone (app deleted, notifications turned off).
      if (res.status === 404 || res.status === 410) {
        gone = true;
        break;
      }
      if (!res.ok) {
        console.error(`Push for ${pair} failed: ${res.status} ${await res.text()}`);
        continue;
      }
      record.sent[pair] = date;
      changed = true;
    }
    if (gone) await env.ALERTS.delete(id);
    else if (changed) await env.ALERTS.put(id, JSON.stringify(record));
  }
}
