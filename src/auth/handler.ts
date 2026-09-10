// The OAuthProvider `defaultHandler`: everything that isn't an authenticated
// /mcp call. Bridges the MCP client's own OAuth dance (handled internally by
// @cloudflare/workers-oauth-provider) to Auth0 login, and answers the
// cross-service /internal/users/purge call for account deletion.

import { NasebanalClient } from '@nasebanal/sdk';
import type { Env, Props } from '../types';
import { corsHeaders, handleCORS } from '../utils/cors';
import { AppError, errorResponse, successResponse } from '../utils/errors';
import { generateCodeChallenge, generateCodeVerifier, generateNonce } from './pkce';
import { consumePendingAuth, storePendingAuth } from './state';
import { buildAuthorizeUrl, exchangeCode } from './auth0';

// Constant-time string compare for the /internal/* shared-secret check.
// A length mismatch is not a secret (it is observable from the header the
// caller sent), but the character comparison must not short-circuit or an
// attacker could time-oracle the secret one byte at a time.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function callbackUrl(request: Request): string {
  return new URL('/callback', request.url).href;
}

async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const nonce = generateNonce();

  await storePendingAuth(env, nonce, { oauthReqInfo, codeVerifier });

  const authorizeUrl = buildAuthorizeUrl(env, {
    redirectUri: callbackUrl(request),
    state: nonce,
    codeChallenge,
  });

  return Response.redirect(authorizeUrl, 302);
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  if (error) {
    const description = url.searchParams.get('error_description') ?? error;
    return new Response(`Auth0 login failed: ${description}`, { status: 400 });
  }

  const nonce = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!nonce || !code) {
    return new Response('Missing code or state parameter', { status: 400 });
  }

  const pending = await consumePendingAuth(env, nonce);
  if (!pending) {
    return new Response('Invalid or expired login attempt — please try connecting again.', { status: 400 });
  }

  const tokens = await exchangeCode(env, {
    code,
    redirectUri: callbackUrl(request),
    codeVerifier: pending.codeVerifier,
  });

  // Resolve the canonical NASEBANAL numeric account id. This also JIT-
  // provisions the user in nb-account-api on first login. We deliberately key
  // the OAuth grant by this id, not the raw Auth0 `sub` — nb-account-api's
  // /internal/users/purge fan-out only knows the numeric id, and grants are
  // user-owned state that must be purgeable on account deletion (see
  // handleInternalPurge below).
  const nb = new NasebanalClient({ auth: { token: tokens.access_token }, env: 'production' });
  const me = await nb.account.me.get();
  if (!me.data?.id) {
    return new Response('Could not resolve your NASEBANAL account after login. Please try again.', { status: 502 });
  }
  const userId = String(me.data.id);
  const { email, name } = me.data;

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: pending.oauthReqInfo,
    userId,
    metadata: { label: name || email || userId },
    scope: pending.oauthReqInfo.scope,
    props: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      userId,
      email,
      name,
    } satisfies Props,
  });

  return Response.redirect(redirectTo, 302);
}

interface PurgeUserBody {
  user_id: number;
}

// See apps/CLAUDE.md: every backend storing user-owned rows must implement
// POST /internal/users/purge. The OAuth grants in OAUTH_KV are exactly that
// kind of state here — this revokes every grant (= every connected MCP
// client session) for the deleted user. Idempotent: nothing left to revoke
// on a repeat call.
async function handleInternalPurge(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as PurgeUserBody;
    const userId = Number(body?.user_id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('VALIDATION_ERROR', 'user_id must be a positive integer', 400);
    }

    const userIdStr = String(userId);
    let cursor: string | undefined;
    let grantsRevoked = 0;
    do {
      const page = await env.OAUTH_PROVIDER.listUserGrants(userIdStr, { cursor });
      for (const grant of page.items) {
        await env.OAUTH_PROVIDER.revokeGrant(grant.id, userIdStr);
        grantsRevoked++;
      }
      cursor = page.cursor;
    } while (cursor);

    return successResponse({ user_id: userId, grants_revoked: grantsRevoked });
  } catch (err) {
    if (err instanceof AppError) return errorResponse(err);
    console.error('[handleInternalPurge] Failed:', err);
    return errorResponse(new AppError('INTERNAL_ERROR', 'Failed to purge user data', 500));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsResponse = handleCORS(request);
    if (corsResponse) return corsResponse;

    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;

    if (pathname === '/health' && method === 'GET') {
      const response = new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
      Object.entries(corsHeaders()).forEach(([key, value]) => response.headers.set(key, value));
      return response;
    }

    // Internal endpoints invoked by nb-account-api's purge fan-out. Gated by
    // the X-Internal-Auth shared secret + a Host guard, the same pattern as
    // every other NASEBANAL backend. A mismatch returns 404 rather than 401
    // so the endpoint's existence isn't advertised.
    if (pathname.startsWith('/internal/')) {
      const host = (request.headers.get('host') || '').toLowerCase();
      const hostLooksPublic = host.endsWith('.nasebanal.com') || host === 'nasebanal.com' || host.endsWith('.workers.dev');
      const providedSecret = request.headers.get('x-internal-auth') || '';
      const secretValid = !!env.INTERNAL_SECRET && constantTimeEqual(providedSecret, env.INTERNAL_SECRET);
      if (hostLooksPublic || !secretValid) {
        return new Response('Not found', { status: 404 });
      }

      if (pathname === '/internal/users/purge' && method === 'POST') {
        return handleInternalPurge(request, env);
      }
      return new Response('Not found', { status: 404 });
    }

    try {
      if (pathname === '/authorize' && method === 'GET') {
        return await handleAuthorize(request, env);
      }

      if (pathname === '/callback' && method === 'GET') {
        return await handleCallback(request, env);
      }
    } catch (err) {
      console.error('[defaultHandler] Auth flow failed:', err);
      return new Response('Authentication failed. Please try connecting again.', { status: 500 });
    }

    return new Response('Not found', { status: 404 });
  },
};
