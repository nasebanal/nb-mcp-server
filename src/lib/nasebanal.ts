import { NasebanalClient } from '@nasebanal/sdk';
import type { Props } from '../types';

/**
 * One SDK client per MCP session, authenticated as the logged-in user via
 * the Auth0 access token captured at /callback (see auth/handler.ts).
 * `@nasebanal/sdk`'s AuthProvider is auth-scheme-agnostic — it just wants a
 * bearer string — so this Auth0 token works exactly like a PAT would.
 */
export function nbFor(props: Props): NasebanalClient {
  return new NasebanalClient({ auth: { token: props.accessToken }, env: 'production' });
}
