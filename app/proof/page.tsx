// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Proof-chain / signal-propagation visualizer — an ordered, attributable audit
 * trail (simulated; not a cryptographic guarantee). For one agent + window it
 * renders how trust signals PROPAGATE
 * into outcomes as a set of vertical correlation traces:
 *
 *   signal → canary result → risk-accumulator crossing → circuit-breaker
 *
 * Traces are grouped by correlationId where present (signals without one are
 * shown as honestly-labelled single-node traces). Within a trace, nodes read
 * oldest → newest so the arrows follow causation; the trace list itself can be
 * ordered newest- or oldest-first. The "Elbow" — the observed inflection where
 * the continuous risk/trust curve bends into a discrete state change — is
 * highlighted where it actually occurs in the stream.
 *
 * Read-only RSC. Every datum is read through the existing read-only accessors
 * (getAgentSignals / getAgents / getAgentInfo); nothing here is fabricated and
 * no claim of cryptographic strength is made. State lives in the URL
 * (?agent=&window=&order=) so any view is shareable.
 */

import { notFound } from 'next/navigation';
import { ShieldCheck, CornerDownRight, AlertTriangle } from 'lucide-react';
import type { Metadata } from 'next';
import { RISK_ACCUMULATOR } from '@vorionsys/basis-spec';
import {
  ensureHydrated,
  getAgents,
  getAgentInfo,
  getAgentRiskEvidence,
  getAgentSignals,
  isPresetDuration,
  PRESET_DURATIONS,
} from '../lib/data-source';
import { accumulatorWord } from '../lib/insights';
import { pageMetadata } from '../lib/page-metadata';
import {
  buildProofChain,
  STAGE_ORDER,
  STAGE_META,
  type ProofStage,
  type CorrelationTrace,
  type ChainNode,
} from '../lib/proof-chain';
import { conceptSlug } from '../lib/glossary';
import { TIER_COLORS, tierName, type TierKey } from '../lib/tiers';
import {
  STATUS,
  SEVERITY_COLORS,
  OUTCOME_COLORS,
  tint,
} from '../lib/status-colors';
import { fmtDateTime, fmtNum, fmtSigned } from '../lib/format';
import { ExploreLink, exploreHref } from '../components/explore-link';
import { ConceptTooltip } from '../components/tooltip';
import { Panel, EmptyState } from '../components/panel';
import { ProofPicker } from './proof-picker';

export const dynamic = 'force-dynamic';

const DEFAULT_AGENT = 'cascade-03';

/** Per-stage accent — keyed to the existing status palette. */
const STAGE_COLOR: Record<ProofStage, string> = {
  signal: STATUS.info,
  canary: STATUS.neutral,
  risk: STATUS.warnAlt,
  breaker: STATUS.bad,
};

interface PageProps {
  searchParams: Promise<{ agent?: string; window?: string; order?: string }>;
}

