// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Windowed risk-accumulator trend — a thin display adapter.
 *
 * The canonical rolling-24h risk accumulator (per-failure contribution
 * P(T) × R, P(T) = 3 + tier at STANDARD posture) now lives in
 * `@vorionsys/rainbow`'s `computeRiskTrend` — the decontamination landed in the
 * library (0.2.x/0.3.0); the earlier 0.1.0 used an R-only proxy. No risk math
 * is reimplemented here.
 *
 * This module only adds a DISPLAY concern the library doesn't: it seeds the
 * accumulator with signals from before the display window (so sub-24h windows
 * don't ramp from zero) and then reports samples / peak / breaches for the
 * display window only.
 */

import { computeRiskTrend, type IngestedSignal, type RiskTrend } from '@vorionsys/rainbow';
import { RISK_ACCUMULATOR } from '@vorionsys/basis-spec';

/**
 * Pre-window seeding span: callers pass signals starting this far BEFORE the
 * display window so every in-window sample's rolling 24h sum is complete.
 */
export const RISK_SEED_WINDOW_MS = RISK_ACCUMULATOR.windowHours * 3_600_000;

/**
 * Canonical rolling-24h risk trend over a display window.
 *
 * Delegates the accumulator math to the library's `computeRiskTrend`, then —
 * when `displayFromMs` is given — keeps only samples at/after the display start
 * and recomputes peak / breaches / trend over that slice. Each per-sample value
 * is already a complete 24h rolling sum because `signals` includes the seed
 * span before the window.
 */
export function computeCorrectedRiskTrend(
  signals: IngestedSignal[],
  displayFromMs?: number
): RiskTrend {
  const full = computeRiskTrend(signals);
  if (displayFromMs === undefined) return full;

  const samples = full.samples.filter((s) => s.timestamp.getTime() >= displayFromMs);

  let peakInWindow = 0;
  let warningBreaches = 0;
  let degradedBreaches = 0;
  let prevAboveWarning = false;
  let prevAboveDegraded = false;
  for (const s of samples) {
    peakInWindow = Math.max(peakInWindow, s.value);
    const aboveWarning = s.value >= RISK_ACCUMULATOR.warningThreshold;
    const aboveDegraded = s.value >= RISK_ACCUMULATOR.degradedThreshold;
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
    excludedFromAccumulator: full.excludedFromAccumulator,
  };
}

/** Window-local trend label (escalating / de-escalating / stable). */
function determineTrend(samples: Array<{ timestamp: Date; value: number }>): RiskTrend['trend'] {
  if (samples.length < 2) return 'stable';
  const quarter = Math.max(1, Math.floor(samples.length / 4));
  const firstAvg = samples.slice(0, quarter).reduce((s, v) => s + v.value, 0) / quarter;
  const lastAvg = samples.slice(-quarter).reduce((s, v) => s + v.value, 0) / quarter;
  const diff = lastAvg - firstAvg;
  if (diff > 5) return 'escalating';
  if (diff < -5) return 'de-escalating';
  return 'stable';
}
