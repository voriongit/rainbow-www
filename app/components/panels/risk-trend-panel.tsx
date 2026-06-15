// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { RISK_ACCUMULATOR } from '@vorionsys/basis-spec';
import type { RiskTrend } from '@vorionsys/rainbow';
import { Panel, EmptyState } from '../panel';
import { LineChart } from '../charts/line-chart';
import { fmtNum } from '../../lib/format';

interface RiskTrendPanelProps {
  risk: RiskTrend;
  agentId: string;
  duration: string;
}

const TREND_COLORS = {
  escalating: '#ef4444',
  'de-escalating': '#22c55e',
  stable: '#94a3b8',
} as const;

/** Rolling 24h risk accumulator — corrected P(T) × R contributions */
export function RiskTrendPanel({ risk, agentId, duration }: RiskTrendPanelProps) {
  const trendColor = TREND_COLORS[risk.trend];
  const yMax = Math.max(risk.peakInWindow * 1.2, RISK_ACCUMULATOR.degradedThreshold * 1.15);

  return (
    <Panel
      title="Risk accumulator"
      subtitle={`${agentId} · rolling ${RISK_ACCUMULATOR.windowHours}h pressure · last ${duration}`}
      badge={
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize"
          style={{ color: trendColor, backgroundColor: `${trendColor}1a` }}
        >
          {risk.trend}
        </span>
      }
      footnote={`Corrected accumulator: each failure contributes P(T) × R per the BASIS canonical formula (P(T) = 3 + tier at STANDARD posture). The library's R-only proxy is replaced pending rainbow-decontaminate (#3). Thresholds: warning ≥ ${RISK_ACCUMULATOR.warningThreshold}, degraded ≥ ${RISK_ACCUMULATOR.degradedThreshold}, circuit breaker ≥ ${RISK_ACCUMULATOR.cbThreshold}.`}
    >
      {risk.samples.length === 0 ? (
        <EmptyState message={`No signals for ${agentId} in the last ${duration}.`} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Current</p>
              <p className="text-2xl font-bold text-white">{fmtNum(risk.currentAccumulatorValue, 1)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Peak in window</p>
              <p className="text-sm font-semibold text-white/85">{fmtNum(risk.peakInWindow, 1)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Warning breaches</p>
              <p className="text-sm font-semibold text-amber-400">{risk.warningBreaches}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Degraded breaches</p>
              <p className="text-sm font-semibold text-red-400">{risk.degradedBreaches}</p>
            </div>
          </div>
          <LineChart
            id="risk"
            points={risk.samples.map((s) => ({ t: s.timestamp.getTime(), v: s.value }))}
            color="#f97316"
            height={210}
            yDomain={[0, yMax]}
            thresholds={[
              {
                value: RISK_ACCUMULATOR.warningThreshold,
                label: `warning ${RISK_ACCUMULATOR.warningThreshold}`,
                color: '#f59e0b',
              },
              {
                value: RISK_ACCUMULATOR.degradedThreshold,
                label: `degraded ${RISK_ACCUMULATOR.degradedThreshold}`,
                color: '#ef4444',
              },
              {
                value: RISK_ACCUMULATOR.cbThreshold,
                label: `CB ${RISK_ACCUMULATOR.cbThreshold}`,
                color: '#dc2626',
              },
            ]}
          />
        </div>
      )}
    </Panel>
  );
}
