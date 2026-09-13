// Cloudflare Workers entry point.
//
// @cloudflare/workers-oauth-provider owns the top-level fetch: it validates
// bearer tokens on /mcp itself (populating NasebanalMcp's `this.props`) and
// routes everything else — /authorize, /callback, /health, /internal/* — to
// our own defaultHandler (src/auth/handler.ts).

import { OAuthProvider, OAuthError } from '@cloudflare/workers-oauth-provider';
import { NasebanalMcp } from './mcp/agent';
import defaultHandler from './auth/handler';
import { refreshToken, Auth0TokenExchangeError } from './auth/auth0';
import type { Env, Props } from './types';

export { NasebanalMcp };

// OAuthProvider is constructed per-request (rather than once at module
// scope) so tokenExchangeCallback below can close over `env` — the
// library's own callback signature has no env parameter, and the Auth0
// credentials needed to refresh a token only exist as per-request bindings.
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return new OAuthProvider({
      apiRoute: '/mcp',
      apiHandler: NasebanalMcp.serve('/mcp', { binding: 'MCP_OBJECT' }),
      defaultHandler,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      // Lets Claude Desktop's "Add custom connector" flow dynamically register
      // itself as an OAuth client (RFC 7591) instead of requiring a pre-shared
      // client id.
      clientRegistrationEndpoint: '/register',
      // Without this, the downstream Auth0 access token captured once at
      // /callback never gets renewed. The outer OAuth grant (this provider's
      // own access/refresh tokens, issued to Claude) keeps refreshing itself
      // on its own ~1h cycle for up to 30 days, which makes Claude's
      // connection look perfectly healthy — but that cycle just carries the
      // stale inner `props` forward unchanged. Once the inner Auth0 token
      // expires (typically far sooner than 30 days), every tool call starts
      // failing with a 401 that's silently swallowed into a normal-looking
      // MCP tool-error response, with nothing to tell Claude to reconnect.
      // Hooking the inner refresh onto the outer provider's own refresh
      // cycle (rather than building separate scheduling) keeps the
      // downstream token fresh automatically.
      tokenExchangeCallback: async (options) => {
        if (options.grantType !== 'refresh_token') return;
        const props = options.props as Props;
        if (!props.refreshToken) return; // no offline_access grant captured — nothing to refresh
        try {
          const tokens = await refreshToken(env, props.refreshToken);
          return {
            newProps: {
              ...props,
              accessToken: tokens.access_token,
              // Auth0 may or may not rotate the refresh token itself.
              refreshToken: tokens.refresh_token ?? props.refreshToken,
            },
          };
        } catch (err) {
          if (err instanceof Auth0TokenExchangeError && (err.status === 401 || err.status === 403)) {
            // The refresh token itself is dead (revoked, or the NASEBANAL
            // user was deleted) — surface this as an OAuth-level error so
            // the outer refresh grant fails too, forcing Claude to prompt a
            // fresh login instead of quietly failing every tool call.
            throw new OAuthError('invalid_grant', {
              description: 'NASEBANAL session expired or was revoked — please reconnect this connector.',
            });
          }
          throw err;
        }
      },
    }).fetch(request, env, ctx);
  },
};
