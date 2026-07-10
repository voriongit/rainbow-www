// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Interactive fleet roster table. Client-side search + tier + lifecycle
 * filtering over an agent list passed from a server parent (so this never
 * imports the server-only simulator). Each row deep-links into the explore
 * surfaces (agent / tier), all carrying the active window. The Trend column
 * renders a per-agent sparkline tinted to its tier color.
 */

import { useMemo, useState } from 'react';
import { ExploreLink, exploreHref } from './explore-link';
import { ConceptTooltip } from './tooltip';
import { Sparkline } from './sparkline';
import { conceptSlug } from '../lib/glossary';
import { TIER_COLORS, type TierKey } from '../lib/tiers';
import { LIFECYCLE_COLORS, STATUS, tint } from '../lib/status-colors';
import { fmtNum } from '../lib/format';

/**
 * Local shape of the agent fields this component renders — deliberately NOT
 * the server-only `SimAgentInfo` so the client bundle stays clean.
 */
type RosterAgent = {
  agentId: string;
  label: string;
  tier: string;
  lifecycleState: string;
  score: number;
  signalCount: number;
};

interface FleetRosterProps {
  agents: RosterAgent[];
  sparklines: Record<string, { t: number; v: number }[]>;
  duration: string;
  selectedAgentId: string;
}

const TIER_OPTIONS = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const LIFECYCLE_OPTIONS = ['ACTIVE', 'DEGRADED', 'TRIPPED'];

const SELECT_CLASS =
  'max-w-full rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-base sm:text-xs text-white/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30';

export function FleetRoster({
  agents,
  sparklines,
  duration,
  selectedAgentId,
}: FleetRosterProps) {
  const [query, setQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('All');
  const [lifecycleFilter, setLifecycleFilter] = useState('All');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (q && !a.agentId.toLowerCase().includes(q) && !a.label.toLowerCase().includes(q)) {
        return false;
      }
      if (tierFilter !== 'All' && a.tier !== tierFilter) return false;
      if (lifecycleFilter !== 'All' && a.lifecycleState !== lifecycleFilter) return false;
      return true;
    });
  }, [agents, query, tierFilter, lifecycleFilter]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agent or archetype…"
          aria-label="Search by agent ID or archetype"
          className="min-w-[12rem] flex-1 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1 text-base sm:text-xs text-white/85 placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          aria-label="Filter by tier"
          className={SELECT_CLASS}
        >
          <option value="All">All tiers</option>
          {TIER_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={lifecycleFilter}
          onChange={(e) => setLifecycleFilter(e.target.value)}
          aria-label="Filter by lifecycle state"
          className={SELECT_CLASS}
        >
          <option value="All">All states</option>
          {LIFECYCLE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[11px] uppercase tracking-wider text-white/40">
          {filtered.length} of {agents.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40">
              <th className="px-2 py-1.5 font-medium">Agent</th>
              <th className="px-2 py-1.5 font-medium">Tier</th>
              <th className="px-2 py-1.5 text-right font-medium">Score</th>
              <th className="px-2 py-1.5 font-medium">Lifecycle</th>
              <th className="px-2 py-1.5 text-right font-medium">Signals</th>
              <th className="px-2 py-1.5 font-medium">Trend</th>
              <th className="px-2 py-1.5 font-medium">Archetype</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-white/40">
                  No agents match
                </td>
              </tr>
            ) : (
              filtered.map((a) => {
                const tierColor = TIER_COLORS[a.tier as TierKey] ?? '#6b7280';
                const trend = sparklines[a.agentId] ?? [];
                const isSelected = a.agentId === selectedAgentId;
                return (
                  <tr
                    key={a.agentId}
                    className={`border-b border-white/5 ${isSelected ? 'bg-white/[0.04]' : ''}`}
                  >
                    <td className="px-2 py-1.5">
                      <ExploreLink
                        href={exploreHref('/agent/' + a.agentId, { window: duration })}
                        className="font-medium text-white/85"
                      >
                        {a.agentId}
                      </ExploreLink>
                    </td>
                    <td className="px-2 py-1.5">
                      <ConceptTooltip slug={conceptSlug.tier(a.tier)}>
                        <ExploreLink href={exploreHref('/tier/' + a.tier, { window: duration })}>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                            style={{ color: tierColor, backgroundColor: tint(tierColor) }}
                          >
                            {a.tier}
                          </span>
                        </ExploreLink>
                      </ConceptTooltip>
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold text-white/85">
                      {fmtNum(a.score)}
                    </td>
                    <td className="px-2 py-1.5">
                      <ConceptTooltip slug={conceptSlug.lifecycle(a.lifecycleState)}>
                        <span
                          className="text-[11px]"
                          style={{ color: LIFECYCLE_COLORS[a.lifecycleState] ?? STATUS.neutral }}
                        >
                          {a.lifecycleState}
                        </span>
                      </ConceptTooltip>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <ExploreLink
                        href={exploreHref('/agent/' + a.agentId, { window: duration })}
                        className="text-white/55"
                        title="View signal log"
                      >
                        {a.signalCount}
                      </ExploreLink>
                    </td>
                    <td className="px-2 py-1.5">
                      {trend.length > 0 ? <Sparkline points={trend} color={tierColor} /> : null}
                    </td>
                    <td className="px-2 py-1.5 text-white/45">{a.label}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