/** One node in a vertical trace: a real signal positioned in its stage lane. */
function ChainNodeRow({
  node,
  isLast,
  window,
}: {
  node: ChainNode;
  isLast: boolean;
  window: string;
}) {
  const { signal: s, stage, outcome, elbow } = node;
  const stageColor = STAGE_COLOR[stage];
  const outcomeColor = OUTCOME_COLORS[outcome] ?? STATUS.neutral;
  const sevColor = s.severity ? SEVERITY_COLORS[s.severity] ?? STATUS.neutral : undefined;

  return (
    <li className="relative flex gap-3">
      {/* Rail + node marker */}
      <div className="relative flex w-4 shrink-0 flex-col items-center">
        <span
          className="z-10 mt-1 h-3 w-3 rounded-full ring-2 ring-[#05050a]"
          style={{ backgroundColor: stageColor }}
          aria-hidden
        />
        {!isLast && (
          <span className="absolute top-1 bottom-0 w-px bg-white/10" aria-hidden />
        )}
      </div>

      {/* Node card */}
      <div
        className={`mb-3 flex-1 rounded-lg border px-3 py-2 ${
          elbow ? 'border-red-500/40 bg-red-500/[0.06]' : 'border-white/10 bg-white/[0.02]'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: stageColor, backgroundColor: tint(stageColor) }}
          >
            {STAGE_META[stage].label}
          </span>
          {s.busSignalType ? (
            <ConceptTooltip slug={conceptSlug.signalType(s.busSignalType)}>
              <ExploreLink
                href={exploreHref(`/signal-type/${s.busSignalType}`, { window })}
                className="font-mono text-[11px] text-white/80"
              >
                {s.busSignalType}
              </ExploreLink>
            </ConceptTooltip>
          ) : (
            <span className="font-mono text-[11px] text-white/40">untyped signal</span>
          )}
          <span className="font-semibold text-[11px]" style={{ color: outcomeColor }}>
            {outcome}
          </span>
          {elbow && (
            <ExploreLink href="/concepts/elbow" className="ml-auto">
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/[0.08] px-2 py-0.5 text-[10px] font-semibold text-red-300">
                <AlertTriangle size={11} aria-hidden /> Elbow
              </span>
            </ExploreLink>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-white/45">
          <span className="tabular-nums text-white/55">{fmtDateTime(s.timestamp)} UTC</span>
          {s.severity && sevColor ? (
            <span className="inline-flex items-center gap-1">
              severity
              <ConceptTooltip slug={conceptSlug.severity(s.severity)}>
                <span className="font-semibold" style={{ color: sevColor }}>
                  {s.severity}
                </span>
              </ConceptTooltip>
            </span>
          ) : null}
          {s.factorCode ? (
            <span>
              factor{' '}
              <ExploreLink
                href={exploreHref(`/factor/${s.factorCode}`, { window })}
                className="font-mono text-white/70"
              >
                {s.factorCode}
              </ExploreLink>
            </span>
          ) : null}
          {s.riskLevel ? (
            <span>
              risk{' '}
              <ConceptTooltip slug={conceptSlug.risk(s.riskLevel)}>
                <ExploreLink
                  href={exploreHref(`/risk/${s.riskLevel}`, { window })}
                  className="text-white/70"
                >
                  {s.riskLevel}
                </ExploreLink>
              </ConceptTooltip>
            </span>
          ) : null}
          <span
            className="tabular-nums"
            style={{ color: s.delta > 0 ? STATUS.good : s.delta < 0 ? STATUS.bad : STATUS.neutral }}
          >
            Δ {fmtSigned(s.delta)}
          </span>
          {s.blocked && s.blockReason ? (
            <span className="text-white/40">· {s.blockReason}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** One correlation trace rendered as a vertical chain. */
function TraceColumn({ trace, window }: { trace: CorrelationTrace; window: string }) {
  const peakColor = STAGE_COLOR[trace.peakStage];
  return (
    <section
      className={`rounded-xl border bg-white/[0.02] p-4 ${
        trace.reachesElbow ? 'border-red-500/30' : 'border-white/10'
      }`}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <CornerDownRight size={14} className="text-white/40" aria-hidden />
        {trace.correlationId ? (
          <span className="font-mono text-[11px] text-white/70" title="correlationId">
            {trace.correlationId}
          </span>
        ) : (
          <span className="text-[11px] italic text-white/45">
            uncorrelated signal (no correlationId)
          </span>
        )}
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ color: peakColor, backgroundColor: tint(peakColor) }}
        >
          reached {STAGE_META[trace.peakStage].label}
        </span>
        <span className="text-[10px] text-white/35">
          {trace.nodes.length} {trace.nodes.length === 1 ? 'step' : 'steps'}
        </span>
      </header>
      <ol className="ml-1">
        {trace.nodes.map((node, i) => (
          <ChainNodeRow
            key={node.signal.signalId}
            node={node}
            isLast={i === trace.nodes.length - 1}
            window={window}
          />
        ))}
      </ol>
    </section>
  );
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';
  const agent = sp.agent?.trim() || DEFAULT_AGENT;
  return pageMetadata({
    title: `Proof chain · ${agent} · ${window}`,
    description: `Ordered signal trail for ${agent} over the last ${window}: signals, canary results, accumulator failures and circuit-breaker events.`,
    path: '/proof',
    query: { agent, window },
  });
}

/** Stage legend + counts strip. */
function StageLegend({ byStage }: { byStage: Record<ProofStage, number> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {STAGE_ORDER.map((stage, i) => (
        <div key={stage} className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: STAGE_COLOR[stage] }}
            aria-hidden
          />
          <span className="text-xs text-white/70">{STAGE_META[stage].label}</span>
          <span className="text-[11px] tabular-nums text-white/55">
            {byStage[stage]}
            {byStage[stage] === 0 && stage !== 'signal' ? (
              <span className="text-white/40"> · none emitted</span>
            ) : null}
          </span>
          {i < STAGE_ORDER.length - 1 && (
            <span className="ml-2 text-white/25" aria-hidden>
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default async function ProofChainPage({ searchParams }: PageProps) {
  await ensureHydrated();
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';
  const order: 'newest' | 'oldest' = sp.order === 'oldest' ? 'oldest' : 'newest';

  const agents = getAgents();
  const info =
    (sp.agent ? getAgentInfo(sp.agent) : undefined) ??
    getAgentInfo(DEFAULT_AGENT) ??
    agents[0];
  if (!info) notFound();
  const agentId = info.agentId;

  const signals = getAgentSignals(agentId, window);
  const chain = buildProofChain(signals, order);
  const evidence = getAgentRiskEvidence(window, agentId);
  const riskStagesEmpty = chain.summary.byStage.risk === 0 && chain.summary.byStage.breaker === 0;

  const tier = info.tier as TierKey;
  const tierColor = TIER_COLORS[tier] ?? STATUS.neutral;

  const pickerAgents = agents.map((a) => ({
    agentId: a.agentId,
    label: a.label,
    tier: a.tier,
  }));

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <ExploreLink
          href={exploreHref(`/agent/${agentId}`, { window })}
          className="text-sm text-white/55"
        >
          ← {agentId} profile
        </ExploreLink>
      </div>

      {/* Header */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/[0.08] px-2 py-0.5 font-semibold text-amber-200/90">
                <ShieldCheck size={12} aria-hidden /> Ordered audit trail (simulated)
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white/90">
              Proof chain
            </h1>
            <p className="mt-1 text-sm text-white/55">
              How trust signals propagate into outcomes for{' '}
              <span className="font-mono text-white/75">{agentId}</span> · window {window}
            </p>
          </div>
          <ExploreLink href={exploreHref(`/tier/${tier}`, { window })}>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ color: tierColor, backgroundColor: tint(tierColor) }}
            >
              {tier} · {tierName(tier)}
            </span>
          </ExploreLink>
        </div>

        <ProofPicker
          agents={pickerAgents}
          agent={agentId}
          window={window}
          windows={PRESET_DURATIONS}
          order={order}
        />
      </header>

      {/* Synthetic / honesty banner — prominent, always visible. */}
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-4 py-3">
        <p className="text-xs leading-relaxed text-amber-100/90">
          <span className="font-bold">Synthetic, illustrative — not live data.</span> This is a
          read-only reconstruction of how signals propagated through a deterministic, seeded
          simulator: raw events → canary results → risk-accumulator crossings → circuit-breaker
          decisions, grouped by correlation id. It is an ordered, attributable record of signals.
          Nothing on this page is hashed, signed or anchored, so it is{' '}
          <span className="font-semibold">not</span> tamper-proof and not a cryptographic guarantee.
          RAINBOW observes and records; it does not control agents.
        </p>
      </div>

      {/* Summary + legend */}
      <Panel
        title="Propagation stages"
        subtitle={`${agentId} · ${chain.summary.totalSignals} signals · last ${window}`}
        badge={
          chain.summary.elbowCount > 0 ? (
            <ExploreLink href="/concepts/elbow">
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/[0.08] px-2 py-0.5 text-[11px] font-semibold text-red-300">
                <AlertTriangle size={12} aria-hidden /> {chain.summary.elbowCount} Elbow
                {chain.summary.elbowCount === 1 ? '' : 's'}
              </span>
            </ExploreLink>
          ) : undefined
        }
        footnote="Each step is a real (synthetic) trust-bus event read through the read-only accessors. Stages follow the canonical flow signal → canary → risk accumulator → circuit breaker. The Elbow marks the observed inflection where the continuous trust/risk curve bends into a discrete state change — it is detected in the stream, never invented."
      >
        <div className="flex flex-col gap-4">
          <StageLegend byStage={chain.summary.byStage} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Correlated traces</p>
              <p className="mt-0.5 text-lg font-bold text-white/85 tabular-nums">
                {chain.summary.correlatedTraces}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Uncorrelated</p>
              <p className="mt-0.5 text-lg font-bold text-white/85 tabular-nums">
                {chain.summary.uncorrelatedSignals}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Total signals</p>
              <p className="mt-0.5 text-lg font-bold text-white/85 tabular-nums">
                {chain.summary.totalSignals}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">State changes</p>
              <p
                className="mt-0.5 text-lg font-bold tabular-nums"
                style={{ color: chain.summary.elbowCount > 0 ? STATUS.bad : STATUS.good }}
              >
                {chain.summary.elbowCount}
              </p>
            </div>
          </div>
        </div>
      </Panel>

      {/* Accumulator — reconstructed from failures, the same series the
          dashboard's risk panel and this agent's insight cite. */}
      <Panel
        title="Risk accumulator failures"
        subtitle={`${agentId} · peak ${fmtNum(evidence.risk.peakInWindow)} · now ${fmtNum(evidence.risk.currentAccumulatorValue)} · ${accumulatorWord(evidence.risk.trend)} · last ${window}`}
        footnote={`Reconstructed from failure signals: each adds P(T) × R to a rolling ${RISK_ACCUMULATOR.windowHours}h sum. Listed: the failures inside the ${RISK_ACCUMULATOR.windowHours}h ending at the in-window peak, largest first.${riskStagesEmpty ? ' The stream itself carries no risk-accumulator or circuit-breaker events for this agent and window, so those stage counts above are zero: the accumulator is not emitted as bus events here, only reconstructed.' : ''}`}
      >
        {evidence.contributors.length === 0 ? (
          <p className="text-xs text-white/55">
            No failures fed the accumulator in this window (peak {fmtNum(evidence.risk.peakInWindow)}).
          </p>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[24rem] text-left text-[12px]">
              <caption className="sr-only">Failures making up the accumulator peak</caption>
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-white/55">
                  <th scope="col" className="px-1 py-1.5 font-medium">Time (UTC)</th>
                  <th scope="col" className="px-1 py-1.5 font-medium">Factor</th>
                  <th scope="col" className="px-1 py-1.5 font-medium">Risk</th>
                  <th scope="col" className="px-1 py-1.5 font-medium">Type</th>
                  <th scope="col" className="px-1 py-1.5 text-right font-medium">P(T) × R</th>
                </tr>
              </thead>
              <tbody>
                {evidence.contributors.map((c) => (
                  <tr key={c.signalId} className="border-t border-white/[0.06] text-white/70">
                    <td className="px-1 py-1.5 tabular-nums">{fmtDateTime(c.at)}</td>
                    <td className="px-1 py-1.5">
                      {c.factorCode ? (
                        <ExploreLink
                          href={exploreHref(`/factor/${c.factorCode}`, { window })}
                          className="font-mono"
                        >
                          {c.factorCode}
                        </ExploreLink>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-1 py-1.5">{c.riskLevel ?? '—'}</td>
                    <td className="px-1 py-1.5 font-mono text-[11px] text-white/55">
                      {c.busSignalType ?? '—'}
                    </td>
                    <td className="px-1 py-1.5 text-right font-semibold tabular-nums">
                      +{fmtNum(c.contribution)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {evidence.contributorCount > evidence.contributors.length && (
              <p className="mt-1.5 px-1 text-[11px] text-white/45">
                Showing the {evidence.contributors.length} largest of {evidence.contributorCount}{' '}
                contributing failures.
              </p>
            )}
          </div>
        )}
      </Panel>

      {/* Traces */}
      {chain.traces.length === 0 ? (
        <EmptyState message={`No signals for ${agentId} in the last ${window}.`} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {chain.traces.map((trace, i) => (
            <TraceColumn
              key={trace.correlationId ?? `loose-${trace.nodes[0]?.signal.signalId ?? i}`}
              trace={trace}
              window={window}
            />
          ))}
        </div>
      )}
    </main>
  );
}
