// Core types for nb-mcp-server

import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

export interface Env {
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  AUTH0_CLIENT_ID: string;
  AUTH0_CLIENT_SECRET: string;
  INTERNAL_SECRET: string;
  SERVICE_ID: string;
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  // Injected by @cloudflare/workers-oauth-provider itself.
  OAUTH_PROVIDER: OAuthHelpers;
}

/**
 * Stored on the OAuth grant at /callback (`completeAuthorization({ props })`)
 * and available as `this.props` inside NasebanalMcp for every tool call.
 */
export interface Props {
  /** Auth0 access token, audience=https://api.nasebanal.com — passed straight to @nasebanal/sdk. */
  accessToken: string;
  /** Present only if the "offline_access" scope was granted. */
  refreshToken?: string;
  /** NASEBANAL numeric account id (from nb.account.me.get()), stringified. Never the raw Auth0 `sub`. */
  userId: string;
  email?: string;
  name?: string;
  // Index signature required by McpAgent<Env, State, Props extends Record<string, unknown>>.
  [key: string]: unknown;
}

// Generic API envelope, matching every other NASEBANAL backend's response shape.
export interface APIResponse<T> {
  data?: T;
  error?: APIError;
  success: boolean;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
