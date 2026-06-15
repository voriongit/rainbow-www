// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Anomaly-cluster drill-down — read-only RSC.
 *
 * Resolves one fleet-wide anomaly cluster (agents failing the same trust
 * factors in a correlated way) and renders its members, the shared failing
 * factors, and — full width — the combined raw signal log restricted to those
 * shared factors across every member. Every categorical value links onward to
 * its agent/factor/concept page so the cluster is fully explorable.
 */

import { notFound } from 'next/navigation';
import type { IngestedSignal } from '@vorionsys/rainbow';
import {
  getFleetSnapshot,
  getAgentSignals,
  isPresetDuration,
} from '../../lib/data-source';
import { fmtDateTime } from '../../lib/format';
import { SEVERITY_COLORS, STATUS, tint } from '../../lib/status-colors';
import { ExploreLink, exploreHref } from '../../components/explore-link';
import { InfoLink } from '../../components/info-link';
import { Panel } from '../../components/panel';
import { SignalLog } from '../../components/signal-log';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ clusterId: string }>;
  searchParams: Promise<{ window?: string }>;
}

export default async function ClusterPage({ params, searchParams }: PageProps) {
  const { clusterId } = await params;
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';

  const fleet = getFleetSnapshot(window);
  const cluster = fleet.anomalyClusters.find((c) => c.clusterId === clusterId);
  if (!cluster) notFound();

  const severityColor = SEVERITY_COLORS[cluster.severity] ?? STATUS.neutral;

  // Combined member signals restricted to the shared failing factors: for each
  // member × each shared factor, pull that agent's filtered signals, flatten,
  // then sort newest-first for the unified log.
  const memberSignals: IngestedSignal[] = cluster.agentIds
    .flatMap((agentId) =>
      cluster.commonFactors.flatMap((factorCode) =>
        getAgentSignals(agentId, window, { factorCode })
      )
    )
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <ExploreLink href={exploreHref('/', { window })} className="text-sm text-white/55">
        ← Dashboard
      </ExploreLink>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Anomaly cluster</h1>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ color: severityColor, backgroundColor: tint(severityColor) }}
        >
          {cluster.severity}
        </span>
        <span className="font-mono text-[11px] text-white/40">{cluster.clusterId}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="Cluster"
          subtitle={`Detected ${fmtDateTime(cluster.detectedAt)} UTC`}
          badge={<InfoLink slug="metric-anomaly-cluster" />}
        >
          <div className="flex flex-col gap-5">
            <p className="text-sm leading-relaxed text-white/90">{cluster.description}</p>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                Members
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {cluster.agentIds.map((agentId) => (
                  <li key={agentId}>
                    <ExploreLink
                      href={exploreHref(`/agent/${agentId}`, { window })}
                      className="font-mono text-[11px] text-white/80"
                    >
                      {agentId}
                    </ExploreLink>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                Shared failing factors
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {cluster.commonFactors.map((factorCode) => (
                  <li key={factorCode}>
                    <ExploreLink
                      href={exploreHref(`/factor/${factorCode}`, { window })}
                      className="font-mono text-[11px] text-white/80"
                    >
                      {factorCode}
                    </ExploreLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>

        <Panel
          title="Member signals on shared factors"
          subtitle={`Combined log across ${cluster.agentIds.length} members · window ${window}`}
          className="lg:col-span-3"
        >
          <SignalLog
            signals={memberSignals}
            window={window}
            emptyLabel="No signals on the shared factors in this window."
          />
        </Panel>
      </div>
    </main>
  );
}
