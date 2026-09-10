# CLAUDE.md - nb-mcp-server

## Overview

Remote MCP server exposing NASEBANAL Target and Recorder data to MCP clients (Claude Desktop, etc.), authenticated via an Auth0 browser-popup login. See `README.md` for the full picture (tools, architecture, setup).

## Tech Stack

- Cloudflare Workers + TypeScript, no D1 (no domain data of its own — everything is fetched live from `nb-target-api`/`nb-recorder-api`/`nb-account-api` via `@nasebanal/sdk`)
- `agents`' `McpAgent` (Durable-Object-backed) for the MCP protocol layer
- `@cloudflare/workers-oauth-provider` for the OAuth Authorization Server, bridging to Auth0
- KV (`OAUTH_KV`) for OAuth grant/token storage and the short-lived pending-login state

## Commands

```bash
npm run dev              # Start dev server (port 8791)
npm run cf-typegen       # Generate Cloudflare types
npx vitest run           # Unit tests (PKCE, KV pending-auth store, Auth0 exchange shape, tool schemas)
```

## Deployment

**Do NOT run `wrangler deploy` directly.** Deploy by merging a PR to `main` — CI/CD handles the rest.

A live OAuth round-trip can't be tested against `localhost` — Auth0 will reject an unregistered `redirect_uri`. Verify the login flow end-to-end only after a real deploy (see README.md).

## Key details

- `src/auth/handler.ts`'s `/callback` keys the OAuth grant's `userId` by the NASEBANAL **numeric account id** (from `nb.account.me.get()`), never the raw Auth0 `sub` — required so `POST /internal/users/purge` can find and revoke a deleted user's grants.
- `src/utils/jwt.ts`/`auth.ts` (the byte-identical-across-4-repos JWT verification convention) deliberately do **not** exist here — the only inbound bearer-guarded surface is `/mcp`, and `@cloudflare/workers-oauth-provider` authenticates that internally before `this.props` is populated. We never see a raw Auth0 JWT on the inbound path.
- Adding a new tool: register it in `src/mcp/tools/{target,recorder}.ts` against the matching `@nasebanal/sdk` method, export its Zod input shape for `src/__tests__/toolSchemas.test.ts` to cover.
- `keep_vars: true` is set in `wrangler.jsonc` — don't remove it, or a deploy overwrites Cloudflare Dashboard-set vars.
