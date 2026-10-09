// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { CorrelationSummary } from '@vorionsys/rainbow';
import { Panel, EmptyState } from '../panel';
import { ExploreLink, exploreHref } from '../explore-link';
import { fmtDateTime } from '../../lib/format';
import { STATUS, tint } from '../../lib/status-colors';

interface CorrelationsPanelProps {
  correlations: CorrelationSummary;
  window?: string;
}

const SEV: Record<string, string> = {
  warning: STATUS.warn,
  critical: STATUS.bad,
  emergency: '#dc2626',
};

/**
 * Cross-agent correlations — alerts derived from real co-occurrence in the
 * signal stream (shared failing factors, shared correlation ids). Honestly
 * grounded; agrees with the anomaly clusters.
 */
export function CorrelationsPanel({ correlations, window }: CorrelationsPanelProps) {
  const { activeAlerts, alertCountByPattern, mostAffectedAgents, totalAlerts } = correlations;

  return (
    <Panel
      title="Correlated events"
      subtitle="Individual co-occurrences across agents (shared failing factors, shared correlation ids). Not the cluster count: one cluster can produce many events."
      badge={
        totalAlerts > 0 ? (
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/70">
            {totalAlerts}
          </span>
        ) : undefined
      }
    >
      {totalAlerts === 0 ? (
        <EmptyState message="No correlated events in this window." />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Pattern counts */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(alertCountByPattern).map(([pattern, count]) => (
              <span
                key={pattern}
                className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] text-white/60"
              >
                {pattern}: {count}
              </span>
            ))}
          </div>

          {/* Active alerts */}
          <ul className="flex flex-col gap-2">
            {activeAlerts.map((a) => {
              const color = SEV[a.severity] ?? STATUS.neutral;
              return (
                <li
                  key={a.alertId}
                  className="rounded-lg border border-l-2 border-white/10 bg-white/[0.02] px-3.5 py-2.5"
                  style={{ borderLeftColor: color }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold"
                      style={{ color, backgroundColor: tint(color) }}
                    >
                      {a.pattern}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider" style={{ color }}>
                      {a.severity}
                    </span>
                    <span className="ml-auto text-[10px] text-white/30">
                      {fmtDateTime(a.detectedAt)} UTC
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-white/70">{a.description}</p>
                  <p className="mt-1 text-[11px] text-white/45">
                    {a.agentIds.map((id, i) => (
                      <span key={id}>
                        {i > 0 ? ', ' : ''}
                        <ExploreLink href={exploreHref(`/agent/${id}`, { window })} className="text-white/70">
                          {id}
                        </ExploreLink>
                      </span>
                    ))}
                  </p>
                </li>
              );
            })}
          </ul>

          {/* Most affected */}
          {mostAffectedAgents.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wider text-white/40">
                Most affected agents
              </p>
              <div className="flex flex-wrap gap-1.5">
                {mostAffectedAgents.map((m) => (
                  <ExploreLink
                    key={m.agentId}
                    href={exploreHref(`/agent/${m.agentId}`, { window })}
                    variant="block"
                    className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60"
                  >
                    {m.agentId} · {m.alertCount}
                  </ExploreLink>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
