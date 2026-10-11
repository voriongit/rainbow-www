// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignalRepository } from '../app/lib/signal-repository';

// The route imports the data layer; replace it so no store or React `cache` is involved.
const dataSource = vi.hoisted(() => ({
  getIngestRepository: vi.fn(),
  markFeedStale: vi.fn(),
}));
vi.mock('../app/lib/data-source', () => dataSource);

import { POST } from '../app/api/signals/route';

const TOKEN = 'correct-horse-battery-staple';

function validSignal(overrides: Record<string, unknown> = {}) {
  return {
    signalId: `sig-${Math.random().toString(36).slice(2)}`,
    agentId: 'agent-1',
    tenantId: 'acme',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    success: false,
    delta: -12,
    blocked: false,
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) {
  return new NextRequest('https://rainbow-live.example.test/api/signals', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

let repo: { insert: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.stubEnv('RAINBOW_DEPLOYMENT', 'live');
  vi.stubEnv('RAINBOW_INGEST_TOKEN', TOKEN);
  repo = { insert: vi.fn(async (signals: unknown[]) => ({ inserted: signals.length })) };
  dataSource.getIngestRepository.mockReturnValue(repo as unknown as SignalRepository);
  dataSource.markFeedStale.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  dataSource.getIngestRepository.mockReset();
});

describe('POST /api/signals: availability and auth', () => {
  it('public deployment: 404, and the store is never even looked up', async () => {
    vi.stubEnv('RAINBOW_DEPLOYMENT', 'public');
    const response = await POST(post(validSignal()));
    expect(response.status).toBe(404);
    expect(dataSource.getIngestRepository).not.toHaveBeenCalled();
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('503 when no ingest token is configured (fails closed)', async () => {
    vi.stubEnv('RAINBOW_INGEST_TOKEN', '');
    const response = await POST(post(validSignal()));
    expect(response.status).toBe(503);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('401 for a missing, malformed or wrong token, including one of the right length', async () => {
    const attempts: Array<Record<string, string>> = [
      {},
      { authorization: 'Basic abc' },
      { authorization: `Bearer ${TOKEN}x` },
      { authorization: `Bearer ${TOKEN.slice(0, -1)}` },
      { authorization: `Bearer ${'x'.repeat(TOKEN.length)}` },
    ];
    for (const headers of attempts) {
      const response = await POST(post(validSignal(), headers));
      expect(response.status, JSON.stringify(headers)).toBe(401);
    }
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('503 when no signal store is configured', async () => {
    dataSource.getIngestRepository.mockReturnValue(undefined);
    expect((await POST(post(validSignal()))).status).toBe(503);
  });
});

describe('POST /api/signals: body limits and validation', () => {
  it('413 when the declared length is over the limit', async () => {
    const request = post(validSignal(), {
      authorization: `Bearer ${TOKEN}`,
      'content-length': String(3 * 1024 * 1024),
    });
    expect((await POST(request)).status).toBe(413);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('413 for an oversized body that declares no length, without buffering it all', async () => {
    const chunk = new Uint8Array(512 * 1024).fill(97);
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 20) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const request = new NextRequest('https://rainbow-live.example.test/api/signals', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
      body: stream,
      duplex: 'half',
    });

    expect((await POST(request)).status).toBe(413);
    expect(pulled).toBeLessThan(20); // stopped reading once past 2 MiB
  });

  it('400 for malformed JSON', async () => {
    expect((await POST(post('{not json'))).status).toBe(400);
  });

  it('400 naming the offending field for an invalid single signal', async () => {
    const response = await POST(post(validSignal({ success: 'yes', delta: 'big' })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid signal');
    expect(body.issues.map((issue: { path: string }) => issue.path).sort()).toEqual(['delta', 'success']);
  });

  it('400 naming which signal in a batch, and which field, is wrong', async () => {
    const batch = [validSignal(), validSignal({ tierAfter: 9 }), validSignal(), validSignal({ riskLevel: 'WILD' })];
    const response = await POST(post(batch));
    expect(response.status).toBe(400);
    const { issues } = await response.json();
    expect(issues.map((issue: { path: string }) => issue.path).sort()).toEqual(['[1].tierAfter', '[3].riskLevel']);
    expect(repo.insert).not.toHaveBeenCalled(); // nothing from a bad batch is stored
  });

  it('400 for an empty batch or one over 1000, saying so', async () => {
    for (const batch of [[], Array.from({ length: 1001 }, () => validSignal())]) {
      const response = await POST(post(batch));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/between 1 and 1000/);
    }
  });

  it('rejects values that would silently drop out of the analytics', async () => {
    const bad = [
      { tierAfter: 8 },
      { tierAfter: -1 },
      { tierAfter: 2.5 },
      { riskLevel: 'WILD' },
      { scoreAfter: 1001 },
      { scoreAfter: -1 },
      { delta: 1001 },
      { busSignalType: 'not_a_type' },
      { severity: 'spicy' },
    ];
    for (const override of bad) {
      const response = await POST(post(validSignal(override)));
      expect(response.status, JSON.stringify(override)).toBe(400);
    }
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('normalizes a risk level to the BASIS key form', async () => {
    const response = await POST(post(validSignal({ riskLevel: 'critical', tierAfter: 3, scoreAfter: 640 })));
    expect(response.status).toBe(202);
    const [stored] = repo.insert.mock.calls[0][0] as Array<{ riskLevel: string }>;
    expect(stored.riskLevel).toBe('CRITICAL');
  });

  it('rejects timestamps more than five minutes in the future, and accepts old ones', async () => {
    const future = validSignal({ timestamp: new Date(Date.now() + 10 * 60_000).toISOString() });
    const rejected = await POST(post(future));
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).signalIds).toEqual([future.signalId]);

    const slightlyAhead = validSignal({ timestamp: new Date(Date.now() + 2 * 60_000).toISOString() });
    const backfill = validSignal({ timestamp: new Date(Date.now() - 90 * 86_400_000).toISOString() });
    expect((await POST(post([slightlyAhead, backfill]))).status).toBe(202);
  });
});

describe('POST /api/signals: storing', () => {
  it('stores a batch, reports duplicates, and makes the next read fresh', async () => {
    repo.insert.mockResolvedValue({ inserted: 2 });
    const batch = [validSignal({ agentId: 'a' }), validSignal({ agentId: 'b' }), validSignal({ agentId: 'a' })];

    const response = await POST(post(batch));

    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      accepted: 3,
      inserted: 2,
      duplicates: 1,
      agentIds: ['a', 'b'],
    });
    const [stored, abort] = repo.insert.mock.calls[0];
    expect(stored).toHaveLength(3);
    expect(stored[0].timestamp).toBeInstanceOf(Date); // parsed, not a string
    expect(abort).toBeInstanceOf(AbortSignal); // the write has a deadline
    expect(dataSource.markFeedStale).toHaveBeenCalledTimes(1);
  });

  it('accepts a single signal as well as an array', async () => {
    const response = await POST(post(validSignal()));
    expect(response.status).toBe(202);
    expect((await response.json()).accepted).toBe(1);
  });

  it('502 when the store fails, says a retry is safe, and still refreshes what may have landed', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    repo.insert.mockRejectedValue(new Error('connection to db.internal:5432 refused'));

    const response = await POST(post(validSignal()));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.hint).toMatch(/retrying .* safe/i);
    expect(JSON.stringify(body)).not.toContain('db.internal'); // no internals to the producer
    expect(errorLog).toHaveBeenCalled();
    expect(dataSource.markFeedStale).toHaveBeenCalledTimes(1);
  });
});
