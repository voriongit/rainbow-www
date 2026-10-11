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
  ensureHydrated,
  getAgentInfo,
  getDashboardData,
  getAgents,
  getProvenance,
  isPresetDuration,
  type DashboardData,
  liveDataUnavailable,
} from '../lib/data-source';
import { TIER_COLORS, tierName, tierIndexForScore, type TierKey } from '../lib/tiers';
import { STATUS, tint, healthColor } from '../lib/status-colors';
import { fmtNum, fmtSigned, fmtPct } from '../lib/format';
import { ExploreLink, exploreHref } from '../components/explore-link';
import { Panel } from '../components/panel';
import { LineChart } from '../components/charts/line-chart';
import { ComparePicker } from './compare-picker';
import type { Metadata } from 'next';
import { pageMetadata } from '../lib/page-metadata';

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

/** Distinct accent pair used when both agents resolve to the same tier color,
 *  so the two trajectory lines never collapse into one indistinguishable hue. */
const ACCENT_A = '#22d3ee'; // cyan
const ACCENT_B = '#f0abfc'; // fuchsia

const TREND_RANK: Record<'rising' | 'stable' | 'falling', number> = {
  rising: 1,
  stable: 0,
  falling: -1,
};

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
              {fmtNum(risk.currentAccumulatorValue)}
              <span className="text-white/40"> / </span>
              {fmtNum(risk.peakInWindow)}
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

/** A single trust-delta callout tile (A vs B for one dimension). */
function DeltaTile({
  label,
  valueA,
  valueB,
  delta,
  colorA,
  colorB,
  idA,
  idB,
}: {
  label: string;
  valueA: string;
  valueB: string;
  delta: string;
  colorA: string;
  colorB: string;
  idA: string;
  idB: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-white/40">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2 text-sm font-semibold">
        <span style={{ color: colorA }} title={idA}>
          {valueA}
        </span>
        <span className="text-white/30">vs</span>
        <span style={{ color: colorB }} title={idB}>
          {valueB}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-white/55">{delta}</p>
    </div>
  );
}

/**
 * Trust-delta callouts: the headline gaps between the two agents (score, tier,
 * trend) read straight off each agent's window analytics — no fabrication.
 */
function DeltaCallouts({
  dA,
  dB,
  colorA,
  colorB,
}: {
  dA: DashboardData;
  dB: DashboardData;
  colorA: string;
  colorB: string;
}) {
  const idA = dA.agentInfo.agentId;
  const idB = dB.agentInfo.agentId;
  const scoreA = dA.window.trajectory.current;
  const scoreB = dB.window.trajectory.current;
  const scoreGap = scoreA - scoreB;

  const tierIdxA = tierIndexForScore(scoreA);
  const tierIdxB = tierIndexForScore(scoreB);
  const tierGap = tierIdxA - tierIdxB;

  const trendA = dA.window.trajectory.trend;
  const trendB = dB.window.trajectory.trend;
  const trendGap = TREND_RANK[trendA] - TREND_RANK[trendB];

  const ahead = (gap: number) => (gap > 0 ? idA : gap < 0 ? idB : null);
  const scoreLead = ahead(scoreGap);
  const tierLead = ahead(tierGap);
  const trendLead = ahead(trendGap);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <DeltaTile
        label="Score gap"
        valueA={fmtNum(scoreA)}
        valueB={fmtNum(scoreB)}
        delta={
          scoreGap === 0
            ? 'Even on trust score.'
            : `${fmtNum(Math.abs(scoreGap))} pts apart — ${scoreLead} leads.`
        }
        colorA={colorA}
        colorB={colorB}
        idA={idA}
        idB={idB}
      />
      <DeltaTile
        label="Tier gap"
        valueA={dA.agentInfo.tier}
        valueB={dB.agentInfo.tier}
        delta={
          tierGap === 0
            ? 'Same trust tier.'
            : `${Math.abs(tierGap)} tier${Math.abs(tierGap) === 1 ? '' : 's'} apart — ${tierLead} higher.`
        }
        colorA={colorA}
        colorB={colorB}
        idA={idA}
        idB={idB}
      />
      <DeltaTile
        label="Trend gap"
        valueA={TREND_META[trendA].label}
        valueB={TREND_META[trendB].label}
        delta={
          trendGap === 0
            ? 'Same trajectory direction.'
            : `${trendLead} on the stronger trajectory.`
        }
        colorA={colorA}
        colorB={colorB}
        idA={idA}
        idB={idB}
      />
    </div>
  );
}

/**
 * Overlaid score trajectories — both agents on one shared y-domain via the
 * LineChart multi-series overlay, colored to match the delta callouts.
 */
function OverlayTrajectory({
  dA,
  dB,
  colorA,
  colorB,
  window,
  live,
}: {
  dA: DashboardData;
  dB: DashboardData;
  colorA: string;
  colorB: string;
  window: string;
  live: boolean;
}) {
  const idA = dA.agentInfo.agentId;
  const idB = dB.agentInfo.agentId;
  const toPoints = (d: DashboardData) =>
    d.window.trajectory.samples.map((s) => ({ t: s.timestamp.getTime(), v: s.score }));

  return (
    <Panel
      title="Overlaid trust trajectories"
      subtitle={`${idA} vs ${idB} · window ${window}`}
      footnote={`Both score trajectories on one shared scale, read directly from each agent's windowed analytics. ${live ? 'Live telemetry reported by these agents.' : 'Synthetic deterministic data — no live agents.'}`}
    >
      <LineChart
        id="cmp-overlay"
        points={toPoints(dA)}
        series={[
          { points: toPoints(dA), color: colorA, label: idA },
          { points: toPoints(dB), color: colorB, label: idB },
        ]}
        height={240}
      />
    </Panel>
  );
}

