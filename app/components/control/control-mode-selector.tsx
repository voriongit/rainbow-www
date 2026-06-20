// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Per-agent control-card mode selector.
 *
 * A minimal, URL-driven operation-mode switch for the /control/[agentId] card.
 * It is the ONLY interactive surface on the control card and it is still
 * strictly READ-ONLY: clicking a mode only rewrites the `?mode` query param, so
 * the reference merge *shows* a different illustrative resolution. There is no
 * apply/write path — this changes nothing about any live agent (there are none).
 *
 * Follows the house client-component idiom (window-selector.tsx): useRouter +
 * useTransition, state set in the click handler (never in an effect), navigation
 * with { scroll: false }, and `aria-pressed` on every toggle for WCAG.
 */

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface ModeOption {
  value: string;
  label: string;
}

interface ControlModeSelectorProps {
  /** The path to push back to (e.g. `/control/cascade-03`). */
  basePath: string;
  /** Available operation modes (value = OperationModeKey, label = display). */
  options: ModeOption[];
  /** The currently-selected mode key. */
  current: string;
}

export function ControlModeSelector({ basePath, options, current }: ControlModeSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className={`flex flex-wrap gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5 ${
        isPending ? 'opacity-60' : ''
      }`}
      role="group"
      aria-label="Operation mode"
    >
      {options.map((o) => {
        const active = o.value === current;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() =>
              startTransition(() => {
                router.push(`${basePath}?mode=${encodeURIComponent(o.value)}`, {
                  scroll: false,
                });
              })
            }
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white/85'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
