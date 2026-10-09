// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * /network — the A2A DELEGATION NETWORK (read-only).
 *
 * A deterministic, server-rendered visualization of who escalates to whom
 * across the (synthetic) fleet: requestor -> handler delegation edges weighted
 * by escalation count, handler concentration, and the policy-induced collusion
 * edges. It reads the SAME modeled delegation that /lab uses
 * (`getDelegationModel`), under the DEFAULT orchestration policy.
 *
 * Honesty discipline (mirrors /lab and /model): the simulator has no native
 * agent-to-agent delegation, so this view applies one explicit, declared
 * routing policy on top of the real signal stream and DERIVES every outcome
 * from the simulated trust trajectories — no outcome is fabricated. The
 * collusion flag is the library's >=80%-to-one-handler rule, SCOPED to agents
 * with real CT-SEC / CT-ID failures (>=3 escalations total). This surface
 * controls NOTHING: no live agents, no auth, no writes, no backend. RAINBOW
 * observes; it does not control agents. The honesty ceiling is WHITE_BOX.
 *
 * Server component, force-dynamic, URL-driven (?window) and deep-linkable;
 * state lives in the URL — no browser storage.
 */

import type { Metadata } from 'next';
import {
  ensureHydrated,
  getDelegationModel,
  isPresetDuration,
  PRESET_DURATIONS,
} from '../lib/data-source';
import { Panel, EmptyState } from '../components/panel';
import { Stat } from '../components/stat';
import { ExploreLink, exploreHref } from '../components/explore-link';
import { STATUS } from '../lib/status-colors';
import { fmtNum, fmtPct } from '../lib/format';
import { NetworkWindowSelector } from '../components/network/network-window-selector';
import {
  DelegationNetworkGraph,
  buildDelegationNetwork,
} from '../components/network/delegation-network-graph';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'A2A delegation network (synthetic)',
  alternates: { canonical: '/network' },
  description:
    'A read-only, deterministic visualization of agent-to-agent escalation across a synthetic fleet — who escalates to whom, handler concentration, and policy-induced collusion edges. Not connected to live agents.',
};

interface PageProps {
  searchParams: Promise<{ window?: string }>;
}

function fmtResolution(ms: number): string {
  if (ms <= 0) return '—';
  const m = ms / 60_000;
  return m >= 1 ? `${m.toFixed(1)}m` : `${Math.round(ms / 1000)}s`;
}

