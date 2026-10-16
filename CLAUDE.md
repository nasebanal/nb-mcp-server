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
- `src/index.ts`'s `OAuthProvider` is constructed **per-request** (inside a `fetch(request, env, ctx)` wrapper), not once at module scope — `tokenExchangeCallback` needs `env` (Auth0 credentials) in closure, and the library's callback signature has no `env` parameter of its own. `tokenExchangeCallback` refreshes the downstream Auth0 token (`src/auth/auth0.ts`'s `refreshToken`) on every outer-token refresh cycle, since the outer OAuth grant (Claude ↔ this server) and the inner Auth0 token (this server ↔ NASEBANAL) have independent lifetimes — see README.md's "Auth0 token refresh" note.
- `src/utils/jwt.ts`/`auth.ts` (the byte-identical-across-4-repos JWT verification convention) deliberately do **not** exist here — the only inbound bearer-guarded surface is `/mcp`, and `@cloudflare/workers-oauth-provider` authenticates that internally before `this.props` is populated. We never see a raw Auth0 JWT on the inbound path.
- Adding a new tool: register it in `src/mcp/tools/{target,recorder}.ts` against the matching `@nasebanal/sdk` method, export its Zod input shape for `src/__tests__/toolSchemas.test.ts` to cover. Also map the tool to its contract `operationId` in `src/mcp/operations.ts` (`TOOL_OPERATIONS`).
- `src/__tests__/operationCoverage.test.ts` checks every `operationId` in the pinned `@nasebanal/api-specs-{target,recorder}` against `TOOL_OPERATIONS` and `UNEXPOSED_OPERATIONS` (each with a reason). A contract Bump PR that adds an operation fails it until the operation gets a tool or an entry with a reason. Keep both specs pinned exactly (`bin/bump_pinned_dep.sh nb-mcp-server @nasebanal/api-specs-<name>@<version> --dev`).
- `keep_vars: true` is set in `wrangler.jsonc` — don't remove it, or a deploy overwrites Cloudflare Dashboard-set vars.
