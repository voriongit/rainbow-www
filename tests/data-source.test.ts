// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Clock, FakeRepository, makeSignal } from './helpers/fake-repository';

// React's `cache` only exists in the server build; per-render memoization is
// not what is under test, so make it the identity.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));

// Replace the Supabase implementation with one the test controls, and record
// every construction: for the public deployment the answer must be zero.
const store = vi.hoisted(() => ({ instance: undefined as unknown, constructed: 0 }));
vi.mock('../app/lib/supabase-signal-repository', () => ({
  SupabaseSignalRepository: vi.fn(function () {
    store.constructed += 1;
    return store.instance;
  }),
}));

const STORE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  RAINBOW_INGEST_TOKEN: 'ingest-token',
};

const GLOBAL_KEYS = ['__rainbowSource', '__rainbowRepository', '__rainbowFeed', '__rainbowEmptyLive'];

let clock: Clock;
let repo: FakeRepository;

async function loadDataSource() {
  vi.resetModules();
  return import('../app/lib/data-source');
}

function stubEnv(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

const live = (extra: Record<string, string> = {}) =>
  stubEnv({ RAINBOW_DEPLOYMENT: 'live', ...STORE_ENV, ...extra });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  clock = new Clock(Date.now());
  repo = new FakeRepository(clock);
  store.instance = repo;
  store.constructed = 0;
  for (const key of GLOBAL_KEYS) delete (globalThis as Record<string, unknown>)[key];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('public deployment: always synthetic', () => {
  it('ignores store credentials in its environment and never builds a store', async () => {
    stubEnv(STORE_ENV); // RAINBOW_DEPLOYMENT unset: the public deployment
    repo.add(makeSignal({ atMs: Date.now() - 1_000, agentId: 'REAL-AGENT' }));
    const dataSource = await loadDataSource();

    expect(await dataSource.ensureHydrated()).toBe(0);
    const provenance = dataSource.getProvenance();
    expect(provenance).toMatchObject({ mode: 'simulated', deployment: 'public', available: true });
    expect(dataSource.getIngestRepository()).toBeUndefined();
    expect(dataSource.unavailableResponse(provenance)).toBeUndefined();

    // The seeded fleet is what it serves; the real agent is nowhere in it.
    const roster = dataSource.getAgents();
    expect(roster.length).toBeGreaterThan(5);
    expect(roster.map((agent) => agent.agentId)).not.toContain('REAL-AGENT');
    expect(roster.some((agent) => agent.label !== agent.agentId)).toBe(true); // scripted archetypes

    expect(store.constructed).toBe(0);
    expect(repo.calls).toEqual({ insert: 0, latest: 0, recent: 0, since: 0 });
  });

  it('a mistyped deployment name is still the public, synthetic one', async () => {
    stubEnv({ ...STORE_ENV, RAINBOW_DEPLOYMENT: 'Live' });
    const dataSource = await loadDataSource();

    await dataSource.ensureHydrated();

    expect(dataSource.getProvenance().mode).toBe('simulated');
    expect(dataSource.getIngestRepository()).toBeUndefined();
    expect(store.constructed).toBe(0);
  });
});

describe('live deployment: always real, never the simulator', () => {
  it('not configured: nothing to show, said plainly, and no simulated fleet behind it', async () => {
    stubEnv({ RAINBOW_DEPLOYMENT: 'live' });
    const dataSource = await loadDataSource();

    await dataSource.ensureHydrated();
    const provenance = dataSource.getProvenance();

    expect(provenance).toMatchObject({ mode: 'live', deployment: 'live', available: false });
    expect(provenance.reason).toContain('SUPABASE_URL');
    expect(dataSource.getAgents()).toEqual([]);
    const response = dataSource.unavailableResponse(provenance)!;
    expect(response.status).toBe(503);
    expect((await response.json()).provenance.available).toBe(false);
  });

  it('configured but empty: says no agent has reported, not an empty healthy fleet', async () => {
    live();
    const dataSource = await loadDataSource();

    await dataSource.ensureHydrated();
    const provenance = dataSource.getProvenance();

    expect(provenance).toMatchObject({ mode: 'live', available: false, signalCount: 0 });
    expect(provenance.reason).toMatch(/empty.*no agent has reported/);
    expect(dataSource.getAgents()).toEqual([]);
  });

  it('with signals: serves exactly the real agents, with their ids as names', async () => {
    live();
    for (const agentId of ['zulu-1', 'alpha-2']) {
      repo.add(makeSignal({ atMs: Date.now() - 5_000, agentId, delta: 0, scoreAfter: 700 }));
      repo.add(makeSignal({ atMs: Date.now() - 2_000, agentId, delta: 3, scoreAfter: 703 }));
    }
    const dataSource = await loadDataSource();

    expect(await dataSource.ensureHydrated()).toBe(4);
    const provenance = dataSource.getProvenance();

    expect(provenance).toMatchObject({
      mode: 'live',
      deployment: 'live',
      available: true,
      signalCount: 4,
      agentCount: 2,
    });
    expect(provenance.reason).toContain('Live telemetry from 2 reporting agents, 4 signals');
    expect(dataSource.unavailableResponse(provenance)).toBeUndefined();

    const roster = dataSource.getAgents();
    expect(roster.map((agent) => agent.agentId)).toEqual(['alpha-2', 'zulu-1']);
    expect(roster.every((agent) => agent.label === agent.agentId && agent.score === 703)).toBe(true);
    expect(dataSource.getIngestRepository()).toBe(repo);
  });

  it('builds a full dashboard from real signals', async () => {
    live();
    const base = Date.now() - 3 * 3_600_000;
    for (let i = 0; i < 12; i++) {
      repo.add(
        makeSignal({
          atMs: base + i * 600_000,
          agentId: 'agent-1',
          success: i % 3 !== 0,
          delta: i % 3 === 0 ? -8 : 2,
          scoreAfter: 600 + i,
          tierAfter: 3,
          riskLevel: 'HIGH',
          factorCode: 'CT-COMP',
        }),
      );
    }
    const dataSource = await loadDataSource();
    await dataSource.ensureHydrated();

    const data = dataSource.getDashboardData('24h', 'agent-1');

    expect(data.agentId).toBe('agent-1');
    expect(data.window.distribution.total).toBe(12);
    expect(data.fleet.fleet.totalAgents).toBe(1);
    expect(data.correctedRisk.currentAccumulatorValue).toBeGreaterThan(0);
  });

  it('refuses to build a dashboard when nothing has reported', async () => {
    live();
    const dataSource = await loadDataSource();
    await dataSource.ensureHydrated();
    expect(() => dataSource.getDashboardData('24h')).toThrow(/No agents have reported yet/);
  });

  it('a store that cannot be read is reported as such, then recovers', async () => {
    live({ RAINBOW_LIVE_REFRESH_MS: '1' });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    repo.add(makeSignal({ atMs: Date.now() - 1_000, scoreAfter: 650 }));
    repo.failNext = new Error('connection refused');
    const dataSource = await loadDataSource();

    await dataSource.ensureHydrated();
    expect(dataSource.getProvenance()).toMatchObject({ mode: 'live', available: false });
    expect(dataSource.getProvenance().reason).toContain('could not be read');
    expect(dataSource.getProvenance().reason).toContain('connection refused');
    expect(errorLog).toHaveBeenCalled();

    await sleep(5);
    await dataSource.ensureHydrated();
    expect(dataSource.getProvenance()).toMatchObject({ available: true, signalCount: 1 });
  });

  it('keeps serving the last good data when a refresh fails, and says it may be out of date', async () => {
    live({ RAINBOW_LIVE_REFRESH_MS: '1' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    repo.add(makeSignal({ atMs: Date.now() - 1_000, scoreAfter: 650 }));
    const dataSource = await loadDataSource();
    await dataSource.ensureHydrated();

    await sleep(5);
    repo.failNext = new Error('timeout');
    await dataSource.ensureHydrated();

    const provenance = dataSource.getProvenance();
    expect(provenance).toMatchObject({ available: true, signalCount: 1 });
    expect(provenance.reason).toContain('latest refresh failed');
    expect(provenance.reason).toContain('may be out of date');
    expect(dataSource.getAgents()).toHaveLength(1);
  });

  it('picks up signals ingested after the first load, on the next refresh', async () => {
    live({ RAINBOW_LIVE_REFRESH_MS: '1' });
    repo.add(makeSignal({ atMs: Date.now() - 2_000, agentId: 'first' }));
    const dataSource = await loadDataSource();
    await dataSource.ensureHydrated();
    expect(dataSource.getAgents().map((a) => a.agentId)).toEqual(['first']);

    clock.ms = Date.now();
    repo.add(makeSignal({ atMs: Date.now() - 500, agentId: 'second' }));
    dataSource.markFeedStale();
    await dataSource.ensureHydrated();

    expect(dataSource.getAgents().map((a) => a.agentId)).toEqual(['first', 'second']);
  });

  it('says when history was cut short by the cap', async () => {
    live({ RAINBOW_LIVE_MAX_SIGNALS: '2' });
    for (let i = 1; i <= 3; i++) repo.add(makeSignal({ atMs: Date.now() - i * 1_000 }));
    const dataSource = await loadDataSource();

    await dataSource.ensureHydrated();

    expect(dataSource.getProvenance()).toMatchObject({ available: true, signalCount: 2 });
    expect(dataSource.getProvenance().reason).toContain('limited to the most recent');
  });
});
