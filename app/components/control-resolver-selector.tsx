// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Control-model resolver selector. Client component by necessity (it navigates
 * on click); state lives entirely in the URL — no browser storage, no local
 * state machine. Mirrors window-selector's pattern: useRouter + startTransition,
 * { scroll: false }, and state is set in the click handler, never in an effect.
 *
 * READ-ONLY by construction: every interaction only rewrites query params on
 * /model, which the server page re-resolves through the illustrative reference
 * merge. There is no apply/write path here — picking a scope only *shows* a
 * different illustrative resolution. It controls nothing.
 */

import { useRouter } from 'next/navigation';
import { Fragment, useTransition } from 'react';

/** One selectable dimension: a query key + its allowed values (validated server-side too). */
export interface ResolverControl {
  /** The URL query parameter this control writes. */
  param: string;
  /** Human label for the control group. */
  label: string;
  /** Allowed values; the first-class enum. The page clamps to these as well. */
  options: { value: string; label: string }[];
  /** Currently selected value (already validated/clamped by the page). */
  current: string;
  /** Optional group heading, rendered once above the first control of a new group. */
  group?: string;
}

interface ControlResolverSelectorProps {
  /** All controls; their `param` keys are merged into a single URL on every click. */
  controls: ResolverControl[];
}

export function ControlResolverSelector({ controls }: ControlResolverSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /** Build the next href from the full current selection, overriding one param. */
  function hrefWith(param: string, value: string): string {
    const next = new URLSearchParams();
    for (const c of controls) {
      next.set(c.param, c.param === param ? value : c.current);
    }
    return `/model?${next.toString()}`;
  }

  return (
    <div
      className={`flex flex-col gap-3 ${isPending ? 'opacity-60' : ''}`}
      role="group"
      aria-label="Illustrative resolution scope (read-only)"
    >
      {controls.map((control, i) => {
        const newGroup = !!control.group && control.group !== controls[i - 1]?.group;
        return (
          <Fragment key={control.param}>
            {newGroup && (
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55 first:mt-0">
                {control.group}
              </span>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wider text-white/55">{control.label}</span>
              <div className="flex flex-wrap gap-1">
                {control.options.map((opt) => {
                  const selected = opt.value === control.current;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        startTransition(() => {
                          router.push(hrefWith(control.param, opt.value), { scroll: false });
                        })
                      }
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? 'border-white/20 bg-white/10 text-white'
                          : 'border-white/10 bg-white/[0.02] text-white/50 hover:text-white/80'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
