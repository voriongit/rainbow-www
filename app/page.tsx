// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * RAINBOW observability dashboard — read-only RSC page.
 *
 * All analytics reads happen server-side through the Rainbow facade;
 * the only client components are the window/agent selectors (URL state,
 * no browser storage). There are no mutation paths to trust data.
 */

import type { Metadata } from 'next';
import {
  ensureHydrated,
  getDashboardData,
  getDelegationSummary,
  getFleetOverview,
  getFleetSparklines,
  getProvenance,
  isPresetDuration,
  PRESET_DURATIONS,
  liveDataUnavailable,
} from './lib/data-source';
import { pageMetadata } from './lib/page-metadata';
import { fmtDateTime, fmtNum } from './lib/format';
import { WindowSelector } from './components/window-selector';
import { AgentSelector } from './components/agent-selector';
import { Stat } from './components/stat';
import { TrajectoryPanel } from './components/panels/trajectory-panel';
import { RiskTrendPanel } from './components/panels/risk-trend-panel';
import { TierDistributionPanel } from './components/panels/tier-distribution-panel';
import { FleetPanel } from './components/panels/fleet-panel';
import { FactorHealthPanel } from './components/panels/factor-health-panel';
import { TransitionsPanel } from './components/panels/transitions-panel';
import { InsightsPanel } from './components/panels/insights-panel';
import { CorrelationsPanel } from './components/panels/correlations-panel';
import { DelegationTeaserPanel } from './components/panels/delegation-teaser-panel';
import { InfoLink } from './components/info-link';
import { ExploreLink, exploreHref } from './components/explore-link';
import { CopyLink } from './components/copy-link';
import { FreshnessIndicator } from './components/freshness-indicator';
import { TierSpectrum } from './components/tier-spectrum';
import { FleetTrendPanel } from './components/panels/fleet-trend-panel';
import { FleetRiskPanel } from './components/panels/fleet-risk-panel';
import { SignalMixPanel } from './components/panels/signal-mix-panel';
import { InstallButton } from './components/pwa/install-button';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ window?: string; agent?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const window = isPresetDuration(params.window) ? params.window : '24h';
  const agent = params.agent?.trim();
  return pageMetadata({
    title: agent ? `${agent} · ${window}` : `Fleet · ${window}`,
    description: agent
      ? `Trust trajectory, risk accumulator, factor health and insights for ${agent} over the last ${window}.`
      : `Fleet trust trend, per-agent risk accumulators, anomaly clusters and insights over the last ${window}.`,
    path: '/',
    query: { agent, window: params.window ? window : undefined },
  });
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  await ensureHydrated();
  if (liveDataUnavailable()) return null;
  // What this page is actually showing, derived from whether real signals
  // exist. Every "synthetic" claim below reads from here, so the copy cannot
  // keep saying "demo" once a real fleet starts reporting.
  const provenance = getProvenance();
  const isLive = provenance.mode === 'live';
  const data = getDashboardData(params.window, params.agent);
  // Fleet is the front door; an agent is a drill-down chosen in the URL.
  const isFleet = !data.agents.some((a) => a.agentId === params.agent);
  const overview = getFleetOverview(data.duration);
  // Delegation is modeled over the stream under a declared policy, so the live
  // deployment (real telemetry only) does not compute or show it.
  const delegationSummary = isLive ? undefined : getDelegationSummary(data.duration);
  const sparklines: Record<string, { t: number; v: number }[]> = {};
  for (const s of getFleetSparklines(data.duration)) sparklines[s.agentId] = s.points;

  const clusters = data.fleet.anomalyClusters;
  const firstCluster = clusters[0];
  const clusterTip = firstCluster
    ? `1 cluster = one group of agents that share the same failing factors. Here: ${firstCluster.agentIds.join(', ')} on ${firstCluster.commonFactors.join(' + ')}. The list under “Correlated events” counts individual co-occurrences, a different noun.`
    : 'A cluster is a group of agents that share the same failing factors in the window. Individual co-occurrences are listed under “Correlated events”.';
  // The two agents under the most accumulated risk — the comparison worth making first.
  const [hotA, hotB] = overview.rows
    .slice()
    .sort((a, b) => b.risk.peakInWindow - a.risk.peakInWindow);
  const compareHref = exploreHref('/compare', {
    a: hotA?.agentId,
    b: hotB?.agentId,
    window: data.duration,
  });

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-4">
        {/* Brand row */}
        <div className="flex items-center gap-2 text-[11px]">
          <a
            href="https://vorion.org"
            className="font-semibold tracking-wider text-white/55 transition-colors hover:text-white/85"
          >
            VORION ↗
          </a>
          <span className="text-white/20">/</span>
          <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 font-medium text-white/45">
            {isLive ? 'Live telemetry' : 'Synthetic demo'}
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, #f87171, #fde047, #4ade80, #22d3ee, #a78bfa)',
                }}
              >
                RAINBOW
              </span>{' '}
              <span className="text-white/85">Trust Analytics Observatory</span>
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Recorded Analytics Involving Non-Binary Orchestration Window — read-only
              observability over the Trust Signal Bus.
            </p>
            <p className="mt-0.5 text-xs text-white/45">
              Non-binary = continuous trust state (a 0–1000 score, 16 factors, trajectories), not a
              pass/fail bit.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AgentSelector
              agents={data.agents.map((a) => ({
                agentId: a.agentId,
                label: a.label,
                tier: a.tier,
              }))}
              current={isFleet ? '' : data.agentId}
              duration={data.duration}
              archetypes={!isLive}
            />
            <WindowSelector
              durations={PRESET_DURATIONS}
              current={data.duration}
              agentId={isFleet ? undefined : data.agentId}
            />
            <ExploreLink
              href="/concepts"
              className="text-xs text-white/45"
              title="Browse the concept glossary"
            >
              Concepts ↗
            </ExploreLink>
            <ExploreLink
              href="/compare"
              className="text-xs text-white/45"
              title="Compare two agents side by side"
            >
              Compare ↗
            </ExploreLink>
            {!isLive && (
              <ExploreLink
                href="/lab"
                className="text-xs text-white/45"
                title="Delegation health — derived under a modeled orchestration policy"
              >
                Lab ↗
              </ExploreLink>
            )}
            <ExploreLink
              href={exploreHref('/report', {
                window: data.duration,
                agent: isFleet ? undefined : data.agentId,
              })}
              className="text-xs text-white/45"
              title="Print-optimized brief of this view (fleet or the selected agent)"
            >
              Report ↗
            </ExploreLink>
            <CopyLink />
            <span className="text-[11px] text-white/30" title="Press ⌘K (or Ctrl-K) to search">
              ⌘K
            </span>
          </div>
        </div>

        {/* The brief — what this is, what the data is, and the one move to make. */}
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-3">
          <ul className="flex flex-col gap-1 text-xs leading-relaxed text-cyan-100/80">
            <li>
              <span className="font-semibold text-cyan-100">What it computes:</span> per-agent trust
              trajectories, the rolling risk accumulator, 16-factor health and fleet anomaly
              clusters, from Trust Signal Bus events. Read-only.
            </li>
            <li>
              <span className="font-semibold text-cyan-100">
                {isLive ? 'Live data:' : 'Synthetic data:'}
              </span>{' '}
              {isLive
                ? `signals reported by ${provenance.agentCount} real agent${provenance.agentCount === 1 ? '' : 's'}.`
                : `a seeded fleet of ${data.agents.length} scripted agents. No live agents, no real trust decisions.`}{' '}
              Computed {fmtDateTime(data.computedAt)} UTC.{' '}
              <FreshnessIndicator computedAt={data.computedAt.toISOString()} />
            </li>
            <li>
              <span className="font-semibold text-cyan-100">Start here:</span>{' '}
              {firstCluster ? (
                <>
                  <ExploreLink
                    href={exploreHref(`/cluster/${firstCluster.clusterId}`, { window: data.duration })}
                    className="font-medium text-cyan-200 underline"
                  >
                    open the anomaly cluster
                  </ExploreLink>{' '}
                  ({firstCluster.agentIds.length} agents failing {firstCluster.commonFactors.join(' + ')})
                </>
              ) : (
                'no anomaly cluster in this window'
              )}
              {hotA && hotB ? (
                <>
                  {', or '}
                  <ExploreLink href={compareHref} className="font-medium text-cyan-200 underline">
                    compare {hotA.agentId} with {hotB.agentId}
                  </ExploreLink>
                  , the two highest risk peaks.
                </>
              ) : (
                '.'
              )}
            </li>
          </ul>
          <details className="mt-2 text-xs text-cyan-200/70">
            <summary className="cursor-pointer select-none font-medium text-cyan-200/90 [touch-action:manipulation]">
              How to read this
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1 leading-relaxed text-cyan-100/55">
              <li>
                <span className="font-medium text-cyan-100/80">Three moves:</span> pick a window, pick
                an agent (or stay on the fleet), then open an insight to see the signals behind it.
              </li>
              <li>
                <span className="font-medium text-cyan-100/80">Trust spectrum:</span> every agent sits in a
                tier T0→T7 (red→violet). Tap a band to explore that tier.
              </li>
              <li>
                <span className="font-medium text-cyan-100/80">Risk accumulator:</span> each agent&apos;s
                rolling 24h sum of failure weight (P(T) × R). The{' '}
                <span className="font-medium text-cyan-100/80">Elbow</span> marks where it first crosses
                the degraded or circuit-breaker threshold, the moment continuous risk would become a
                discrete state change.
              </li>
              <li>
                {isLive
                  ? 'This view is read-only — audit infrastructure and trust telemetry. Rainbow observes; it does not make trust decisions.'
                  : 'Everything here is synthetic and read-only — audit infrastructure and trust telemetry, not live governance.'}
              </li>
              {!isLive && (
                <li>
                  Next: explore the stack at{' '}
                  <a href="https://vorion.org" className="underline hover:text-cyan-100">
                    vorion.org
                  </a>
                  , or watch agents get audited &amp; gated at{' '}
                  <a href="https://demo.vorion.org" className="underline hover:text-cyan-100">
                    demo.vorion.org
                  </a>
                  .
                </li>
              )}
            </ul>
          </details>
        </div>

        {/* Spectrum accent hairline */}
        <div
          className="h-px w-full rounded-full opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(90deg,#6b7280,#ef4444,#f97316,#eab308,#22c55e,#06b6d4,#6366f1,#a855f7)',
          }}
          aria-hidden="true"
        />
      </header>

      {/* Rainbow trust tier spectrum — the hero visual */}
      <TierSpectrum
        byTier={data.fleet.fleet.byTier}
        totalAgents={data.fleet.fleet.totalAgents}
        averageScore={data.fleet.fleet.averageScore}
        medianScore={data.fleet.fleet.medianScore}
        duration={data.duration}
        emptyReason={isLive ? 'none reporting' : 'none in this seed'}
      />

      {/* Fleet stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Fleet agents" value={String(data.fleet.fleet.totalAgents)} />
        <Stat
          label={
            <>
              Fleet mean score
              <InfoLink slug="metric-composite-score" />
            </>
          }
          value={fmtNum(data.fleet.fleet.averageScore)}
          sub={`median ${fmtNum(data.fleet.fleet.medianScore)}`}
        />
        <Stat
          label={`Signals · ${data.duration}`}
          value={String(data.fleetSignalCount)}
          sub="fleet-wide"
          tip="Total Trust Signal Bus events emitted across the whole fleet in the selected window."
        />
        <Stat
          label={
            <>
              Anomaly clusters
              <InfoLink slug="metric-anomaly-cluster" />
            </>
          }
          value={String(clusters.length)}
          color={clusters.length > 0 ? '#ef4444' : undefined}
          sub={
            firstCluster
              ? `${firstCluster.agentIds.length} agents sharing ${firstCluster.commonFactors.join(' + ')}`
              : 'none detected'
          }
          tip={clusterTip}
        />
      </div>

      {/* Insights — scoped to what the panels below draw */}
      {isFleet ? (
        <InsightsPanel
          insights={overview.insights}
          window={data.duration}
          subtitle={`Fleet · ${overview.agentCount} agents · last ${data.duration}`}
          emptyScope="fleet-wide"
        />
      ) : (
        <InsightsPanel
          insights={data.insights}
          window={data.duration}
          subtitle={`${data.agentId} · last ${data.duration} · same series as the panels below`}
        />
      )}

      {/* Conversion CTAs — bridge to the wider Vorion ecosystem (claim-safe) */}
      {!isLive && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-3 text-sm">
          <span className="text-white/45">Take it further:</span>
          <a
            href="https://vorion.org"
            className="font-medium text-cyan-300/90 transition-colors hover:text-cyan-200"
          >
            Explore the Vorion stack ↗
          </a>
          <a href="https://demo.vorion.org" className="text-white/70 transition-colors hover:text-white">
            See agents audited &amp; gated ↗
          </a>
          <a
            href="https://www.npmjs.com/package/@vorionsys/rainbow"
            className="text-white/70 transition-colors hover:text-white"
          >
            @vorionsys/rainbow on npm ↗
          </a>
          <a
            href="https://www.npmjs.com/package/@vorionsys/basis-spec"
            className="text-white/70 transition-colors hover:text-white"
          >
            BASIS spec on npm ↗
          </a>
        </div>
      )}

      {/* Primary panels — fleet scope by default, one agent when chosen */}
      {isFleet ? (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <FleetTrendPanel overview={overview} />
            </div>
            <TierDistributionPanel fleet={data.fleet.fleet} duration={data.duration} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <FleetRiskPanel overview={overview} />
            </div>
            <SignalMixPanel
              distribution={overview.distribution}
              subtitle={`Fleet · pooled counts · last ${data.duration}`}
              duration={data.duration}
            />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <TrajectoryPanel
                trajectory={data.window.trajectory}
                agentId={data.agentId}
                duration={data.duration}
              />
            </div>
            <TierDistributionPanel fleet={data.fleet.fleet} duration={data.duration} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <RiskTrendPanel
                risk={data.correctedRisk}
                agentId={data.agentId}
                duration={data.duration}
              />
            </div>
            <TransitionsPanel
              transitions={data.window.transitions}
              distribution={data.window.distribution}
              agentId={data.agentId}
              duration={data.duration}
            />
          </div>
        </>
      )}

      <FleetPanel
        fleet={data.fleet}
        agents={data.agents}
        simulated={!isLive}
        selectedAgentId={isFleet ? undefined : data.agentId}
        duration={data.duration}
        sparklines={sparklines}
      />

      <CorrelationsPanel correlations={data.fleet.correlations} window={data.duration} />

      {!isFleet && <FactorHealthPanel state={data.state} duration={data.duration} />}

      {/* Modeled — kept below every grounded section, with its own badge. */}
      <div className="grid gap-6 lg:grid-cols-3">
        {delegationSummary && (
          <DelegationTeaserPanel summary={delegationSummary} window={data.duration} />
        )}
        <div className={`flex flex-col justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4 text-xs text-white/55 ${isLive ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
          <p className="font-semibold uppercase tracking-wider text-white/55">A guided path</p>
          <ol className="list-inside list-decimal space-y-1 leading-relaxed">
            <li>
              {firstCluster ? (
                <ExploreLink
                  href={exploreHref(`/cluster/${firstCluster.clusterId}`, { window: data.duration })}
                  className="text-cyan-300/85"
                >
                  Open the cluster
                </ExploreLink>
              ) : (
                'Open a cluster (none in this window)'
              )}{' '}
              to see which agents fail together.
            </li>
            <li>
              Follow a shared factor
              {firstCluster?.commonFactors[0] ? (
                <>
                  {' '}
                  (
                  <ExploreLink
                    href={exploreHref(`/factor/${firstCluster.commonFactors[0]}`, {
                      window: data.duration,
                    })}
                    className="text-cyan-300/85"
                  >
                    {firstCluster.commonFactors[0]}
                  </ExploreLink>
                  )
                </>
              ) : null}{' '}
              across the fleet.
            </li>
            <li>
              <ExploreLink href={compareHref} className="text-cyan-300/85">
                Compare
              </ExploreLink>{' '}
              two agents factor by factor.
            </li>
            {!isLive && (
              <li>
                Try a routing policy in the{' '}
                <ExploreLink href={exploreHref('/lab', { window: data.duration })} className="text-cyan-300/85">
                  Lab
                </ExploreLink>{' '}
                (modeled, not grounded).
              </li>
            )}
          </ol>
          <p className="text-[11px] text-white/45">
            <ExploreLink href="/concepts" className="text-white/55">
              Concepts
            </ExploreLink>{' '}
            is the dictionary for every term on this page.
          </p>
        </div>
      </div>

      {/* Scope & limitations */}
      <footer className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">
          Scope & limitations
        </h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] leading-relaxed text-white/40">
          <li>
            {isLive ? (
              <>
                <span className="text-white/55">Live data</span> — {provenance.signalCount} signal
                {provenance.signalCount === 1 ? '' : 's'} ingested via POST /api/signals. Scores are the
                producer&apos;s declared <code>scoreAfter</code> where sent, otherwise the accumulated
                deltas rainbow actually received.
              </>
            ) : (
              <>
                <span className="text-white/55">Synthetic data</span> — a deterministic seeded simulator
                stands in for live ecosystem signal producers. Agent labels are scripted archetypes
                (steady, degrading, recovering, dormant, compromised), not computed state; read the
                current trend from the trajectory panel.
              </>
            )}
          </li>
          <li>
            <span className="text-white/55">Source</span> — {provenance.reason}
          </li>
          {isLive ? (
            <li>
              <span className="text-white/55">Grounded</span> — every figure is computed from the
              signals agents reported, and cross-agent correlation is derived from co-occurrence in
              that stream. Delegation is not shown: no escalation events are ingested yet.
            </li>
          ) : (
            <li>
              <span className="text-white/55">Grounded vs modeled</span> — cross-agent correlation is
              derived from real signal co-occurrence; delegation health is modeled under a declared
              policy (the simulator has no native agent-to-agent delegation), shown as a
              &ldquo;modeled policy&rdquo; teaser with full logic in the Lab.
            </li>
          )}
          <li>
            <span className="text-white/55">Read-only</span> — no mutation paths to trust data, no
            browser storage; view state lives in the URL.
          </li>
        </ul>
        <p className="mt-3 text-[11px] text-white/30">
          <a href="https://www.npmjs.com/package/@vorionsys/rainbow" className="underline hover:text-white/60">
            @vorionsys/rainbow
          </a>{' '}
          · Vorion AI governance ecosystem ·{' '}
          <ExploreLink href="/concepts" className="text-white/40">
            Browse all concepts
          </ExploreLink>{' '}
          ·{' '}
          {!isLive && (
            <>
              <ExploreLink
                href="/model"
                className="text-white/40"
                title="Illustrative model of the agent-control layer — not connected to live agents"
              >
                Control model
              </ExploreLink>{' '}
              ·{' '}
            </>
          )}
          <a href="https://vorion.org" className="underline hover:text-white/60">
            vorion.org
          </a>{' '}
          ·{' '}
          <a href="https://demo.vorion.org" className="underline hover:text-white/60">
            demo.vorion.org
          </a>{' '}
          {!isLive && <>· <InstallButton /></>}
        </p>
      </footer>
    </main>
  );
}
