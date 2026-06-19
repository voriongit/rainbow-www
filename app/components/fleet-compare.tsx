// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Cross-fleet benchmark visual — reads the live (synthetic) fleet's trust-tier
 * distribution against a curated reference profile. Server component
 * (deterministic from props, no hydration). Per tier: the live share is a filled
 * bar in the tier's spectrum color, with a tick marking the reference share so
 * the gap is legible. Aggregate deltas (mean, median, low-trust share) sit on
 * top. Higher trust / lower low-trust share is the "better" direction.
 */

import { TIER_ORDER, TIER_COLORS, tierName, type TierKey } from '../lib/tiers';
import { fmtNum, fmtSigned } from '../lib/format';
import { Stat } from './stat';
import type { FleetProfile } from '../lib/reference-fleets';

export interface FleetSummaryLike {
  byTier: Record<string, number>;
  totalAgents: number;
  averageScore: number;
  medianScore: number;
}

const LOW_TIERS = ['T0', 'T1', 'T2'] as const;
const GOOD = '#22c55e';
const BAD = '#ef4444';

function lowShare(s: FleetSummaryLike | FleetProfile): number {
  if (s.totalAgents <= 0) return 0;
  const low = LOW_TIERS.reduce((a, t) => a + (s.byTier[t] ?? 0), 0);
  return (low / s.totalAgents) * 100;
}

export function FleetCompare({
  live,
  reference,
}: {
  live: FleetSummaryLike;
  reference: FleetProfile;
}) {
  const tiersHiToLo = [...TIER_ORDER].reverse();
  const liveShare = (t: TierKey) =>
    live.totalAgents > 0 ? ((live.byTier[t] ?? 0) / live.totalAgents) * 100 : 0;
  const refShare = (t: TierKey) =>
    reference.totalAgents > 0 ? ((reference.byTier[t] ?? 0) / reference.totalAgents) * 100 : 0;
  const maxShare = Math.max(1, ...TIER_ORDER.flatMap((t) => [liveShare(t), refShare(t)]));

  const dMean = live.averageScore - reference.averageScore;
  const dMedian = live.medianScore - reference.medianScore;
  const liveLow = lowShare(live);
  const refLow = lowShare(reference);
  const dLow = liveLow - refLow;

  return (
    <div className="flex flex-col gap-5">
      {/* Aggregate deltas */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Fleet mean trust"
          value={fmtNum(live.averageScore)}
          color={dMean >= 0 ? GOOD : BAD}
          sub={`ref ${fmtNum(reference.averageScore)} · Δ ${fmtSigned(dMean, 0)}`}
        />
        <Stat
          label="Median trust"
          value={fmtNum(live.medianScore)}
          color={dMedian >= 0 ? GOOD : BAD}
          sub={`ref ${fmtNum(reference.medianScore)} · Δ ${fmtSigned(dMedian, 0)}`}
        />
        <Stat
          label="Low-trust share (T0–T2)"
          value={`${Math.round(liveLow)}%`}
          color={dLow <= 0 ? GOOD : BAD}
          sub={`ref ${Math.round(refLow)}% · Δ ${fmtSigned(dLow, 0)}pp`}
        />
      </div>

      {/* Per-tier distribution diff */}
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-xs font-semibold text-white/80">Tier distribution</span>
          <span className="text-[11px] text-white/45">
            bar = this fleet&apos;s share of each tier · tick = reference fleet&apos;s share
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {tiersHiToLo.map((t) => {
            const ls = liveShare(t);
            const rs = refShare(t);
            const color = TIER_COLORS[t];
            return (
              <div
                key={t}
                className="flex items-center gap-3"
                role="img"
                aria-label={`Tier ${t} ${tierName(t)}: this fleet ${Math.round(ls)}%, reference ${Math.round(rs)}%`}
              >
                <div className="flex w-20 shrink-0 items-baseline gap-1.5">
                  <span className="text-xs font-semibold tabular-nums" style={{ color }}>
                    {t}
                  </span>
                  <span className="hidden truncate text-[10px] text-white/40 sm:inline">
                    {tierName(t)}
                  </span>
                </div>
                <div className="relative h-3 flex-1 rounded-full bg-white/[0.05]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${(ls / maxShare) * 100}%`, backgroundColor: color, opacity: 0.85 }}
                  />
                  <div
                    className="absolute inset-y-[-2px] w-px bg-white/80"
                    style={{ left: `${(rs / maxShare) * 100}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className="flex w-24 shrink-0 items-baseline justify-end gap-2 tabular-nums">
                  <span className="text-xs text-white/80">{Math.round(ls)}%</span>
                  <span className="text-[10px] text-white/40">ref {Math.round(rs)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
