// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseSignalRepository } from '../app/lib/supabase-signal-repository';
import { fromRow, toRow } from '../app/lib/signal-repository';
import { makeSignal } from './helpers/fake-repository';

type Call = { method: string; args: unknown[] };

/**
 * A stand-in for the PostgREST query builder: records every chained call and
 * resolves, when awaited, with the next scripted response.
 */
function fakeClient(responses: Array<{ data: unknown; error?: { message: string } | null }>) {
  const queries: Call[][] = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [{ method: 'from', args: [table] }];
      queries.push(calls);
      const builder: Record<string, unknown> = {};
      for (const method of [
        'upsert',
        'select',
        'gte',
        'order',
        'range',
        'limit',
        'abortSignal',
      ]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ method, args });
          return builder;
        };
      }
      builder.then = (resolve: (value: unknown) => unknown) => {
        const next = responses.shift() ?? { data: [], error: null };
        return Promise.resolve({ error: null, ...next }).then(resolve);
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const stored = (seq: number, atMs: number, insertedAt: string) => ({
  seq,
  inserted_at: insertedAt,
  payload: { ...toRow(makeSignal({ atMs, agentId: `agent-${seq}` })).payload },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('row mapping', () => {
  it('round-trips a signal through a stored row', () => {
    const signal = makeSignal({ atMs: 1_700_000_000_000, scoreAfter: 612, metadata: { observationTier: 'WHITE_BOX' } });
    const row = toRow(signal);

    expect(row).toMatchObject({
      tenant_id: signal.tenantId,
      signal_id: signal.signalId,
      agent_id: signal.agentId,
      timestamp_ms: 1_700_000_000_000,
    });

    const back = fromRow({ seq: '42', inserted_at: '2026-06-01T12:00:00.000Z', payload: row.payload });
    expect(back).toBeDefined();
    expect(back!.seq).toBe(42);
    expect(back!.insertedAtMs).toBe(Date.parse('2026-06-01T12:00:00.000Z'));
    expect(back!.signal).toEqual(signal);
    expect(back!.signal.timestamp).toBeInstanceOf(Date);
  });

  it('refuses a damaged payload instead of throwing', () => {
    const ok = { seq: 1, inserted_at: '2026-06-01T12:00:00Z' };
    expect(fromRow({ ...ok, payload: {} })).toBeUndefined();
    expect(fromRow({ ...ok, payload: { agentId: 'a' } })).toBeUndefined();
    expect(fromRow({ ...ok, payload: { agentId: 'a', timestamp: 'yesterday' } })).toBeUndefined();
    expect(fromRow({ ...ok, payload: { agentId: 7, timestamp: 1 } })).toBeUndefined();
    expect(fromRow({ seq: 'x', inserted_at: ok.inserted_at, payload: { agentId: 'a', timestamp: 1 } })).toBeUndefined();
    expect(fromRow({ seq: 1, inserted_at: 'not a date', payload: { agentId: 'a', timestamp: 1 } })).toBeUndefined();
  });
});

describe('SupabaseSignalRepository.insert', () => {
  it('upserts on (tenant_id, signal_id) ignoring duplicates, and counts only rows written', async () => {
    const { client, queries } = fakeClient([{ data: [{ seq: 1 }, { seq: 2 }] }]);
    const repo = new SupabaseSignalRepository({ client });
    const signals = [makeSignal({ atMs: 1 }), makeSignal({ atMs: 2 }), makeSignal({ atMs: 3 })];

    const result = await repo.insert(signals);

    expect(result).toEqual({ inserted: 2 }); // the third was a duplicate and not returned
    const [call] = queries;
    expect(call.find((c) => c.method === 'from')?.args).toEqual(['rainbow_signals']);
    const upsert = call.find((c) => c.method === 'upsert')!;
    expect(upsert.args[1]).toEqual({ onConflict: 'tenant_id,signal_id', ignoreDuplicates: true });
    expect(upsert.args[0]).toEqual(signals.map(toRow));
    expect(call.find((c) => c.method === 'select')?.args).toEqual(['seq']);
  });

  it('writes in batches of 500, in the order given', async () => {
    const { client, queries } = fakeClient([
      { data: new Array(500).fill({ seq: 1 }) },
      { data: new Array(500).fill({ seq: 1 }) },
      { data: new Array(50).fill({ seq: 1 }) },
    ]);
    const signals = Array.from({ length: 1050 }, (_, i) => makeSignal({ atMs: i, signalId: `s${i}` }));

    const result = await new SupabaseSignalRepository({ client }).insert(signals);

    expect(result.inserted).toBe(1050);
    const batches = queries.map((q) => (q.find((c) => c.method === 'upsert')!.args[0] as unknown[]).length);
    expect(batches).toEqual([500, 500, 50]);
    const firstIds = queries.map((q) => (q.find((c) => c.method === 'upsert')!.args[0] as Array<{ signal_id: string }>)[0].signal_id);
    expect(firstIds).toEqual(['s0', 's500', 's1000']);
  });

  it('threads the abort signal into the request', async () => {
    const { client, queries } = fakeClient([{ data: [] }]);
    const abort = new AbortController().signal;
    await new SupabaseSignalRepository({ client }).insert([makeSignal({ atMs: 1 })], abort);
    expect(queries[0].find((c) => c.method === 'abortSignal')?.args).toEqual([abort]);
  });

  it('surfaces a database error', async () => {
    const { client } = fakeClient([{ data: null, error: { message: 'permission denied' } }]);
    await expect(new SupabaseSignalRepository({ client }).insert([makeSignal({ atMs: 1 })])).rejects.toThrow(
      /insert failed: permission denied/,
    );
  });
});

describe('SupabaseSignalRepository reads', () => {
  it('loadRecent asks for the newest rows first, within the window, and pages 1000 at a time', async () => {
    const { client, queries } = fakeClient([
      { data: Array.from({ length: 1000 }, (_, i) => stored(i + 1, 1_000 + i, '2026-06-01T12:00:00Z')) },
      { data: Array.from({ length: 500 }, (_, i) => stored(i + 1001, 3_000 + i, '2026-06-01T12:00:01Z')) },
    ]);

    const rows = await new SupabaseSignalRepository({ client }).loadRecent({ sinceMs: 777, limit: 1500 });

    expect(rows).toHaveLength(1500);
    const first = queries[0];
    expect(first.find((c) => c.method === 'gte')?.args).toEqual(['timestamp_ms', 777]);
    expect(first.filter((c) => c.method === 'order').map((c) => c.args)).toEqual([
      ['timestamp_ms', { ascending: false }],
      ['seq', { ascending: false }],
    ]);
    expect(queries.map((q) => q.find((c) => c.method === 'range')?.args)).toEqual([
      [0, 999],
      [1000, 1499],
    ]);
  });

  it('stops paging when a page comes back short', async () => {
    const { client, queries } = fakeClient([{ data: [stored(1, 1, '2026-06-01T12:00:00Z')] }]);
    const rows = await new SupabaseSignalRepository({ client }).loadRecent({ sinceMs: 0, limit: 5000 });
    expect(rows).toHaveLength(1);
    expect(queries).toHaveLength(1);
  });

  it('loadInsertedSince filters on the database clock and reads oldest seq first', async () => {
    const { client, queries } = fakeClient([{ data: [stored(9, 5, '2026-06-01T12:00:00Z')] }]);
    const since = Date.UTC(2026, 5, 1, 11, 59, 0);

    const rows = await new SupabaseSignalRepository({ client }).loadInsertedSince({ sinceMs: since, limit: 100 });

    expect(rows.map((r) => r.seq)).toEqual([9]);
    const call = queries[0];
    expect(call.find((c) => c.method === 'gte')?.args).toEqual(['inserted_at', '2026-06-01T11:59:00.000Z']);
    expect(call.find((c) => c.method === 'order')?.args).toEqual(['seq', { ascending: true }]);
  });

  it('skips damaged rows and says how many', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = fakeClient([
      {
        data: [
          stored(1, 1, '2026-06-01T12:00:00Z'),
          { seq: 2, inserted_at: '2026-06-01T12:00:00Z', payload: { agentId: 'a' } },
          stored(3, 3, '2026-06-01T12:00:00Z'),
        ],
      },
    ]);

    const rows = await new SupabaseSignalRepository({ client }).loadRecent({ sinceMs: 0, limit: 10 });

    expect(rows.map((r) => r.seq)).toEqual([1, 3]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipped 1 stored row'));
  });

  it('latestInsertedAtMs reads the newest row, and is 0 for an empty table', async () => {
    const { client, queries } = fakeClient([
      { data: [{ inserted_at: '2026-06-01T12:00:00Z' }] },
      { data: [] },
    ]);
    const repo = new SupabaseSignalRepository({ client });

    expect(await repo.latestInsertedAtMs()).toBe(Date.parse('2026-06-01T12:00:00Z'));
    expect(await repo.latestInsertedAtMs()).toBe(0);
    expect(queries[0].find((c) => c.method === 'order')?.args).toEqual(['inserted_at', { ascending: false }]);
    expect(queries[0].find((c) => c.method === 'limit')?.args).toEqual([1]);
  });

  it('surfaces a read error', async () => {
    const { client } = fakeClient([{ data: null, error: { message: 'timeout' } }]);
    await expect(new SupabaseSignalRepository({ client }).loadRecent({ sinceMs: 0, limit: 10 })).rejects.toThrow(
      /read failed: timeout/,
    );
  });
});
