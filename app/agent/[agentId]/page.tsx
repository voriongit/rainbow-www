// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Agent profile — the richest drill-down view. Resolves one agent's full
 * trust posture in a single read pass (windowed analytics, corrected risk
 * accumulator, 16-factor health, observation-ceiling what-if) plus its raw
 * signal log. Read-only RSC; every categorical value links to its concept or
 * its own drill-down, and the active window is carried into every link.
 */

import { notFound } from 'next/navigation';
import { TrendingUp, TrendingDown, Minus, Check, X } from 'lucide-react';
import {
  getAgentInfo,
  getDashboardData,
  getAgentSignals,
  isPresetDuration,
} from '../../lib/data-source';
import { conceptSlug } from '../../lib/glossary';
import { TIER_COLORS, tierName, type TierKey } from '../../lib/tiers';
import {
  STATUS,
  LIFECYCLE_COLORS,
  healthColor,
  tint,
} from '../../lib/status-colors';
import { fmtNum, fmtSigned, fmtPct, fmtDateTime } from '../../lib/format';
import { ExploreLink, exploreHref } from '../../components/explore-link';
import { InfoLink } from '../../components/info-link';
import { Panel, EmptyState } from '../../components/panel';
import { SignalLog } from '../../components/signal-log';
import { InsightsPanel } from '../../components/panels/insights-panel';
import { LineChart } from '../../components/charts/line-chart';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ window?: string }>;
}

const TREND_META = {
  rising: { Icon: TrendingUp, color: STATUS.good, label: 'Rising' },
  falling: { Icon: TrendingDown, color: STATUS.bad, label: 'Falling' },
  stable: { Icon: Minus, color: STATUS.neutral, label: 'Stable' },
} as const;

const GROUP_ORDER = ['Foundation', 'Security', 'Agency', 'Maturity', 'Evolution'];

