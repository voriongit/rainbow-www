// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * The live deployment's in-memory view of the signal store.
 *
 * A Worker isolate cannot query the database for every panel, so it keeps the
 * recent window in memory and tops it up. The earlier design loaded the whole
 * table once per process and never looked again, which on a platform that runs
 * many isolates meant a reader never saw anything another isolate ingested. This
 * feed instead:
 *
 *   hydrate   loads the newest `maxSignals` signals inside the longest window,
 *             not all history, so a cold start is bounded in rows and memory.
 *   tail      every `ttlMs` (or at once after an ingest) reads rows stored since
 *             the newest one seen, minus an overlap. Rows from slow transactions
 *             can become visible out of insert order; re-reading the overlap
 *             catches them and `seen` stops them being counted twice.
 *   reload    every `rehydrateMs` the window is loaded from the store again,
 *             which heals anything the tail missed and drops what has aged out.
 *
 * Every change publishes a new generation (store, analytics and fleet source
 * built together) and never alters one already handed out, so a request that
 * holds a generation computes every panel from the same data. A late signal is
 * merged in time order, because the analytics assume a time-ordered stream per
 * agent.
 *
 * Every database call carries an AbortSignal with a deadline, so an abandoned
 * request ends instead of leaving a refresh in flight forever.
 *
 * Failure is visible, not silent: if a refresh fails the last good data keeps
 * being served and `status().lastError` says so; if the first load fails there
 * is simply no data, never a fabricated empty fleet.
 */

import { MemoryWindowStore, Rainbow, type IngestedSignal, type WindowStore } from '@vorionsys/rainbow';
import { LiveFleetSource } from './fleet-source';
import type { SignalRepository, StoredSignal } from './signal-repository';

const DAY_MS = 86_400_000;
const EPOCH = new Date(0);
const FAR_FUTURE = new Date(8.64e15);

/**
 * The package's stores spread a buffer's contents into `push(...)`, which
 * overflows the call stack somewhere past ~100k arguments. Stay well inside it.
 */
const MAX_AGENT_CAPACITY = 50_000;

/**
 * Sized for a Cloudflare Worker isolate (128 MB). The seeded demo fleet holds
 * about 40k signals, and a reload briefly holds two generations at once.
 */
export const LIVE_FEED_DEFAULTS = {
  /** The longest view (30d) plus the 24h the risk accumulator needs before it. */
  windowMs: 31 * DAY_MS,
  maxSignals: 50_000,
  perAgentCapacity: 10_000,
  ttlMs: 10_000,
  overlapMs: 60_000,
  rehydrateMs: 15 * 60_000,
  refreshTimeoutMs: 8_000,
  hydrateTimeoutMs: 30_000,
  tailLimit: 20_000,
} as const;

export interface LiveFeedOptions {
  repo: SignalRepository;
  windowMs?: number;
  /** Most signals held in memory; the newest win. */
  maxSignals?: number;
  /** Ring-buffer capacity per agent. */
  perAgentCapacity?: number;
  /** Minimum time between reads of the store. */
  ttlMs?: number;
  /** How far before the newest row seen the tail re-reads. */
  overlapMs?: number;
  /** Reload the whole window from the store this often. */
  rehydrateMs?: number;
  refreshTimeoutMs?: number;
  hydrateTimeoutMs?: number;
  tailLimit?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}

/** One immutable generation of the loaded data. */
export interface LiveSnapshot {
  generation: number;
  rainbow: Rainbow;
  store: WindowStore;
  source: LiveFleetSource;
}

export interface LiveFeedStatus {
  hydrated: boolean;
  signalCount: number;
  agentCount: number;
  /** The first load hit `maxSignals`: older signals inside the window are not loaded. */
  truncated: boolean;
  /** Agents with more history than their buffer holds, so their oldest signals were dropped. */
  truncatedAgents: string[];
  oldestSignalMs?: number;
  /** When the store was last read successfully. */
  refreshedAt?: number;
  /** The most recent failure, until a later refresh succeeds. */
  lastError?: string;
}

const byTime = (a: IngestedSignal, b: IngestedSignal) =>
  a.timestamp.getTime() - b.timestamp.getTime();

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : 'unknown error';
}

