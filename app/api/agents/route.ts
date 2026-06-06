// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/** Read-only: simulated fleet roster. */

import { getAgents } from '../../lib/data-source';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    { synthetic: true, agents: getAgents() },
    { headers: { 'cache-control': 'no-store' } }
  );
}
