// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { FleetDistribution } from '@vorionsys/rainbow';
import { Panel, EmptyState } from '../panel';
import { BarChart } from '../charts/bar-chart';
import { exploreHref } from '../explore-link';
import { Tooltip } from '../tooltip';
import { fmtNum } from '../../lib/format';
import { TIER_COLORS, TIER_ORDER, tierName, tierKeyForScore } from '../../lib/tiers';

/** Faint dotted-underline + help cursor signalling a hoverable metric value. */
const METRIC_TIP = 'cursor-help underline decoration-dotted decoration-white/25 underline-offset-2';

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
              href: exploreHref(`/tier/${tier}`, { window: duration }),
            }))}
            height={185}
            valueLabel="Agents"
          />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white/[0.03] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Mean</p>
              <p className="text-sm font-bold text-white/90">
                <Tooltip
                  content="Arithmetic mean of every agent's current trust score (0–1000)."
                  className={METRIC_TIP}
                >
                  {fmtNum(fleet.averageScore)}
                </Tooltip>
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Median</p>
              <p className="text-sm font-bold text-white/90">
                <Tooltip
                  content="Middle score — half the fleet is above it, half below. Robust to a few outliers, unlike the mean."
                  className={METRIC_TIP}
                >
                  {fmtNum(fleet.medianScore)}
                </Tooltip>
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Std dev</p>
              <p className="text-sm font-bold text-white/90">
                <Tooltip
                  content="Standard deviation of the scores — how spread out the fleet is around the mean. Higher means a more polarized fleet."
                  className={METRIC_TIP}
                >
                  {fmtNum(fleet.standardDeviation)}
                </Tooltip>
              </p>
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
                valueLabel="Agents"
                bars={fleet.scoreHistogram.map((b) => {
                  const tier = tierKeyForScore(b.bucketMin);
                  return {
                    label: String(b.bucketMin),
                    sublabel: `${b.bucketMin}–${b.bucketMax}`,
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
