import { describe, expect, it, vi } from 'vitest';
import handler from '../auth/handler';
import type { Env } from '../types';

const SECRET = 'test-internal-secret';

function makeEnv(secret: string | undefined = SECRET) {
  const listUserGrants = vi.fn().mockResolvedValue({ items: [{ id: 'g1' }, { id: 'g2' }], cursor: undefined });
  const revokeGrant = vi.fn().mockResolvedValue(undefined);
  const env = { INTERNAL_SECRET: secret, OAUTH_PROVIDER: { listUserGrants, revokeGrant } } as unknown as Env;
  return { env, listUserGrants, revokeGrant };
}

function purge(host: string, headers: Record<string, string> = {}, body: unknown = { user_id: 42 }) {
  return new Request(`https://${host}/internal/users/purge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host, ...headers },
    body: JSON.stringify(body),
  });
}

describe('/internal/* guard', () => {
  it('returns 404 without the shared secret and revokes nothing', async () => {
    const { env, listUserGrants } = makeEnv();
    const res = await handler.fetch(purge('nb-mcp-server.internal'), env);
    expect(res.status).toBe(404);
    expect(listUserGrants).not.toHaveBeenCalled();
  });

  it('returns 404 for a wrong secret', async () => {
    const { env, listUserGrants } = makeEnv();
    const res = await handler.fetch(purge('nb-mcp-server.internal', { 'x-internal-auth': 'wrong-secret-value' }), env);
    expect(res.status).toBe(404);
    expect(listUserGrants).not.toHaveBeenCalled();
  });

  it('returns 404 when INTERNAL_SECRET is unset, even with an empty header', async () => {
    const { env, listUserGrants } = makeEnv('');
    const res = await handler.fetch(purge('nb-mcp-server.internal', { 'x-internal-auth': '' }), env);
    expect(res.status).toBe(404);
    expect(listUserGrants).not.toHaveBeenCalled();
  });

  it.each(['mcp.nasebanal.com', 'nasebanal.com', 'nb-mcp-server.example.workers.dev'])(
    'returns 404 on the public host %s even with the correct secret',
    async (host) => {
      const { env, listUserGrants } = makeEnv();
      const res = await handler.fetch(purge(host, { 'x-internal-auth': SECRET }), env);
      expect(res.status).toBe(404);
      expect(listUserGrants).not.toHaveBeenCalled();
    }
  );

  it('revokes only the given user\'s grants with the secret on a non-public host', async () => {
    const { env, listUserGrants, revokeGrant } = makeEnv();
    const res = await handler.fetch(purge('nb-mcp-server.internal', { 'x-internal-auth': SECRET }), env);
    expect(res.status).toBe(200);
    expect(listUserGrants).toHaveBeenCalledWith('42', { cursor: undefined });
    expect(revokeGrant).toHaveBeenCalledTimes(2);
    expect(revokeGrant).toHaveBeenCalledWith('g1', '42');
    expect(revokeGrant).toHaveBeenCalledWith('g2', '42');
  });

  it('rejects a non-positive user_id with 400', async () => {
    const { env, revokeGrant } = makeEnv();
    const res = await handler.fetch(purge('nb-mcp-server.internal', { 'x-internal-auth': SECRET }, { user_id: 0 }), env);
    expect(res.status).toBe(400);
    expect(revokeGrant).not.toHaveBeenCalled();
  });
});
