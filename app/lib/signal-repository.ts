// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Durable storage for ingested signals: the seam between the live feed and the
 * database. Kept as an interface so the feed's loading, de-duplication and
 * refresh logic is tested against an in-memory fake, and the Supabase
 * implementation (supabase-signal-repository.ts) stays thin.
 */

import type { IngestedSignal } from '@vorionsys/rainbow';

/** A stored signal with the database-assigned fields the feed tails by. */
export interface StoredSignal {
  /** Insert order, assigned by the database. */
  seq: number;
  /** Database clock when the row was stored. Never compared with a local clock. */
  insertedAtMs: number;
  signal: IngestedSignal;
}

export interface SignalRepository {
  /**
   * Store signals, skipping any whose (tenantId, signalId) is already stored.
   * `inserted` counts rows actually written; the rest were duplicates.
   */
  insert(signals: IngestedSignal[], abort?: AbortSignal): Promise<{ inserted: number }>;

  /** `inserted_at` of the newest row, or 0 when the store is empty. */
  latestInsertedAtMs(abort?: AbortSignal): Promise<number>;

  /** The newest `limit` signals timestamped at or after `sinceMs`, newest first. */
  loadRecent(
    query: { sinceMs: number; limit: number },
    abort?: AbortSignal,
  ): Promise<StoredSignal[]>;

  /** Up to `limit` rows stored at or after `sinceMs` (database clock), oldest `seq` first. */
  loadInsertedSince(
    query: { sinceMs: number; limit: number },
    abort?: AbortSignal,
  ): Promise<StoredSignal[]>;
}

// ----------------------------------------------------------------------------
// Row mapping (pure, shared by the Supabase implementation and its tests)
// ----------------------------------------------------------------------------

export interface SignalRow {
  tenant_id: string;
  signal_id: string;
  agent_id: string;
  timestamp_ms: number;
  payload: Record<string, unknown>;
}

export interface StoredRow {
  seq: number | string;
  inserted_at: string;
  payload: Record<string, unknown>;
}

export function toRow(signal: IngestedSignal): SignalRow {
  return {
    tenant_id: signal.tenantId,
    signal_id: signal.signalId,
    agent_id: signal.agentId,
    timestamp_ms: signal.timestamp.getTime(),
    payload: { ...signal, timestamp: signal.timestamp.getTime() },
  };
}

/**
 * A stored row back into a signal, or undefined when the payload cannot be one
 * (one damaged row must not take the whole dashboard down).
 */
export function fromRow(row: StoredRow): StoredSignal | undefined {
  const payload = row.payload as Record<string, unknown> & { timestamp?: unknown };
  const timestamp = payload?.timestamp;
  const insertedAtMs = Date.parse(row.inserted_at);
  const seq = Number(row.seq);
  if (
    typeof payload?.agentId !== 'string' ||
    typeof timestamp !== 'number' ||
    !Number.isFinite(timestamp) ||
    !Number.isFinite(insertedAtMs) ||
    !Number.isFinite(seq)
  ) {
    return undefined;
  }
  return {
    seq,
    insertedAtMs,
    signal: { ...payload, timestamp: new Date(timestamp) } as unknown as IngestedSignal,
  };
}
