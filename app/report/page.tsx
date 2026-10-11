// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Report — a one-agent or one-fleet brief, print-optimized. This is the page a
 * reader forwards, so it carries everything needed to read it cold: window,
 * scope, score and trend, the accumulator against its thresholds, the factors
 * below the tier minimum, the signal mix, the open limitations, when it was
 * generated and by which package version.
 *
 * Scope is the `agent` searchParam: present and known → that agent's brief;
 * absent → the fleet brief. Every insight printed here must carry the same
 * scope as the figures beside it; if one does not, the report refuses to
 * render rather than freeze a contradictory snapshot into a PDF.
 *
 * Print presentation: the screen view stays dark; printed output flips to
 * ink-on-white (the `print:` utilities and the `@media print` block in
 * globals.css). Read-only RSC; only the Print button is a client component.
 */

import type { Metadata } from 'next';
import type { RecordedInsight, SignalDistribution } from '@vorionsys/rainbow';
import { VERSION as RAINBOW_VERSION } from '@vorionsys/rainbow';
import { RISK_ACCUMULATOR, TRUST_FACTORS } from '@vorionsys/basis-spec';
import {
  ensureHydrated,
  getDashboardData,
  getFleetOverview,
  getProvenance,
  isPresetDuration,
  liveDataUnavailable,
} from '../lib/data-source';
import { fmtDateTime, fmtNum, fmtPct, fmtSigned } from '../lib/format';
import { accumulatorWord, insightMeta } from '../lib/insights';
import { pageMetadata } from '../lib/page-metadata';
import { tierName, type TierKey } from '../lib/tiers';
import { TierSpectrum } from '../components/tier-spectrum';
import { PrintButton } from '../components/print-button';
import { ExploreLink, exploreHref } from '../components/explore-link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ window?: string; agent?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const window = isPresetDuration(params.window) ? params.window : '24h';
  const agent = params.agent?.trim();
  return pageMetadata({
    title: `Report · ${agent ?? 'Fleet'} · ${window}`,
    description: agent
      ? `Printable brief for ${agent} over the last ${window}: score, trend, risk accumulator, factors below tier minimum, signal mix.`
      : `Printable fleet brief over the last ${window}: fleet trend, per-agent risk accumulators, anomaly clusters, signal mix.`,
    path: '/report',
    query: { agent, window },
  });
}

const H2 = 'text-xs font-semibold uppercase tracking-wider text-white/55 print:text-black/60';
const CARD =
  'rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 print:border-black/15 print:bg-transparent';

/** A compact label/value cell, legible on both dark screen and printed white. */
function ReportStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={CARD}>
      <p className="text-[11px] uppercase tracking-wider text-white/55 print:text-black/50">{label}</p>
      <p className="mt-1 text-xl font-bold text-white/90 print:text-black">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/55 print:text-black/55">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 print:break-inside-avoid">
      <h2 className={H2}>{title}</h2>
      {children}
    </section>
  );
}

function SignalMix({ distribution }: { distribution: SignalDistribution }) {
  const total = distribution.total;
  const outcome = (k: 'success' | 'failure' | 'blocked') =>
    `${distribution.byOutcome[k]} (${fmtPct(total > 0 ? distribution.byOutcome[k] / total : 0)})`;
  const levels = Object.entries(distribution.byRiskLevel).sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <ReportStat label="Signals" value={String(total)} />
      <ReportStat label="Succeeded" value={outcome('success')} />
      <ReportStat label="Failed" value={outcome('failure')} />
      <ReportStat
        label="Blocked"
        value={outcome('blocked')}
        sub={levels.length > 0 ? levels.map(([l, n]) => `${l} ${n}`).join(' · ') : undefined}
      />
    </div>
  );
}

