// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Corrected risk-accumulator trend — the full canonical formula.
 *
 * `@vorionsys/rainbow@0.1.0`'s `computeRiskTrend` approximates each failure's
 * contribution as the raw risk multiplier R (its source notes "Full formula
 * would be P(T) × R, but we don't have tier in signal"). Signals here DO
 * carry tier (`tierAfter` / `scoreAfter`), so this module replays the rolling
 * 24h accumulator with the canonical contribution from BASIS:
 *
 *   contribution = P(T) × R
 *   P(T) = penaltyRatioMin + (T/7) × (penaltyRatioMax − penaltyRatioMin)
 *        = 3 + T at STANDARD posture
 *
 * SEAM (#3 rainbow-decontaminate): when the corrected accumulator lands in
 * `@vorionsys/rainbow`, delete this module and use the library's
 * `computeRiskTrend` — the returned `RiskTrend` shape is identical.
 */

import {
  PENALTY_RATIO_MIN,
  PENALTY_RATIO_MAX,
  RISK_ACCUMULATOR,
  RISK_LEVELS,
} from '@vorionsys/basis';
import type { IngestedSignal, RiskTrend, RiskEscalation } from '@vorionsys/rainbow';

const ACCUMULATOR_WINDOW_MS = RISK_ACCUMULATOR.windowHours * 3_600_000;

/** P(T) per the canonical loss formula (STANDARD posture: 3 + T) */
function penaltyRatio(tierIndex: number): number {
  return PENALTY_RATIO_MIN + (tierIndex / 7) * (PENALTY_RATIO_MAX - PENALTY_RATIO_MIN);
}

/** Tier index at the moment of failure (prefer pre-failure score) */
function tierAtFailure(signal: IngestedSignal): number {
  if (signal.scoreAfter !== undefined) {
    // Reconstruct the score just before this signal's delta was applied
    const before = Math.max(0, Math.min(1000, signal.scoreAfter - signal.delta));
    return tierIndexFor(before);
  }
  if (signal.tierAfter !== undefined) return signal.tierAfter;
  return 3; // conservative mid-fleet fallback when no tier evidence exists
}

const TIER_MINS = [0, 200, 350, 500, 650, 800, 876, 951];

function tierIndexFor(score: number): number {
  for (let i = TIER_MINS.length - 1; i >= 0; i--) {
    if (score >= TIER_MINS[i]) return i;
  }
  return 0;
}

/**
 * Pre-window seeding span: callers should pass signals starting this far
 * BEFORE the display window so every sample's rolling 24h sum is complete.
 */
export const RISK_SEED_WINDOW_MS = ACCUMULATOR_WINDOW_MS;

/**
 * Compute the corrected risk accumulator trend from signals.
 * Mirrors the library's sampling/breach semantics; only the per-failure
 * contribution differs (P(T) × R instead of the R-only proxy).
 *
 * `displayFromMs` — when provided, ALL passed signals feed the rolling sum
 * (pass signals from `displayFromMs - RISK_SEED_WINDOW_MS` onward), but
 * samples/peak/breaches are reported only for timestamps inside the display
 * window. Without seeding, the left edge of every window would artificially
 * ramp from zero and sub-24h windows would understate a rolling-24h metric.
 */
export function computeCorrectedRiskTrend(
  signals: IngestedSignal[],
  displayFromMs?: number
): RiskTrend {
  if (signals.length === 0) {
    return {
      currentAccumulatorValue: 0,
      peakInWindow: 0,
      warningBreaches: 0,
      degradedBreaches: 0,
      trend: 'stable',
      samples: [],
    };
  }

  const failureEvents: Array<{ timestamp: Date; contribution: number }> = [];
  for (const signal of signals) {
    if (!signal.success && !signal.blocked && signal.riskLevel) {
      const riskEntry = RISK_LEVELS[signal.riskLevel as keyof typeof RISK_LEVELS];
      if (riskEntry) {
        failureEvents.push({
          timestamp: signal.timestamp,
          contribution: penaltyRatio(tierAtFailure(signal)) * riskEntry.multiplier,
        });
      }
    }
  }

  const uniqueTimestamps = [...new Set(signals.map((s) => s.timestamp.getTime()))]
    .filter((t) => displayFromMs === undefined || t >= displayFromMs)
    .sort((a, b) => a - b)
    .map((t) => new Date(t));

  const samples: Array<{ timestamp: Date; value: number }> = [];
  let peakInWindow = 0;
  let warningBreaches = 0;
  let degradedBreaches = 0;
  let prevAboveWarning = false;
  let prevAboveDegraded = false;

  for (const ts of uniqueTimestamps) {
    const cutoff = ts.getTime() - ACCUMULATOR_WINDOW_MS;
    const value = failureEvents
      .filter((e) => e.timestamp.getTime() > cutoff && e.timestamp.getTime() <= ts.getTime())
      .reduce((sum, e) => sum + e.contribution, 0);

    samples.push({ timestamp: ts, value });
    peakInWindow = Math.max(peakInWindow, value);

    const aboveWarning = value >= RISK_ACCUMULATOR.warningThreshold;
    const aboveDegraded = value >= RISK_ACCUMULATOR.degradedThreshold;
    if (aboveWarning && !prevAboveWarning) warningBreaches++;
    if (aboveDegraded && !prevAboveDegraded) degradedBreaches++;
    prevAboveWarning = aboveWarning;
    prevAboveDegraded = aboveDegraded;
  }

  return {
    currentAccumulatorValue: samples.length > 0 ? samples[samples.length - 1].value : 0,
    peakInWindow,
    warningBreaches,
    degradedBreaches,
    trend: determineTrend(samples),
    samples,
  };
}

function determineTrend(samples: Array<{ timestamp: Date; value: number }>): RiskEscalation {
  if (samples.length < 2) return 'stable';
  const quarter = Math.max(1, Math.floor(samples.length / 4));
  const firstAvg = samples.slice(0, quarter).reduce((s, v) => s + v.value, 0) / quarter;
  const lastAvg = samples.slice(-quarter).reduce((s, v) => s + v.value, 0) / quarter;
  const diff = lastAvg - firstAvg;
  if (diff > 5) return 'escalating';
  if (diff < -5) return 'de-escalating';
  return 'stable';
}
