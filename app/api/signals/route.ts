// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * POST /api/signals — ingest real trust signals into the LIVE deployment.
 *
 * The public deployment has no store and no ingest: it answers 404 here, so
 * rainbow.vorion.org can only ever serve the seeded simulator.
 *
 * Auth is a bearer token (RAINBOW_INGEST_TOKEN), compared in constant time.
 * FAIL-CLOSED: with no token configured, or no store configured, ingest is
 * disabled and returns 503 — it never silently accepts and drops. Producers are
 * machines, so this route is the one the Access gate (middleware.ts) lets
 * through to its own token check.
 *
 * Idempotent: a signal is identified by (tenantId, signalId) and a repeat is
 * dropped by the store, so a producer may retry any batch, including after a
 * timeout or a 5xx, without double-counting a failure into the risk accumulator.
 *
 * Body: one IngestedSignal, or an array of up to 1000.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { isLiveDeployment } from '../../lib/deployment';
import { parseIngestBody } from '../../lib/ingested-signal-schema';
import { getIngestRepository, markFeedStale } from '../../lib/data-source';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const INSERT_TIMEOUT_MS = 20_000;
/** A producer clock this far ahead is a bug, and a future timestamp would sit in every window. */
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

const NO_STORE = { 'cache-control': 'no-store' };

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isAuthorized(request: NextRequest, expected: string): boolean {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return false;
  return tokenMatches(header.slice('Bearer '.length).trim(), expected);
}

/**
 * Read the body, giving up as soon as it passes `maxBytes`. Checking only after
 * `request.text()` would buffer an oversized chunked upload in full first.
 */
async function readBodyCapped(request: NextRequest, maxBytes: number): Promise<string | undefined> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function POST(request: NextRequest) {
  if (!isLiveDeployment()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  const expected = process.env.RAINBOW_INGEST_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'Ingest disabled: RAINBOW_INGEST_TOKEN is not configured' },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!isAuthorized(request, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const repo = getIngestRepository();
  if (!repo) {
    return NextResponse.json(
      { error: 'Ingest disabled: no signal store configured' },
      { status: 503, headers: NO_STORE },
    );
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: NO_STORE });
  }

  const rawText = await readBodyCapped(request, MAX_BODY_BYTES);
  if (rawText === undefined) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: NO_STORE });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE });
  }

  const parsed = parseIngestBody(parsedJson);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, issues: parsed.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const signals = parsed.signals;

  const latestAllowed = Date.now() + MAX_FUTURE_SKEW_MS;
  const future = signals.filter((signal) => signal.timestamp.getTime() > latestAllowed);
  if (future.length > 0) {
    return NextResponse.json(
      {
        error: 'Signal timestamps are in the future',
        hint: 'Check the producer clock. Allowed skew is 5 minutes.',
        signalIds: future.slice(0, 20).map((signal) => signal.signalId),
      },
      { status: 400, headers: NO_STORE },
    );
  }

  let inserted: number;
  try {
    ({ inserted } = await repo.insert(
      signals as unknown as Parameters<typeof repo.insert>[0],
      AbortSignal.timeout(INSERT_TIMEOUT_MS),
    ));
  } catch (err) {
    console.error('[rainbow] ingest insert failed:', err instanceof Error ? err.message : err);
    // A batch may have been written in part; show whatever was.
    markFeedStale();
    return NextResponse.json(
      {
        error: 'Persistence failed',
        hint: 'Retrying the same batch is safe: signals already stored are skipped.',
      },
      { status: 502, headers: NO_STORE },
    );
  }

  // The first read after an ingest should see it, not wait out the interval.
  markFeedStale();

  return NextResponse.json(
    {
      accepted: signals.length,
      inserted,
      duplicates: signals.length - inserted,
      agentIds: [...new Set(signals.map((s) => s.agentId))],
    },
    { status: 202, headers: NO_STORE },
  );
}
