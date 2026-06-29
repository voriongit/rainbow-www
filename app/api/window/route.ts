// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Read-only: windowed analytics for one agent (or fleet-wide aggregate).
 * Both `window.riskTrend` and `correctedRiskTrend` use the canonical P(T) × R
 * accumulator from @vorionsys/rainbow; `correctedRiskTrend` additionally seeds and
 * trims the rolling 24h window for sub-24h accuracy (see lib/corrected-risk-trend).
 *
 * Query: ?window=1h|6h|24h|7d|30d & agent=<agentId>
 */

import type { NextRequest } from 'next/server';
import { getWindowResult, getAgentRiskTrend } from '../../lib/data-source';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const window = params.get('window') ?? undefined;
  const agent = params.get('agent') ?? undefined;

  return Response.json(
    {
      synthetic: true,
      window: getWindowResult(window, agent),
      correctedRiskTrend: getAgentRiskTrend(window, agent),
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
