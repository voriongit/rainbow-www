// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Read-only: fleet roster. Public deployment: the seeded fleet. Live deployment:
 * real agents, or a 503 saying why there are none yet.
 */

import {
  ensureHydrated,
  getAgents,
  getProvenance,
  unavailableResponse,
} from '../../lib/data-source';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureHydrated();
  const provenance = getProvenance();
  const unavailable = unavailableResponse(provenance);
  if (unavailable) return unavailable;

  return Response.json(
    // `synthetic` is kept for existing consumers, but it is now DERIVED from
    // whether real signals are present — it used to be a hardcoded `true`.
    { synthetic: provenance.mode === 'simulated', provenance, agents: getAgents() },
    { headers: { 'cache-control': 'no-store' } }
  );
}
