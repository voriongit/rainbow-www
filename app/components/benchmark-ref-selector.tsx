// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Reference-fleet selector for /benchmark. Client component (navigation on
 * click); ALL state lives in the URL — no browser storage. Mirrors
 * window-selector.tsx / lab-policy-controls.tsx (useRouter + startTransition +
 * { scroll: false }). Only chooses which curated reference the live synthetic
 * fleet is read against — no real agent, no fetched data.
 */

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { REFERENCE_FLEETS } from '../lib/reference-fleets';

export function BenchmarkRefSelector({ current, window }: { current: string; window: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const go = (id: string) => {
    startTransition(() => {
      const qs = new URLSearchParams({ ref: id, window });
      router.push(`/benchmark?${qs.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-white/45">
        Reference fleet
      </span>
      <div
        className={`flex flex-wrap items-center gap-1.5 transition-opacity ${isPending ? 'opacity-60' : ''}`}
        role="group"
        aria-label="Reference fleet"
      >
        {REFERENCE_FLEETS.map((f) => {
          const active = f.id === current;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={active}
              title={f.blurb}
              onClick={() => go(f.id)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'border-cyan-400/40 bg-cyan-400/[0.12] text-cyan-100'
                  : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white/90'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
