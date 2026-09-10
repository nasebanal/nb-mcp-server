import { describe, expect, it } from 'vitest';
import { consumePendingAuth, storePendingAuth, type PendingAuth } from '../auth/state';
import type { Env } from '../types';
import type { AuthRequest } from '@cloudflare/workers-oauth-provider';

function fakeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

function fakeAuthRequest(): AuthRequest {
  return {
    responseType: 'code',
    clientId: 'test-client',
    redirectUri: 'https://claude.ai/callback',
    scope: ['mcp'],
    state: 'client-state',
  };
}

describe('pending auth state', () => {
  it('round-trips a stored pending auth', async () => {
    const env = { OAUTH_KV: fakeKv() } as Env;
    const data: PendingAuth = { oauthReqInfo: fakeAuthRequest(), codeVerifier: 'verifier-123' };

    await storePendingAuth(env, 'nonce-1', data);
    const result = await consumePendingAuth(env, 'nonce-1');

    expect(result).toEqual(data);
  });

  it('is one-time use: a second read returns null', async () => {
    const env = { OAUTH_KV: fakeKv() } as Env;
    await storePendingAuth(env, 'nonce-2', { oauthReqInfo: fakeAuthRequest(), codeVerifier: 'v' });

    await consumePendingAuth(env, 'nonce-2');
    const second = await consumePendingAuth(env, 'nonce-2');

    expect(second).toBeNull();
  });

  it('returns null for an unknown nonce', async () => {
    const env = { OAUTH_KV: fakeKv() } as Env;
    await expect(consumePendingAuth(env, 'never-stored')).resolves.toBeNull();
  });
});
