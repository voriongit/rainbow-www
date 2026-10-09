// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Bus-signal-type drill-down — one canonical Trust Bus signal type (e.g.
 * trust_updated), what it means, and every fleet-wide occurrence in the active
 * window. Reached from any "Signal type" cell in the signal log. Read-only RSC;
 * data comes from the live simulator so it is dynamic.
 */

import { notFound } from 'next/navigation';

import { ensureHydrated, getFleetSignals, isPresetDuration } from '../../lib/data-source';
import { getConcept, conceptSlug } from '../../lib/glossary';
import { ExploreLink, exploreHref } from '../../components/explore-link';
import { Panel } from '../../components/panel';
import { SignalLog } from '../../components/signal-log';
import type { Metadata } from 'next';
import { pageMetadata } from '../../lib/page-metadata';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ window?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { type } = await params;
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';
  return pageMetadata({
    title: `${type} · ${window}`,
    description: `Fleet ${type} signals over the last ${window}.`,
    path: `/signal-type/${type}`,
    query: { window },
  });
}

export default async function SignalTypePage({ params, searchParams }: PageProps) {
  await ensureHydrated();
  const { type: typeRaw } = await params;
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';

  const type = decodeURIComponent(typeRaw);
  const concept = getConcept(conceptSlug.signalType(type));
  if (!concept) notFound();

  const signals = getFleetSignals(window, { busSignalType: type });

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <ExploreLink href={exploreHref('/', { window })} className="text-sm text-white/55">
        ← Dashboard
      </ExploreLink>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-extrabold tracking-tight text-white/90">
          {type}
        </h1>
        <span className="text-[11px] uppercase tracking-wider text-white/40">
          bus signal type · window {window}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="What this signal means" subtitle="Canonical Trust Bus signal type">
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-white/80">{concept.short}</p>
            <p className="text-sm leading-relaxed text-white/55">{concept.long}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-white/40">
              <ExploreLink href={`/concepts/${concept.slug}`} className="text-white/55">
                Concept: {concept.term} →
              </ExploreLink>
            </div>
          </div>
        </Panel>

        <Panel
          title="Occurrences"
          subtitle={`Fleet-wide ${type} signals · ${window}`}
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
            emptyLabel={`No ${type} signals in this window.`}
          />
        </Panel>
      </div>
    </main>
  );
}
