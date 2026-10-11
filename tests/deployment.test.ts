// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { describe, expect, it } from 'vitest';
import {
  PUBLIC_ONLY_PREFIXES,
  isLiveDeployment,
  isPublicOnlyPath,
  resolveAccessConfig,
  resolveDeployment,
} from '../app/lib/deployment';

describe('resolveDeployment', () => {
  it('is public unless explicitly set to the exact string "live"', () => {
    expect(resolveDeployment({})).toBe('public');
    expect(resolveDeployment({ RAINBOW_DEPLOYMENT: 'live' })).toBe('live');
  });

  it('fails toward public on typos, case changes and empty values', () => {
    for (const value of ['Live', 'LIVE', ' live', 'live ', 'lve', 'true', '1', '']) {
      expect(resolveDeployment({ RAINBOW_DEPLOYMENT: value })).toBe('public');
    }
  });

  it('isLiveDeployment mirrors resolveDeployment', () => {
    expect(isLiveDeployment({ RAINBOW_DEPLOYMENT: 'live' })).toBe(true);
    expect(isLiveDeployment({ RAINBOW_DEPLOYMENT: 'public' })).toBe(false);
    expect(isLiveDeployment({})).toBe(false);
  });
});

describe('isPublicOnlyPath', () => {
  it('matches each modeled/illustrative route and everything beneath it', () => {
    for (const prefix of PUBLIC_ONLY_PREFIXES) {
      expect(isPublicOnlyPath(prefix)).toBe(true);
      expect(isPublicOnlyPath(`${prefix}/anything/below`)).toBe(true);
    }
  });

  it('does not match grounded routes or look-alike prefixes', () => {
    for (const path of ['/', '/agent/atlas-01', '/compare', '/proof', '/report', '/api/window']) {
      expect(isPublicOnlyPath(path)).toBe(false);
    }
    // A shared string prefix is not a path prefix.
    expect(isPublicOnlyPath('/labs')).toBe(false);
    expect(isPublicOnlyPath('/modeling')).toBe(false);
    expect(isPublicOnlyPath('/controls')).toBe(false);
  });
});

describe('resolveAccessConfig', () => {
  const AUD = 'a'.repeat(64);

  it('accepts a team domain and AUD tag', () => {
    expect(
      resolveAccessConfig({ CF_ACCESS_TEAM_DOMAIN: 'vorion.cloudflareaccess.com', CF_ACCESS_AUD: AUD }),
    ).toEqual({ ok: true, config: { teamDomain: 'vorion.cloudflareaccess.com', audience: AUD } });
  });

  it('tolerates a pasted scheme, trailing slash and mixed case', () => {
    const result = resolveAccessConfig({
      CF_ACCESS_TEAM_DOMAIN: ' https://Vorion.CloudflareAccess.com/ ',
      CF_ACCESS_AUD: ` ${AUD} `,
    });
    expect(result).toEqual({
      ok: true,
      config: { teamDomain: 'vorion.cloudflareaccess.com', audience: AUD },
    });
  });

  it('reports which setting is missing', () => {
    expect(resolveAccessConfig({ CF_ACCESS_AUD: AUD })).toEqual({
      ok: false,
      reason: 'CF_ACCESS_TEAM_DOMAIN is not set',
    });
    expect(resolveAccessConfig({ CF_ACCESS_TEAM_DOMAIN: 'vorion.cloudflareaccess.com' })).toEqual({
      ok: false,
      reason: 'CF_ACCESS_AUD is not set',
    });
  });

  it('refuses a team domain that is not a cloudflareaccess.com host', () => {
    // The domain is also where signing keys are fetched from, so an arbitrary
    // host would let a bad setting point key discovery somewhere else.
    for (const domain of [
      'evil.example.com',
      'vorion.cloudflareaccess.com.evil.example',
      'cloudflareaccess.com',
      'vorion.cloudflareaccess.com:8443',
      'https://vorion.cloudflareaccess.com/cdn-cgi/access/certs',
    ]) {
      const result = resolveAccessConfig({ CF_ACCESS_TEAM_DOMAIN: domain, CF_ACCESS_AUD: AUD });
      expect(result.ok, domain).toBe(false);
    }
  });

  it('refuses an AUD containing whitespace', () => {
    const result = resolveAccessConfig({
      CF_ACCESS_TEAM_DOMAIN: 'vorion.cloudflareaccess.com',
      CF_ACCESS_AUD: 'abc def',
    });
    expect(result.ok).toBe(false);
  });
});
