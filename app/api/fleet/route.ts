// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Read-only: fleet-wide orchestration snapshot.
 * Query: ?window=1h|6h|24h|7d|30d
 */

import type { NextRequest } from 'next/server';
import { getFleetSnapshot } from '../../lib/data-source';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const window = request.nextUrl.searchParams.get('window') ?? undefined;

  return Response.json(
    { synthetic: true, fleet: getFleetSnapshot(window) },
    { headers: { 'cache-control': 'no-store' } }
  );
}