export class LiveSignalFeed {
  private readonly repo: SignalRepository;
  private readonly windowMs: number;
  private readonly maxSignals: number;
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly overlapMs: number;
  private readonly rehydrateMs: number;
  private readonly refreshTimeoutMs: number;
  private readonly hydrateTimeoutMs: number;
  private readonly tailLimit: number;
  private readonly now: () => number;
  private readonly onError?: (error: unknown) => void;

  private snap!: LiveSnapshot;
  private generation = 0;
  private hydrated = false;
  private truncated = false;
  private stale = false;
  private inflight: Promise<void> | null = null;
  private lastCheckAt: number | undefined;
  private lastHydrateAt = 0;
  private refreshedAt: number | undefined;
  private lastError: string | undefined;

  /** Newest `inserted_at` seen (database clock). */
  private watermarkMs = 0;
  /** seq -> inserted_at for rows recent enough to be re-read by the tail. */
  private seen = new Map<number, number>();

  /** The current generation's signals, each agent's in time order. */
  private kept: IngestedSignal[] = [];
  private lastSignalMs = new Map<string, number>();
  private oldestMs: number | undefined;
  /** Agents that had more signals than their buffer holds, since the last full load. */
  private overflowed = new Set<string>();

  constructor(options: LiveFeedOptions) {
    const d = LIVE_FEED_DEFAULTS;
    this.repo = options.repo;
    this.windowMs = options.windowMs ?? d.windowMs;
    this.maxSignals = options.maxSignals ?? d.maxSignals;
    this.capacity = Math.min(options.perAgentCapacity ?? d.perAgentCapacity, MAX_AGENT_CAPACITY);
    this.ttlMs = options.ttlMs ?? d.ttlMs;
    this.overlapMs = options.overlapMs ?? d.overlapMs;
    this.rehydrateMs = options.rehydrateMs ?? d.rehydrateMs;
    this.refreshTimeoutMs = options.refreshTimeoutMs ?? d.refreshTimeoutMs;
    this.hydrateTimeoutMs = options.hydrateTimeoutMs ?? d.hydrateTimeoutMs;
    this.tailLimit = options.tailLimit ?? d.tailLimit;
    this.now = options.now ?? Date.now;
    this.onError = options.onError;
    this.install([]);
  }

  /** The current generation. Never altered once published. */
  get current(): LiveSnapshot {
    return this.snap;
  }

  /** Make the next `refresh()` read the store regardless of the interval (call after an ingest). */
  markStale(): void {
    this.stale = true;
  }