/** A labelled mini-statistic with an inline "explain" affordance. */
function MiniStat({
  label,
  slug,
  children,
}: {
  label: string;
  slug?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-white/40">
        {label}
        {slug ? <InfoLink slug={slug} label={label} /> : null}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default async function AgentProfilePage({ params, searchParams }: PageProps) {
  const { agentId } = await params;
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';

  const info = getAgentInfo(agentId);
  if (!info) notFound();

  const d = getDashboardData(window, agentId);
  const signals = getAgentSignals(agentId, window);

  const tier = info.tier as TierKey;
  const tierColor = TIER_COLORS[tier] ?? STATUS.neutral;
  const lifecycleColor = LIFECYCLE_COLORS[info.lifecycleState] ?? STATUS.neutral;

  const traj = d.window.trajectory;
  const trend = TREND_META[traj.trend];
  const risk = d.correctedRisk;
  const impact = d.state.observationImpact;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-4">
        <ExploreLink href={exploreHref('/', { window })} className="text-sm text-white/55">
          ← Dashboard
        </ExploreLink>
        <ExploreLink
          href={exploreHref('/proof', { agent: agentId, window })}
          className="text-sm text-white/55"
        >
          Proof chain →
        </ExploreLink>
      </div>

      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-mono text-2xl font-extrabold tracking-tight text-white/90">
              {agentId}
            </h1>
            <p className="mt-1 text-sm text-white/55">{info.label}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExploreLink href={exploreHref(`/tier/${tier}`, { window })}>
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ color: tierColor, backgroundColor: tint(tierColor) }}
              >
                {tier} · {tierName(tier)}
              </span>
            </ExploreLink>
            <ExploreLink href={`/concepts/${conceptSlug.lifecycle(info.lifecycleState)}`}>
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ color: lifecycleColor, backgroundColor: tint(lifecycleColor) }}
              >
                {info.lifecycleState}
              </span>
            </ExploreLink>
          </div>
        </div>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Observation:{' '}
          <ExploreLink
            href={`/concepts/${conceptSlug.observation(info.observationTier)}`}
            className="normal-case text-white/60"
          >
            {info.observationTier.replace(/_/g, ' ')}
          </ExploreLink>{' '}
          · window {window} · score {fmtNum(info.score)} · {info.signalCount} lifetime signals
        </p>
      </header>

      {/* Insights for this agent */}
      <InsightsPanel
        insights={d.insights}
        window={window}
        subtitle={`${agentId} · rule-based findings · last ${window}`}
      />

      {/* Primary panels */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Score trajectory */}
        <div className="lg:col-span-2">
          <Panel
            title="Score trajectory"
            subtitle={`${agentId} · last ${window}`}
            badge={
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ color: tierColor, backgroundColor: tint(tierColor) }}
              >
                {tier} · {tierName(tier)}
              </span>
            }
          >
            {traj.samples.length === 0 ? (
              <EmptyState message={`No signals for ${agentId} in the last ${window}.`} />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
                  <MiniStat label="Current" slug="metric-composite-score">
                    <p className="text-2xl font-bold" style={{ color: tierColor }}>
                      {fmtNum(traj.current)}
                    </p>
                  </MiniStat>
                  <MiniStat label="Trend" slug="metric-trajectory">
                    <p
                      className="flex items-center gap-1.5 text-sm font-semibold"
                      style={{ color: trend.color }}
                    >
                      <trend.Icon size={16} aria-hidden /> {trend.label}
                    </p>
                  </MiniStat>
                  <MiniStat label="Velocity" slug="metric-velocity">
                    <p className="text-sm font-semibold text-white/85">
                      {fmtSigned(traj.velocity)} <span className="text-white/40">pts/h</span>
                    </p>
                  </MiniStat>
                  <MiniStat label="Acceleration" slug="metric-acceleration">
                    <p className="text-sm font-semibold text-white/85">
                      {fmtSigned(traj.acceleration, 2)}{' '}
                      <span className="text-white/40">pts/h²</span>
                    </p>
                  </MiniStat>
                  <MiniStat label="Range">
                    <p className="text-sm font-semibold text-white/85">
                      {fmtNum(traj.min)}–{fmtNum(traj.max)}
                    </p>
                  </MiniStat>
                </div>
                <LineChart
                  id="agent-traj"
                  points={traj.samples.map((s) => ({ t: s.timestamp.getTime(), v: s.score }))}
                  color={tierColor}
                  regression
                  height={210}
                  valueLabel="Score"
                />
              </div>
            )}
          </Panel>
        </div>

        {/* Risk accumulator */}
        <Panel
          title="Risk accumulator"
          subtitle={`${agentId} · rolling 24h · last ${window}`}
          badge={
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize"
              style={{
                color: STATUS[risk.trend === 'escalating' ? 'bad' : risk.trend === 'de-escalating' ? 'good' : 'neutral'],
                backgroundColor: tint(
                  STATUS[risk.trend === 'escalating' ? 'bad' : risk.trend === 'de-escalating' ? 'good' : 'neutral']
                ),
              }}
            >
              {risk.trend}
            </span>
          }
          footnote="Corrected accumulator: each failure contributes P(T) × R per the BASIS canonical formula. Thresholds: warning ≥ 60, degraded ≥ 120, circuit breaker ≥ 240."
        >
          {risk.samples.length === 0 ? (
            <EmptyState message={`No signals for ${agentId} in the last ${window}.`} />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <MiniStat label="Current" slug="metric-risk-accumulator">
                  <p className="text-2xl font-bold text-white">
                    {fmtNum(risk.currentAccumulatorValue, 1)}
                  </p>
                </MiniStat>
                <MiniStat label="Peak in window" slug="formula-risk-accumulator">
                  <p className="text-sm font-semibold text-white/85">
                    {fmtNum(risk.peakInWindow, 1)}
                  </p>
                </MiniStat>
                <MiniStat label="Warning breaches">
                  <p className="text-sm font-semibold" style={{ color: STATUS.warn }}>
                    {risk.warningBreaches}
                  </p>
                </MiniStat>
                <MiniStat label="Degraded breaches">
                  <p className="text-sm font-semibold" style={{ color: STATUS.bad }}>
                    {risk.degradedBreaches}
                  </p>
                </MiniStat>
              </div>
              <LineChart
                id="agent-risk"
                points={risk.samples.map((s) => ({ t: s.timestamp.getTime(), v: s.value }))}
                color={STATUS.warnAlt}
                height={210}
                valueLabel="Accumulator"
                yDomain={[0, Math.max(risk.peakInWindow * 1.2, 240 * 1.15)]}
                thresholds={[
                  { value: 60, label: 'warn', color: STATUS.warn },
                  { value: 120, label: 'degraded', color: STATUS.warnAlt },
                  { value: 240, label: 'breaker', color: STATUS.bad },
                ]}
              />
            </div>
          )}
        </Panel>
      </div>

      {/* Factor health — full width */}
      <Panel
        title="Factor health"
        subtitle={`${agentId} · 16 canonical trust factors · last ${window}`}
        footnote="Success rate per factor over window evidence. Factors with no evidence in this window are shown as “no data” — absence of evidence is not evidence of health."
      >
        {d.state.factors.every((f) => f.recentEvidenceCount === 0) ? (
          <EmptyState message={`No factor evidence for ${agentId} in the last ${window}.`} />
        ) : (
          <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
            {GROUP_ORDER.map((group) => {
              const factors = d.state.factors.filter((f) => f.group === group);
              if (factors.length === 0) return null;
              return (
                <div key={group}>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    {group}
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {factors.map((factor) => {
                      const noEvidence = factor.recentEvidenceCount === 0;
                      const factorTrend = TREND_META[factor.trend];
                      const barColor = healthColor(factor.currentScore);
                      return (
                        <li key={factor.factorCode}>
                          <ExploreLink
                            href={exploreHref(`/factor/${factor.factorCode}`, { window })}
                            variant="block"
                            ariaLabel={`Factor ${factor.factorName} (${factor.factorCode})`}
                            className={`flex items-center gap-3 px-2 py-1 ${noEvidence ? 'opacity-50' : ''}`}
                          >
                            <span className="w-24 shrink-0 truncate text-xs text-white/75">
                              {factor.factorName}
                            </span>
                            <span className="w-20 shrink-0 font-mono text-[10px] text-white/35">
                              {factor.factorCode}
                            </span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                              {!noEvidence && (
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.round(factor.currentScore * 100)}%`,
                                    backgroundColor: barColor,
                                  }}
                                />
                              )}
                            </div>
                            <span className="w-12 shrink-0 text-right text-xs font-semibold text-white/80">
                              {noEvidence ? '—' : fmtPct(factor.currentScore)}
                            </span>
                            {noEvidence ? (
                              <Minus size={13} className="shrink-0 text-slate-600" aria-hidden />
                            ) : (
                              <factorTrend.Icon
                                size={13}
                                style={{ color: factorTrend.color }}
                                className="shrink-0"
                                aria-hidden
                              />
                            )}
                            <span className="w-12 shrink-0 text-right text-[10px] text-white/35">
                              {noEvidence ? 'no data' : `${factor.recentEvidenceCount} ev`}
                            </span>
                            <span
                              className="w-4 shrink-0"
                              title={
                                noEvidence
                                  ? 'No evidence in window'
                                  : factor.meetsMinimum
                                    ? 'Meets tier minimum'
                                    : 'Below tier minimum'
                              }
                            >
                              {noEvidence ? (
                                <span className="text-slate-600" aria-label="No evidence in window">
                                  ·
                                </span>
                              ) : factor.meetsMinimum ? (
                                <Check
                                  size={13}
                                  className="text-emerald-500"
                                  aria-label="Meets tier minimum"
                                />
                              ) : (
                                <X
                                  size={13}
                                  className="text-red-500"
                                  aria-label="Below tier minimum"
                                />
                              )}
                            </span>
                          </ExploreLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Observation ceiling — what if */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel
            title="Observation ceiling — what if"
            subtitle={`${agentId} · trust capped by how observable it is`}
            footnote="An agent cannot be trusted higher than it can be seen. Moving to a more transparent observation tier raises both the ceiling and the reachable trust tier."
          >
            {!impact ? (
              <EmptyState message="No observation-impact analysis available for this agent." />
            ) : (
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                  <MiniStat label="Observation tier" slug="metric-observation-ceiling">
                    <ExploreLink
                      href={`/concepts/${conceptSlug.observation(impact.observationTier)}`}
                      className="text-sm font-semibold text-white/85"
                    >
                      {impact.observationTier.replace(/_/g, ' ')}
                    </ExploreLink>
                  </MiniStat>
                  <MiniStat label="Ceiling">
                    <p className="text-sm font-semibold text-white/85">{fmtNum(impact.ceiling)}</p>
                  </MiniStat>
                  <MiniStat label="Current score">
                    <p className="text-sm font-semibold text-white/85">
                      {fmtNum(impact.currentScore)}
                    </p>
                  </MiniStat>
                  <MiniStat label="Ceiling active">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: impact.ceilingConstraintActive ? STATUS.warn : STATUS.good }}
                    >
                      {impact.ceilingConstraintActive ? 'Yes' : 'No'}
                    </p>
                  </MiniStat>
                </div>
                <div>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Potential if upgraded
                  </h3>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40">
                        <th className="py-1.5 pr-3 font-medium">Observation tier</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Max score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(impact.potentialIfUpgraded).map(([tierKey, maxScore]) => {
                        const isCurrent = tierKey === impact.observationTier;
                        return (
                          <tr key={tierKey} className="border-b border-white/5">
                            <td className="py-1.5 pr-3">
                              <ExploreLink
                                href={`/concepts/${conceptSlug.observation(tierKey)}`}
                                className={isCurrent ? 'text-white/85' : 'text-white/60'}
                              >
                                {tierKey.replace(/_/g, ' ')}
                              </ExploreLink>
                              {isCurrent ? (
                                <span className="ml-2 text-[10px] uppercase tracking-wider text-white/35">
                                  current
                                </span>
                              ) : null}
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-white/80">
                              {fmtNum(maxScore)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Signal log — full width */}
      <Panel
        title="Signal log"
        subtitle={`${agentId} · raw Trust Bus events · last ${window}`}
        footnote="Every categorical field links into its concept or drill-down. Newest first."
      >
        <SignalLog
          signals={signals}
          window={window}
          emptyLabel={`No signals for ${agentId} in the last ${window}.`}
        />
      </Panel>
    </main>
  );
}
