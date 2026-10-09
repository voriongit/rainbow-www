// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Per-route metadata. Every view is URL-addressable (agent, window, tier,
 * factor…), so a shared link should say which view it opens: a unique title
 * and description, and a canonical URL that keeps the view-defining query.
 * Titles are written absolute ("<view> — RAINBOW"); the layout supplies
 * metadataBase so canonicals resolve against rainbow.vorion.org.
 */

import type { Metadata } from 'next';

export const SITE_URL = 'https://rainbow.vorion.org';

export function pageMetadata({
  title,
  description,
  path,
  query,
}: {
  /** View name, e.g. "cascade-03 · 24h". " — RAINBOW" is appended. */
  title: string;
  description: string;
  path: string;
  /** View-defining params only (agent, window…); undefined values dropped. */
  query?: Record<string, string | undefined>;
}): Metadata {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v) qs.set(k, v);
  }
  const canonical = qs.size > 0 ? `${path}?${qs.toString()}` : path;
  const full = `${title} — RAINBOW`;
  return {
    // Absolute: the root page shares the layout's segment, where the
    // "%s — RAINBOW" template does not apply. One rule for every route.
    title: { absolute: full },
    description,
    alternates: { canonical },
    openGraph: { title: full, description, url: canonical, siteName: 'Vorion RAINBOW', type: 'website' },
    twitter: { card: 'summary', title: full, description },
  };
}
