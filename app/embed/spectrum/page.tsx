// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Embeddable widget — compact tier-spectrum mini. A self-contained, iframe-ready
 * version of the dashboard's spectrum hero: the fleet distribution across the
 * eight trust tiers (T0–T7) as a rainbow ribbon plus a per-tier count strip.
 * Read-only over the deterministic simulator; supports `?window=`. RSC only.
 */

import { ensureHydrated, getFleetSnapshot, isPresetDuration } from '../../lib/data-source';
import { TIER_COLORS, TIER_ORDER, tierName } from '../../lib/tiers';
import { fmtNum } from '../../lib/format';
import { EmbedShell } from '../embed-shell';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ window?: string }>;
}

export default async function EmbedSpectrumPage({ searchParams }: PageProps) {
  await ensureHydrated();
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';

  const { fleet } = getFleetSnapshot(window);
  const byTier = fleet.byTier;
  const gradient = `linear-gradient(90deg, ${TIER_ORDER.map((t) => TIER_COLORS[t]).join(', ')})`;

  return (
    <EmbedShell href={`https://rainbow.vorion.org/?window=${window}`}>
      <header className="mb-2.5 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-xs font-semibold tracking-wide text-white/90">Trust spectrum</h1>
          <p className="mt-0.5 text-[10px] text-white/45">
            {fleet.totalAgents} agents across T0–T7
          </p>
        </div>
        <p className="shrink-0 text-[10px] text-white/45">
          mean <span className="font-semibold text-white/80">{fmtNum(fleet.averageScore)}</span>
        </p>
      </header>

      {/* The literal rainbow ribbon (decorative). */}
      <div
        className="h-1.5 w-full rounded-full"
        style={{ backgroundImage: gradient }}
        aria-hidden="true"
      />

      {/* Live distribution as a count strip. */}
      <div className="mt-2.5 grid grid-cols-8 gap-1">
        {TIER_ORDER.map((t) => {
          const count = byTier[t] ?? 0;
          const occupied = count > 0;
          const color = TIER_COLORS[t];
          return (
            <div
              key={t}
              title={`Tier ${t} — ${tierName(t)}: ${count} agent${count === 1 ? '' : 's'}`}
              className="flex flex-col items-center rounded-md border px-0.5 py-1 text-center"
              style={{
                borderColor: occupied ? `${color}55` : 'rgba(255,255,255,0.06)',
                backgroundColor: occupied ? `${color}14` : 'transparent',
              }}
            >
              <span
                className="text-sm font-bold tabular-nums"
                style={{ color: occupied ? color : 'rgba(255,255,255,0.25)' }}
              >
                {count}
              </span>
              <span className="text-[9px] font-semibold text-white/65">{t}</span>
            </div>
          );
        })}
      </div>
    </EmbedShell>
  );
}
