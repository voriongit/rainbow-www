// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { RISK_ACCUMULATOR } from '@vorionsys/basis-spec';
import { Panel } from '../panel';
import { ExploreLink, exploreHref } from '../explore-link';
import { InfoLink } from '../info-link';
import { fmtNum } from '../../lib/format';
import { accumulatorWord } from '../../lib/insights';
import { STATUS } from '../../lib/status-colors';
import type { FleetOverview } from '../../lib/data-source';

const TREND_COLORS = {
  escalating: STATUS.bad,
  'de-escalating': STATUS.good,
  stable: STATUS.neutral,
} as const;

function levelColor(v: number): string {
  if (v >= RISK_ACCUMULATOR.cbThreshold) return '#dc2626';
  if (v >= RISK_ACCUMULATOR.degradedThreshold) return STATUS.bad;
  if (v >= RISK_ACCUMULATOR.warningThreshold) return STATUS.warn;
  return 'rgba(255,255,255,0.75)';
}

/**
 * Per-agent risk accumulators, ranked by in-window peak. BASIS defines the
 * accumulator per agent, so the fleet view lists them rather than summing
 * them into a pooled number that has no threshold meaning. Every value here
 * is the same seeded series the agent's own risk panel draws.
 */
export function FleetRiskPanel({ overview }: { overview: FleetOverview }) {
  const { duration } = overview;
  const ranked = overview.rows
    .slice()
    .sort((a, b) => b.risk.peakInWindow - a.risk.peakInWindow || a.agentId.localeCompare(b.agentId));
  const over = ranked.filter((r) => r.risk.peakInWindow >= RISK_ACCUMULATOR.warningThreshold).length;

  return (
    <Panel
      title="Risk accumulators"
      subtitle={`Per agent · rolling ${RISK_ACCUMULATOR.windowHours}h · last ${duration} · ${over} of ${ranked.length} crossed warning`}
      footnote={`Thresholds: warning ${RISK_ACCUMULATOR.warningThreshold}, degraded ${RISK_ACCUMULATOR.degradedThreshold}, circuit breaker ${RISK_ACCUMULATOR.cbThreshold}. Direction compares the first and last quarter of the window, the same rule as each agent's chart badge.`}
    >
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[18rem] text-left text-[12px]">
          <caption className="sr-only">Risk accumulator per agent, highest peak first</caption>
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white/55">
              <th scope="col" className="px-1 py-1.5 font-medium">Agent</th>
              <th scope="col" className="px-1 py-1.5 text-right font-medium">
                Peak
                <InfoLink slug="metric-risk-accumulator" />
              </th>
              <th scope="col" className="px-1 py-1.5 text-right font-medium">Now</th>
              <th scope="col" className="px-1 py-1.5 font-medium">Direction</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr key={r.agentId} className="border-t border-white/[0.06]">
                <td className="px-1 py-1.5">
                  <ExploreLink
                    href={exploreHref('/', { window: duration, agent: r.agentId })}
                    className="font-mono text-white/80"
                    title={`Open ${r.agentId}'s risk accumulator`}
                  >
                    {r.agentId}
                  </ExploreLink>
                </td>
                <td
                  className="px-1 py-1.5 text-right font-semibold tabular-nums"
                  style={{ color: levelColor(r.risk.peakInWindow) }}
                >
                  {fmtNum(r.risk.peakInWindow)}
                </td>
                <td
                  className="px-1 py-1.5 text-right tabular-nums"
                  style={{ color: levelColor(r.risk.currentAccumulatorValue) }}
                >
                  {fmtNum(r.risk.currentAccumulatorValue)}
                </td>
                <td className="px-1 py-1.5" style={{ color: TREND_COLORS[r.risk.trend] }}>
                  {accumulatorWord(r.risk.trend)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
