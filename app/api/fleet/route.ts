// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Read-only: fleet-wide orchestration snapshot.
 * Query: ?window=1h|6h|24h|7d|30d
 */

import type { NextRequest } from 'next/server';
import {
  ensureHydrated,
  getFleetSnapshot,
  getProvenance,
  unavailableResponse,
} from '../../lib/data-source';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  await ensureHydrated();
  const window = request.nextUrl.searchParams.get('window') ?? undefined;
  const provenance = getProvenance();
  const unavailable = unavailableResponse(provenance);
  if (unavailable) return unavailable;

  return Response.json(
    { synthetic: provenance.mode === 'simulated', provenance, fleet: getFleetSnapshot(window) },
    { headers: { 'cache-control': 'no-store' } }
  );
}
