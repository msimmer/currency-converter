// Prints a new VAPID key pair for Web Push (base64url, the usual format).
// Node runs this TypeScript directly (type stripping, Node 22.18+).

import { b64u } from '../src/webpush.ts';

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']) as CryptoKeyPair;
const publicKey = b64u(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer);
const { d: privateKey } = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey;

console.log(`VAPID_PUBLIC_KEY  ${publicKey}`);
console.log(`VAPID_PRIVATE_KEY ${privateKey}`);
console.log('\nPut the public key in wrangler.jsonc. Store the private key as a secret:');
console.log('  npx wrangler secret put VAPID_PRIVATE_KEY');
