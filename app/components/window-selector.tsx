// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Time-window selector. Client component by necessity (navigation on click);
 * state lives in the URL — no browser storage.
 */

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface WindowSelectorProps {
  durations: string[];
  current: string;
  agentId: string;
}

export function WindowSelector({ durations, current, agentId }: WindowSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className={`flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 ${
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
              router.push(`/?window=${d}&agent=${encodeURIComponent(agentId)}`, {
                scroll: false,
              });
            })
          }
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            d === current
              ? 'bg-white/10 text-white'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
