// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { OrchestrationSnapshot } from '@vorionsys/rainbow';
import { AlertTriangle } from 'lucide-react';
import { Panel, EmptyState } from '../panel';
import { ExploreLink, exploreHref } from '../explore-link';
import { FleetRoster } from '../fleet-roster';
import type { SimAgentInfo } from '../../lib/simulator';

interface FleetPanelProps {
  fleet: OrchestrationSnapshot;
  agents: SimAgentInfo[];
  selectedAgentId?: string;
  duration: string;
  /** Per-agent downsampled trajectory for the roster sparklines. */
  sparklines: Record<string, { t: number; v: number }[]>;
}

const CLUSTER_COLORS = {
  warning: '#f59e0b',
  critical: '#ef4444',
  emergency: '#dc2626',
} as const;

/** Fleet roster (searchable, with sparklines) + cross-agent anomaly clusters */
export function FleetPanel({ fleet, agents, selectedAgentId, duration, sparklines }: FleetPanelProps) {
  return (
    <Panel
      title="Fleet view"
      subtitle={`${agents.length} simulated agents · search/filter the roster · anomaly clustering over window signals`}
    >
      <div className="flex flex-col gap-5">
        {/* Anomaly clusters */}
        {fleet.anomalyClusters.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
            <p className="text-xs text-white/45">
              No anomaly clusters detected in this window.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {fleet.anomalyClusters.map((cluster) => {
              const color = CLUSTER_COLORS[cluster.severity];
              return (
                <li
                  key={cluster.clusterId}
                  className="flex items-start gap-3 rounded-lg border px-4 py-3"
                  style={{ borderColor: `${color}55`, backgroundColor: `${color}0d` }}
                >
                  <AlertTriangle size={16} style={{ color }} className="mt-0.5 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold" style={{ color }}>
                      <ExploreLink
                        href={exploreHref(`/cluster/${cluster.clusterId}`, { window: duration })}
                        title="Open cluster detail"
                      >
                        {cluster.severity.toUpperCase()} — {cluster.description}
                      </ExploreLink>
                    </p>
                    <p className="mt-1 text-[11px] text-white/55">
                      Agents:{' '}
                      {cluster.agentIds.map((id, i) => (
                        <span key={id}>
                          {i > 0 ? ', ' : ''}
                          <ExploreLink
                            href={exploreHref(`/agent/${id}`, { window: duration })}
                            className="text-white/70"
                          >
                            {id}
                          </ExploreLink>
                        </span>
                      ))}
                      {' · '}Shared failing factors:{' '}
                      {cluster.commonFactors.map((code, i) => (
                        <span key={code}>
                          {i > 0 ? ', ' : ''}
                          <ExploreLink
                            href={exploreHref(`/factor/${code}`, { window: duration })}
                            className="font-mono text-white/70"
                          >
                            {code}
                          </ExploreLink>
                        </span>
                      ))}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Roster — searchable / filterable, with per-agent sparklines */}
        {agents.length === 0 ? (
          <EmptyState message="No agents observed." />
        ) : (
          <FleetRoster
            agents={agents}
            sparklines={sparklines}
            duration={duration}
            selectedAgentId={selectedAgentId}
          />
        )}
      </div>
    </Panel>
  );
}
