// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { IngestedSignal } from '@vorionsys/rainbow';
import type { SignalRepository, StoredSignal } from '../../app/lib/signal-repository';

/** One shared clock, standing in for both the Worker's and the database's. */
export class Clock {
  constructor(public ms: number) {}
  now = () => this.ms;
  advance(ms: number) {
    this.ms += ms;
  }
}

export function makeSignal(overrides: Partial<IngestedSignal> & { atMs: number }): IngestedSignal {
  const { atMs, ...rest } = overrides;
  return {
    signalId: `sig-${atMs}-${Math.random().toString(36).slice(2, 8)}`,
    agentId: 'a1',
    tenantId: 'default',
    timestamp: new Date(atMs),
    success: true,
    delta: 1,
    blocked: false,
    ...rest,
  };
}

/**
 * An in-memory SignalRepository that can misbehave on purpose:
 *   - `hidden` rows exist but are not visible yet (an uncommitted transaction);
 *   - `failNext` makes the next read throw;
 *   - `hang` makes reads wait until their AbortSignal fires.
 */
export class FakeRepository implements SignalRepository {
  readonly rows: StoredSignal[] = [];
  readonly hidden = new Set<number>();
  readonly calls = { insert: 0, latest: 0, recent: 0, since: 0 };
  failNext: Error | undefined;
  hang = false;
  private nextSeq = 1;

  constructor(private readonly clock: Clock) {}

  /** Store a signal as the database would, stamped with the current database clock. */
  add(signal: IngestedSignal, options: { hidden?: boolean } = {}): number {
    const seq = this.nextSeq++;
    this.rows.push({ seq, insertedAtMs: this.clock.ms, signal });
    if (options.hidden) this.hidden.add(seq);
    return seq;
  }

  reveal(seq: number) {
    this.hidden.delete(seq);
  }

  private visible(): StoredSignal[] {
    return this.rows.filter((row) => !this.hidden.has(row.seq));
  }

  private async guard(abort?: AbortSignal): Promise<void> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = undefined;
      throw error;
    }
    if (this.hang) {
      await new Promise<never>((_, reject) => {
        if (abort?.aborted) reject(abort.reason);
        abort?.addEventListener('abort', () => reject(abort.reason));
      });
    }
  }

  async insert(signals: IngestedSignal[], abort?: AbortSignal): Promise<{ inserted: number }> {
    this.calls.insert += 1;
    await this.guard(abort);
    let inserted = 0;
    for (const signal of signals) {
      const exists = this.rows.some(
        (row) => row.signal.tenantId === signal.tenantId && row.signal.signalId === signal.signalId,
      );
      if (!exists) {
        this.add(signal);
        inserted += 1;
      }
    }
    return { inserted };
  }

  async latestInsertedAtMs(abort?: AbortSignal): Promise<number> {
    this.calls.latest += 1;
    await this.guard(abort);
    return this.visible().reduce((max, row) => Math.max(max, row.insertedAtMs), 0);
  }

  async loadRecent(
    { sinceMs, limit }: { sinceMs: number; limit: number },
    abort?: AbortSignal,
  ): Promise<StoredSignal[]> {
    this.calls.recent += 1;
    await this.guard(abort);
    return this.visible()
      .filter((row) => row.signal.timestamp.getTime() >= sinceMs)
      .sort(
        (a, b) => b.signal.timestamp.getTime() - a.signal.timestamp.getTime() || b.seq - a.seq,
      )
      .slice(0, limit);
  }

  async loadInsertedSince(
    { sinceMs, limit }: { sinceMs: number; limit: number },
    abort?: AbortSignal,
  ): Promise<StoredSignal[]> {
    this.calls.since += 1;
    await this.guard(abort);
    return this.visible()
      .filter((row) => row.insertedAtMs >= sinceMs)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit);
  }
}
