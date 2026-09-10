// Pending-authorization store: bridges the two legs of the login flow.
//
// The MCP client's own AuthRequest (captured by env.OAUTH_PROVIDER.parseAuthRequest
// at /authorize) has to survive the round trip to Auth0 and back to /callback,
// alongside the PKCE code_verifier we generated for that Auth0 leg. KV keyed by a
// random nonce (sent to Auth0 as our own `state` param) is a one-time-use mailbox
// for that — put at /authorize, get-then-delete at /callback.

import type { AuthRequest } from '@cloudflare/workers-oauth-provider';
import type { Env } from '../types';

const TTL_SECONDS = 600; // Generous enough for a slow Auth0 login, short enough to bound KV growth.

export interface PendingAuth {
  oauthReqInfo: AuthRequest;
  codeVerifier: string;
}

function kvKey(nonce: string): string {
  return `pending:${nonce}`;
}

export async function storePendingAuth(env: Env, nonce: string, data: PendingAuth): Promise<void> {
  await env.OAUTH_KV.put(kvKey(nonce), JSON.stringify(data), { expirationTtl: TTL_SECONDS });
}

/** One-time use: deletes the entry on read, so a replayed callback can't reuse a stale verifier. */
export async function consumePendingAuth(env: Env, nonce: string): Promise<PendingAuth | null> {
  const raw = await env.OAUTH_KV.get(kvKey(nonce));
  if (!raw) return null;
  await env.OAUTH_KV.delete(kvKey(nonce));
  return JSON.parse(raw) as PendingAuth;
}
