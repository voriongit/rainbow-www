// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Inline "explain this" affordance — a small ⓘ that links to the concept page
 * for a glossary slug. Lets every metric label, threshold, and badge offer a
 * plain-language definition without cluttering the dashboard. Server component.
 */

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
  const name = label ?? concept?.term ?? slug;
  return (
    <Link
      href={`/concepts/${slug}`}
      title={concept ? `${concept.term} — ${concept.short}` : `Explain: ${name}`}
      aria-label={`Explain ${name}`}
      className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 align-middle text-[9px] leading-none text-white/40 transition-colors hover:border-white/40 hover:text-white/80 focus-visible:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
    >
      i
    </Link>
  );
}
