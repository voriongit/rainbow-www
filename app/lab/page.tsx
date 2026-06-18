// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Lab — orchestration views that layer one explicit, declared POLICY on top of
 * the honestly-grounded signal stream. The simulator has no native concept of
 * agent-to-agent delegation, so this delegation-health view supplies a routing
 * policy and then DERIVES every outcome from the real simulated trust history
 * (handler pool, resolution and rejection all come from each handler's actual
 * trust at the escalation instant). The policy is the one model, so it is kept
 * off the assumption-free main dashboard on purpose.
 */

import { getDelegationModel, isPresetDuration } from '../lib/data-source';
import { Panel, EmptyState } from '../components/panel';
import { ExploreLink, exploreHref } from '../components/explore-link';
import { EscalationPairsBars } from '../components/panels/escalation-pairs-bars';
import { fmtNum, fmtDateTime } from '../lib/format';
import { STATUS } from '../lib/status-colors';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ window?: string }>;
}

function fmtResolution(ms: number): string {
  if (ms <= 0) return '—';
  const m = ms / 60_000;
  return m >= 1 ? `${m.toFixed(1)}m` : `${Math.round(ms / 1000)}s`;
}

export default async function LabPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';
  const { escalations, summary, handlers, securityCluster } = getDelegationModel(window);

  // Per-pair collusion flag: the library's ≥80%-to-one-handler rule, SCOPED to
  // agents with real CT-SEC/CT-ID failures so the badge reflects the genuine
  // shared-security cluster, not incidental load-balancing concentration.
  const cluster = new Set(securityCluster);
  const requestorTotals = new Map<string, number>();
  for (const e of escalations) {
    requestorTotals.set(e.requestorId, (requestorTotals.get(e.requestorId) ?? 0) + 1);
  }
  const isColluding = (requestor: string, count: number) => {
    const total = requestorTotals.get(requestor) ?? 0;
    return cluster.has(requestor) && total >= 3 && count / total >= 0.8;
  };

  const recent = escalations
    .slice()
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 60);

  // Enrich the top pairs with each pair's share of its requestor's routing
  // (the collusion-relevant metric) for the bar view's hover detail.
  const maxPairCount = Math.max(1, ...summary.topEscalationPairs.map((p) => p.count));
  const pairBars = summary.topEscalationPairs.map((p) => {
    const total = requestorTotals.get(p.requestor) ?? 0;
    return {
      requestor: p.requestor,
      handler: p.handler,
      count: p.count,
      sharePct: total > 0 ? Math.round((p.count / total) * 100) : 0,
      colluding: isColluding(p.requestor, p.count),
    };
  });

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3">
        <ExploreLink href={exploreHref('/', { window })} className="text-xs text-white/45">
          ← Dashboard
        </ExploreLink>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Lab <span className="text-white/50">· derived under a modeled policy</span>
        </h1>
        {/* Honesty disclaimer */}
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2.5">
          <p className="text-xs leading-relaxed text-amber-200/80">
            <span className="font-semibold">Derived — declared orchestration policy.</span> The
            simulator does <em>not</em> prescribe who handles an escalation, so this view applies
            one explicit policy on top of the real signal stream: when an agent hits a stress
            event — a circuit-breaker trip, a risk-accumulator crossing, or a security-factor
            (CT-SEC / CT-ID) failure — it escalates to the highest-trust handler available{' '}
            <em>at that moment</em>. No outcome is fabricated: whether it resolves and how fast
            are <span className="font-semibold">derived</span> from that handler&apos;s actual
            simulated trust at the time versus the difficulty of the case (severity + how degraded
            the requestor is). The collusion flag is a three-step chain, not an observed pattern:
            agents sharing CT-SEC / CT-ID failures are a <em>real</em> signal (the same one the
            correlation panel surfaces); the policy <em>routes</em> them all to one security lead;
            that policy-induced concentration — ≥80% of a requestor&apos;s (≥3) escalations to one
            handler — is what trips the detector. The routing <em>policy</em> is the one model (the
            simulator has no native delegation), so this stays off the main dashboard. Window:{' '}
            {window}.
          </p>
        </div>
      </header>

      {summary.totalEscalations === 0 ? (
        <Panel title="Delegation health" subtitle="Derived escalations in window">
          <EmptyState message="No stress signals produced any escalations in this window." />
        </Panel>
      ) : (
        <>
          {summary.potentialCollusionRisk && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-4 py-2.5">
              <p className="text-xs font-semibold text-amber-300">
                ⚠ Potential collusion risk — a requestor routes ≥80% of its escalations to a single
                handler (≥3 total). Policy-induced concentration; inspect the flagged pair below.
              </p>
            </div>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Panel title="Total escalations" className="!p-4">
              <p className="text-2xl font-bold text-white/90">{summary.totalEscalations}</p>
            </Panel>
            <Panel title="Successful" className="!p-4">
              <p className="text-2xl font-bold" style={{ color: STATUS.good }}>
                {summary.successfulEscalations}
              </p>
            </Panel>
            <Panel title="Rejected" className="!p-4">
              <p className="text-2xl font-bold" style={{ color: STATUS.bad }}>
                {summary.rejectedEscalations}
              </p>
            </Panel>
            <Panel title="Avg resolution" className="!p-4">
              <p className="text-2xl font-bold text-white/90">
                {fmtResolution(summary.averageResolutionTimeMs)}
              </p>
            </Panel>
          </div>

          {/* Top escalation pairs — bar view */}
          <Panel
            title="Top escalation pairs"
            subtitle="requestor → handler · bar length = escalation count, with each pair's share of its requestor's routing; flagged when ≥80% concentrates on one handler"
          >
            <EscalationPairsBars pairs={pairBars} maxCount={maxPairCount} window={window} />
          </Panel>

          {/* Escalation log */}
          <Panel title="Escalation log" subtitle={`Newest ${recent.length} of ${escalations.length} derived escalations`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40">
                    <th className="py-2 pr-3 font-medium">Time (UTC)</th>
                    <th className="py-2 pr-3 font-medium">Requestor → Handler</th>
                    <th className="py-2 pr-3 font-medium">Outcome</th>
                    <th className="py-2 pr-3 text-right font-medium">Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((e, i) => (
                    <tr key={`${e.requestorId}-${e.timestamp.getTime()}-${i}`} className="border-b border-white/5">
                      <td className="py-1.5 pr-3 tabular-nums text-white/55">{fmtDateTime(e.timestamp)}</td>
                      <td className="py-1.5 pr-3">
                        <ExploreLink href={exploreHref(`/agent/${e.requestorId}`, { window })} className="text-white/80">
                          {e.requestorId}
                        </ExploreLink>
                        <span className="text-white/30"> → </span>
                        <ExploreLink href={exploreHref(`/agent/${e.handlerId}`, { window })} className="text-white/80">
                          {e.handlerId}
                        </ExploreLink>
                      </td>
                      <td className="py-1.5 pr-3" style={{ color: e.success ? STATUS.good : STATUS.bad }}>
                        {e.success ? 'resolved' : 'rejected'}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-white/55">
                        {e.resolutionTimeMs !== undefined ? fmtResolution(e.resolutionTimeMs) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <p className="text-[11px] text-white/35">
            Handler pool (highest-trust agents): {handlers.join(', ') || '—'} · escalations counted:{' '}
            {fmtNum(escalations.length)}.
          </p>
        </>
      )}
    </main>
  );
}
