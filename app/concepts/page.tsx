// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * /concepts — the glossary / explainer hub.
 *
 * Pure render of the static concept registry (lib/glossary.ts), grouped by
 * category. There is no live data here, so this page is intentionally
 * static-friendly: no `export const dynamic`. Every concept links to its own
 * /concepts/<slug> detail page — the same destination the inline ⓘ affordances
 * across the dashboard point at.
 */

import type { ConceptCategory } from '../lib/glossary';
import { CATEGORY_LABELS, CONCEPTS } from '../lib/glossary';
import { ExploreLink, exploreHref } from '../components/explore-link';
import { ConceptsExplorer, type ExplorerConcept } from './concepts-explorer';

export const metadata = {
  title: 'Concepts',
  description: 'Every RAINBOW and BASIS term on one page, generated from the canonical @vorionsys/basis-spec constants.',
  alternates: { canonical: '/concepts' },
};

export default function ConceptsPage() {
  const categoryKeys = Object.keys(CATEGORY_LABELS) as ConceptCategory[];
  const categories = categoryKeys.map((key) => ({ key, label: CATEGORY_LABELS[key] }));

  // Pass a plain-data subset to the client explorer — never the server module.
  const concepts: ExplorerConcept[] = CONCEPTS.map((c) => ({
    slug: c.slug,
    term: c.term,
    category: c.category,
    short: c.short,
    long: c.long,
    live: c.live,
  }));

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3">
        <ExploreLink href={exploreHref('/')} className="text-sm text-white/55">
          ← Dashboard
        </ExploreLink>
        <h1 className="text-2xl font-extrabold tracking-tight text-white/90">Concepts</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-white/55">
          The explainer hub for every term RAINBOW measures and displays — trust tiers, risk
          levels, the 16 canonical trust factors, observation tiers, lifecycle states, Trust Bus
          signal types, severities, the metrics and formulas behind the charts, and the canary
          probe taxonomy. Definitional concepts are derived directly from the canonical{' '}
          <span className="font-mono text-[12px] text-white/70">@vorionsys/basis-spec</span>{' '}
          constants, so they can never drift from the published standard. Search or filter to find
          a term, then pick it to read the full definition — or jump straight to the live surface
          where it appears.
        </p>
      </div>

      <ConceptsExplorer concepts={concepts} categories={categories} />
    </main>
  );
}
