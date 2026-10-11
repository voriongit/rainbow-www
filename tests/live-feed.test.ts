// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { describe, expect, it, vi } from 'vitest';
import { LiveSignalFeed, type LiveFeedOptions } from '../app/lib/live-feed';
import { Clock, FakeRepository, makeSignal } from './helpers/fake-repository';

const DAY = 86_400_000;
const MIN = 60_000;
const T0 = Date.UTC(2026, 5, 1, 12, 0, 0);
const EPOCH = new Date(0);
const FAR = new Date(8.64e15);

function setup(options: Partial<LiveFeedOptions> = {}) {
  const clock = new Clock(T0);
  const repo = new FakeRepository(clock);
  const feed = new LiveSignalFeed({ repo, now: clock.now, ...options });
  const timestamps = (agentId: string) =>
    feed.current.store.query(agentId, EPOCH, FAR).map((s) => s.timestamp.getTime());
  return { clock, repo, feed, timestamps };
}

describe('hydrate', () => {
  it('loads the window oldest first and ignores signals older than it', async () => {
    const { repo, feed, timestamps } = setup();
    repo.add(makeSignal({ atMs: T0 - 40 * DAY })); // outside the 31-day window
    repo.add(makeSignal({ atMs: T0 - 3 * MIN }));
    repo.add(makeSignal({ atMs: T0 - 1 * MIN }));
    repo.add(makeSignal({ atMs: T0 - 2 * MIN }));

    await feed.refresh();

    expect(timestamps('a1')).toEqual([T0 - 3 * MIN, T0 - 2 * MIN, T0 - 1 * MIN]);
    expect(feed.status()).toMatchObject({ hydrated: true, signalCount: 3, agentCount: 1, truncated: false });
  });

  it('keeps the newest signals when the cap is hit and says it truncated', async () => {
    const { repo, feed, timestamps } = setup({ maxSignals: 3 });
    for (let i = 1; i <= 5; i++) repo.add(makeSignal({ atMs: T0 - (6 - i) * MIN }));

    await feed.refresh();

    expect(timestamps('a1')).toEqual([T0 - 3 * MIN, T0 - 2 * MIN, T0 - 1 * MIN]);
    expect(feed.status()).toMatchObject({ signalCount: 3, truncated: true });
  });

  it('reports exactly the agents that lost signals to a full buffer', async () => {
    const { repo, feed, clock } = setup({ perAgentCapacity: 3 });
    for (let i = 1; i <= 5; i++) repo.add(makeSignal({ atMs: T0 - i * MIN, agentId: 'busy' }));
    for (let i = 1; i <= 3; i++) repo.add(makeSignal({ atMs: T0 - i * MIN, agentId: 'full' }));
    repo.add(makeSignal({ atMs: T0 - MIN, agentId: 'quiet' }));

    await feed.refresh();

    // 'full' holds exactly its capacity and has lost nothing.
    expect(feed.status().truncatedAgents).toEqual(['busy']);
    expect(feed.status().signalCount).toBe(3 + 3 + 1);

    // One more signal for 'full' pushes its oldest out.
    clock.advance(15_000);
    repo.add(makeSignal({ atMs: T0 + 1_000, agentId: 'full' }));
    await feed.refresh();
    expect(feed.status().truncatedAgents).toEqual(['busy', 'full']);
  });

  it('starts a window from the score the stored history had reached, not from zero', async () => {
    const { repo, feed, clock } = setup();
    repo.add(makeSignal({ atMs: T0 - 90 * MIN, delta: -5, success: false, scoreAfter: 600 }));
    repo.add(makeSignal({ atMs: T0 - 30 * MIN, delta: 5, scoreAfter: 605 }));

    await feed.refresh();
    const window = feed.current.rainbow.computeAnalyticsWindow(
      { duration: '1h', agentId: 'a1' },
      new Date(clock.ms),
    );

    // Only the second signal is inside the 1h window; the 600 it starts from
    // comes from the stored history via the feed's score lookup.
    expect(window.distribution.total).toBe(1);
    expect(window.trajectory.current).toBe(605);
  });
});

