// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import Link from 'next/link';
import type { SimAgentInfo } from '../lib/simulator';
import { TIER_COLORS, tierName, type TierKey } from '../lib/tiers';
import { fmtNum } from '../lib/format';
import { exploreHref } from './explore-link';
import { Sparkline } from './sparkline';

interface WatchListProps {
  agents: SimAgentInfo[];
  sparklines: Record<string, { t: number; v: number }[]>;
  duration: string;
  live: boolean;
}

export function WatchList({ agents, sparklines, duration, live }: WatchListProps) {
  if (agents.length === 0) return null;

  return (
    <section>
      <header className="mb-3">
        <h2 className="text-sm font-semibold tracking-wide text-white/90">What to watch</h2>
        <p className="mt-0.5 text-xs text-white/45">
          {live
            ? 'Lowest current scores in the reporting fleet — start here.'
            : 'Four plots in the demo fleet. Open one, then use the roster for the rest.'}
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {agents.map((a) => {
          const color = TIER_COLORS[a.tier as TierKey] ?? '#a3a3a3';
          const points = sparklines[a.agentId] ?? [];
          return (
            <li key={a.agentId}>
              <Link
                href={exploreHref(`/agent/${a.agentId}`, { window: duration })}
                className="flex h-full flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/25 hover:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-mono text-white/40">{a.agentId}</p>
                    <p className="text-sm font-semibold text-white/90">{a.label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums" style={{ color }}>
                      {fmtNum(a.score)}
                    </p>
                    <p className="text-[11px] text-white/45">
                      {a.tier} · {tierName(a.tier as TierKey)}
                    </p>
                  </div>
                </div>
                {a.story ? (
                  <p className="text-xs leading-relaxed text-white/55">{a.story}</p>
                ) : (
                  <p className="text-xs leading-relaxed text-white/55">
                    Reporting live · {a.signalCount} signal{a.signalCount === 1 ? '' : 's'} · {a.lifecycleState}
                  </p>
                )}
                {points.length > 1 ? (
                  <div className="mt-auto w-full">
                    <Sparkline points={points} color={color} width={280} height={32} />
                  </div>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