  /**
   * Bring the loaded data up to date if it is due. Resolves when done, and
   * never rejects: a failure is recorded in `status().lastError` and the last
   * good data keeps being served.
   */
  refresh(): Promise<void> {
    // Not-yet-hydrated is not "always due": a failed first load backs off for
    // the interval like any other read, instead of retrying on every request.
    const due =
      this.lastCheckAt === undefined || this.stale || this.now() - this.lastCheckAt >= this.ttlMs;
    if (!due) return Promise.resolve();
    this.inflight ??= this.run().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  status(): LiveFeedStatus {
    return {
      hydrated: this.hydrated,
      signalCount: this.kept.length,
      agentCount: this.lastSignalMs.size,
      truncated: this.truncated,
      truncatedAgents: [...this.overflowed].sort(),
      oldestSignalMs: this.oldestMs,
      refreshedAt: this.refreshedAt,
      lastError: this.lastError,
    };
  }

  // --------------------------------------------------------------------------

  private async run(): Promise<void> {
    const fullReload = !this.hydrated || this.now() - this.lastHydrateAt >= this.rehydrateMs;
    const deadline = fullReload && !this.hydrated ? this.hydrateTimeoutMs : this.refreshTimeoutMs;
    const abort = AbortSignal.timeout(deadline);
    // Cleared up front, not afterwards: an ingest that lands while this read is
    // in flight sets it again, and that ingest's rows must not wait out a full
    // interval because an older read happened to finish after it.
    this.stale = false;
    try {
      if (fullReload) await this.hydrate(abort);
      else await this.tail(abort);
      this.refreshedAt = this.now();
      this.lastError = undefined;
    } catch (error) {
      this.lastError = describeError(error);
      this.onError?.(error);
    } finally {
      // A failed read waits out the interval too: do not hammer a struggling store.
      this.lastCheckAt = this.now();
    }
  }

  private async hydrate(abort: AbortSignal): Promise<void> {
    const startedAt = this.now();
    // Read the clock first: anything stored while the load runs is then newer
    // than the watermark and is picked up by the first tail.
    const baseline = await this.repo.latestInsertedAtMs(abort);
    const rows = await this.repo.loadRecent(
      { sinceMs: startedAt - this.windowMs, limit: this.maxSignals },
      abort,
    );

    rows.sort((a, b) => byTime(a.signal, b.signal) || a.seq - b.seq);
    this.overflowed = new Set();
    this.install(rows.map((row) => row.signal));

    let watermark = baseline;
    for (const row of rows) watermark = Math.max(watermark, row.insertedAtMs);
    this.watermarkMs = watermark;
    this.seen = new Map();
    this.remember(rows);

    this.truncated = rows.length >= this.maxSignals;
    this.lastHydrateAt = startedAt;
    this.hydrated = true;
  }

  private async tail(abort: AbortSignal): Promise<void> {
    const rows = await this.repo.loadInsertedSince(
      { sinceMs: this.watermarkMs - this.overlapMs, limit: this.tailLimit },
      abort,
    );

    const cutoff = this.now() - this.windowMs;
    const unseen: StoredSignal[] = [];
    const inWindow: IngestedSignal[] = [];
    for (const row of rows) {
      if (this.seen.has(row.seq)) continue;
      unseen.push(row);
      if (row.signal.timestamp.getTime() >= cutoff) inWindow.push(row.signal);
    }
    this.remember(unseen);
    this.apply(inWindow);
  }

  /** Record rows as seen, advance the watermark, and forget rows the tail can no longer re-read. */
  private remember(rows: StoredSignal[]): void {
    for (const row of rows) {
      this.watermarkMs = Math.max(this.watermarkMs, row.insertedAtMs);
    }
    const keepFrom = this.watermarkMs - 2 * this.overlapMs;
    for (const row of rows) {
      if (row.insertedAtMs >= keepFrom) this.seen.set(row.seq, row.insertedAtMs);
    }
    for (const [seq, insertedAtMs] of this.seen) {
      if (insertedAtMs < keepFrom) this.seen.delete(seq);
    }
  }

  private apply(incoming: IngestedSignal[]): void {
    if (incoming.length === 0) return;
    const ordered = incoming.slice().sort(byTime);
    const inOrder = ordered.every(
      (signal) => signal.timestamp.getTime() >= (this.lastSignalMs.get(signal.agentId) ?? -Infinity),
    );
    const next = this.kept.concat(ordered);
    // A late signal is merged in time order. The sort is stable, so signals
    // sharing a timestamp keep the order they were stored in.
    this.install(inOrder ? next : next.sort(byTime));
  }

  /** Publish `signals` (each agent's in time order) as a new generation. */
  private install(signals: IngestedSignal[]): void {
    const store = new MemoryWindowStore(this.capacity);
    const source = new LiveFleetSource(store);
    const rainbow = new Rainbow({
      store,
      collector: { bufferCapacity: this.capacity },
      // This generation's own source, so a generation never reads another's data.
      resolveInitialScore: (agentId, at) => source.resolveScoreAt(agentId, at),
    });

    const perAgent = new Map<string, number>();
    for (const signal of signals) {
      rainbow.ingest(signal);
      perAgent.set(signal.agentId, (perAgent.get(signal.agentId) ?? 0) + 1);
    }
    for (const [agentId, count] of perAgent) {
      if (count > this.capacity) this.overflowed.add(agentId);
    }

    // What the buffers actually kept, after any eviction.
    const kept: IngestedSignal[] = [];
    const lastSignalMs = new Map<string, number>();
    let oldestMs: number | undefined;
    for (const agentId of store.agentIds()) {
      const agentSignals = store.query(agentId, EPOCH, FAR_FUTURE);
      if (agentSignals.length === 0) continue;
      for (const signal of agentSignals) kept.push(signal);
      lastSignalMs.set(agentId, agentSignals[agentSignals.length - 1].timestamp.getTime());
      const first = agentSignals[0].timestamp.getTime();
      if (oldestMs === undefined || first < oldestMs) oldestMs = first;
    }

    this.kept = kept;
    this.lastSignalMs = lastSignalMs;
    this.oldestMs = oldestMs;
    this.generation += 1;
    this.snap = { generation: this.generation, rainbow, store, source };
  }
}
