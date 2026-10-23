// Prints a new VAPID key pair for Web Push (base64url, the usual format).

import { b64u } from '../src/webpush.js';

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const publicKey = b64u(await crypto.subtle.exportKey('raw', pair.publicKey));
const { d: privateKey } = await crypto.subtle.exportKey('jwk', pair.privateKey);

console.log(`VAPID_PUBLIC_KEY  ${publicKey}`);
console.log(`VAPID_PRIVATE_KEY ${privateKey}`);
console.log('\nPut the public key in wrangler.jsonc. Store the private key as a secret:');
console.log('  npx wrangler secret put VAPID_PRIVATE_KEY');
