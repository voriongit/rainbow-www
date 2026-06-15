// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Lab — explicitly MODELED / illustrative views that are not part of the
 * honestly-grounded main dashboard. The simulator models trust dynamics, not
 * agent-to-agent delegation, so the delegation-health view here is synthesized
 * from real stress signals routed by an illustrative policy. Kept off the main
 * dashboard on purpose.
 */

import { getDelegationModel, isPresetDuration } from '../lib/data-source';
import { Panel, EmptyState } from '../components/panel';
import { ExploreLink, exploreHref } from '../components/explore-link';
import { fmtNum, fmtDateTime } from '../lib/format';
import { STATUS, tint } from '../lib/status-colors';

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
  const { escalations, summary, handlers } = getDelegationModel(window);

  // Per-pair collusion flag (mirrors the library's ≥80%-to-one-handler rule).
  const requestorTotals = new Map<string, number>();
  for (const e of escalations) {
    requestorTotals.set(e.requestorId, (requestorTotals.get(e.requestorId) ?? 0) + 1);
  }
  const isColluding = (requestor: string, count: number) => {
    const total = requestorTotals.get(requestor) ?? 0;
    return total >= 3 && count / total >= 0.8;
  };

  const recent = escalations
    .slice()
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 60);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3">
        <ExploreLink href={exploreHref('/', { window })} className="text-xs text-white/45">
          ← Dashboard
        </ExploreLink>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Lab <span className="text-white/50">· modeled views</span>
        </h1>
        {/* Honesty disclaimer */}
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2.5">
          <p className="text-xs leading-relaxed text-amber-200/80">
            <span className="font-semibold">Illustrative / modeled.</span> Unlike the main
            dashboard (which is grounded in the simulated signal stream), the simulator does{' '}
            <em>not</em> model agent-to-agent delegation. The escalations below are{' '}
            <span className="font-semibold">synthesized</span> from real stress signals
            (circuit-breaker trips and risk-accumulator crossings) routed by an illustrative
            policy — a struggling agent is shown escalating to a high-trust handler. This is a
            demonstration of RAINBOW&apos;s delegation-health detection, <em>not</em> observed
            delegation. Window: {window}.
          </p>
        </div>
      </header>

      {summary.totalEscalations === 0 ? (
        <Panel title="Delegation health" subtitle="Modeled escalations in window">
          <EmptyState message="No stress signals produced modeled escalations in this window." />
        </Panel>
      ) : (
        <>
          {summary.potentialCollusionRisk && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-4 py-2.5">
              <p className="text-xs font-semibold text-red-300">
                ⚠ Potential collusion risk — a requestor routes ≥80% of its escalations to a single
                handler (≥3 total). Inspect the flagged pair below.
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

          {/* Top escalation pairs */}
          <Panel
            title="Top escalation pairs"
            subtitle="requestor → handler frequency; flagged when one handler dominates a requestor"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40">
                    <th className="py-2 pr-3 font-medium">Requestor</th>
                    <th className="py-2 pr-3 font-medium">Handler</th>
                    <th className="py-2 pr-3 text-right font-medium">Count</th>
                    <th className="py-2 font-medium">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topEscalationPairs.map((p) => {
                    const colluding = isColluding(p.requestor, p.count);
                    return (
                      <tr key={`${p.requestor}-${p.handler}`} className="border-b border-white/5">
                        <td className="py-1.5 pr-3">
                          <ExploreLink href={exploreHref(`/agent/${p.requestor}`, { window })} className="text-white/80">
                            {p.requestor}
                          </ExploreLink>
                        </td>
                        <td className="py-1.5 pr-3">
                          <ExploreLink href={exploreHref(`/agent/${p.handler}`, { window })} className="text-white/80">
                            {p.handler}
                          </ExploreLink>
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-white/70">{p.count}</td>
                        <td className="py-1.5">
                          {colluding ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{ color: STATUS.bad, backgroundColor: tint(STATUS.bad) }}
                            >
                              collusion risk
                            </span>
                          ) : (
                            <span className="text-white/30">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Escalation log */}
          <Panel title="Escalation log" subtitle={`Newest ${recent.length} of ${escalations.length} modeled escalations`}>
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
