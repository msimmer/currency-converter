// Rates alerts Worker.
//
// The app registers its push subscription and currency list here. Every hour a
// cron run checks each list's pairs ("You convert" currency against each other
// one) and pushes a notification for any pair at a new 2-week high or low:
// at most one per pair per day of rates, and only between 8 am and 9 pm in
// the phone's time zone.
//
// Storage (KV, binding ALERTS): "sub:<sha256 of endpoint>" -> {
//   subscription, base, codes, names, timeZone, sent: { 'CAD/USD': '2026-10-23' } }

import { alertPayload, findExtremes, loadHistory } from './alerts.js';
import { sendPush } from './webpush.js';

const QUIET_UNTIL = 8;
const QUIET_FROM = 21;
const MAX_CODES = 30;

// Only real push services, so this can't be used to POST to arbitrary URLs.
const PUSH_HOSTS = /(^|\.)push\.apple\.com$|^fcm\.googleapis\.com$|(^|\.)push\.services\.mozilla\.com$|\.notify\.windows\.com$/;

export default {
  async fetch(request, env) {
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
      return json({ error: err.message }, status, cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAlerts(env));
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

async function route(request, env) {
  const { pathname } = new URL(request.url);
  const key = `${request.method} ${pathname}`;

  if (key === 'GET /config') return json({ publicKey: env.VAPID_PUBLIC_KEY });

  if (key === 'PUT /subscription') {
    const body = await readBody(request);
    const record = validate(body);
    const id = await subKey(record.subscription.endpoint);
    const old = await env.ALERTS.get(id, 'json');
    // Keep "already sent today" marks for pairs still in the list.
    const pairs = new Set(record.codes.map((c) => `${record.base}/${c}`));
    record.sent = Object.fromEntries(Object.entries(old?.sent ?? {}).filter(([pair]) => pairs.has(pair)));
    await env.ALERTS.put(id, JSON.stringify(record));
    return json({ ok: true });
  }

  if (key === 'DELETE /subscription') {
    const { endpoint } = await readBody(request);
    if (typeof endpoint !== 'string') throw new HttpError(400, 'endpoint required');
    await env.ALERTS.delete(await subKey(endpoint));
    return json({ ok: true });
  }

  if (key === 'POST /test') {
    const { endpoint } = await readBody(request);
    const record = typeof endpoint === 'string' && await env.ALERTS.get(await subKey(endpoint), 'json');
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

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Expected JSON');
  }
}

function validate(body) {
  const sub = body?.subscription;
  let host;
  try { host = new URL(sub.endpoint).hostname; } catch { /* checked below */ }
  if (!host || !sub.endpoint.startsWith('https://') || !PUSH_HOSTS.test(host)) throw new HttpError(400, 'Unsupported push endpoint');
  if (typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') throw new HttpError(400, 'Missing subscription keys');

  const isCode = (c) => typeof c === 'string' && /^[A-Z]{3}$/.test(c);
  const codes = Array.isArray(body.codes) ? body.codes.filter(isCode).slice(0, MAX_CODES) : [];
  if (!isCode(body.base)) throw new HttpError(400, 'base must be a currency code');

  const names = {};
  for (const c of [body.base, ...codes]) {
    const n = body.names?.[c];
    names[c] = { name: String(n?.name ?? c).slice(0, 60), flag: String(n?.flag ?? '').slice(0, 8) };
  }

  let timeZone = 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: body.timeZone });
    if (typeof body.timeZone === 'string') timeZone = body.timeZone;
  } catch { /* keep UTC */ }

  return {
    subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
    base: body.base,
    codes,
    names,
    timeZone,
  };
}

async function subKey(endpoint) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return 'sub:' + [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function vapid(env) {
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
}

function listText(items) {
  return items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function localHour(timeZone, now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
}

async function allKeys(kv) {
  const keys = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: 'sub:', cursor });
    keys.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

export async function runAlerts(env, now = new Date()) {
  const keys = await allKeys(env.ALERTS);
  if (!keys.length) return;
  const history = await loadHistory();
  const date = history.at(-1).date;

  for (const id of keys) {
    const record = await env.ALERTS.get(id, 'json');
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
