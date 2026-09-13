import { afterEach, describe, expect, it, vi } from 'vitest';
import { Auth0TokenExchangeError, buildAuthorizeUrl, exchangeCode, refreshToken } from '../auth/auth0';
import type { Env } from '../types';

const env = {
  AUTH0_DOMAIN: 'test-tenant.us.auth0.com',
  AUTH0_AUDIENCE: 'https://api.nasebanal.com',
  AUTH0_CLIENT_ID: 'client-id',
  AUTH0_CLIENT_SECRET: 'client-secret',
} as Env;

describe('buildAuthorizeUrl', () => {
  it('builds the Auth0 /authorize URL with PKCE and audience params', () => {
    const url = new URL(
      buildAuthorizeUrl(env, {
        redirectUri: 'https://nb-mcp-server.example.workers.dev/callback',
        state: 'nonce-abc',
        codeChallenge: 'challenge-xyz',
      })
    );

    expect(url.origin + url.pathname).toBe('https://test-tenant.us.auth0.com/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://nb-mcp-server.example.workers.dev/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('audience')).toBe('https://api.nasebanal.com');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('nonce-abc');
    expect(url.searchParams.get('scope')).toContain('offline_access');
  });
});

describe('exchangeCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the authorization_code grant with client_secret and code_verifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', token_type: 'Bearer', expires_in: 3600 }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await exchangeCode(env, {
      code: 'auth-code',
      redirectUri: 'https://nb-mcp-server.example.workers.dev/callback',
      codeVerifier: 'verifier-123',
    });

    expect(result.access_token).toBe('at');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://test-tenant.us.auth0.com/oauth/token');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      grant_type: 'authorization_code',
      client_id: 'client-id',
      client_secret: 'client-secret',
      code: 'auth-code',
      code_verifier: 'verifier-123',
    });
  });

  it('throws Auth0TokenExchangeError on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))
    );

    await expect(
      exchangeCode(env, { code: 'bad-code', redirectUri: 'https://x/callback', codeVerifier: 'v' })
    ).rejects.toBeInstanceOf(Auth0TokenExchangeError);
  });

  it('throws Auth0TokenExchangeError when access_token is missing from an otherwise-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));

    await expect(
      exchangeCode(env, { code: 'code', redirectUri: 'https://x/callback', codeVerifier: 'v' })
    ).rejects.toBeInstanceOf(Auth0TokenExchangeError);
  });
});

describe('refreshToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the refresh_token grant with client_secret and the given refresh token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'new-at', refresh_token: 'new-rt', token_type: 'Bearer', expires_in: 3600 }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshToken(env, 'old-rt');

    expect(result.access_token).toBe('new-at');
    expect(result.refresh_token).toBe('new-rt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://test-tenant.us.auth0.com/oauth/token');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      grant_type: 'refresh_token',
      client_id: 'client-id',
      client_secret: 'client-secret',
      refresh_token: 'old-rt',
    });
  });

  it('throws Auth0TokenExchangeError with the upstream status on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 401 }))
    );

    const err = await refreshToken(env, 'revoked-rt').catch((e) => e);
    expect(err).toBeInstanceOf(Auth0TokenExchangeError);
    expect(err.status).toBe(401);
  });

  it('throws Auth0TokenExchangeError when access_token is missing from an otherwise-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));

    await expect(refreshToken(env, 'rt')).rejects.toBeInstanceOf(Auth0TokenExchangeError);
  });
});
