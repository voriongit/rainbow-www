// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessVerdict, AccessVerifier } from '../app/lib/access-jwt';
import { LIVE_RESPONSE_HEADERS, decideAccess } from '../app/lib/live-gate';
import { PUBLIC_ONLY_PREFIXES } from '../app/lib/deployment';

const LIVE_ENV = {
  RAINBOW_DEPLOYMENT: 'live',
  CF_ACCESS_TEAM_DOMAIN: 'vorion.cloudflareaccess.com',
  CF_ACCESS_AUD: 'a'.repeat(64),
};

/** A verifier that records the token it was asked about and returns a fixed verdict. */
function fakeVerifier(verdict: AccessVerdict) {
  const seen: Array<string | undefined> = [];
  const verifier: AccessVerifier = async (token) => {
    seen.push(token);
    return verdict;
  };
  return { verifier, seen, verifierFor: vi.fn(() => verifier) };
}

const request = (pathname: string, headers: Record<string, string> = {}) => ({
  pathname,
  headers: new Headers(headers),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('decideAccess: public deployment', () => {
  it('passes every request through untouched, with no verification', async () => {
    const { verifierFor } = fakeVerifier({ ok: false, reason: 'invalid' });
    for (const path of ['/', '/agent/atlas-01', '/lab', '/api/window', '/embed/fleet', '/api/signals']) {
      const decision = await decideAccess(request(path), { env: {}, verifierFor });
      expect(decision, path).toEqual({ action: 'pass', headers: {} });
    }
    expect(verifierFor).not.toHaveBeenCalled();
  });

  it('treats a mistyped deployment name as public', async () => {
    const decision = await decideAccess(request('/'), { env: { RAINBOW_DEPLOYMENT: 'Live' } });
    expect(decision).toEqual({ action: 'pass', headers: {} });
  });
});

describe('decideAccess: live deployment', () => {
  it('answers 404 for modeled/illustrative routes before any authentication', async () => {
    const { verifierFor } = fakeVerifier({ ok: true });
    for (const prefix of PUBLIC_ONLY_PREFIXES) {
      for (const path of [prefix, `${prefix}/x`]) {
        // Even a fully valid identity does not reach them.
        const decision = await decideAccess(request(path, { 'cf-access-jwt-assertion': 'valid' }), {
          env: LIVE_ENV,
          verifierFor,
        });
        expect(decision, path).toEqual({ action: 'deny', status: 404, message: 'Not found' });
      }
    }
    expect(verifierFor).not.toHaveBeenCalled();
  });

  it('lets the ingest route through to its own bearer check, with no Access identity', async () => {
    const { verifierFor } = fakeVerifier({ ok: false, reason: 'missing' });
    // Producers are machines: no Access token, and the route works even while
    // the Access settings are absent (it has its own fail-closed token check).
    const decision = await decideAccess(request('/api/signals'), {
      env: { RAINBOW_DEPLOYMENT: 'live' },
      verifierFor,
    });
    expect(decision).toEqual({ action: 'pass', headers: LIVE_RESPONSE_HEADERS });
    expect(verifierFor).not.toHaveBeenCalled();
  });

  it('refuses to serve anything while the Access settings are missing or malformed', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { verifierFor } = fakeVerifier({ ok: true });

    const unset = await decideAccess(request('/'), { env: { RAINBOW_DEPLOYMENT: 'live' }, verifierFor });
    expect(unset).toMatchObject({ action: 'deny', status: 503 });
    expect(unset.action === 'deny' && unset.message).toContain('CF_ACCESS_TEAM_DOMAIN is not set');

    const malformed = await decideAccess(request('/api/window'), {
      env: { ...LIVE_ENV, CF_ACCESS_TEAM_DOMAIN: 'evil.example.com' },
      verifierFor,
    });
    expect(malformed).toMatchObject({ action: 'deny', status: 503 });

    expect(verifierFor).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledTimes(2);
  });

  it('401 when no token is presented, 403 when it is not acceptable, 503 when keys are unreachable', async () => {
    const cases: Array<[AccessVerdict, number]> = [
      [{ ok: false, reason: 'missing' }, 401],
      [{ ok: false, reason: 'invalid' }, 403],
      [{ ok: false, reason: 'unavailable' }, 503],
    ];
    for (const [verdict, status] of cases) {
      const { verifierFor } = fakeVerifier(verdict);
      const decision = await decideAccess(request('/'), { env: LIVE_ENV, verifierFor });
      expect(decision, JSON.stringify(verdict)).toMatchObject({ action: 'deny', status });
    }
  });

  it('serves a verified identity with no-store, noindex and no-referrer headers', async () => {
    const { verifierFor } = fakeVerifier({ ok: true, email: 'ryan@example.com' });
    const decision = await decideAccess(request('/agent/atlas-01'), { env: LIVE_ENV, verifierFor });
    expect(decision).toEqual({ action: 'pass', headers: LIVE_RESPONSE_HEADERS });
    expect(LIVE_RESPONSE_HEADERS).toMatchObject({
      'cache-control': 'private, no-store',
      'x-robots-tag': expect.stringContaining('noindex'),
      'referrer-policy': 'no-referrer',
    });
  });

  it('verifies against the configured team and AUD, reading the header or the cookie', async () => {
    const { seen, verifierFor } = fakeVerifier({ ok: true });

    await decideAccess(request('/', { 'cf-access-jwt-assertion': 'from-header' }), {
      env: LIVE_ENV,
      verifierFor,
    });
    await decideAccess(request('/', { cookie: 'a=1; CF_Authorization=from-cookie' }), {
      env: LIVE_ENV,
      verifierFor,
    });
    await decideAccess(request('/'), { env: LIVE_ENV, verifierFor });

    expect(verifierFor).toHaveBeenCalledWith({
      teamDomain: 'vorion.cloudflareaccess.com',
      audience: 'a'.repeat(64),
    });
    expect(seen).toEqual(['from-header', 'from-cookie', undefined]);
  });
});
