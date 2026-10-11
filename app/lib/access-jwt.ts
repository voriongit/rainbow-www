// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Cloudflare Access token verification for the live deployment.
 *
 * Access sits in front of the live hostname and attaches a signed JWT to every
 * request it lets through. This module is the app's own check of that token, so
 * the live deployment does not depend on the Access policy being right: a
 * request that reaches the Worker some other way (the workers.dev hostname, a
 * policy that was loosened, Access switched off) carries no valid token and is
 * refused.
 *
 * Verified against the team's published signing keys: RS256 only, the
 * application's AUD tag, the team issuer, and a mandatory expiry.
 *
 * Web Crypto only, no Node APIs: this runs in the Edge middleware.
 */

import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AccessConfig } from './deployment';

export type AccessVerdict =
  | { ok: true; subject?: string; email?: string }
  /**
   * missing:     no token presented
   * invalid:     a token was presented and is not acceptable (signature, claims, expiry, algorithm)
   * unavailable: the token could not be checked because the signing keys could not be fetched
   */
  | { ok: false; reason: 'missing' | 'invalid' | 'unavailable' };

export type AccessVerifier = (token: string | undefined) => Promise<AccessVerdict>;

export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';
export const ACCESS_COOKIE = 'CF_Authorization';

const CLOCK_TOLERANCE_SECONDS = 30;
const JWKS_TIMEOUT_MS = 5_000;

/** The token Access attached: the header it injects, else its session cookie. */
export function readAccessToken(headers: Headers): string | undefined {
  const fromHeader = headers.get(ACCESS_JWT_HEADER)?.trim();
  if (fromHeader) return fromHeader;

  const cookies = headers.get('cookie');
  if (!cookies) return undefined;
  for (const part of cookies.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${ACCESS_COOKIE}=`)) {
      const value = trimmed.slice(ACCESS_COOKIE.length + 1).trim();
      if (value) return value;
    }
  }
  return undefined;
}

/** Problems with the token itself, as opposed to problems reaching the keys. */
function isTokenFault(error: unknown): boolean {
  return (
    error instanceof errors.JWTClaimValidationFailed ||
    error instanceof errors.JWTExpired ||
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JOSEAlgNotAllowed ||
    error instanceof errors.JOSENotSupported ||
    error instanceof errors.JWKSNoMatchingKey ||
    error instanceof errors.JWKSMultipleMatchingKeys
  );
}

/**
 * Build a verifier for one Access application. `keys` defaults to the team's
 * remote key set (cached and rotated by jose); tests inject a local one.
 */
export function createAccessVerifier(config: AccessConfig, keys?: JWTVerifyGetKey): AccessVerifier {
  const issuer = `https://${config.teamDomain}`;
  const getKey =
    keys ??
    createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: JWKS_TIMEOUT_MS,
    });

  return async (token) => {
    if (!token) return { ok: false, reason: 'missing' };
    try {
      const { payload } = await jwtVerify(token, getKey, {
        issuer,
        audience: config.audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
      return {
        ok: true,
        subject: payload.sub || undefined,
        email: typeof payload.email === 'string' ? payload.email : undefined,
      };
    } catch (error) {
      if (isTokenFault(error)) return { ok: false, reason: 'invalid' };
      // Never log the token. The error class is enough to tell a key-fetch
      // outage from an attack.
      console.error(
        '[rainbow] Access key lookup failed:',
        error instanceof Error ? error.name : typeof error,
      );
      return { ok: false, reason: 'unavailable' };
    }
  };
}

const verifiers = new Map<string, AccessVerifier>();

/** One verifier (and so one cached key set) per Access application, per isolate. */
export function getAccessVerifier(config: AccessConfig): AccessVerifier {
  const key = `${config.teamDomain}|${config.audience}`;
  let verifier = verifiers.get(key);
  if (!verifier) {
    verifier = createAccessVerifier(config);
    verifiers.set(key, verifier);
  }
  return verifier;
}
