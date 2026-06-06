// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { OrchestrationSnapshot } from '@vorionsys/rainbow';
import { AlertTriangle } from 'lucide-react';
import { Panel, EmptyState } from '../panel';
import { fmtNum } from '../../lib/format';
import { TIER_COLORS, type TierKey } from '../../lib/tiers';
import type { SimAgentInfo } from '../../lib/simulator';

interface FleetPanelProps {
  fleet: OrchestrationSnapshot;
  agents: SimAgentInfo[];
  selectedAgentId: string;
}

const CLUSTER_COLORS = {
  warning: '#f59e0b',
  critical: '#ef4444',
  emergency: '#dc2626',
} as const;

const LIFECYCLE_COLORS: Record<string, string> = {
  ACTIVE: '#22c55e',
  DEGRADED: '#f59e0b',
  TRIPPED: '#ef4444',
};

/** Fleet roster + cross-agent anomaly clusters */
export function FleetPanel({ fleet, agents, selectedAgentId }: FleetPanelProps) {
  return (
    <Panel
      title="Fleet view"
      subtitle={`${agents.length} simulated agents · anomaly clustering over window signals`}
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
                  <div>
                    <p className="text-xs font-semibold" style={{ color }}>
                      {cluster.severity.toUpperCase()} — {cluster.description}
                    </p>
                    <p className="mt-1 text-[11px] text-white/55">
                      Agents: {cluster.agentIds.join(', ')} · Shared failing factors:{' '}
                      {cluster.commonFactors.join(', ')}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Roster */}
        {agents.length === 0 ? (
          <EmptyState message="No agents observed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40">
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="py-2 pr-3 font-medium">Tier</th>
                  <th className="py-2 pr-3 text-right font-medium">Score</th>
                  <th className="py-2 pr-3 font-medium">Lifecycle</th>
                  <th className="py-2 pr-3 text-right font-medium">Signals</th>
                  <th className="py-2 font-medium">Archetype</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const tierColor = TIER_COLORS[agent.tier as TierKey] ?? '#6b7280';
                  const lifecycleColor = LIFECYCLE_COLORS[agent.lifecycleState] ?? '#94a3b8';
                  const selected = agent.agentId === selectedAgentId;
                  return (
                    <tr
                      key={agent.agentId}
                      className={`border-b border-white/5 ${selected ? 'bg-white/[0.04]' : ''}`}
                    >
                      <td className="py-2 pr-3 font-medium text-white/85">{agent.agentId}</td>
                      <td className="py-2 pr-3">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ color: tierColor, backgroundColor: `${tierColor}1a` }}
                        >
                          {agent.tier}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold text-white/85">
                        {fmtNum(agent.score)}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="text-[11px]" style={{ color: lifecycleColor }}>
                          {agent.lifecycleState}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right text-white/55">
                        {agent.signalCount}
                      </td>
                      <td className="py-2 text-white/45">{agent.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}
