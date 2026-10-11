// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { MemoryWindowStore, type IngestedSignal } from '@vorionsys/rainbow';
import { describe, expect, it } from 'vitest';
import { LiveFleetSource, buildScoreTimeline, scoreAtTime } from '../app/lib/fleet-source';
import { makeSignal } from './helpers/fake-repository';

const at = (ms: number, extra: Partial<IngestedSignal> = {}) => makeSignal({ atMs: ms, ...extra });

describe('buildScoreTimeline / scoreAtTime', () => {
  it('accumulates deltas from an undeclared baseline of zero', () => {
    const timeline = buildScoreTimeline([at(10, { delta: 5 }), at(20, { delta: -2 }), at(30, { delta: 4 })]);
    expect(timeline.scores).toEqual([5, 3, 7]);
  });

  it('treats a declared scoreAfter as authoritative and resets the total', () => {
    const timeline = buildScoreTimeline([
      at(10, { delta: 5 }),
      at(20, { delta: 5, scoreAfter: 600 }),
      at(30, { delta: -1 }),
    ]);
    expect(timeline.scores).toEqual([5, 600, 599]);
  });

  it('ignores a non-finite scoreAfter', () => {
    const timeline = buildScoreTimeline([
      at(10, { delta: 5, scoreAfter: Number.NaN }),
      at(20, { delta: 5, scoreAfter: Number.POSITIVE_INFINITY }),
    ]);
    expect(timeline.scores).toEqual([5, 10]);
  });

  it('answers 0 before the first signal when nothing declares a baseline, and for an empty history', () => {
    const timeline = buildScoreTimeline([at(100, { delta: 7 })]);
    expect(scoreAtTime(timeline, 99)).toBe(0);
    expect(scoreAtTime(buildScoreTimeline([]), 1_000)).toBe(0);
  });

  it('derives the baseline from a first signal that declares its score', () => {
    // 520 after a +2 means 518 before it. A window opening earlier starts there,
    // not at 0, so a new agent's trajectory does not climb out of zero.
    const timeline = buildScoreTimeline([at(100, { delta: 2, scoreAfter: 520 }), at(200, { delta: -15 })]);
    expect(timeline.baseline).toBe(518);
    expect(scoreAtTime(timeline, 50)).toBe(518);
    expect(scoreAtTime(timeline, 100)).toBe(520);
    expect(scoreAtTime(timeline, 250)).toBe(505);
  });

  it('keeps a derived baseline inside the trust score range', () => {
    expect(buildScoreTimeline([at(1, { delta: 40, scoreAfter: 10 })]).baseline).toBe(0);
    expect(buildScoreTimeline([at(1, { delta: -40, scoreAfter: 990 })]).baseline).toBe(1000);
  });

  it('includes a signal at exactly the queried instant, and holds the score between signals', () => {
    const timeline = buildScoreTimeline([at(100, { delta: 7 }), at(200, { delta: 3 })]);
    expect(scoreAtTime(timeline, 100)).toBe(7);
    expect(scoreAtTime(timeline, 150)).toBe(7);
    expect(scoreAtTime(timeline, 200)).toBe(10);
    expect(scoreAtTime(timeline, 9_999)).toBe(10);
  });

  it('applies every signal sharing a timestamp', () => {
    const timeline = buildScoreTimeline([at(100, { delta: 1 }), at(100, { delta: 2 }), at(100, { delta: 3 })]);
    expect(scoreAtTime(timeline, 100)).toBe(6);
  });

  it('matches a plain linear scan, on random histories', () => {
    // A plain walk over the signals for every lookup, the obvious implementation.
    const linear = (signals: IngestedSignal[], atMs: number) => {
      const first = signals[0];
      let score =
        first && typeof first.scoreAfter === 'number' && Number.isFinite(first.scoreAfter)
          ? Math.min(1000, Math.max(0, first.scoreAfter - first.delta))
          : 0;
      for (const s of signals) {
        if (s.timestamp.getTime() > atMs) break;
        score = typeof s.scoreAfter === 'number' && Number.isFinite(s.scoreAfter) ? s.scoreAfter : score + s.delta;
      }
      return score;
    };
    let seed = 12345;
    const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;

    for (let run = 0; run < 50; run++) {
      let t = 0;
      const signals = Array.from({ length: 1 + Math.floor(random() * 60) }, () => {
        t += Math.floor(random() * 4) * 10; // repeated timestamps happen
        return at(t, {
          delta: Math.round((random() - 0.5) * 40),
          scoreAfter: random() < 0.2 ? Math.round(random() * 1000) : undefined,
        });
      });
      const timeline = buildScoreTimeline(signals);
      for (let probe = -10; probe <= t + 20; probe += 7) {
        expect(scoreAtTime(timeline, probe), `run ${run} probe ${probe}`).toBe(linear(signals, probe));
      }
    }
  });
});

