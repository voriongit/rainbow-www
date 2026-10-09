// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Rainbow Trust Tier Spectrum — the hero. Makes the "RAINBOW" promise literal:
 * the eight trust tiers (T0→T7) as a continuous color spectrum, with the live
 * fleet distribution overlaid as a clickable band per tier (→ /tier/[key]).
 *
 * Server component (deterministic from props; drill-down via <Link>) — no client
 * state, no hydration cost. Reuses the canonical TIER_COLORS palette so it can
 * never drift from the rest of the dashboard. Reinforces the non-binary brand:
 * trust is a continuous spectrum (the Elbow, elsewhere, is where it bends to a
 * binary state).
 */

import Link from 'next/link';
import { exploreHref } from './explore-link';
import { TIER_COLORS, TIER_ORDER, tierName } from '../lib/tiers';
import { fmtNum } from '../lib/format';

interface TierSpectrumProps {
  byTier: Record<string, number>;
  totalAgents: number;
  averageScore: number;
  medianScore: number;
  duration: string;
  /** Why an empty band is empty, e.g. "none in this seed", so a zero never
   *  reads as a filter bug. */
  emptyReason?: string;
}

export function TierSpectrum({
  byTier,
  totalAgents,
  averageScore,
  medianScore,
  duration,
  emptyReason = 'no agents',
}: TierSpectrumProps) {
  const emptyTiers = TIER_ORDER.filter((t) => (byTier[t] ?? 0) === 0);
  const gradient = `linear-gradient(90deg, ${TIER_ORDER.map((t) => TIER_COLORS[t]).join(', ')})`;

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white/90">Trust spectrum</h2>
          <p className="mt-0.5 text-xs text-white/45">
            Continuous trust across the eight tiers · {totalAgents} agents · tap a band to explore
          </p>
        </div>
        <p className="shrink-0 text-[11px] text-white/45">
          fleet mean <span className="font-semibold text-white/80">{fmtNum(averageScore)}</span>
          <span className="mx-1 text-white/25">·</span>
          median <span className="font-semibold text-white/80">{fmtNum(medianScore)}</span>
        </p>
      </header>

      {/* The literal rainbow ribbon (decorative — the bands below carry the data). */}
      <div className="h-2 w-full rounded-full" style={{ backgroundImage: gradient }} aria-hidden="true" />

      {/* Live distribution as clickable tier bands. */}
      <div className="mt-3 grid grid-cols-8 gap-1.5">
        {TIER_ORDER.map((t) => {
          const count = byTier[t] ?? 0;
          const occupied = count > 0;
          const color = TIER_COLORS[t];
          return (
            <Link
              key={t}
              href={exploreHref(`/tier/${t}`, { window: duration })}
              aria-label={`Tier ${t} ${tierName(t)}: ${occupied ? `${count} agent${count === 1 ? '' : 's'}` : emptyReason}`}
              title={occupied ? undefined : `${t}: ${emptyReason}`}
              className="flex flex-col items-center rounded-lg border px-1 py-2 text-center outline-none [touch-action:manipulation] transition-colors hover:brightness-125 focus-visible:ring-1 focus-visible:ring-white/40"
              style={{
                borderColor: occupied ? `${color}55` : 'rgba(255,255,255,0.06)',
                backgroundColor: occupied ? `${color}14` : 'transparent',
              }}
            >
              <span
                className="text-base font-bold tabular-nums"
                style={{ color: occupied ? color : 'rgba(255,255,255,0.25)' }}
              >
                {count}
              </span>
              <span className="text-[11px] font-semibold text-white/70">{t}</span>
              <span className="hidden text-[9px] leading-tight text-white/35 sm:block">{tierName(t)}</span>
            </Link>
          );
        })}
      </div>
      {emptyTiers.length > 0 && (
        <p className="mt-2 text-[11px] text-white/45">
          {emptyTiers.join(', ')}: {emptyReason}.
        </p>
      )}
    </section>
  );
}
