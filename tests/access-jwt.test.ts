// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import {
  SignJWT,
  UnsecuredJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
} from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_COOKIE,
  ACCESS_JWT_HEADER,
  createAccessVerifier,
  readAccessToken,
} from '../app/lib/access-jwt';

const TEAM = 'vorion.cloudflareaccess.com';
const AUD = 'f'.repeat(64);
const ISSUER = `https://${TEAM}`;
const KID = 'test-key-1';

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

let trusted: KeyPair;
let stranger: KeyPair;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  trusted = await generateKeyPair('RS256');
  stranger = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(trusted.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
  keys = createLocalJWKSet({ keys: [jwk] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

function sign(
  privateKey: KeyPair['privateKey'],
  overrides: { issuer?: string; audience?: string; exp?: number | null } = {},
) {
  const jwt = new SignJWT({ email: 'ryan@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUD)
    .setSubject('user-1')
    .setIssuedAt();
  if (overrides.exp !== null) jwt.setExpirationTime(overrides.exp ?? nowSeconds() + 300);
  return jwt.sign(privateKey);
}

const verifier = () => createAccessVerifier({ teamDomain: TEAM, audience: AUD }, keys);

describe('createAccessVerifier', () => {
  it('accepts a token signed by the team key for this application', async () => {
    const verdict = await verifier()(await sign(trusted.privateKey));
    expect(verdict).toEqual({ ok: true, subject: 'user-1', email: 'ryan@example.com' });
  });

  it('reports a missing token as missing, not invalid', async () => {
    expect(await verifier()(undefined)).toEqual({ ok: false, reason: 'missing' });
    expect(await verifier()('')).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects a token minted for a different Access application', async () => {
    const token = await sign(trusted.privateKey, { audience: 'b'.repeat(64) });
    expect(await verifier()(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token from a different team', async () => {
    const token = await sign(trusted.privateKey, { issuer: 'https://other.cloudflareaccess.com' });
    expect(await verifier()(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an expired token', async () => {
    const token = await sign(trusted.privateKey, { exp: nowSeconds() - 3600 });
    expect(await verifier()(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token with no expiry', async () => {
    const token = await sign(trusted.privateKey, { exp: null });
    expect(await verifier()(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token signed by a key that is not in the team key set', async () => {
    // Same kid, different private key: the signature cannot verify.
    const forged = await sign(stranger.privateKey);
    expect(await verifier()(forged)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects algorithm confusion: HS256 with a shared secret', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', kid: KID })
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setExpirationTime(nowSeconds() + 300)
      .sign(new TextEncoder().encode('not-a-real-secret-but-long-enough-for-hs256'));
    expect(await verifier()(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects any algorithm other than RS256 even when the published key would verify it', async () => {
    // The HS256 and alg:none cases above are also stopped by jose's key-type
    // checks. Here the key is a genuine RSA key that verifies RS384, published
    // without an `alg` pin, so the allowlist is the only thing refusing it.
    const rs384 = await generateKeyPair('RS384');
    const unpinned = createLocalJWKSet({
      keys: [{ ...(await exportJWK(rs384.publicKey)), kid: KID }],
    });
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS384', kid: KID })
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setExpirationTime(nowSeconds() + 300)
      .sign(rs384.privateKey);

    const verdict = await createAccessVerifier({ teamDomain: TEAM, audience: AUD }, unpinned)(token);
    expect(verdict).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an unsecured (alg: none) token', async () => {
    const token = new UnsecuredJWT({})
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setExpirationTime(nowSeconds() + 300)
      .encode();
    expect(await verifier()(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects malformed input', async () => {
    for (const junk of ['not-a-jwt', 'a.b.c', 'Bearer abc', '....']) {
      expect(await verifier()(junk), junk).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('reports unavailable, not invalid, when the signing keys cannot be fetched', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unreachable: JWTVerifyGetKey = () => {
      throw new TypeError('fetch failed');
    };
    const token = await sign(trusted.privateKey);

    const verdict = await createAccessVerifier({ teamDomain: TEAM, audience: AUD }, unreachable)(token);

    expect(verdict).toEqual({ ok: false, reason: 'unavailable' });
    // The class of the failure is logged; the token never is.
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(token);
  });
});

describe('readAccessToken', () => {
  it('prefers the header Access injects', () => {
    const headers = new Headers({
      [ACCESS_JWT_HEADER]: ' header-token ',
      cookie: `${ACCESS_COOKIE}=cookie-token`,
    });
    expect(readAccessToken(headers)).toBe('header-token');
  });

  it('falls back to the Access session cookie among other cookies', () => {
    const headers = new Headers({ cookie: `a=1; ${ACCESS_COOKIE}=cookie-token; b=2` });
    expect(readAccessToken(headers)).toBe('cookie-token');
  });

  it('returns undefined when neither is present or the cookie is empty', () => {
    expect(readAccessToken(new Headers())).toBeUndefined();
    expect(readAccessToken(new Headers({ cookie: 'a=1; b=2' }))).toBeUndefined();
    expect(readAccessToken(new Headers({ cookie: `${ACCESS_COOKIE}=` }))).toBeUndefined();
    expect(readAccessToken(new Headers({ cookie: `X${ACCESS_COOKIE}=nope` }))).toBeUndefined();
  });
});
