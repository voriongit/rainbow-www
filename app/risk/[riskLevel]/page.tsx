// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Risk-level drill-down — one canonical risk level (READ … LIFE_CRITICAL),
 * its loss multiplier, what it means, and the fleet-wide signals tagged at
 * this level in the active window. Reached from any "Risk" cell in the signal
 * log. Read-only RSC; data comes from the live simulator so it is dynamic.
 */

import { notFound } from 'next/navigation';
import { RISK_LEVELS } from '@vorionsys/basis-spec';

import { ensureHydrated, getFleetSignals, isPresetDuration } from '../../lib/data-source';
import { conceptSlug } from '../../lib/glossary';
import { STATUS, tint } from '../../lib/status-colors';
import { ExploreLink, exploreHref } from '../../components/explore-link';
import { Panel } from '../../components/panel';
import { SignalLog } from '../../components/signal-log';
import type { Metadata } from 'next';
import { pageMetadata } from '../../lib/page-metadata';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ riskLevel: string }>;
  searchParams: Promise<{ window?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { riskLevel } = await params;
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';
  return pageMetadata({
    title: `Risk ${riskLevel} · ${window}`,
    description: `Fleet signals at risk level ${riskLevel} over the last ${window}.`,
    path: `/risk/${riskLevel}`,
    query: { window },
  });
}

export default async function RiskLevelPage({ params, searchParams }: PageProps) {
  await ensureHydrated();
  const { riskLevel } = await params;
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';

  const level = decodeURIComponent(riskLevel).toUpperCase();
  if (!(level in RISK_LEVELS)) notFound();

  const spec = RISK_LEVELS[level as keyof typeof RISK_LEVELS] as {
    multiplier: number;
    description: string;
  };
  const riskConceptSlug = conceptSlug.risk(level);
  const signals = getFleetSignals(window, { riskLevel: level });

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <ExploreLink href={exploreHref('/', { window })} className="text-sm text-white/55">
        ← Dashboard
      </ExploreLink>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-white/90">
          <span className="font-mono">{level}</span> risk
        </h1>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ color: STATUS.warnAlt, backgroundColor: tint(STATUS.warnAlt) }}
        >
          ×{spec.multiplier} multiplier
        </span>
        <span className="text-[11px] uppercase tracking-wider text-white/40">
          window {window}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="What this risk level means"
          subtitle={`Canonical loss multiplier for ${level} actions`}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-white/80">{spec.description}.</p>
            <p className="text-sm leading-relaxed text-white/55">
              A failed <span className="font-mono text-white/80">{level}</span> action carries a
              risk multiplier of{' '}
              <span className="font-semibold text-white/80">×{spec.multiplier}</span> in the loss
              formula — it costs proportionally more trust and contributes P(T) × {spec.multiplier}{' '}
              to the rolling 24h risk accumulator.
            </p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wider text-white/40">
                  Loss multiplier
                </dt>
                <dd className="mt-0.5 tabular-nums text-white/85">×{spec.multiplier}</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wider text-white/40">Risk level</dt>
                <dd className="mt-0.5 font-mono text-white/85">{level}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-white/40">
              <ExploreLink href={`/concepts/${riskConceptSlug}`} className="text-white/55">
                Concept: {level} risk level →
              </ExploreLink>
              <ExploreLink
                href="/concepts/formula-risk-accumulator"
                className="text-white/55"
              >
                Concept: risk accumulator →
              </ExploreLink>
            </div>
          </div>
        </Panel>

        <Panel
          title="Signals at this risk level"
          subtitle={`Fleet-wide ${level} signals · ${window}`}
          className="min-w-0 lg:col-span-2"
          badge={
            <span className="text-[11px] uppercase tracking-wider text-white/40">
              {signals.length} signals
            </span>
          }
        >
          <SignalLog
            signals={signals}
            window={window}
            emptyLabel={`No ${level} signals in this window.`}
          />
        </Panel>
      </div>
    </main>
  );
}
