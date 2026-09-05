// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Embeddable widget — single-agent trust card. A self-contained, iframe-ready
 * snapshot of one agent: id, tier chip, current trust score, and windowed
 * trend (direction + velocity). Read-only over the deterministic simulator;
 * supports `?window=`. RSC only.
 */

import { notFound } from 'next/navigation';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  ensureHydrated,
  getAgentInfo,
  getDashboardData,
  isPresetDuration,
} from '../../../lib/data-source';
import { TIER_COLORS, tierName, type TierKey } from '../../../lib/tiers';
import { fmtNum, fmtSigned } from '../../../lib/format';
import { EmbedShell } from '../../embed-shell';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ window?: string }>;
}

const TREND_META = {
  rising: { Icon: TrendingUp, color: '#22c55e', label: 'Rising' },
  falling: { Icon: TrendingDown, color: '#ef4444', label: 'Falling' },
  stable: { Icon: Minus, color: '#94a3b8', label: 'Stable' },
} as const;

/** Subtle tint of a hex color for chip backgrounds. */
function tint(hex: string): string {
  return `${hex}1f`;
}

export default async function EmbedAgentPage({ params, searchParams }: PageProps) {
  await ensureHydrated();
  const { agentId } = await params;
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';

  const info = getAgentInfo(agentId);
  if (!info) notFound();

  const d = getDashboardData(window, agentId);
  const traj = d.window.trajectory;
  const trend = TREND_META[traj.trend];

  const tier = info.tier as TierKey;
  const tierColor = TIER_COLORS[tier] ?? '#94a3b8';
  const score = traj.samples.length > 0 ? traj.current : info.score;

  return (
    <EmbedShell href={`https://rainbow.vorion.org/agent/${agentId}?window=${window}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-mono text-base font-extrabold tracking-tight text-white/90">
            {agentId}
          </h1>
          <p className="mt-0.5 truncate text-[11px] text-white/50">{info.label}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold"
          style={{ color: tierColor, backgroundColor: tint(tierColor) }}
        >
          {tier} · {tierName(tier)}
        </span>
      </header>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40">Trust score</p>
          <p className="mt-0.5 text-3xl font-bold tabular-nums" style={{ color: tierColor }}>
            {fmtNum(score)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-white/40">Trend · {window}</p>
          <p
            className="mt-0.5 flex items-center justify-end gap-1.5 text-sm font-semibold"
            style={{ color: trend.color }}
          >
            <trend.Icon size={15} aria-hidden /> {trend.label}
          </p>
          <p className="text-[10px] text-white/45">
            {fmtSigned(traj.velocity)} <span className="text-white/30">pts/h</span>
          </p>
        </div>
      </div>
    </EmbedShell>
  );
}