describe('LiveFleetSource', () => {
  function sourceOver(signals: IngestedSignal[]) {
    const store = new MemoryWindowStore();
    for (const s of signals) store.put(s);
    return new LiveFleetSource(store);
  }
  const NOW = Date.now();

  it('lists agents sorted by id, named by id, with score and tier from their history', () => {
    const source = sourceOver([
      at(NOW - 2_000, { agentId: 'zeta', delta: 0, scoreAfter: 910 }),
      at(NOW - 1_000, { agentId: 'alpha', delta: 0, scoreAfter: 450 }),
    ]);

    const roster = source.agents();

    expect(roster.map((a) => a.agentId)).toEqual(['alpha', 'zeta']);
    expect(roster.map((a) => a.label)).toEqual(['alpha', 'zeta']); // no invented archetype
    expect(roster.map((a) => a.score)).toEqual([450, 910]);
    expect(roster[0]).toMatchObject({ signalCount: 1, observationTier: 'BLACK_BOX' });
    expect(roster[1].tier).not.toBe(roster[0].tier);
  });

  it('reads the declared observation tier from the newest signal that has one', () => {
    const source = sourceOver([
      at(NOW - 3_000, { metadata: { observationTier: 'GRAY_BOX' } }),
      at(NOW - 2_000, { metadata: { observationTier: 'WHITE_BOX' } }),
      at(NOW - 1_000, { metadata: { unrelated: true } }),
    ]);
    expect(source.agents()[0].observationTier).toBe('WHITE_BOX');
  });

  it('marks an agent whose latest signal is a circuit-breaker trip as TRIPPED', () => {
    const source = sourceOver([
      at(NOW - 2_000, { scoreAfter: 800 }),
      at(NOW - 1_000, { scoreAfter: 800, busSignalType: 'circuit_breaker_tripped' as IngestedSignal['busSignalType'] }),
    ]);
    expect(source.agents()[0].lifecycleState).toBe('TRIPPED');
  });

  it('resolves historical scores from the same series, repeatedly, without rescanning', () => {
    const source = sourceOver([
      at(1_000, { agentId: 'a', delta: 10 }),
      at(2_000, { agentId: 'a', delta: 10 }),
      at(3_000, { agentId: 'a', delta: 10 }),
    ]);
    expect(source.resolveScoreAt('a', new Date(500))).toBe(0);
    expect(source.resolveScoreAt('a', new Date(2_500))).toBe(20);
    expect(source.resolveScoreAt('a', new Date(9_000))).toBe(30);
    expect(source.resolveScoreAt('missing', new Date(9_000))).toBe(0);
    expect(source.currentScores().get('a')).toBe(30);
  });

  it('does nothing to advance a stream (data arrives by ingest)', () => {
    expect(() => sourceOver([]).ensureUpTo()).not.toThrow();
    expect(sourceOver([]).agents()).toEqual([]);
  });
});
