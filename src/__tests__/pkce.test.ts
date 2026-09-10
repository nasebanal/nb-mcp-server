import { describe, expect, it } from 'vitest';
import { generateCodeChallenge, generateCodeVerifier, generateNonce } from '../auth/pkce';

describe('pkce', () => {
  it('generates a verifier of the expected length range (RFC 7636: 43-128 chars)', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates unique verifiers and nonces across calls', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);

    const n1 = generateNonce();
    const n2 = generateNonce();
    expect(n1).not.toBe(n2);
  });

  it('computes the correct S256 code_challenge for a known verifier', async () => {
    // RFC 7636 Appendix B worked example.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    await expect(generateCodeChallenge(verifier)).resolves.toBe(expected);
  });

  it('produces a base64url string (no padding, no +/) for the challenge', async () => {
    const challenge = await generateCodeChallenge(generateCodeVerifier());
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
