// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * POST /api/signals — ingest real trust signals into rainbow.
 *
 * This is the half that did not exist. Until it did, rainbow.vorion.org could
 * only ever serve the seeded simulator, and its read endpoints said so with a
 * hardcoded `synthetic: true`. A producer that posts here is persisted to
 * Supabase, and the read path flips itself to live on the next request.
 *
 * Auth is a bearer token (RAINBOW_INGEST_TOKEN), compared in constant time.
 * FAIL-CLOSED: with no token configured, or no store configured, ingest is
 * disabled and returns 503 — it never silently accepts and drops.
 *
 * Body: one IngestedSignal, or an array of up to 1000.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { ingestBodySchema } from '../../lib/ingested-signal-schema';
import { getIngestStore, invalidateSource } from '../../lib/data-source';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

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

export async function POST(request: NextRequest) {
  const expected = process.env.RAINBOW_INGEST_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'Ingest disabled: RAINBOW_INGEST_TOKEN is not configured' },
      { status: 503 },
    );
  }

  if (!isAuthorized(request, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = getIngestStore();
  if (!store) {
    return NextResponse.json(
      { error: 'Ingest disabled: no signal store configured' },
      { status: 503 },
    );
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const rawText = await request.text();
  if (rawText.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ingestBodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid signal', issues: parsed.error.issues.slice(0, 20) },
      { status: 400 },
    );
  }

  const signals = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

  for (const signal of signals) {
    store.put(signal as unknown as Parameters<typeof store.put>[0]);
  }

  try {
    await store.flush();
  } catch (err) {
    console.error('[rainbow] ingest flush failed:', err);
    return NextResponse.json(
      { error: 'Accepted into memory but persistence failed', accepted: signals.length },
      { status: 502 },
    );
  }

  // The read path caches one source per mode; the first real signal must be
  // able to flip it from simulated to live.
  invalidateSource();

  return NextResponse.json(
    { accepted: signals.length, agentIds: [...new Set(signals.map((s) => s.agentId))] },
    { status: 202, headers: { 'cache-control': 'no-store' } },
  );
}
