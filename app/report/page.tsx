// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Shareable report snapshot — a print-optimized, single-purpose summary of the
 * current dashboard view. Read-only RSC (only the Print button is a client
 * component); reads exclusively through the existing facade accessors
 * (getDashboardData / getFleetInsights). Mirrors the dashboard's
 * `?window=&agent=` searchParams contract so a report URL is shareable.
 *
 * Print presentation: the screen view stays dark to match the dashboard; the
 * printed/exported output flips to ink-on-white for legibility (see the
 * `print:` utilities below and the `@media print` block in globals.css).
 * Provenance (demo vs live) is derived, never hardcoded.
 */

import {
  ensureHydrated,
  getDashboardData,
  getFleetInsights,
  getProvenance,
} from '../lib/data-source';
import { ProvenanceBanner, ProvenancePill } from '../components/provenance-banner';
import { fmtDateTime, fmtNum, fmtSigned } from '../lib/format';
import { TierSpectrum } from '../components/tier-spectrum';
import { PrintButton } from '../components/print-button';
import { ExploreLink, exploreHref } from '../components/explore-link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ window?: string; agent?: string }>;
}

/** A compact label/value cell, legible on both dark screen and printed white. */
function ReportStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 print:border-black/15 print:bg-transparent">
      <p className="text-[11px] uppercase tracking-wider text-white/40 print:text-black/50">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-white/90 print:text-black">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/45 print:text-black/55">{sub}</p>}
    </div>
  );
}

