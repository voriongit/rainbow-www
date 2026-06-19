// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Client-side search + category filter for the /concepts hub.
 *
 * The full concept list is passed in from the server page (lib/glossary is a
 * server module — it is NOT imported here). This component only narrows what is
 * already rendered: it derives the filtered/grouped list at render time from the
 * search query and selected category (no setState-in-effect), keeps the existing
 * grouped layout, and shows live result counts. Read-only, no browser storage.
 */

import { useMemo, useState } from 'react';
import { ExploreLink, exploreHref } from '../components/explore-link';

/** Minimal concept shape the explorer needs — a plain-data subset of Concept. */
export interface ExplorerConcept {
  slug: string;
  term: string;
  category: string;
  short: string;
  long: string;
  live?: { href: string; label: string };
}

interface ConceptsExplorerProps {
  concepts: ExplorerConcept[];
  /** Ordered category keys with their display labels. */
  categories: { key: string; label: string }[];
}

export function ConceptsExplorer({ concepts, categories }: ConceptsExplorerProps) {
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');

  const q = query.trim().toLowerCase();

  // Derived at render — never via effect/setState.
  const filtered = useMemo(() => {
    return concepts.filter((c) => {
      if (activeCat !== 'all' && c.category !== activeCat) return false;
      if (!q) return true;
      return (
        c.term.toLowerCase().includes(q) ||
        c.short.toLowerCase().includes(q) ||
        c.long.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q)
      );
    });
  }, [concepts, activeCat, q]);

  const groups = useMemo(() => {
    return categories
      .map((cat) => ({
        ...cat,
        items: filtered.filter((c) => c.category === cat.key),
      }))
      .filter((g) => g.items.length > 0);
  }, [categories, filtered]);

  const total = filtered.length;
  const isFiltering = q.length > 0 || activeCat !== 'all';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search concepts</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search terms, definitions, slugs…"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/90 placeholder:text-white/35 focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/25"
            />
          </label>
          <span
            className="text-xs text-white/45 sm:whitespace-nowrap"
            aria-live="polite"
          >
            {total} {total === 1 ? 'concept' : 'concepts'}
            {isFiltering ? ' matched' : ''}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="All"
            active={activeCat === 'all'}
            onClick={() => setActiveCat('all')}
          />
          {categories.map((cat) => (
            <FilterChip
              key={cat.key}
              label={cat.label}
              active={activeCat === cat.key}
              onClick={() => setActiveCat(cat.key)}
            />
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/45">
          No concepts match your search.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {groups.map((g) => (
            <section
              key={g.key}
              className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-white/90">{g.label}</h2>
                <span className="text-[11px] uppercase tracking-wider text-white/40">
                  {g.items.length}
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {g.items.map((c) => (
                  <li key={c.slug} className="flex flex-col gap-0.5">
                    <ExploreLink
                      href={exploreHref(`/concepts/${c.slug}`)}
                      variant="block"
                      className="px-3 py-2"
                    >
                      <span className="block text-sm font-medium text-white/90">
                        {c.term}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-white/55">
                        {c.short}
                      </span>
                    </ExploreLink>
                    {c.live && (
                      <ExploreLink
                        href={c.live.href}
                        className="px-3 text-[11px] text-emerald-300/70 hover:text-emerald-200"
                        ariaLabel={`See ${c.term} live: ${c.live.label}`}
                      >
                        See it live →
                      </ExploreLink>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${
        active
          ? 'bg-white/15 text-white/90 ring-1 ring-inset ring-white/20'
          : 'text-white/55 ring-1 ring-inset ring-white/10 hover:bg-white/[0.06] hover:text-white/80'
      }`}
    >
      {label}
    </button>
  );
}
