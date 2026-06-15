// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { ScoreTrajectory } from '@vorionsys/rainbow';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Panel, EmptyState } from '../panel';
import { LineChart } from '../charts/line-chart';
import { ExploreLink, exploreHref } from '../explore-link';
import { InfoLink } from '../info-link';
import { ConceptTooltip } from '../tooltip';
import { conceptSlug } from '../../lib/glossary';
import { fmtNum, fmtSigned } from '../../lib/format';
import { TIER_COLORS, tierKeyForScore, tierName } from '../../lib/tiers';

interface TrajectoryPanelProps {
  trajectory: ScoreTrajectory;
  agentId: string;
  duration: string;
}

const TREND_META = {
  rising: { Icon: TrendingUp, color: '#22c55e', label: 'Rising' },
  falling: { Icon: TrendingDown, color: '#ef4444', label: 'Falling' },
  stable: { Icon: Minus, color: '#94a3b8', label: 'Stable' },
} as const;

/** Score trajectory: timeline, regression trend, velocity, acceleration */
export function TrajectoryPanel({ trajectory, agentId, duration }: TrajectoryPanelProps) {
  const tier = tierKeyForScore(trajectory.current);
  const tierColor = TIER_COLORS[tier];
  const { Icon, color, label } = TREND_META[trajectory.trend];

  return (
    <Panel
      title="Score trajectory"
      subtitle={`${agentId} · last ${duration}`}
      badge={
        <ConceptTooltip slug={conceptSlug.tier(tier)} side="bottom">
          <ExploreLink href={exploreHref(`/tier/${tier}`, { window: duration })} title={`Explore tier ${tier}`}>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ color: tierColor, backgroundColor: `${tierColor}1a` }}
            >
              {tier} · {tierName(tier)}
            </span>
          </ExploreLink>
        </ConceptTooltip>
      }
    >
      {trajectory.samples.length === 0 ? (
        <EmptyState message={`No signals for ${agentId} in the last ${duration}.`} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">
                Current
                <InfoLink slug="metric-composite-score" />
              </p>
              <p className="text-2xl font-bold" style={{ color: tierColor }}>
                {fmtNum(trajectory.current)}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">
                Trend
                <InfoLink slug="metric-trajectory" />
              </p>
              <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color }}>
                <Icon size={16} aria-hidden /> {label}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">
                Velocity
                <InfoLink slug="metric-velocity" />
              </p>
              <p className="text-sm font-semibold text-white/85">
                {fmtSigned(trajectory.velocity)} <span className="text-white/40">pts/h</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">
                Acceleration
                <InfoLink slug="metric-acceleration" />
              </p>
              <p className="text-sm font-semibold text-white/85">
                {fmtSigned(trajectory.acceleration, 2)}{' '}
                <span className="text-white/40">pts/h²</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Range</p>
              <p className="text-sm font-semibold text-white/85">
                {fmtNum(trajectory.min)}–{fmtNum(trajectory.max)}
              </p>
            </div>
          </div>
          <LineChart
            id="trajectory"
            points={trajectory.samples.map((s) => ({ t: s.timestamp.getTime(), v: s.score }))}
            color={tierColor}
            regression
            height={210}
          />
        </div>
      )}
    </Panel>
  );
}
