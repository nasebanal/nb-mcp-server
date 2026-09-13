# nb-mcp-server

A public [Remote MCP](https://modelcontextprotocol.io/) server that lets you connect Claude Desktop (or any MCP client) to your own [Target](https://target.nasebanal.com) and [Recorder](https://recorder.nasebanal.com) data — for quick data entry and report generation, straight from a chat.

Login works like the Figma or Trello MCP connectors: add the server, a browser popup opens for a NASEBANAL (Auth0) login, and once you approve, the tools unlock for your account. No manual token copy-pasting.

## Tools

**Target**

| Tool | Does |
|---|---|
| `target_list` | List all your Targets, with nested cells |
| `target_get` | Get one Target by id |
| `target_create` | Create a Target (optionally as a sub-target via `parent_id`) |
| `target_update` | Update a Target's title/description/memo |
| `target_delete` | Delete a Target |

**Recorder**

| Tool | Does |
|---|---|
| `recorder_record_list` | List logged data points, filterable by tag/date range |
| `recorder_record_create` | Log a new data point (auto-creates the tag by name) |
| `recorder_record_update` | Update a logged data point |
| `recorder_tag_list` | List tags — use this to find a tag's numeric id for goals |
| `recorder_goal_list` | List Goals |
| `recorder_goal_create` | Create a Goal on an existing tag |
| `recorder_stats` | Summary stats (count/min/max/average/latest) for a tag — the report-generation tool |

Out of scope for now: sharing/collaboration, media upload, public/shared-graph endpoints, bulk operations. These wrap [`@nasebanal/sdk`](../nb-sdk), which already exposes the full API surface — adding more tools is mostly a matter of registering them in `src/mcp/tools/`.

## How it works

- **`src/index.ts`** — [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider) owns the top-level `fetch`. It validates bearer tokens on `/mcp` itself and hands everything else to our own `defaultHandler`.
- **`src/auth/handler.ts`** — bridges the MCP client's OAuth dance to Auth0: `/authorize` redirects to Auth0 login (with its own PKCE leg, separate from the one the OAuth Provider runs against the MCP client); `/callback` exchanges the code, resolves the caller's NASEBANAL account via `nb.account.me.get()` (which also JIT-provisions the user), and completes the grant with that numeric account id as `userId` — not the raw Auth0 `sub`, so the grant is purgeable on account deletion (see below).
- **`src/mcp/agent.ts`** — `NasebanalMcp`, a [`McpAgent`](https://developers.cloudflare.com/agents/api-reference/mcp-agent-api/) that registers the tools above against an `@nasebanal/sdk` client authenticated with the session's Auth0 access token.
- **`POST /internal/users/purge`** — implements the org's mandatory account-deletion fan-out contract (see `apps/CLAUDE.md`): revokes every OAuth grant for a deleted user.

**Auth0 token refresh** (2026-09): `src/index.ts`'s `tokenExchangeCallback` refreshes the downstream Auth0 access token using the stored refresh token every time `@cloudflare/workers-oauth-provider` renews its own (outer) access token — roughly hourly. Before this was wired up, the outer OAuth grant kept refreshing itself for up to 30 days while silently carrying the stale inner Auth0 token forward, so Claude's connection looked healthy while every tool call failed with a swallowed 401. If the refresh token itself is revoked or the NASEBANAL user is deleted, the callback throws `OAuthError('invalid_grant', ...)`, which fails the outer refresh too — so Claude correctly prompts a fresh login rather than failing silently.

**Known deprecation to revisit**: `agents`' `McpAgent` (the Durable-Object-backed SDK v1 integration used here) is marked feature-frozen upstream in favor of a stateless v2 factory (`createStatelessMcpHandler` from `agents/mcp/server`). It's still what Cloudflare's own OAuth-fronted MCP examples use today and remains fully supported, so this was a deliberate choice — revisit once the v2 path has real-world examples to build the auth bridge against.

## Setup

### 1. Auth0 Dashboard (manual — do this first)

1. **Applications → Create Application** — name it (e.g. `NASEBANAL MCP Server`), type **Regular Web Application** (a confidential client — needed for the server-side code exchange in `/callback`; don't reuse `nb-cli`'s public Native app).
2. **Settings → Allowed Callback URLs** — add `https://nb-mcp-server.<your-cf-subdomain>.workers.dev/callback` (and your production hostname's `/callback` once you have one).
3. **Settings → Advanced → Grant Types** — ensure **Authorization Code** and **Refresh Token** are both checked.
4. **APIs → `https://api.nasebanal.com` → Allow Offline Access** — must be ON, or the `offline_access` scope silently drops and refresh tokens never issue.
5. Copy the **Client ID** / **Client Secret**.

### 2. Local dev

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET / INTERNAL_SECRET
wrangler kv namespace create OAUTH_KV   # paste the returned id into wrangler.jsonc
npm run dev
```

`npx vitest run` covers PKCE math, the KV pending-auth store, Auth0 token-exchange request shape, and tool input validation — no live Auth0 needed. A full login round-trip can't run against `localhost` (Auth0 rejects an unregistered `redirect_uri`), so first verify that end-to-end after a real deploy.

### 3. Secrets (after the first deploy)

```bash
wrangler secret put AUTH0_CLIENT_ID
wrangler secret put AUTH0_CLIENT_SECRET
wrangler secret put INTERNAL_SECRET   # must match the value on the other 4 NASEBANAL APIs
```

### 4. Connect from Claude Desktop

Settings → Connectors → Add custom connector → the deployed `/mcp` URL → complete the Auth0 login popup → the Target/Recorder tools appear.

## Deployment

**Do NOT run `wrangler deploy` directly.** Deploy by merging a PR to `main` — CI/CD handles the rest.

## Follow-ups tracked outside this repo

- Add `nb-mcp-server` to `nb-account-api`'s `PURGE_TARGETS` + Service Binding, so account deletion actually calls this repo's `/internal/users/purge`.
- Add `bin/config/cloudflare/nb-mcp-server.sh` (secret management script).
- Add a row to `apps/CLAUDE.md`'s port table for `nb-mcp-server` (dev port `8791`).
