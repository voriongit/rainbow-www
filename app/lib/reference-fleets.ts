// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Curated reference fleet profiles for cross-fleet benchmarking. These are
 * hand-authored, fully deterministic ILLUSTRATIVE benchmarks — not real
 * organizations, not live simulations, and not derived from any dataset. They
 * exist to give the live (synthetic) fleet something to be read against: a
 * well-governed target, a middling industry-baseline mix, and a degraded fleet.
 * Tier distributions and the mean/median that summarize them are authored to be
 * internally consistent with the canonical 8-tier score bands.
 *
 * Pure + dependency-light (tier display only), so server- and client-safe.
 */

import type { TierKey } from './tiers';
import { TIER_ORDER } from './tiers';

export interface FleetProfile {
  id: 'well-governed' | 'baseline' | 'degraded';
  label: string;
  blurb: string;
  byTier: Record<TierKey, number>;
  totalAgents: number;
  averageScore: number;
  medianScore: number;
}

function profile(
  id: FleetProfile['id'],
  label: string,
  blurb: string,
  counts: Partial<Record<TierKey, number>>,
  averageScore: number,
  medianScore: number
): FleetProfile {
  const byTier = {} as Record<TierKey, number>;
  let totalAgents = 0;
  for (const t of TIER_ORDER) {
    const c = counts[t] ?? 0;
    byTier[t] = c;
    totalAgents += c;
  }
  return { id, label, blurb, byTier, totalAgents, averageScore, medianScore };
}

export const REFERENCE_FLEETS: readonly FleetProfile[] = [
  profile(
    'well-governed',
    'Well-governed',
    'An aspirational target — most agents have earned high, stable trust and almost none sit in the untrusted bands.',
    { T7: 7, T6: 7, T5: 4, T4: 2 },
    806,
    812
  ),
  profile(
    'baseline',
    'Industry baseline',
    'A middling reference mix — trust clusters around the middle tiers with a tail in both directions.',
    { T6: 2, T5: 5, T4: 6, T3: 4, T2: 2, T1: 1 },
    550,
    562
  ),
  profile(
    'degraded',
    'Degraded fleet',
    'A fleet under stress — many agents have fallen into low-trust bands and the high tiers are thin.',
    { T4: 3, T3: 4, T2: 6, T1: 5, T0: 2 },
    318,
    312
  ),
] as const;

export const DEFAULT_REFERENCE_ID: FleetProfile['id'] = 'well-governed';

export function isReferenceId(v: unknown): v is FleetProfile['id'] {
  return v === 'well-governed' || v === 'baseline' || v === 'degraded';
}

export function referenceById(id: string | undefined): FleetProfile {
  return (
    REFERENCE_FLEETS.find((f) => f.id === id) ??
    REFERENCE_FLEETS.find((f) => f.id === DEFAULT_REFERENCE_ID)!
  );
}
