// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Persistent `WindowStore` backed by Supabase (Postgres).
 *
 * Adapted from the proven implementation in the rainbow-interop harness
 * (src/supabase-window-store.ts), whose store-parity tests assert that
 * swapping this backend in for MemoryWindowStore leaves rainbow's analytics
 * bit-identical. Two deliberate changes for production use:
 *
 *   - connects with the SERVICE ROLE key from server-only code, because the
 *     production RLS policy (sql/rainbow-signals.sql) grants anon nothing;
 *   - `clearRemote()` is NOT ported. It existed for test hygiene; a delete-all
 *     path has no business in the production read/ingest surface.
 *
 * `WindowStore` is a SYNCHRONOUS interface, so an async backend cannot serve
 * reads directly. This store keeps a local mirror (rainbow's own
 * MemoryWindowStore, so read semantics are the known-good implementation by
 * construction) and persists at explicit async boundaries:
 *
 *   - put()     writes the mirror and queues the signal for persistence
 *   - flush()   bulk-inserts queued signals in put-order
 *   - hydrate() reloads everything ordered by `seq` into a fresh mirror, so a
 *               cold process sees exactly what a previous one stored
 */

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MemoryWindowStore } from '@vorionsys/rainbow';
import type { IngestedSignal, WindowStore } from '@vorionsys/rainbow';

const DEFAULT_TABLE = 'rainbow_signals';
const FLUSH_BATCH_SIZE = 500;
const HYDRATE_PAGE_SIZE = 1000;

export interface SupabaseWindowStoreOptions {
  /** Supabase project URL (https://<ref>.supabase.co). */
  url: string;
  /** Service role key. Server-only — never expose this to the client. */
  serviceKey: string;
  /** Table name (default 'rainbow_signals'). */
  table?: string;
  /** Local mirror per-agent capacity, matching MemoryWindowStore. */
  capacity?: number;
}

interface SignalRow {
  agent_id: string;
  timestamp_ms: number;
  payload: Record<string, unknown>;
}

function toRow(signal: IngestedSignal): SignalRow {
  return {
    agent_id: signal.agentId,
    timestamp_ms: signal.timestamp.getTime(),
    payload: { ...signal, timestamp: signal.timestamp.getTime() },
  };
}

function fromRow(row: SignalRow): IngestedSignal {
  const raw = row.payload as Record<string, unknown> & { timestamp: number };
  return { ...raw, timestamp: new Date(raw.timestamp) } as unknown as IngestedSignal;
}

export class SupabaseWindowStore implements WindowStore {
  private readonly client: SupabaseClient;
  private readonly table: string;
  private readonly capacity: number | undefined;
  private mirror: MemoryWindowStore;
  private writeQueue: IngestedSignal[] = [];
  private signalCount = 0;
  private flushing: Promise<void> | null = null;

  constructor(options: SupabaseWindowStoreOptions) {
    this.client = createClient(options.url, options.serviceKey, {
      auth: { persistSession: false },
    });
    this.table = options.table ?? DEFAULT_TABLE;
    this.capacity = options.capacity;
    this.mirror = this.newMirror();
  }

  private newMirror(): MemoryWindowStore {
    return this.capacity === undefined
      ? new MemoryWindowStore()
      : new MemoryWindowStore(this.capacity);
  }

  // Sync WindowStore surface, served by the mirror.

  put(signal: IngestedSignal): void {
    this.mirror.put(signal);
    this.writeQueue.push(signal);
    this.signalCount += 1;
  }

  query(agentId: string, from: Date, to: Date): IngestedSignal[] {
    return this.mirror.query(agentId, from, to);
  }

  queryAll(from: Date, to: Date): IngestedSignal[] {
    return this.mirror.queryAll(from, to);
  }

  agentIds(): string[] {
    return this.mirror.agentIds();
  }

  /**
   * Clears the LOCAL mirror and pending writes only — deliberately NOT the
   * remote table, which is the durable record (a later hydrate() will see it
   * again). This diverges from the WindowStore.clear() doc on purpose.
   */
  clear(): void {
    this.mirror.clear();
    this.writeQueue = [];
    this.signalCount = 0;
  }

  /**
   * Signals currently held in the mirror.
   *
   * Tracked incrementally rather than recomputed: provenance is resolved on
   * every request, and summing per-agent queries would walk the whole mirror
   * each time. This counts what was put/hydrated, so it can drift above the
   * mirror's true contents once ring-buffer capacity evicts old signals — it
   * is a "have we received anything real" measure, not an exact census.
   */
  get size(): number {
    return this.signalCount;
  }

  // Async persistence boundaries.

  /**
   * Persist queued signals in put-order. Sequential ordered batches, so the
   * server-assigned `seq` preserves insertion order — the ordering contract
   * analytics depend on. Single-flight: concurrent calls share the in-flight
   * run, because interleaved inserts would scramble seq order.
   *
   * Delivery is AT-LEAST-ONCE: a response lost after the server commits
   * leaves the batch queued and a retry duplicates rows. There is deliberately
   * no unique constraint, because rainbow's memory semantics permit duplicate
   * signalIds.
   */
  flush(): Promise<void> {
    this.flushing ??= this.runFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async runFlush(): Promise<void> {
    while (this.writeQueue.length > 0) {
      const batch = this.writeQueue.slice(0, FLUSH_BATCH_SIZE);
      const { error } = await this.client.from(this.table).insert(batch.map(toRow));
      if (error) {
        throw new Error(`SupabaseWindowStore.flush failed: ${error.message}`);
      }
      this.writeQueue = this.writeQueue.slice(batch.length);
    }
  }

  /**
   * Rebuild the local mirror from Supabase in `seq` (insertion) order, paging
   * past the per-request row limit. Returns the number of signals loaded.
   */
  async hydrate(): Promise<number> {
    const mirror = this.newMirror();
    let offset = 0;
    let loaded = 0;
    for (;;) {
      const { data, error } = await this.client
        .from(this.table)
        .select('agent_id, timestamp_ms, payload')
        .order('seq', { ascending: true })
        .range(offset, offset + HYDRATE_PAGE_SIZE - 1);
      if (error) {
        throw new Error(`SupabaseWindowStore.hydrate failed: ${error.message}`);
      }
      const rows = (data ?? []) as unknown as SignalRow[];
      for (const row of rows) {
        mirror.put(fromRow(row));
        loaded += 1;
      }
      if (rows.length < HYDRATE_PAGE_SIZE) break;
      offset += rows.length;
    }
    this.mirror = mirror;
    this.writeQueue = [];
    this.signalCount = loaded;
    return loaded;
  }
}
