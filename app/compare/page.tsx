// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Agent comparison view. Resolves two agents (A and B) from searchParams,
 * reads each through a single dashboard pass, and renders them side by side:
 * score trajectory, mini-stats (score/trend/velocity/risk), and an insight
 * count, with a deep-link into each agent's full profile. Read-only RSC; the
 * active window is carried into every link.
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  getAgentInfo,
  getDashboardData,
  getAgents,
  isPresetDuration,
  type DashboardData,
} from '../lib/data-source';
import { TIER_COLORS, tierName, type TierKey } from '../lib/tiers';
import { STATUS, tint } from '../lib/status-colors';
import { fmtNum, fmtSigned } from '../lib/format';
import { ExploreLink, exploreHref } from '../components/explore-link';
import { Panel } from '../components/panel';
import { LineChart } from '../components/charts/line-chart';
import { ComparePicker } from './compare-picker';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string; window?: string }>;
}

const TREND_META = {
  rising: { Icon: TrendingUp, color: STATUS.good, label: 'Rising' },
  falling: { Icon: TrendingDown, color: STATUS.bad, label: 'Falling' },
  stable: { Icon: Minus, color: STATUS.neutral, label: 'Stable' },
} as const;

const DEFAULT_A = 'cascade-03';
const DEFAULT_B = 'orion-07';

/** A labelled mini-statistic for the compare panels. */
function MiniStat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-white/40">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** One comparison column for a resolved agent bundle. */
function CompareColumn({
  d,
  side,
  window,
}: {
  d: DashboardData;
  side: 'a' | 'b';
  window: string;
}) {
  const info = d.agentInfo;
  const tier = info.tier as TierKey;
  const tierColor = TIER_COLORS[tier] ?? STATUS.neutral;
  const traj = d.window.trajectory;
  const trend = TREND_META[traj.trend];
  const risk = d.correctedRisk;

  return (
    <Panel
      title={info.agentId}
      subtitle={info.label}
      badge={
        <ExploreLink href={exploreHref(`/tier/${tier}`, { window })}>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ color: tierColor, backgroundColor: tint(tierColor) }}
          >
            {tier} · {tierName(tier)}
          </span>
        </ExploreLink>
      }
      footnote={`${d.insights.length} ${d.insights.length === 1 ? 'insight' : 'insights'} in the last ${window}.`}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <MiniStat label="Score">
            <p className="text-2xl font-bold" style={{ color: tierColor }}>
              {fmtNum(traj.current)}
            </p>
          </MiniStat>
          <MiniStat label="Trend">
            <p
              className="flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: trend.color }}
            >
              <trend.Icon size={16} aria-hidden /> {trend.label}
            </p>
          </MiniStat>
          <MiniStat label="Velocity">
            <p className="text-sm font-semibold text-white/85">
              {fmtSigned(traj.velocity)} <span className="text-white/40">pts/h</span>
            </p>
          </MiniStat>
          <MiniStat label="Risk cur/peak">
            <p className="text-sm font-semibold text-white/85">
              {fmtNum(risk.currentAccumulatorValue, 1)}
              <span className="text-white/40"> / </span>
              {fmtNum(risk.peakInWindow, 1)}
            </p>
          </MiniStat>
        </div>

        <LineChart
          id={`cmp-${side}-traj`}
          points={traj.samples.map((s) => ({ t: s.timestamp.getTime(), v: s.score }))}
          color={tierColor}
          regression
          height={200}
          valueLabel="Score"
        />

        <div>
          <ExploreLink
            href={exploreHref(`/agent/${info.agentId}`, { window })}
            className="text-sm text-white/55"
          >
            Full profile →
          </ExploreLink>
        </div>
      </div>
    </Panel>
  );
}

export default async function ComparePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';

  const agents = getAgents();

  // Resolve agent A: requested → cascade-03 → first roster agent.
  const infoA =
    (sp.a ? getAgentInfo(sp.a) : undefined) ??
    getAgentInfo(DEFAULT_A) ??
    agents[0];
  const idA = infoA.agentId;

  // Resolve agent B: requested (and distinct from A) → a different default →
  // any roster agent that is not A.
  const requestedB = sp.b ? getAgentInfo(sp.b) : undefined;
  const infoB =
    (requestedB && requestedB.agentId !== idA ? requestedB : undefined) ??
    (getAgentInfo(DEFAULT_B)?.agentId !== idA ? getAgentInfo(DEFAULT_B) : undefined) ??
    agents.find((a) => a.agentId !== idA) ??
    agents[1] ??
    infoA;
  const idB = infoB.agentId;

  const dA = getDashboardData(window, idA);
  const dB = getDashboardData(window, idB);

  const pickerAgents = agents.map((a) => ({
    agentId: a.agentId,
    label: a.label,
    tier: a.tier,
  }));

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <ExploreLink href={exploreHref('/', { window })} className="text-sm text-white/55">
          ← Dashboard
        </ExploreLink>
      </div>

      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white/90">
            Compare agents
          </h1>
          <p className="mt-1 text-sm text-white/55">
            Two agents side by side · window {window}
          </p>
        </div>
        <ComparePicker agents={pickerAgents} a={idA} b={idB} window={window} />
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <CompareColumn d={dA} side="a" window={window} />
        <CompareColumn d={dB} side="b" window={window} />
      </div>
    </main>
  );
}
