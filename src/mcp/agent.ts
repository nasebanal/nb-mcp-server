import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Env, Props } from '../types';
import { nbFor } from '../lib/nasebanal';
import { registerTargetTools } from './tools/target';
import { registerRecorderTools } from './tools/recorder';

// NOTE: `agents`' McpAgent (SDK v1, Durable-Object-backed) is marked
// feature-frozen upstream in favor of a stateless v2 factory
// (`createStatelessMcpHandler` from `agents/mcp/server`). It remains fully
// supported and is what Cloudflare's own OAuth-fronted MCP examples use
// today, so this is a deliberate choice, not an oversight — flagged in
// README.md as a migration to revisit once the v2 path has real-world
// examples to build against.
export class NasebanalMcp extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: 'nasebanal-mcp-server', version: '0.1.0' });

  async init() {
    // OAuthProvider only calls into this Durable Object after validating the
    // access token and attaching its grant's props, so `this.props` is
    // populated for every real session. The guard exists purely to satisfy
    // TypeScript's `props?: Props` and fail loudly instead of silently
    // constructing an unauthenticated SDK client if that assumption is ever
    // wrong.
    if (!this.props) {
      throw new Error('NasebanalMcp.init() called without authenticated props');
    }
    const nb = nbFor(this.props);
    registerTargetTools(this.server, nb);
    registerRecorderTools(this.server, nb);
  }
}
