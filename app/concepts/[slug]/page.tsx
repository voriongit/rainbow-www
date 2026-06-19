// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * /concepts/<slug> — a single concept definition.
 *
 * Pure render of one entry from the static concept registry. No live data, so
 * no `export const dynamic`. Unknown slugs 404 via notFound().
 */

import { notFound } from 'next/navigation';
import { CATEGORY_LABELS, getConcept } from '../../lib/glossary';
import { ExploreLink, exploreHref } from '../../components/explore-link';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const c = getConcept(slug);
  return { title: c ? `${c.term} — RAINBOW` : 'Concept — RAINBOW' };
}

export default async function ConceptPage({ params }: PageProps) {
  const { slug } = await params;
  const c = getConcept(slug);
  if (!c) notFound();

  const related = (c.related ?? [])
    .map((s) => getConcept(s))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-4 text-sm text-white/55">
        <ExploreLink href={exploreHref('/concepts')}>← All concepts</ExploreLink>
        <ExploreLink href={exploreHref('/')}>Dashboard</ExploreLink>
      </div>

      <header className="flex flex-col gap-3">
        <span className="w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/55 ring-1 ring-inset ring-white/15">
          {CATEGORY_LABELS[c.category]}
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-white/90">{c.term}</h1>
        <p className="max-w-3xl text-base leading-relaxed text-white/80">{c.short}</p>
        {c.live && (
          <ExploreLink
            href={c.live.href}
            variant="inline"
            className="w-fit text-sm font-medium text-emerald-300/80 hover:text-emerald-200"
            ariaLabel={`See ${c.term} live: ${c.live.label}`}
          >
            See it live: {c.live.label} →
          </ExploreLink>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section className="flex h-full flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Definition
            </h2>
            <p className="text-sm leading-relaxed text-white/70">{c.long}</p>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          {c.data && c.data.length > 0 && (
            <section className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Key facts
              </h2>
              <dl className="grid grid-cols-1 gap-2">
                {c.data.map((d) => (
                  <div
                    key={d.label}
                    className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                  >
                    <dt className="text-[11px] uppercase tracking-wider text-white/40">
                      {d.label}
                    </dt>
                    <dd className="mt-0.5 font-mono text-[13px] text-white/85">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {related.length > 0 && (
            <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Related
              </h2>
              <ul className="flex flex-col gap-1">
                {related.map((r) => (
                  <li key={r.slug}>
                    <ExploreLink
                      href={exploreHref(`/concepts/${r.slug}`)}
                      variant="block"
                      className="px-3 py-2"
                    >
                      <span className="block text-sm font-medium text-white/90">{r.term}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-white/55">
                        {r.short}
                      </span>
                    </ExploreLink>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
