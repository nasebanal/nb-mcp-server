// Cloudflare Workers entry point.
//
// @cloudflare/workers-oauth-provider owns the top-level fetch: it validates
// bearer tokens on /mcp itself (populating NasebanalMcp's `this.props`) and
// routes everything else — /authorize, /callback, /health, /internal/* — to
// our own defaultHandler (src/auth/handler.ts).

import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { NasebanalMcp } from './mcp/agent';
import defaultHandler from './auth/handler';

export { NasebanalMcp };

export default new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: NasebanalMcp.serve('/mcp', { binding: 'MCP_OBJECT' }),
  defaultHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  // Lets Claude Desktop's "Add custom connector" flow dynamically register
  // itself as an OAuth client (RFC 7591) instead of requiring a pre-shared
  // client id.
  clientRegistrationEndpoint: '/register',
});
