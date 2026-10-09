// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { Panel, EmptyState } from '../panel';
import { LineChart } from '../charts/line-chart';
import { InfoLink } from '../info-link';
import { fmtNum, fmtSigned } from '../../lib/format';
import { STATUS } from '../../lib/status-colors';
import type { FleetOverview } from '../../lib/data-source';

/**
 * Fleet score trend — mean and median of every agent's own score, sampled on a
 * fixed grid across the window. This is the series the fleet insights cite;
 * a pooled-signal "fleet trajectory" (all agents' deltas summed onto one
 * starting score) is deliberately not drawn because it matches no real quantity.
 */
export function FleetTrendPanel({ overview }: { overview: FleetOverview }) {
  const { meanSeries, medianSeries, mean, median, rows, duration } = overview;
  const hours = Math.max(1e-9, (overview.computedAt.getTime() - meanSeries[0]?.t) / 3_600_000);
  const meanRate = (mean.end - mean.start) / hours;
  const rising = rows.filter((r) => r.trend === 'rising').length;
  const falling = rows.filter((r) => r.trend === 'falling').length;

  return (
    <Panel
      title="Fleet score trend"
      subtitle={`Mean and median of ${overview.agentCount} agents · last ${duration}`}
      footnote="Each point is the mean (or median) of every agent's score at that moment. Agent trends use each agent's own regression slope; pick an agent above to see its trajectory."
    >
      {meanSeries.length === 0 ? (
        <EmptyState message={`No agents in the last ${duration}.`} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/55">
                Mean now
                <InfoLink slug="metric-composite-score" />
              </p>
              <p className="text-2xl font-bold text-white">{fmtNum(mean.end)}</p>
              <p className="text-[11px] text-white/55">from {fmtNum(mean.start)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/55">Median now</p>
              <p className="text-sm font-semibold text-white/85">{fmtNum(median.end)}</p>
              <p className="text-[11px] text-white/55">from {fmtNum(median.start)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/55">
                Mean change
                <InfoLink slug="metric-velocity" />
              </p>
              <p className="text-sm font-semibold text-white/85">
                {fmtSigned(meanRate)} <span className="text-white/55">pts/h</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/55">Agents</p>
              <p className="text-sm font-semibold text-white/85">
                <span style={{ color: STATUS.good }}>{rising} rising</span>
                <span className="text-white/30"> · </span>
                <span style={{ color: STATUS.bad }}>{falling} falling</span>
              </p>
              <p className="text-[11px] text-white/55">
                {rows.length - rising - falling} stable
              </p>
            </div>
          </div>
          <LineChart
            id="fleet-trend"
            points={meanSeries}
            height={210}
            valueLabel="Score"
            series={[
              { points: meanSeries, color: STATUS.info, label: 'mean' },
              { points: medianSeries, color: STATUS.neutral, label: 'median' },
            ]}
          />
        </div>
      )}
    </Panel>
  );
}
