import { afterEach, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import worker, { runAlerts, type Env } from '../src/index';
import { b64u, type Subscription } from '../src/webpush';

// The parts of KVNamespace the Worker uses.
class MemoryKV {
  map = new Map<string, string>();
  async get(k: string, type?: 'json') { const v = this.map.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; }
  async put(k: string, v: string) { this.map.set(k, v); }
  async delete(k: string) { this.map.delete(k); }
  async list({ prefix }: { prefix: string }) { return { keys: [...this.map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }
}

async function makeEnv(): Promise<{ env: Env; kv: MemoryKV }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']) as CryptoKeyPair;
  const kv = new MemoryKV();
  const env = {
    ALERTS: kv as unknown as KVNamespace,
    ALLOWED_ORIGIN: 'https://msimmer.github.io',
    VAPID_SUBJECT: 'https://msimmer.github.io/currency-converter/',
    VAPID_PUBLIC_KEY: b64u(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer),
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey).d!,
  };
  return { env, kv };
}

function subscription(endpoint = 'https://web.push.apple.com/abc123'): Subscription {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  return { endpoint, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(randomBytes(16)) } };
}

// Fake rate snapshots (CAD/USD at a new high on the latest day) and push service.
let pushes: { url: string; init?: RequestInit }[];
let pushStatus: number;
const realFetch = globalThis.fetch;
beforeEach(() => {
  pushes = [];
  pushStatus = 201;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('push')) {
      pushes.push({ url, init });
      return new Response('', { status: pushStatus });
    }
    const m = url.match(/currency-api@([\w-]+)\//);
    if (!m) return new Response('', { status: 404 });
    const latest = '2026-10-23';
    const date = m[1] === 'latest' ? latest : m[1];
    const cadUsd = date === latest ? 0.7156 : 0.71;
    return Response.json({ date, usd: { usd: 1, cad: 1 / cadUsd, eur: 0.92 } });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const call = (env: Env, method: string, path: string, body?: unknown) => worker.fetch(new Request(`https://w.example${path}`, {
  method, body: body ? JSON.stringify(body) : undefined, headers: { 'Content-Type': 'application/json' },
}), env);

async function register(env: Env, sub = subscription(), extra = {}) {
  const res = await call(env, 'PUT', '/subscription', {
    subscription: sub,
    base: 'CAD',
    codes: ['CAD', 'USD', 'EUR'],
    names: { CAD: { name: 'the Canadian Dollar', flag: '🇨🇦' }, USD: { name: 'the US Dollar', flag: '🇺🇸' } },
    timeZone: 'America/Toronto',
    ...extra,
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://msimmer.github.io');
  return sub;
}

const noonToronto = new Date('2026-10-23T16:00:00Z');

test('sends one alert per pair per day of rates', async () => {
  const { env } = await makeEnv();
  await register(env);
  await runAlerts(env, noonToronto);
  assert.equal(pushes.length, 2, 'CAD/USD and CAD/EUR (EUR is flat against USD)');
  assert.equal((pushes[0].init?.headers as Record<string, string>)['Content-Encoding'], 'aes128gcm');
  await runAlerts(env, noonToronto);
  assert.equal(pushes.length, 2, 'not again the same day');
});

test('waits for daytime in the phone’s time zone', async () => {
  const { env } = await makeEnv();
  await register(env);
  await runAlerts(env, new Date('2026-10-23T06:00:00Z')); // 2 am in Toronto
  assert.equal(pushes.length, 0);
  await runAlerts(env, noonToronto);
  assert.equal(pushes.length, 2);
});

test('forgets subscriptions the push service says are gone', async () => {
  const { env, kv } = await makeEnv();
  await register(env);
  pushStatus = 410;
  await runAlerts(env, noonToronto);
  assert.equal(kv.map.size, 0);
});

test('rejects endpoints that are not push services', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'PUT', '/subscription', { subscription: subscription('https://evil.example/x'), base: 'CAD', codes: [] });
  assert.equal(res.status, 400);
});

test('re-registering keeps sent marks only for pairs still listed', async () => {
  const { env } = await makeEnv();
  const sub = await register(env);
  await runAlerts(env, noonToronto);
  await register(env, sub, { codes: ['CAD', 'USD'] });
  await runAlerts(env, noonToronto);
  assert.equal(pushes.length, 2, 'CAD/USD still marked as sent');
  await register(env, sub, { codes: ['CAD', 'EUR'] });
  await runAlerts(env, noonToronto);
  assert.equal(pushes.length, 3, 'CAD/EUR was dropped from the list, so it alerts again');
});

test('test push and unsubscribe', async () => {
  const { env, kv } = await makeEnv();
  const sub = await register(env);
  assert.equal((await call(env, 'POST', '/test', { endpoint: sub.endpoint })).status, 200);
  assert.equal(pushes.length, 1);
  assert.equal((await call(env, 'DELETE', '/subscription', { endpoint: sub.endpoint })).status, 200);
  assert.equal(kv.map.size, 0);
  assert.equal((await call(env, 'POST', '/test', { endpoint: sub.endpoint })).status, 404);
});
