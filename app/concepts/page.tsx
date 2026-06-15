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
import { CATEGORY_LABELS, conceptsByCategory } from '../lib/glossary';
import { Panel, EmptyState } from '../components/panel';
import { ExploreLink, exploreHref } from '../components/explore-link';

export const metadata = {
  title: 'Concepts — RAINBOW',
};

export default function ConceptsPage() {
  const categories = Object.keys(CATEGORY_LABELS) as ConceptCategory[];

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
          constants, so they can never drift from the published standard. Pick any term to read its
          full definition.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {categories.map((cat) => {
          const concepts = conceptsByCategory(cat);
          return (
            <Panel
              key={cat}
              title={CATEGORY_LABELS[cat]}
              subtitle={`${concepts.length} ${concepts.length === 1 ? 'concept' : 'concepts'}`}
            >
              {concepts.length === 0 ? (
                <EmptyState message="No concepts in this category." />
              ) : (
                <ul className="flex flex-col gap-1">
                  {concepts.map((c) => (
                    <li key={c.slug}>
                      <ExploreLink
                        href={exploreHref(`/concepts/${c.slug}`)}
                        variant="block"
                        className="px-3 py-2"
                      >
                        <span className="block text-sm font-medium text-white/90">{c.term}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-white/55">
                          {c.short}
                        </span>
                      </ExploreLink>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>
    </main>
  );
}
