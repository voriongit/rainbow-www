// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { FleetDistribution } from '@vorionsys/rainbow';
import { Panel, EmptyState } from '../panel';
import { BarChart } from '../charts/bar-chart';
import { exploreHref } from '../explore-link';
import { fmtNum } from '../../lib/format';
import { TIER_COLORS, TIER_ORDER, tierName, tierKeyForScore } from '../../lib/tiers';

interface TierDistributionPanelProps {
  fleet: FleetDistribution;
  duration: string;
}

/** Fleet distribution across the eight trust tiers */
export function TierDistributionPanel({ fleet, duration }: TierDistributionPanelProps) {
  return (
    <Panel
      title="Tier distribution"
      subtitle={`${fleet.totalAgents} agents · current fleet scores · select a tier to explore`}
    >
      {fleet.totalAgents === 0 ? (
        <EmptyState message="No agents observed." />
      ) : (
        <div className="flex flex-col gap-4">
          <BarChart
            bars={TIER_ORDER.map((tier) => ({
              label: tier,
              sublabel: tierName(tier),
              value: fleet.byTier[tier] ?? 0,
              color: TIER_COLORS[tier],
            }))}
            height={185}
            hrefFor={(b) => exploreHref(`/tier/${b.label}`, { window: duration })}
          />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white/[0.03] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Mean</p>
              <p className="text-sm font-bold text-white/90">{fmtNum(fleet.averageScore)}</p>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Median</p>
              <p className="text-sm font-bold text-white/90">{fmtNum(fleet.medianScore)}</p>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Std dev</p>
              <p className="text-sm font-bold text-white/90">{fmtNum(fleet.standardDeviation)}</p>
            </div>
          </div>

          {fleet.scoreHistogram.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/40">
                Score histogram
              </p>
              <BarChart
                dense
                height={120}
                bars={fleet.scoreHistogram.map((b) => {
                  const tier = tierKeyForScore(b.bucketMin);
                  return {
                    label: String(b.bucketMin),
                    value: b.count,
                    color: TIER_COLORS[tier],
                  };
                })}
              />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
