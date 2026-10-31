import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import ece from 'http_ece';
import { b64u, encrypt, fromB64u, vapidAuth } from '../src/webpush';

test('payload decrypts with http_ece (the library behind web-push)', async () => {
  // The browser's side of a subscription.
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  const keys = { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) };

  const body = await encrypt('{"title":"CAD/USD hits 0.7156 📈"}', keys);
  const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua, authSecret: auth });
  assert.equal(plain.toString(), '{"title":"CAD/USD hits 0.7156 📈"}');
});

test('VAPID token is a valid ES256 JWT for the push origin', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const publicKey = b64u(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer);
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey;

  const header = await vapidAuth('https://web.push.apple.com/QGuQyavXutnMH/abc', {
    publicKey, privateKey: d!, subject: 'https://example.com/',
  });
  const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
  assert.equal(k, publicKey);

  const [h, c, s] = jwt.split('.');
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromB64u(s), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(ok, 'signature verifies');

  const claims = JSON.parse(new TextDecoder().decode(fromB64u(c)));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'https://example.com/');
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 86400);
});