function InsightList({ insights, empty }: { insights: RecordedInsight[]; empty: string }) {
  if (insights.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-white/10 px-4 py-4 text-center text-xs text-white/55 print:border-black/20 print:text-black/50">
        {empty}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {insights.map((insight) => (
        <li key={insight.insightId} className={`${CARD} print:break-inside-avoid`}>
          <p className="text-[10px] uppercase tracking-wide text-white/55 print:text-black/60">
            {insight.category.replace(/_/g, ' ')} · {insight.severity}
          </p>
          <p className="mt-1 text-sm font-semibold text-white/90 print:text-black">{insight.title}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-white/65 print:text-black/70">
            {insight.description}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Insight scope must match the report scope, or the brief is not printed. */
function scopeMismatch(
  insights: RecordedInsight[],
  scope: { kind: 'fleet' } | { kind: 'agent'; agentId: string }
): RecordedInsight | undefined {
  return insights.find((i) => {
    const meta = insightMeta(i);
    if (!meta) return true;
    if (scope.kind === 'fleet') return meta.scope !== 'fleet';
    return meta.scope !== 'agent' || i.agentIds.length !== 1 || i.agentIds[0] !== scope.agentId;
  });
}

export default async function ReportPage({ searchParams }: PageProps) {
  await ensureHydrated();
  if (liveDataUnavailable()) return null;
  const params = await searchParams;
  const provenance = getProvenance();
  const isLive = provenance.mode === 'live';
  const data = getDashboardData(params.window, params.agent);
  const isFleet = !data.agents.some((a) => a.agentId === params.agent);
  const overview = getFleetOverview(data.duration);
  const scopeLabel = isFleet ? `Fleet · ${overview.agentCount} agents` : data.agentId;
  const insights = isFleet ? overview.insights : data.insights;
  const mismatch = scopeMismatch(
    insights,
    isFleet ? { kind: 'fleet' } : { kind: 'agent', agentId: data.agentId }
  );

  return (
    <main className="report-page mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 print:max-w-none print:gap-4 print:py-0">
      {/* Header */}
      <header className="flex flex-col gap-4 print:gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-semibold tracking-wider text-white/55 print:text-black/60">VORION</span>
              <span className="text-white/20 print:text-black/30">/</span>
              <span className="rounded-full border border-amber-400/40 bg-amber-400/[0.08] px-2 py-0.5 font-semibold text-amber-200/90 print:border-black/30 print:bg-transparent print:text-black">
                {isLive ? 'Live telemetry brief' : 'Synthetic demo brief'}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white/90 print:text-black">
              RAINBOW brief · <span className="font-mono">{isFleet ? 'fleet' : data.agentId}</span> ·{' '}
              {data.duration}
            </h1>
            <p className="mt-1 text-sm text-white/55 print:text-black/60">
              Scope {scopeLabel} · window last {data.duration} · generated{' '}
              {fmtDateTime(data.computedAt)} UTC · @vorionsys/rainbow {RAINBOW_VERSION}
            </p>
          </div>
          {/* Controls — never printed. */}
          <div className="flex items-center gap-3 print:hidden">
            {!mismatch && <PrintButton />}
            <ExploreLink
              href={exploreHref('/', { window: data.duration, agent: isFleet ? undefined : data.agentId })}
              className="text-xs text-white/55"
            >
              ← Back to dashboard
            </ExploreLink>
          </div>
        </div>

        {/* Synthetic / read-only disclaimer — prominent, always printed. */}
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-4 py-3 print:border-black/40 print:bg-transparent">
          <p className="text-xs leading-relaxed text-amber-100/90 print:text-black">
            {isLive ? (
              <>
                <span className="font-bold">Live telemetry, read-only.</span> Rendered from signals
                reported by {provenance.agentCount} agents. RAINBOW observes; it does not govern or
                control agents.
              </>
            ) : (
              <>
                <span className="font-bold">Synthetic, illustrative brief — not live data.</span> Rendered
                from a deterministic, seeded fleet simulator: no real agents, no real trust decisions.
                RAINBOW is read-only observability; do not treat any figure here as an operational
                assessment.
              </>
            )}
          </p>
        </div>
      </header>

      {mismatch ? (
        <section
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/[0.07] px-4 py-4 text-sm text-red-100/90"
        >
          <p className="font-semibold">Report not rendered.</p>
          <p className="mt-1 text-xs leading-relaxed">
            The insight “{mismatch.title}” is not scoped to {scopeLabel}, so it would contradict the
            figures beside it. Open the{' '}
            <ExploreLink href={exploreHref('/', { window: data.duration })} className="underline">
              dashboard
            </ExploreLink>{' '}
            instead.
          </p>
        </section>
      ) : isFleet ? (
        <>
          <Section title={`Fleet · last ${data.duration}`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ReportStat label="Agents" value={String(overview.agentCount)} />
              <ReportStat
                label="Mean score"
                value={fmtNum(overview.mean.end)}
                sub={`from ${fmtNum(overview.mean.start)} at window start`}
              />
              <ReportStat
                label="Median score"
                value={fmtNum(overview.median.end)}
                sub={`from ${fmtNum(overview.median.start)}`}
              />
              <ReportStat
                label="Agent trends"
                value={`${overview.rows.filter((r) => r.trend === 'falling').length} falling`}
                sub={`${overview.rows.filter((r) => r.trend === 'rising').length} rising · ${overview.rows.filter((r) => r.trend === 'stable').length} stable`}
              />
            </div>
          </Section>

          <section className="print:break-inside-avoid">
            <TierSpectrum
              byTier={data.fleet.fleet.byTier}
              totalAgents={data.fleet.fleet.totalAgents}
              averageScore={data.fleet.fleet.averageScore}
              medianScore={data.fleet.fleet.medianScore}
              duration={data.duration}
              emptyReason={isLive ? 'none reporting' : 'none in this seed'}
            />
          </section>

          <Section
            title={`Risk accumulators · per agent · thresholds ${RISK_ACCUMULATOR.warningThreshold} / ${RISK_ACCUMULATOR.degradedThreshold} / ${RISK_ACCUMULATOR.cbThreshold}`}
          >
            <table className="w-full text-left text-[12px] text-white/75 print:text-black">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-white/55 print:text-black/60">
                  <th scope="col" className="py-1 font-medium">Agent</th>
                  <th scope="col" className="py-1 text-right font-medium">Peak</th>
                  <th scope="col" className="py-1 text-right font-medium">Now</th>
                  <th scope="col" className="py-1 pl-3 font-medium">Direction</th>
                </tr>
              </thead>
              <tbody>
                {overview.rows
                  .slice()
                  .sort((a, b) => b.risk.peakInWindow - a.risk.peakInWindow)
                  .slice(0, 5)
                  .map((r) => (
                    <tr key={r.agentId} className="border-t border-white/[0.06] print:border-black/10">
                      <td className="py-1 font-mono">{r.agentId}</td>
                      <td className="py-1 text-right tabular-nums">{fmtNum(r.risk.peakInWindow)}</td>
                      <td className="py-1 text-right tabular-nums">{fmtNum(r.risk.currentAccumulatorValue)}</td>
                      <td className="py-1 pl-3">{accumulatorWord(r.risk.trend)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="text-[11px] text-white/55 print:text-black/55">
              Top 5 by peak of {overview.agentCount}. The accumulator is defined per agent; there is no
              pooled fleet value.
            </p>
          </Section>

          <Section title="Anomaly clusters">
            {data.fleet.anomalyClusters.length === 0 ? (
              <p className="text-xs text-white/55 print:text-black/60">None in this window.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-[12px] text-white/75 print:text-black">
                {data.fleet.anomalyClusters.map((c) => (
                  <li key={c.clusterId}>
                    {c.agentIds.join(', ')} share failing {c.commonFactors.join(' + ')} ({c.severity})
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Signal mix · fleet · pooled counts`}>
            <SignalMix distribution={overview.distribution} />
          </Section>

          <Section title="Insights · fleet scope">
            <InsightList insights={insights} empty="Nothing flagged fleet-wide in this window." />
          </Section>
        </>
      ) : (
        <AgentBrief data={data} insights={insights} />
      )}

      {/* Limitations + provenance — always printed. */}
      <footer className="mt-2 border-t border-white/10 pt-4 text-[11px] leading-relaxed text-white/55 print:border-black/20 print:text-black/60">
        <p className="font-semibold text-white/70 print:text-black/75">Open limitations</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          {!isLive && (
            <li>Synthetic fleet: agent behaviour is scripted; relative stories are seeded, not observed.</li>
          )}
          <li>Insights are rule-based over window analytics; no proof-plane evidence chain is attached.</li>
          <li>
            Risk-accumulator values are reconstructed from failure signals (P(T) × R); the stream does
            not carry accumulator events for every crossing.
          </li>
          <li>Factors with no evidence in the window are reported as no data, not as healthy.</li>
          <li>Delegation and collusion figures are modeled and excluded from this brief.</li>
        </ul>
        <p className="mt-2">
          Generated {fmtDateTime(data.computedAt)} UTC · @vorionsys/rainbow {RAINBOW_VERSION} ·{' '}
          {`rainbow.vorion.org${exploreHref('/report', { window: data.duration, agent: isFleet ? undefined : data.agentId })}`}
        </p>
      </footer>
    </main>
  );
}

function AgentBrief({
  data,
  insights,
}: {
  data: ReturnType<typeof getDashboardData>;
  insights: RecordedInsight[];
}) {
  const traj = data.window.trajectory;
  const risk = data.correctedRisk;
  const agent = data.agentInfo;
  const tier = agent.tier as TierKey;
  const withEvidence = data.state.factors.filter((f) => f.recentEvidenceCount > 0);
  const belowMin = withEvidence
    .filter((f) => !f.meetsMinimum)
    .sort((a, b) => a.currentScore - b.currentScore)
    .slice(0, 3);
  const noEvidence = data.state.factors.length - withEvidence.length;

  return (
    <>
      <Section title={`${agent.agentId} · last ${data.duration}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ReportStat
            label="Score"
            value={fmtNum(traj.current)}
            sub={`${tier} · ${tierName(tier)} · ${agent.lifecycleState}`}
          />
          <ReportStat
            label="Trend"
            value={traj.trend}
            sub={`${fmtSigned(traj.velocity)} pts/h · ${fmtNum(data.startScore)} → ${fmtNum(traj.current)} · range ${fmtNum(traj.min)}–${fmtNum(traj.max)}`}
          />
          <ReportStat
            label="Risk accumulator"
            value={fmtNum(risk.currentAccumulatorValue)}
            sub={`peak ${fmtNum(risk.peakInWindow)} · ${accumulatorWord(risk.trend)}`}
          />
          <ReportStat
            label="Threshold crossings"
            value={`${risk.warningBreaches} / ${risk.degradedBreaches}`}
            sub={`into warning ${RISK_ACCUMULATOR.warningThreshold} / degraded ${RISK_ACCUMULATOR.degradedThreshold}`}
          />
        </div>
        <p className="text-[11px] text-white/55 print:text-black/55">
          Circuit breaker at {RISK_ACCUMULATOR.cbThreshold}. Accumulator is the seeded rolling{' '}
          {RISK_ACCUMULATOR.windowHours}h series shown on the dashboard; trend is the regression slope
          the trajectory chart draws.
        </p>
      </Section>

      <Section title={`Factors below the ${tier} minimum · top 3`}>
        {belowMin.length === 0 ? (
          <p className="text-xs text-white/55 print:text-black/60">
            Every factor with evidence meets the {tier} minimum. {noEvidence} of{' '}
            {data.state.factors.length} factors have no evidence in this window.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-[12px] text-white/75 print:text-black">
            {belowMin.map((f) => (
              <li key={f.factorCode}>
                <span className="font-mono font-semibold">{f.factorCode}</span>{' '}
                {(TRUST_FACTORS as Record<string, { name: string }>)[f.factorCode]?.name ?? f.factorName} ·{' '}
                {fmtPct(f.currentScore)} success over {f.recentEvidenceCount} signals
              </li>
            ))}
            <li className="text-[11px] text-white/55 print:text-black/55">
              {noEvidence} of {data.state.factors.length} factors have no evidence in this window (no
              data, not healthy).
            </li>
          </ul>
        )}
      </Section>

      <Section title={`Signal mix · ${agent.agentId}`}>
        <SignalMix distribution={data.window.distribution} />
      </Section>

      <Section title={`Insights · ${agent.agentId} scope`}>
        <InsightList insights={insights} empty={`Nothing flagged for ${agent.agentId} in this window.`} />
      </Section>
    </>
  );
}
