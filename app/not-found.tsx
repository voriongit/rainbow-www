// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * App-wide 404 — shown for unknown routes and for any page that calls
 * notFound() (e.g. an unrecognized agent, factor, or cluster id). Static,
 * data-free; keeps the dashboard's surface idiom and offers one way back.
 */

import { ExploreLink } from './components/explore-link';

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6 lg:px-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-white/90">Not found</h1>
      <p className="text-sm text-white/55">That view doesn’t exist.</p>
      <ExploreLink href="/" className="text-sm text-white/80">
        ← Back to the dashboard
      </ExploreLink>
    </main>
  );
}
