// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Supabase (Postgres) implementation of the signal repository.
 *
 * Connects with the SERVICE ROLE key from server-only code, because the
 * production RLS policy (sql/rainbow-signals.sql) grants anon nothing at all.
 * There is deliberately no delete or clear: it is the durable record, and a
 * wipe path has no business in the production read/ingest surface.
 */

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IngestedSignal } from '@vorionsys/rainbow';
import {
  fromRow,
  toRow,
  type SignalRepository,
  type StoredRow,
  type StoredSignal,
} from './signal-repository';

const DEFAULT_TABLE = 'rainbow_signals';
/** PostgREST caps a response at 1000 rows by default. */
const PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 500;
const SELECT_COLUMNS = 'seq, inserted_at, payload';

/** A query builder that can be given an AbortSignal. */
interface Abortable<T> {
  abortSignal(signal: AbortSignal): T;
}

function withAbort<T extends Abortable<T>>(query: T, abort?: AbortSignal): T {
  return abort ? query.abortSignal(abort) : query;
}

export interface SupabaseSignalRepositoryOptions {
  /** Supabase project URL (https://<ref>.supabase.co). */
  url: string;
  /** Service role key. Server-only: never expose this to the client. */
  serviceKey: string;
  /** Table name (default 'rainbow_signals'). */
  table?: string;
}

export class SupabaseSignalRepository implements SignalRepository {
  private readonly client: SupabaseClient;
  private readonly table: string;

  constructor(options: SupabaseSignalRepositoryOptions);
  constructor(options: { client: SupabaseClient; table?: string });
  constructor(
    options: SupabaseSignalRepositoryOptions | { client: SupabaseClient; table?: string },
  ) {
    this.table = options.table ?? DEFAULT_TABLE;
    this.client =
      'client' in options
        ? options.client
        : createClient(options.url, options.serviceKey, { auth: { persistSession: false } });
  }

  async insert(signals: IngestedSignal[], abort?: AbortSignal): Promise<{ inserted: number }> {
    let inserted = 0;
    // Sequential batches keep `seq` in the order the producer sent them.
    for (let start = 0; start < signals.length; start += INSERT_BATCH_SIZE) {
      const rows = signals.slice(start, start + INSERT_BATCH_SIZE).map(toRow);
      const query = this.client
        .from(this.table)
        // ON CONFLICT DO NOTHING on (tenant_id, signal_id): a retried batch
        // stores nothing twice, and RETURNING lists only the rows written.
        .upsert(rows, { onConflict: 'tenant_id,signal_id', ignoreDuplicates: true })
        .select('seq');
      const { data, error } = await withAbort(query, abort);
      if (error) throw new Error(`SupabaseSignalRepository.insert failed: ${error.message}`);
      inserted += data?.length ?? 0;
    }
    return { inserted };
  }

  async latestInsertedAtMs(abort?: AbortSignal): Promise<number> {
    const query = this.client
      .from(this.table)
      .select('inserted_at')
      .order('inserted_at', { ascending: false })
      .limit(1);
    const { data, error } = await withAbort(query, abort);
    if (error) {
      throw new Error(`SupabaseSignalRepository.latestInsertedAtMs failed: ${error.message}`);
    }
    const newest = (data as Array<{ inserted_at: string }> | null)?.[0]?.inserted_at;
    const ms = newest ? Date.parse(newest) : 0;
    return Number.isFinite(ms) ? ms : 0;
  }

  async loadRecent(
    { sinceMs, limit }: { sinceMs: number; limit: number },
    abort?: AbortSignal,
  ): Promise<StoredSignal[]> {
    return this.page(limit, (from, to) =>
      withAbort(
        this.client
          .from(this.table)
          .select(SELECT_COLUMNS)
          .gte('timestamp_ms', sinceMs)
          // Newest first, so a cap keeps the most recent signals. `seq` breaks ties.
          .order('timestamp_ms', { ascending: false })
          .order('seq', { ascending: false })
          .range(from, to),
        abort,
      ),
    );
  }

  async loadInsertedSince(
    { sinceMs, limit }: { sinceMs: number; limit: number },
    abort?: AbortSignal,
  ): Promise<StoredSignal[]> {
    const since = new Date(sinceMs).toISOString();
    return this.page(limit, (from, to) =>
      withAbort(
        this.client
          .from(this.table)
          .select(SELECT_COLUMNS)
          .gte('inserted_at', since)
          .order('seq', { ascending: true })
          .range(from, to),
        abort,
      ),
    );
  }

  /** Read `limit` rows in PostgREST-sized pages, dropping rows that are not valid signals. */
  private async page(
    limit: number,
    build: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  ): Promise<StoredSignal[]> {
    const out: StoredSignal[] = [];
    let damaged = 0;
    for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
      const take = Math.min(PAGE_SIZE, limit - offset);
      const { data, error } = await build(offset, offset + take - 1);
      if (error) throw new Error(`SupabaseSignalRepository read failed: ${error.message}`);
      const rows = (data ?? []) as StoredRow[];
      for (const row of rows) {
        const stored = fromRow(row);
        if (stored) out.push(stored);
        else damaged += 1;
      }
      if (rows.length < take) break;
    }
    if (damaged > 0) {
      console.warn(`[rainbow] skipped ${damaged} stored row(s) that are not valid signals`);
    }
    return out;
  }
}
