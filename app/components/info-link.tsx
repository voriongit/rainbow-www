// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * The inline "explain this" affordance — a small ⓘ that:
 *   • on hover/focus shows a tooltip with the concept's one-line summary, and
 *   • on click opens an in-place popover with the full definition, key facts,
 *     and a link to the concept's full page.
 *
 * Every metric label, threshold and badge that carries an <InfoLink> therefore
 * gets both a tooltip and a popup with no change at the call site. The only
 * client component in the explore layer; closes on Esc or outside-click.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getConcept } from '../lib/glossary';

interface InfoLinkProps {
  /** A glossary concept slug (see lib/glossary). */
  slug: string;
  /** Optional label override for the accessible name. */
  label?: string;
}

export function InfoLink({ slug, label }: InfoLinkProps) {
  const concept = getConcept(slug);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const name = label ?? concept?.term ?? slug;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <span ref={ref} className="group/tip relative ml-1 inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Explain ${name}`}
        aria-expanded={open}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 text-[9px] font-semibold leading-none text-white/40 transition-colors hover:border-white/40 hover:text-white/80 focus-visible:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
      >
        i
      </button>

      {/* Hover/focus tooltip — the short summary (hidden while the popover is open) */}
      {concept && !open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 hidden w-max max-w-[220px] -translate-x-1/2 whitespace-normal rounded-md border border-white/15 bg-[#0c0c14] px-2.5 py-1.5 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-white/80 shadow-lg group-hover/tip:block group-focus-within/tip:block"
        >
          {concept.short}
        </span>
      )}

      {/* Click popover — the full definition */}
      {open && concept && (
        <div
          role="dialog"
          aria-label={concept.term}
          className="absolute left-1/2 top-full z-50 mt-1.5 w-72 -translate-x-1/2 rounded-lg border border-white/15 bg-[#0c0c14] p-3 text-left shadow-xl"
        >
          <p className="text-xs font-semibold text-white/90">{concept.term}</p>
          <p className="mt-1 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-white/65">
            {concept.long}
          </p>
          {concept.data && concept.data.length > 0 && (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {concept.data.map((d) => (
                <div key={d.label}>
                  <dt className="text-[9px] uppercase tracking-wider text-white/35">{d.label}</dt>
                  <dd className="text-[11px] text-white/80">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <Link
            href={`/concepts/${slug}`}
            onClick={() => setOpen(false)}
            className="mt-2.5 inline-block text-[11px] text-cyan-300/80 transition-colors hover:text-cyan-200"
          >
            Open full page →
          </Link>
        </div>
      )}
    </span>
  );
}
