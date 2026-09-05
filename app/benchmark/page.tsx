// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Cross-fleet benchmarking — reads the live (synthetic) fleet's trust-tier
 * distribution against a curated, illustrative reference profile (well-governed
 * / industry-baseline / degraded). Server component, force-dynamic, URL-driven
 * (?ref, ?window) and deep-linkable. Strictly observe: this compares shapes; it
 * does not control agents. The reference fleets are fixed yardsticks, not live.
 */

import { ensureHydrated, getDashboardData, isPresetDuration } from '../lib/data-source';
import { referenceById, isReferenceId, DEFAULT_REFERENCE_ID } from '../lib/reference-fleets';
import { Panel } from '../components/panel';
import { ExploreLink, exploreHref } from '../components/explore-link';
import { BenchmarkRefSelector } from '../components/benchmark-ref-selector';
import { FleetCompare } from '../components/fleet-compare';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ window?: string; ref?: string }>;
}

export default async function BenchmarkPage({ searchParams }: PageProps) {
  await ensureHydrated();
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';
  const refId = isReferenceId(sp.ref) ? sp.ref : DEFAULT_REFERENCE_ID;
  const reference = referenceById(refId);

  const data = getDashboardData(window);
  const live = data.fleet.fleet;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3">
        <ExploreLink href={exploreHref('/', { window })} className="text-xs text-white/45">
          ← Dashboard
        </ExploreLink>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Benchmark <span className="text-white/50">· this fleet vs a reference</span>
        </h1>
        <p className="max-w-2xl text-sm text-white/60">
          Read this fleet&apos;s trust-tier distribution against a curated reference profile to see
          where it sits — ahead on the high tiers, or carrying more low-trust agents than the
          benchmark.
        </p>

        {/* Synthetic / honesty banner */}
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-4 py-3">
          <p className="text-xs leading-relaxed text-amber-100/90">
            <span className="font-bold">Synthetic vs illustrative — not live data.</span> This fleet
            is the same deterministic, seeded simulator shown across RAINBOW. The reference fleets
            are <span className="font-semibold">hand-authored illustrative profiles</span> — not
            real organizations, not live, and not derived from any dataset; they are fixed
            yardsticks for reading the shape of the distribution. RAINBOW observes and compares; it
            does not control agents.
          </p>
        </div>

        <BenchmarkRefSelector current={reference.id} window={window} />
      </header>

      <Panel title={`This fleet vs ${reference.label}`} subtitle={`${reference.blurb} · window ${window}`}>
        <FleetCompare live={live} reference={reference} />
      </Panel>

      <p className="text-[11px] text-white/45">
        This fleet: {live.totalAgents} agents · mean {Math.round(live.averageScore)} · median{' '}
        {Math.round(live.medianScore)}. Reference &ldquo;{reference.label}&rdquo;:{' '}
        {reference.totalAgents} illustrative agents · mean {reference.averageScore} · median{' '}
        {reference.medianScore}. Shares are each fleet&apos;s percentage of agents per tier, so
        fleets of different sizes stay comparable.
      </p>
    </main>
  );
}