describe('refresh cadence', () => {
  it('does not read the store again inside the interval, and markStale bypasses it', async () => {
    const { repo, feed, clock } = setup({ ttlMs: 10_000 });
    repo.add(makeSignal({ atMs: T0 - MIN }));
    await feed.refresh();
    expect(repo.calls).toMatchObject({ recent: 1, since: 0 });

    await feed.refresh();
    clock.advance(5_000);
    await feed.refresh();
    expect(repo.calls).toMatchObject({ recent: 1, since: 0 });

    feed.markStale();
    await feed.refresh();
    expect(repo.calls.since).toBe(1);

    clock.advance(10_000);
    await feed.refresh();
    expect(repo.calls.since).toBe(2);
  });

  it('coalesces concurrent refreshes into a single read', async () => {
    const { repo, feed } = setup();
    repo.add(makeSignal({ atMs: T0 - MIN }));
    await Promise.all([feed.refresh(), feed.refresh(), feed.refresh()]);
    expect(repo.calls.recent).toBe(1);
    expect(repo.calls.latest).toBe(1);
  });

  it('an ingest that lands while a read is in flight is not lost to the interval', async () => {
    const { repo, feed, clock } = setup();
    repo.add(makeSignal({ atMs: T0 - MIN }));
    await feed.refresh();

    clock.advance(11_000);
    const reading = feed.refresh(); // a tail read starts
    feed.markStale(); // an ingest commits while it is in flight
    await reading;

    await feed.refresh(); // must read again now, not wait out another interval
    expect(repo.calls.since).toBe(2);
  });
});

describe('tail', () => {
  it('publishes each change as a new generation and never alters one already handed out', async () => {
    const { repo, feed, clock, timestamps } = setup();
    repo.add(makeSignal({ atMs: T0 - 5 * MIN }));
    await feed.refresh();
    const before = feed.current;

    clock.advance(15_000);
    repo.add(makeSignal({ atMs: T0 + 5_000 }));
    await feed.refresh();

    expect(repo.calls.recent).toBe(1); // no second full load
    expect(feed.current.generation).toBe(before.generation + 1);
    expect(timestamps('a1')).toEqual([T0 - 5 * MIN, T0 + 5_000]);
    // A request still holding the earlier generation sees exactly what it saw.
    expect(before.store.query('a1', EPOCH, FAR)).toHaveLength(1);
    expect(before.rainbow.collector.count('a1')).toBe(1);
    expect(before.source.agents()[0].signalCount).toBe(1);
  });

  it('does not publish a new generation when the tail finds nothing new', async () => {
    const { repo, feed, clock } = setup();
    repo.add(makeSignal({ atMs: T0 - MIN }));
    await feed.refresh();
    const before = feed.current;

    clock.advance(15_000);
    await feed.refresh(); // re-reads the overlap, all of it already seen

    expect(repo.calls.since).toBe(1);
    expect(feed.current).toBe(before);
  });

  it('never counts a row twice when the overlap re-reads it', async () => {
    const { repo, feed, clock, timestamps } = setup();
    await feed.refresh();
    clock.advance(1_000);
    repo.add(makeSignal({ atMs: T0 + 500 }));

    for (let i = 0; i < 4; i++) {
      clock.advance(11_000);
      await feed.refresh();
    }

    expect(repo.calls.since).toBe(4);
    expect(timestamps('a1')).toEqual([T0 + 500]);
  });

  it('catches a row that became visible after a newer one (a slow transaction)', async () => {
    const { repo, feed, clock } = setup();
    await feed.refresh();

    clock.advance(1_000);
    const slow = repo.add(makeSignal({ atMs: T0 + 900, agentId: 'slow' }), { hidden: true });
    clock.advance(1_000);
    repo.add(makeSignal({ atMs: T0 + 1_900, agentId: 'fast' }));

    clock.advance(11_000);
    await feed.refresh();
    expect(feed.current.store.agentIds()).toEqual(['fast']);

    // The earlier transaction commits: lower seq, older inserted_at, visible only now.
    repo.reveal(slow);
    clock.advance(11_000);
    await feed.refresh();

    expect(feed.current.store.agentIds().sort()).toEqual(['fast', 'slow']);
    expect(feed.status().signalCount).toBe(2);
  });

  it('merges a late signal in time order instead of appending it out of sequence', async () => {
    const { repo, feed, clock, timestamps } = setup();
    repo.add(makeSignal({ atMs: T0 - 4 * MIN }));
    repo.add(makeSignal({ atMs: T0 - 2 * MIN }));
    await feed.refresh();
    const before = feed.current;

    clock.advance(15_000);
    repo.add(makeSignal({ atMs: T0 - 3 * MIN })); // older than the agent's newest
    await feed.refresh();

    expect(timestamps('a1')).toEqual([T0 - 4 * MIN, T0 - 3 * MIN, T0 - 2 * MIN]);
    expect(feed.current.rainbow).not.toBe(before.rainbow); // rebuilt
  });

  it('ignores a row whose signal is already older than the window', async () => {
    const { repo, feed, clock } = setup();
    repo.add(makeSignal({ atMs: T0 - MIN }));
    await feed.refresh();

    clock.advance(15_000);
    repo.add(makeSignal({ atMs: T0 - 45 * DAY })); // backfilled history
    await feed.refresh();

    expect(feed.status().signalCount).toBe(1);
  });
});

