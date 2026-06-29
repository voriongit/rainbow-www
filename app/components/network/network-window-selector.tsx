// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Time-window selector for /network. Client component by necessity (navigation
 * on click); ALL state lives in the URL — no browser storage. Mirrors the
 * house window-selector.tsx / benchmark-ref-selector.tsx pattern exactly
 * (useRouter + startTransition + { scroll: false }); state is set in the click
 * handler, never in an effect. It only re-points the ?window param on the
 * /network route — no real agent, no fetched data.
 */

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function NetworkWindowSelector({
  durations,
  current,
}: {
  durations: string[];
  current: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-white/55">
        Time window
      </span>
      <div
        className={`flex w-fit rounded-lg border border-white/10 bg-white/[0.03] p-0.5 transition-opacity ${
          isPending ? 'opacity-60' : ''
        }`}
        role="group"
        aria-label="Time window"
      >
        {durations.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === current}
            onClick={() =>
              startTransition(() => {
                const qs = new URLSearchParams({ window: d });
                router.push(`/network?${qs.toString()}`, { scroll: false });
              })
            }
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              d === current
                ? 'bg-white/10 text-white'
                : 'text-white/55 hover:text-white/90'
            }`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}
