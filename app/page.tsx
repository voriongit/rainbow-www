// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * RAINBOW observability dashboard — read-only RSC page.
 *
 * All analytics reads happen server-side through the Rainbow facade;
 * the only client components are the window/agent selectors (URL state,
 * no browser storage). There are no mutation paths to trust data.
 */

import { getDashboardData, PRESET_DURATIONS } from './lib/data-source';
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

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ window?: string; agent?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const data = getDashboardData(params.window, params.agent);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-4">
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
            <p className="mt-1 text-sm text-white/45">
              Recorded Analytics Involving Non-Binary Orchestration Window — read-only
              observability over the Trust Signal Bus.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AgentSelector
              agents={data.agents.map((a) => ({
                agentId: a.agentId,
                label: a.label,
                tier: a.tier,
              }))}
              current={data.agentId}
              duration={data.duration}
            />
            <WindowSelector
              durations={PRESET_DURATIONS}
              current={data.duration}
              agentId={data.agentId}
            />
          </div>
        </div>

        {/* Synthetic-data notice */}
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-2.5">
          <p className="text-xs leading-relaxed text-cyan-200/80">
            <span className="font-semibold">Synthetic data.</span> This demo renders RAINBOW
            analytics over a deterministic, seeded fleet simulator — no live agents, no real
            trust decisions. The dashboard is strictly read-only. Computed{' '}
            {fmtDateTime(data.computedAt)} UTC.
          </p>
        </div>
      </header>

      {/* Fleet stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Fleet agents" value={String(data.fleet.fleet.totalAgents)} />
        <Stat
          label="Fleet mean score"
          value={fmtNum(data.fleet.fleet.averageScore)}
          sub={`median ${fmtNum(data.fleet.fleet.medianScore)}`}
        />
        <Stat
          label={`Signals · ${data.duration}`}
          value={String(data.fleetSignalCount)}
          sub="fleet-wide"
        />
        <Stat
          label="Anomaly clusters"
          value={String(data.fleet.anomalyClusters.length)}
          color={data.fleet.anomalyClusters.length > 0 ? '#ef4444' : undefined}
          sub={data.fleet.anomalyClusters.length > 0 ? 'attention required' : 'none detected'}
        />
      </div>

      {/* Primary panels */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrajectoryPanel
            trajectory={data.window.trajectory}
            agentId={data.agentId}
            duration={data.duration}
          />
        </div>
        <TierDistributionPanel fleet={data.fleet.fleet} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
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

      <FleetPanel fleet={data.fleet} agents={data.agents} selectedAgentId={data.agentId} />

      <FactorHealthPanel state={data.state} duration={data.duration} />

      {/* Scope & limitations */}
      <footer className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">
          Scope & limitations
        </h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] leading-relaxed text-white/40">
          <li>
            Data is generated by a deterministic seeded simulator standing in for the shared
            ecosystem signal producers; archetypes (steady, degrading, recovering, dormant,
            compromised cluster) are scripted to exercise every analytics surface.
          </li>
          <li>
            The risk accumulator uses the corrected canonical contribution P(T) × R computed
            dashboard-side; it replaces the R-only proxy in @vorionsys/rainbow@0.1.0 pending
            the decontamination pass.
          </li>
          <li>
            Delegation health and cross-agent correlation feeds are not wired in this demo
            (no DelegationService / CrossAgentCorrelator upstream).
          </li>
          <li>
            Read-only by construction: no mutation paths to trust data, no browser storage;
            view state lives in the URL.
          </li>
        </ul>
        <p className="mt-3 text-[11px] text-white/30">
          @vorionsys/rainbow · Vorion AI governance ecosystem ·{' '}
          <a href="https://vorion.org" className="underline hover:text-white/60">
            vorion.org
          </a>
        </p>
      </footer>
    </main>
  );
}
