// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { StateTransitionSummary, SignalDistribution } from '@vorionsys/rainbow';
import { Panel } from '../panel';
import { ExploreLink, exploreHref } from '../explore-link';
import { InfoLink } from '../info-link';
import { ConceptTooltip } from '../tooltip';
import { conceptSlug } from '../../lib/glossary';
import { fmtPct } from '../../lib/format';

interface TransitionsPanelProps {
  transitions: StateTransitionSummary;
  distribution: SignalDistribution;
  agentId: string;
  duration: string;
}

const OUTCOME_COLORS = {
  success: '#22c55e',
  failure: '#ef4444',
  blocked: '#f59e0b',
} as const;

/** Tier transitions, circuit-breaker events, and the window's signal mix */
export function TransitionsPanel({
  transitions,
  distribution,
  agentId,
  duration,
}: TransitionsPanelProps) {
  const counters = [
    { label: 'Promotions', value: transitions.tierPromotions, color: '#22c55e', info: undefined },
    { label: 'Demotions', value: transitions.tierDemotions, color: '#ef4444', info: undefined },
    { label: 'CB trips', value: transitions.cbTrips, color: '#dc2626', info: 'formula-circuit-breaker' },
    { label: 'Degraded entries', value: transitions.cbDegradedEntries, color: '#f59e0b', info: 'formula-risk-accumulator' },
    { label: 'CB resets', value: transitions.cbResets, color: '#06b6d4', info: 'formula-circuit-breaker' },
  ];

  const total = distribution.total;
  const outcomes = (['success', 'failure', 'blocked'] as const).map((key) => ({
    key,
    count: distribution.byOutcome[key],
    ratio: total > 0 ? distribution.byOutcome[key] / total : 0,
  }));

  return (
    <Panel
      title="State transitions & signal mix"
      subtitle={`${agentId} · last ${duration}`}
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2">
          {counters.map((c) => (
            <div key={c.label} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/40">
                {c.label}
                {c.info ? <InfoLink slug={c.info} label={c.label} /> : null}
              </p>
              <p className="text-lg font-bold" style={{ color: c.value > 0 ? c.color : '#ffffff59' }}>
                {c.value}
              </p>
            </div>
          ))}
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-white/40">Signals</p>
            <p className="text-lg font-bold text-white/85">{total}</p>
          </div>
        </div>

        {total === 0 ? (
          <p className="text-xs text-white/40">No signals in this window.</p>
        ) : (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-white/40">
              Outcome mix
            </p>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              {outcomes.map(
                (o) =>
                  o.ratio > 0 && (
                    <div
                      key={o.key}
                      style={{
                        width: `${o.ratio * 100}%`,
                        backgroundColor: OUTCOME_COLORS[o.key],
                      }}
                    />
                  )
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {outcomes.map((o) => (
                <span key={o.key} className="flex items-center gap-1.5 text-[11px] text-white/55">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: OUTCOME_COLORS[o.key] }}
                  />
                  {o.key} {o.count} ({fmtPct(o.ratio)})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Severity chips */}
        {total > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-white/40">
              By severity
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(distribution.bySeverity).map(([severity, count]) => (
                <ConceptTooltip key={severity} slug={conceptSlug.severity(severity)}>
                  <ExploreLink
                    href={exploreHref(`/concepts/${conceptSlug.severity(severity)}`, { window: duration })}
                    variant="block"
                    className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60"
                    title={`What does ${severity} severity mean?`}
                  >
                    {severity}: {count}
                  </ExploreLink>
                </ConceptTooltip>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
