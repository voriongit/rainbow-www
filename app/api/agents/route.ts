// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/** Read-only: fleet roster. Live when agents have reported, simulated otherwise. */

import { ensureHydrated, getAgents, getProvenance } from '../../lib/data-source';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureHydrated();
  const provenance = getProvenance();

  return Response.json(
    // `synthetic` is kept for existing consumers, but it is now DERIVED from
    // whether real signals are present — it used to be a hardcoded `true`.
    { synthetic: provenance.mode === 'simulated', provenance, agents: getAgents() },
    { headers: { 'cache-control': 'no-store' } }
  );
}