describe('periodic reload', () => {
  it('heals a row the tail could not see and drops what has aged out of the window', async () => {
    const { repo, feed, clock } = setup({ rehydrateMs: 15 * MIN });
    repo.add(makeSignal({ atMs: T0 - 30 * DAY, agentId: 'old' })); // inside the window now
    repo.add(makeSignal({ atMs: T0 - MIN, agentId: 'steady' }));
    await feed.refresh();
    expect(feed.current.store.agentIds().sort()).toEqual(['old', 'steady']);

    // A transaction that stays open far longer than the overlap, then commits.
    const stuck = repo.add(makeSignal({ atMs: T0 + 1_000, agentId: 'stuck' }), { hidden: true });
    clock.advance(5 * MIN);
    repo.add(makeSignal({ atMs: clock.ms, agentId: 'steady' }));
    await feed.refresh(); // tail: moves the watermark past the stuck row
    repo.reveal(stuck);
    clock.advance(11_000);
    await feed.refresh();
    expect(feed.current.store.agentIds()).not.toContain('stuck'); // the tail alone cannot see it

    // Past the reload interval, and 2 days on: 'old' is now beyond 31 days.
    clock.advance(2 * DAY);
    await feed.refresh();

    expect(repo.calls.recent).toBe(2);
    const agents = feed.current.store.agentIds();
    expect(agents).toContain('stuck');
    expect(agents).not.toContain('old');
  });
});

describe('failure handling', () => {
  it('keeps serving the last good data when a refresh fails, and says so', async () => {
    const onError = vi.fn();
    const { repo, feed, clock, timestamps } = setup({ onError });
    repo.add(makeSignal({ atMs: T0 - MIN }));
    await feed.refresh();

    clock.advance(11_000);
    repo.failNext = new Error('connection reset');
    await expect(feed.refresh()).resolves.toBeUndefined(); // never rejects

    expect(timestamps('a1')).toEqual([T0 - MIN]);
    expect(feed.status().lastError).toContain('connection reset');
    expect(onError).toHaveBeenCalledTimes(1);

    clock.advance(11_000);
    await feed.refresh();
    expect(feed.status().lastError).toBeUndefined();
  });

  it('a failed first load leaves it unhydrated, then backs off instead of retrying every request', async () => {
    const { repo, feed, clock } = setup({ ttlMs: 10_000 });
    repo.failNext = new Error('db down');

    await feed.refresh();
    expect(feed.status()).toMatchObject({ hydrated: false, signalCount: 0 });
    expect(feed.status().lastError).toContain('db down');

    await feed.refresh();
    await feed.refresh();
    expect(repo.calls.latest).toBe(1); // within the interval: no retry

    clock.advance(10_000);
    repo.add(makeSignal({ atMs: T0 - MIN }));
    await feed.refresh();
    expect(feed.status()).toMatchObject({ hydrated: true, signalCount: 1, lastError: undefined });
  });

  it('gives up on a hung store at the deadline, and recovers afterwards', async () => {
    const { repo, feed, clock } = setup({ hydrateTimeoutMs: 40, ttlMs: 10_000 });
    repo.add(makeSignal({ atMs: T0 - MIN }));
    repo.hang = true;

    await feed.refresh(); // resolves once the deadline aborts the read
    expect(feed.status().hydrated).toBe(false);
    expect(feed.status().lastError).toMatch(/Timeout|abort/i);

    repo.hang = false;
    clock.advance(10_000);
    await feed.refresh();
    expect(feed.status()).toMatchObject({ hydrated: true, signalCount: 1 });
  });
});
