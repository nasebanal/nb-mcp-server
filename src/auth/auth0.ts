// Upstream leg of the login bridge: this Worker as an Auth0 confidential
// client (Regular Web Application — see README.md "Auth0 setup"). Distinct
// PKCE handshake from the one @cloudflare/workers-oauth-provider runs between
// the MCP client and us; see auth/state.ts for why both exist.

import type { Env } from '../types';

export interface Auth0TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
}

export function buildAuthorizeUrl(
  env: Env,
  opts: { redirectUri: string; state: string; codeChallenge: string }
): string {
  const url = new URL(`https://${env.AUTH0_DOMAIN}/authorize`);
  url.searchParams.set('client_id', env.AUTH0_CLIENT_ID);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email offline_access');
  url.searchParams.set('audience', env.AUTH0_AUDIENCE);
  url.searchParams.set('code_challenge', opts.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', opts.state);
  return url.toString();
}

export class Auth0TokenExchangeError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'Auth0TokenExchangeError';
  }
}

export async function exchangeCode(
  env: Env,
  opts: { code: string; redirectUri: string; codeVerifier: string }
): Promise<Auth0TokenResponse> {
  const response = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: env.AUTH0_CLIENT_ID,
      client_secret: env.AUTH0_CLIENT_SECRET,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      code_verifier: opts.codeVerifier,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Auth0TokenExchangeError(`Auth0 token exchange failed (${response.status}): ${body}`, response.status);
  }

  const data = (await response.json()) as Auth0TokenResponse;
  if (!data.access_token) {
    throw new Auth0TokenExchangeError('Auth0 token response had no access_token', 502);
  }
  return data;
}
