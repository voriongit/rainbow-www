// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Embeddable widget — fleet-health badge. A self-contained, iframe-ready
 * summary chip: fleet mean trust score, the tier that mean falls in, and the
 * agent count. Read-only over the deterministic simulator; supports `?window=`.
 * RSC only.
 */

import { getFleetSnapshot, isPresetDuration } from '../../lib/data-source';
import { TIER_COLORS, tierKeyForScore, tierName } from '../../lib/tiers';
import { fmtNum } from '../../lib/format';
import { EmbedShell } from '../embed-shell';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ window?: string }>;
}

export default async function EmbedFleetPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';

  const { fleet } = getFleetSnapshot(window);
  const tier = tierKeyForScore(fleet.averageScore);
  const tierColor = TIER_COLORS[tier];

  return (
    <EmbedShell href={`https://rainbow.vorion.org/?window=${window}`} className="max-w-sm">
      <div className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border"
          style={{ borderColor: `${tierColor}55`, backgroundColor: `${tierColor}14` }}
        >
          <span className="text-lg font-bold leading-none" style={{ color: tierColor }}>
            {tier}
          </span>
          <span className="mt-0.5 text-[8px] uppercase tracking-wider text-white/45">tier</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-white/40">
            Fleet health · {window}
          </p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums text-white/90">
              {fmtNum(fleet.averageScore)}
            </span>
            <span className="text-[11px] text-white/45">mean score</span>
          </p>
          <p className="mt-0.5 text-[11px] text-white/55">
            {fleet.totalAgents} agents · {tierName(tier)} · median {fmtNum(fleet.medianScore)}
          </p>
        </div>
      </div>
    </EmbedShell>
  );
}
