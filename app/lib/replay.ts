// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { Rainbow, WindowStore } from '@vorionsys/rainbow';

/** Query window the stores treat as "everything on disk". */
export const REPLAY_FROM = new Date(0);
export const REPLAY_TO = new Date(8.64e15);

/**
 * Copy every signal in `store` into `rainbow` via ingest.
 *
 * Rainbow's constructor wires collector.ingest → store.put. Replaying into a
 * Rainbow that *shares* the persistent store would duplicate rows and enqueue
 * another flush. Call this on a fresh Rainbow (default MemoryWindowStore) so
 * the collector and the facade store stay in lockstep without writing back
 * to Supabase.
 */
export function replayStoreIntoRainbow(store: WindowStore, rainbow: Rainbow): number {
  const signals = store.queryAll(REPLAY_FROM, REPLAY_TO);
  for (const signal of signals) {
    rainbow.ingest(signal);
  }
  return signals.length;
}
