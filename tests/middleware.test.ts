// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, middleware } from '../middleware';

const AUD = 'a'.repeat(64);

function liveEnv(extra: Record<string, string> = {}) {
  vi.stubEnv('RAINBOW_DEPLOYMENT', 'live');
  vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', 'vorion.cloudflareaccess.com');
  vi.stubEnv('CF_ACCESS_AUD', AUD);
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
}

const get = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://rainbow-live.example.test${path}`, { headers });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('middleware', () => {
  it('public deployment: continues to the app and adds no live headers', async () => {
    vi.stubEnv('RAINBOW_DEPLOYMENT', 'public');
    const response = await middleware(get('/lab'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-robots-tag')).toBeNull();
    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('live: hides modeled routes with a plain 404', async () => {
    liveEnv();
    const response = await middleware(get('/benchmark'));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });

  it('live: no Access token is 401, as JSON for the API and text for pages', async () => {
    liveEnv();

    const api = await middleware(get('/api/window?window=24h'));
    expect(api.status).toBe(401);
    expect(api.headers.get('content-type')).toContain('application/json');
    expect(await api.json()).toEqual({ error: 'Authentication required' });

    const page = await middleware(get('/agent/atlas-01'));
    expect(page.status).toBe(401);
    expect(page.headers.get('content-type')).toContain('text/plain');
    expect(page.headers.get('cache-control')).toBe('no-store');
  });

  it('live: a garbage token never reaches the app', async () => {
    liveEnv();
    // Fails closed whether the key lookup is reachable (invalid -> 403) or not
    // (unavailable -> 503); what matters is that it is never passed through.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await middleware(get('/', { 'cf-access-jwt-assertion': 'not.a.jwt' }));
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect([403, 503]).toContain(response.status);
  });

  it('live: refuses everything but ingest while Access is unconfigured', async () => {
    vi.stubEnv('RAINBOW_DEPLOYMENT', 'live');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const page = await middleware(get('/'));
    expect(page.status).toBe(503);

    const ingest = await middleware(get('/api/signals'));
    expect(ingest.headers.get('x-middleware-next')).toBe('1');
    expect(ingest.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('middleware matcher', () => {
  // The matcher is a path-to-regexp pattern; this one is plain regex syntax.
  const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

  it('covers pages and APIs', () => {
    for (const path of ['/', '/agent/atlas-01', '/api/signals', '/api/window', '/sw.js']) {
      expect(matches(path), path).toBe(true);
    }
  });

  it('skips build assets and static icons only', () => {
    for (const path of [
      '/_next/static/chunks/main.js',
      '/_next/image',
      '/favicon.svg',
      '/icons/icon-192.png',
      '/manifest.webmanifest',
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });
});
