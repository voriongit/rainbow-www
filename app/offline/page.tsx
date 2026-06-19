// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Offline — RAINBOW',
};

/**
 * Static offline fallback served by the service worker when a navigation fails
 * with no cached page. Imports no data source so it precaches cleanly.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-3xl font-semibold tracking-tight">You&apos;re offline</div>
      <p className="text-sm leading-relaxed text-white/55">
        RAINBOW shows live trust telemetry, so this view needs a connection. Any pages you&apos;ve
        already opened are still available from the cache.
      </p>
      <Link
        href="/"
        className="rounded-md border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white/80 transition-colors hover:border-white/30 hover:text-white"
      >
        Back to the dashboard
      </Link>
    </main>
  );
}