export default async function ReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  await ensureHydrated();
  const data = getDashboardData(params.window, params.agent);
  const fleetInsights = getFleetInsights(params.window);
  const provenance = getProvenance();

  const fleet = data.fleet.fleet;
  const traj = data.window.trajectory;
  const risk = data.correctedRisk;
  const agent = data.agentInfo;
  const topInsights = fleetInsights
    .slice()
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
    .slice(0, 5);

  return (
    <main className="report-page mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 print:max-w-none print:gap-4 print:py-0">
      {/* Header */}
      <header className="flex flex-col gap-4 print:gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-semibold tracking-wider text-white/55 print:text-black/60">
                VORION
              </span>
              <span className="text-white/20 print:text-black/30">/</span>
              <ProvenancePill provenance={provenance} />
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight print:text-black">
              <span
                className="bg-clip-text text-transparent print:[-webkit-text-fill-color:#000] print:text-black"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, #f87171, #fde047, #4ade80, #22d3ee, #a78bfa)',
                }}
              >
                RAINBOW
              </span>{' '}
              <span className="text-white/85 print:text-black">Trust Analytics Observatory</span>
            </h1>
            <p className="mt-1 text-sm text-white/50 print:text-black/60">
              Snapshot · window {data.duration} · agent{' '}
              <span className="font-mono">{agent.agentId}</span> · computed{' '}
              {fmtDateTime(data.computedAt)} UTC
            </p>
          </div>
          {/* Controls — never printed. */}
          <div className="flex items-center gap-3 print:hidden">
            <PrintButton />
            <ExploreLink
              href={exploreHref('/', { window: data.duration, agent: agent.agentId })}
              className="text-xs text-white/45"
            >
              ← Back to dashboard
            </ExploreLink>
          </div>
        </div>

        <div className="print:border print:border-black/40">
          <ProvenanceBanner provenance={provenance} computedAt={data.computedAt} />
          <p className="mt-2 text-xs text-white/45 print:text-black/70">
            RAINBOW is read-only. Do not treat any figure here as an operational control decision.
          </p>
        </div>

        {/* Spectrum accent hairline */}
        <div
          className="h-px w-full rounded-full opacity-60 print:hidden"
          style={{
            backgroundImage:
              'linear-gradient(90deg,#6b7280,#ef4444,#f97316,#eab308,#22c55e,#06b6d4,#6366f1,#a855f7)',
          }}
          aria-hidden="true"
        />
      </header>

      {/* Trust spectrum — the hero visual */}
      <section className="print:break-inside-avoid">
        <TierSpectrum
          byTier={fleet.byTier}
          totalAgents={fleet.totalAgents}
          averageScore={fleet.averageScore}
          medianScore={fleet.medianScore}
          duration={data.duration}
        />
      </section>

      {/* Key fleet stats */}
      <section className="flex flex-col gap-3 print:break-inside-avoid">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50 print:text-black/60">
          Fleet summary · last {data.duration}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <ReportStat label="Fleet agents" value={String(fleet.totalAgents)} />
          <ReportStat
            label="Mean score"
            value={fmtNum(fleet.averageScore)}
            sub={`median ${fmtNum(fleet.medianScore)}`}
          />
          <ReportStat label="Median score" value={fmtNum(fleet.medianScore)} />
          <ReportStat
            label={`Signals · ${data.duration}`}
            value={String(data.fleetSignalCount)}
            sub="fleet-wide"
          />
          <ReportStat
            label="Anomaly clusters"
            value={String(data.fleet.anomalyClusters.length)}
            sub={data.fleet.anomalyClusters.length > 0 ? 'attention required' : 'none detected'}
          />
        </div>
      </section>

      {/* Selected agent headline metrics */}
      <section className="flex flex-col gap-3 print:break-inside-avoid">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50 print:text-black/60">
          Selected agent · <span className="font-mono normal-case">{agent.agentId}</span> ·{' '}
          {agent.label}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <ReportStat label="Tier" value={`${agent.tier}`} />
          <ReportStat label="Current score" value={fmtNum(traj.current)} sub={agent.lifecycleState} />
          <ReportStat label="Trend" value={traj.trend} sub={`${fmtSigned(traj.velocity)} pts/h`} />
          <ReportStat label="Range" value={`${fmtNum(traj.min)}–${fmtNum(traj.max)}`} />
          <ReportStat
            label="Risk accumulator"
            value={fmtNum(risk.currentAccumulatorValue, 1)}
            sub={`peak ${fmtNum(risk.peakInWindow, 1)} · ${risk.trend}`}
          />
          <ReportStat
            label="Breaches"
            value={`${risk.warningBreaches}/${risk.degradedBreaches}`}
            sub="warn / degraded"
          />
        </div>
      </section>

      {/* Top fleet insights */}
      <section className="flex flex-col gap-3 print:break-inside-avoid">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50 print:text-black/60">
          Top fleet insights · last {data.duration}
        </h2>
        {topInsights.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/40 print:border-black/20 print:text-black/50">
            Nothing flagged fleet-wide in this window.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {topInsights.map((insight) => (
              <li
                key={insight.insightId}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 print:break-inside-avoid print:border-black/15 print:bg-transparent"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide">
                  <span className="font-semibold text-white/70 print:text-black/70">
                    {insight.category.replace(/_/g, ' ')}
                  </span>
                  <span className="text-white/40 print:text-black/50">· {insight.severity}</span>
                  <span className="ml-auto normal-case text-white/30 print:text-black/45">
                    {fmtDateTime(insight.detectedAt)} UTC
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-white/90 print:text-black">
                  {insight.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-white/60 print:text-black/70">
                  {insight.description}
                </p>
                {insight.agentIds.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-white/45 print:text-black/55">
                    Agents: {insight.agentIds.join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Footer — provenance + honest scope, always printed. */}
      <footer className="mt-2 border-t border-white/10 pt-4 text-[11px] leading-relaxed text-white/40 print:border-black/20 print:text-black/55">
        <p>
          <span className="font-semibold text-white/55 print:text-black/70">
            Synthetic data, read-only by construction.
          </span>{' '}
          Generated by a deterministic seeded simulator standing in for the shared ecosystem signal
          producers. No mutation paths to trust data; view state lives in the URL. @vorionsys/rainbow
          · audit infrastructure & trust telemetry · vorion.org · demo.vorion.org
        </p>
        <p className="mt-1.5">Report computed {fmtDateTime(data.computedAt)} UTC.</p>
      </footer>
    </main>
  );
}
