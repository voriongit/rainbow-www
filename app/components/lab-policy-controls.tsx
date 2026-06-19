// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Lab policy "what-if" controls. Client component by necessity (navigation on
 * click); ALL state lives in the URL — no browser storage. Mirrors
 * window-selector.tsx: useRouter + startTransition + { scroll: false }.
 *
 * These knobs explore a MODELED delegation POLICY over the synthetic, seeded
 * signal stream. They change ONLY how the policy routes/triggers escalations —
 * they do NOT touch the simulator, the trust trajectories, or any real agent.
 * Every param round-trips through the URL so the view is fully deep-linkable.
 */

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RISK_PRESETS, presetIdFor } from '../lib/lab-presets';

export interface LabPolicyState {
  window: string;
  handlers: number;
  lead: 'concentrated' | 'distributed';
  esc: 'warning' | 'degraded' | 'breaker';
}

const HANDLER_OPTIONS = [1, 2, 3, 4, 5] as const;
const LEAD_OPTIONS: { value: LabPolicyState['lead']; label: string }[] = [
  { value: 'concentrated', label: 'Concentrated' },
  { value: 'distributed', label: 'Distributed' },
];
// The risk-accumulator threshold the policy escalates AT — each maps to a real,
// distinct threshold on the risk chart (Warning ≥60 fires earliest/most;
// Breaker ≥240 fires latest/fewest). Warning = the prior default behavior.
const ESC_OPTIONS: { value: LabPolicyState['esc']; label: string }[] = [
  { value: 'warning', label: 'Warning' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'breaker', label: 'Breaker' },
];

export function LabPolicyControls({ current }: { current: LabPolicyState }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Build the next href from the current policy plus one overridden field. The
  // window is always carried so the policy view round-trips with the time window.
  const hrefWith = (patch: Partial<LabPolicyState>): string => {
    const next = { ...current, ...patch };
    const qs = new URLSearchParams();
    qs.set('window', next.window);
    qs.set('handlers', String(next.handlers));
    qs.set('lead', next.lead);
    qs.set('esc', next.esc);
    return `/lab?${qs.toString()}`;
  };

  const go = (patch: Partial<LabPolicyState>) => {
    startTransition(() => {
      router.push(hrefWith(patch), { scroll: false });
    });
  };

  const activePreset = presetIdFor(current);

  return (
    <div className={`flex flex-col gap-4 transition-opacity ${isPending ? 'opacity-60' : ''}`}>
      {/* Risk-tolerance presets — one-tap bundles of the three knobs below.
          Presets are defaults, not limits: every knob stays reachable, and a
          combination matching no preset reads as "Custom mix". */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/45">
          Risk-tolerance preset
        </span>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Risk-tolerance preset">
          {RISK_PRESETS.map((p) => {
            const active = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                title={p.hint}
                onClick={() => go({ handlers: p.handlers, lead: p.lead, esc: p.esc })}
                className={presetBtn(active)}
              >
                {p.label}
              </button>
            );
          })}
          {activePreset === 'custom' && (
            <span className="rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/60">
              Custom mix
            </span>
          )}
        </div>
      </div>

      {/* Granular knobs — the presets above are bundles of exactly these. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-5">
      <Group label="Handler pool" hint="high-trust agents available to receive escalations">
        <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Handler pool size">
          {HANDLER_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={n === current.handlers}
              onClick={() => go({ handlers: n })}
              className={btn(n === current.handlers)}
            >
              {n}
            </button>
          ))}
        </div>
      </Group>

      <Group label="Security-lead routing" hint="concentrated = one designated lead (the collusion driver)">
        <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Security-lead routing">
          {LEAD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={o.value === current.lead}
              onClick={() => go({ lead: o.value })}
              className={btn(o.value === current.lead)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Group>

      <Group label="Escalate at" hint="the risk-accumulator threshold the policy escalates on (earlier = more escalations)">
        <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Escalation threshold">
          {ESC_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={o.value === current.esc}
              onClick={() => go({ esc: o.value })}
              className={btn(o.value === current.esc)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Group>
      </div>
    </div>
  );
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-white/40" title={hint}>
        {label}
      </span>
      {children}
    </div>
  );
}

function btn(active: boolean): string {
  return `rounded-md px-3 py-1.5 text-xs font-medium tabular-nums transition-colors ${
    active ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
  }`;
}

function presetBtn(active: boolean): string {
  return `rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? 'border-amber-400/40 bg-amber-400/[0.12] text-amber-100'
      : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white/90'
  }`;
}
