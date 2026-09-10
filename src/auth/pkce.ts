// PKCE (RFC 7636) helpers for the /authorize -> Auth0 -> /callback bridge.
// Pure Web Crypto — no Node `crypto` module, so this runs unmodified in the
// Workers runtime.

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** RFC 7636 code_verifier: 43-128 chars of unreserved characters. 32 random bytes -> 43-char base64url. */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

/** S256 code_challenge for a given verifier. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** Our own `state` value sent to Auth0 — a random nonce keying the pending-auth KV entry (see state.ts). */
export function generateNonce(): string {
  return base64url(randomBytes(16));
}
