// http_ece (the library behind the web-push package) ships no types; this is
// the part the tests use to check our encryption against it.
declare module 'http_ece' {
  import type { ECDH } from 'node:crypto';

  export function decrypt(
    buffer: Buffer,
    params: { version: 'aes128gcm'; privateKey: ECDH; authSecret: Buffer },
  ): Buffer;
}