export default async function NetworkPage({ searchParams }: PageProps) {
  await ensureHydrated();
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';

  // SAME modeled delegation as /lab, under the DEFAULT orchestration policy
  // (no overlay knobs). The graph is a read-only view over this model.
  const { escalations, summary, handlers, securityCluster } =
    getDelegationModel(window);

  // Derive the bipartite graph (requestors -> handlers) deterministically.
  // The collusion rule mirrors /lab exactly: an edge is flagged when its
  // requestor is in the security cluster (real CT-SEC / CT-ID failures), has
  // >=3 escalations total, and routes >=80% of them to that one handler.
  const graph = buildDelegationNetwork({ escalations, securityCluster });

  const resolvedRatio =
    summary.totalEscalations > 0
      ? summary.successfulEscalations / summary.totalEscalations
      : 0;

  // Handler concentration headline: the single handler absorbing the largest
  // share of all escalations (a fleet-level over-reliance signal).
  const topHandler = graph.handlers.reduce(
    (best, h) => (h.inboundCount > best.inboundCount ? h : best),
    graph.handlers[0]
  );
  const topHandlerShare =
    topHandler && summary.totalEscalations > 0
      ? topHandler.inboundCount / summary.totalEscalations
      : 0;

  const collusionEdges = graph.edges.filter((e) => e.colluding).length;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3">
        <ExploreLink
          href={exploreHref('/', { window })}
          className="text-xs text-white/55"
        >
          ← Dashboard
        </ExploreLink>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">
            A2A delegation network{' '}
            <span className="text-white/55">· who escalates to whom</span>
          </h1>
          {/* Persistent, prominent synthetic stamp — never mistakable for live data. */}
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              borderColor: `${STATUS.warnAlt}66`,
              backgroundColor: `${STATUS.warnAlt}1a`,
              color: STATUS.warnAlt,
            }}
          >
            ▲ Synthetic — not connected to live agents
          </span>
        </div>

        <p className="max-w-3xl text-sm leading-relaxed text-white/60">
          A read-only map of agent-to-agent escalation across the fleet:
          requestors on the left, handlers on the right, with each edge weighted
          by how many escalations flow along it. It surfaces handler
          concentration — a few high-trust agents absorbing most of the load
          — and the policy-induced collusion edges where one requestor routes
          nearly all of its escalations to a single handler.
        </p>

        {/* Honesty disclaimer — same modeled-policy idiom as /lab. */}
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2.5">
          <p className="text-xs leading-relaxed text-amber-200/80">
            <span className="font-semibold">
              Derived — declared orchestration policy, synthetic data.
            </span>{' '}
            The simulator does <em>not</em> prescribe who handles an escalation, so
            this network applies one explicit routing policy on top of the real
            signal stream: when an agent hits a stress event — a circuit-breaker
            trip, a risk-accumulator crossing, or a security-factor (CT-SEC /
            CT-ID) failure — it escalates to the highest-trust handler available{' '}
            <em>at that moment</em>. No outcome is fabricated: resolution is{' '}
            <span className="font-semibold">derived</span> from that handler&apos;s
            actual simulated trust versus the difficulty of the case. The collusion
            edges (amber) are a three-step chain, not an observed pattern: agents
            sharing CT-SEC / CT-ID failures are a <em>real</em> signal; the policy{' '}
            <em>routes</em> them all to one security lead; that policy-induced
            concentration — ≥80% of a requestor&apos;s (≥3) escalations
            to one handler — is what trips the detector. RAINBOW{' '}
            <span className="font-semibold">observes</span> — it does not control
            agents. This is the same modeled delegation shown in the Lab, under the
            default policy; tune the policy in the{' '}
            <ExploreLink
              href={exploreHref('/lab', { window })}
              className="text-amber-200 underline decoration-dotted underline-offset-2"
            >
              Lab
            </ExploreLink>
            . Window: {window} · routing: concentrated (default).
          </p>
        </div>

        <NetworkWindowSelector durations={PRESET_DURATIONS} current={window} />
      </header>

      {summary.totalEscalations === 0 ? (
        <Panel
          title="Delegation network"
          subtitle="Derived escalations in window"
        >
          <EmptyState message="No stress signals produced any escalations in this window — there is no delegation graph to draw." />
        </Panel>
      ) : (
        <>
          {summary.potentialCollusionRisk && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-4 py-2.5">
              <p className="text-xs font-semibold text-amber-300">
                ⚠ Potential collusion risk — a security-failing requestor
                routes ≥80% of its escalations to a single handler (≥3
                total). Policy-induced concentration; the flagged edges are drawn
                in amber below.
              </p>
            </div>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Escalations"
              value={fmtNum(summary.totalEscalations)}
              sub={`${graph.requestors.length} requestors → ${graph.handlers.length} handlers`}
            />
            <Stat
              label="Resolved"
              value={fmtPct(resolvedRatio)}
              color={STATUS.good}
              sub={`${summary.successfulEscalations} of ${summary.totalEscalations}`}
            />
            <Stat
              label="Top-handler load"
              value={fmtPct(topHandlerShare)}
              color={topHandlerShare >= 0.5 ? STATUS.warn : undefined}
              sub={topHandler ? topHandler.id : '—'}
            />
            <Stat
              label="Collusion edges"
              value={fmtNum(collusionEdges)}
              color={collusionEdges > 0 ? STATUS.warn : STATUS.good}
              sub={collusionEdges > 0 ? 'policy-induced' : 'none flagged'}
            />
          </div>

          {/* The bipartite delegation graph */}
          <Panel
            title="Delegation graph"
            subtitle="requestor → handler · edge width = escalation count · node size = total load · amber = policy-induced collusion edge"
            footnote="Positions are computed deterministically (evenly spaced) — there is no physics layout and no randomness. Tap or focus a node to open that agent's drill-down."
          >
            <DelegationNetworkGraph graph={graph} window={window} />
          </Panel>

          {/* Handler concentration table — the load each handler absorbs. */}
          <Panel
            title="Handler concentration"
            subtitle="How escalation load distributes across the handler pool — over-reliance on a few handlers is itself a resilience signal"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/55">
                    <th className="py-2 pr-3 font-medium">Handler</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Inbound
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Share
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Requestors
                    </th>
                    <th className="py-2 pr-3 font-medium">Load</th>
                  </tr>
                </thead>
                <tbody>
                  {graph.handlers
                    .slice()
                    .sort((a, b) => b.inboundCount - a.inboundCount)
                    .map((h) => {
                      const share =
                        summary.totalEscalations > 0
                          ? h.inboundCount / summary.totalEscalations
                          : 0;
                      const widthPct = Math.max(
                        4,
                        (h.inboundCount /
                          Math.max(1, topHandler?.inboundCount ?? 1)) *
                          100
                      );
                      return (
                        <tr
                          key={h.id}
                          className="border-b border-white/5"
                        >
                          <td className="py-1.5 pr-3">
                            <ExploreLink
                              href={exploreHref(`/agent/${h.id}`, { window })}
                              className="text-white/85"
                            >
                              {h.id}
                            </ExploreLink>
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-white/70">
                            {h.inboundCount}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-white/70">
                            {fmtPct(share)}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-white/55">
                            {h.requestorCount}
                          </td>
                          <td className="py-1.5 pr-3">
                            <div
                              className="h-2 max-w-[140px] overflow-hidden rounded-full bg-white/[0.06]"
                              role="img"
                              aria-label={`${fmtPct(share)} of escalations`}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${widthPct}%`,
                                  backgroundColor:
                                    share >= 0.5 ? STATUS.warn : STATUS.info,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Panel>

          <p className="text-[11px] leading-relaxed text-white/55">
            Handler pool (highest-trust agents under the default policy):{' '}
            {handlers.join(', ') || '—'}. Security cluster (real CT-SEC /
            CT-ID failures, scopes the collusion flag):{' '}
            {securityCluster.length > 0 ? securityCluster.join(', ') : 'none'}.
            Escalations counted: {fmtNum(escalations.length)} · average
            resolution {fmtResolution(summary.averageResolutionTimeMs)}.
          </p>
        </>
      )}
    </main>
  );
}
