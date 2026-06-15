// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Trust tier display helpers. Tier boundaries come from the canonical
 * `@vorionsys/basis` TRUST_TIERS; only the colors are presentation-local.
 */

import { TRUST_TIERS } from '@vorionsys/basis-spec';

export type TierKey = keyof typeof TRUST_TIERS;

export const TIER_ORDER: TierKey[] = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Spectrum palette, T0 (untrusted, gray) through T7 (autonomous, violet) */
export const TIER_COLORS: Record<TierKey, string> = {
  T0: '#6b7280',
  T1: '#ef4444',
  T2: '#f97316',
  T3: '#eab308',
  T4: '#22c55e',
  T5: '#06b6d4',
  T6: '#6366f1',
  T7: '#a855f7',
};

const TIER_ENTRIES = TIER_ORDER.map((key) => ({
  key,
  name: TRUST_TIERS[key].name,
  min: TRUST_TIERS[key].min,
  max: TRUST_TIERS[key].max,
}));

/** Tier key for a trust score (0-1000) */
export function tierKeyForScore(score: number): TierKey {
  for (let i = TIER_ENTRIES.length - 1; i >= 0; i--) {
    if (score >= TIER_ENTRIES[i].min) return TIER_ENTRIES[i].key;
  }
  return 'T0';
}

/** Tier index (0-7) for a trust score */
export function tierIndexForScore(score: number): number {
  for (let i = TIER_ENTRIES.length - 1; i >= 0; i--) {
    if (score >= TIER_ENTRIES[i].min) return i;
  }
  return 0;
}

/** Human-readable tier name (e.g. 'Monitored') */
export function tierName(key: TierKey): string {
  return TRUST_TIERS[key].name;
}