/**
 * Side-by-side factor-health diff. Joins the two agents' 16-factor health by
 * factor code and surfaces the largest divergences first; each row shows both
 * success rates (in spectrum/health colors) and the gap between them. Factors
 * lacking evidence in either agent's window are honestly marked, never guessed.
 */
function FactorDiff({
  dA,
  dB,
  colorA,
  colorB,
  window,
}: {
  dA: DashboardData;
  dB: DashboardData;
  colorA: string;
  colorB: string;
  window: string;
}) {
  const idA = dA.agentInfo.agentId;
  const idB = dB.agentInfo.agentId;
  const byCodeB = new Map(dB.state.factors.map((f) => [f.factorCode, f]));

  const rows = dA.state.factors
    .map((fa) => {
      const fb = byCodeB.get(fa.factorCode);
      const hasA = fa.recentEvidenceCount > 0;
      const hasB = fb != null && fb.recentEvidenceCount > 0;
      const comparable = hasA && hasB;
      const gap = comparable ? fa.currentScore - (fb?.currentScore ?? 0) : 0;
      return { fa, fb, hasA, hasB, comparable, gap };
    })
    // Diverging, comparable factors first (largest gap), then the rest.
    .sort((r1, r2) => {
      if (r1.comparable !== r2.comparable) return r1.comparable ? -1 : 1;
      return Math.abs(r2.gap) - Math.abs(r1.gap);
    });

  const cell = (
    has: boolean,
    score: number | undefined,
    code: string
  ) =>
    has && score != null ? (
      <span className="font-semibold" style={{ color: healthColor(score) }}>
        {fmtPct(score)}
      </span>
    ) : (
      <span className="text-white/30">no data</span>
    );

  return (
    <Panel
      title="Factor-health diff"
      subtitle={`${idA} vs ${idB} · biggest divergences first · last ${window}`}
      footnote="Per-factor success rate over window evidence, joined across both agents. Rows where either agent has no evidence in this window are marked “no data” and excluded from the gap ranking — absence of evidence is not evidence of health."
    >
      <ul className="flex flex-col divide-y divide-white/[0.06]">
        <li className="flex items-center gap-2 pb-1.5 text-[10px] uppercase tracking-wider text-white/35">
          <span className="flex-1">Factor</span>
          <span className="w-14 shrink-0 text-right" style={{ color: colorA }}>
            A
          </span>
          <span className="w-14 shrink-0 text-right" style={{ color: colorB }}>
            B
          </span>
          <span className="w-16 shrink-0 text-right">Gap</span>
        </li>
        {rows.map(({ fa, fb, hasA, hasB, comparable, gap }) => {
          const leadColor = gap > 0 ? colorA : gap < 0 ? colorB : STATUS.neutral;
          return (
            <li key={fa.factorCode} className="flex items-center gap-2 py-1.5 text-xs">
              <ExploreLink
                href={exploreHref(`/factor/${fa.factorCode}`, { window })}
                className="flex-1 truncate text-white/75"
                title={`${fa.factorName} (${fa.factorCode})`}
              >
                {fa.factorName}
              </ExploreLink>
              <span className="w-14 shrink-0 text-right">
                {cell(hasA, fa.currentScore, fa.factorCode)}
              </span>
              <span className="w-14 shrink-0 text-right">
                {cell(hasB, fb?.currentScore, fa.factorCode)}
              </span>
              <span
                className="w-16 shrink-0 text-right text-[11px] font-semibold"
                style={{ color: comparable && gap !== 0 ? leadColor : STATUS.neutralDim }}
              >
                {comparable ? (gap === 0 ? 'even' : fmtSigned(gap * 100, 0)) : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';
  const a = sp.a ?? DEFAULT_A;
  const b = sp.b ?? DEFAULT_B;
  return pageMetadata({
    title: `Compare ${a} vs ${b} · ${window}`,
    description: `${a} and ${b} side by side over the last ${window}: trajectories, risk accumulators and the factor gap.`,
    path: '/compare',
    query: { a, b, window },
  });
}

export default async function ComparePage({ searchParams }: PageProps) {
  await ensureHydrated();
  if (liveDataUnavailable()) return null;
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

  // Line/accent color per agent: prefer each agent's tier color, but if both
  // resolve to the SAME tier hue, fall back to a distinct accent pair so the
  // overlaid trajectories and diff columns stay visually separable.
  const tierColorA = TIER_COLORS[dA.agentInfo.tier as TierKey] ?? STATUS.neutral;
  const tierColorB = TIER_COLORS[dB.agentInfo.tier as TierKey] ?? STATUS.neutral;
  const sameHue = tierColorA === tierColorB;
  const colorA = sameHue ? ACCENT_A : tierColorA;
  const colorB = sameHue ? ACCENT_B : tierColorB;

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

      <DeltaCallouts dA={dA} dB={dB} colorA={colorA} colorB={colorB} />

      <OverlayTrajectory
        dA={dA}
        dB={dB}
        colorA={colorA}
        colorB={colorB}
        window={window}
        live={getProvenance().mode === 'live'}
      />

      <FactorDiff dA={dA} dB={dB} colorA={colorA} colorB={colorB} window={window} />

      <div className="grid gap-6 md:grid-cols-2">
        <CompareColumn d={dA} side="a" window={window} />
        <CompareColumn d={dB} side="b" window={window} />
      </div>
    </main>
  );
}
