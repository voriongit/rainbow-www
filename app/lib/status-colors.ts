// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Consolidated status palette. These hexes were previously re-declared inline
 * across five panels (trajectory / risk-trend / transitions / fleet /
 * factor-health); this is the single source so every surface — including the
 * new drill-down/explore views — stays consistent.
 *
 * The tier spectrum lives separately in `./tiers` (TIER_COLORS), because it is
 * keyed by tier and derived alongside the basis-spec TRUST_TIERS boundaries.
 */

export const STATUS = {
  good: '#22c55e', // success / rising / promotion / ACTIVE
  bad: '#ef4444', // failure / falling / demotion / critical
  warn: '#f59e0b', // warning / blocked
  warnAlt: '#f97316', // degraded / risk series
  info: '#06b6d4', // neutral info / resets / default series
  neutral: '#94a3b8', // stable / muted
  neutralDim: '#64748b',
} as const;

/** Severity → color (BusSeverity: low/medium/high/critical/emergency). */
export const SEVERITY_COLORS: Record<string, string> = {
  low: STATUS.neutral,
  medium: STATUS.info,
  high: STATUS.warn,
  critical: STATUS.bad,
  emergency: '#dc2626',
};

/** Outcome → color (success / failure / blocked). */
export const OUTCOME_COLORS: Record<string, string> = {
  success: STATUS.good,
  failure: STATUS.bad,
  blocked: STATUS.warnAlt,
};

/** Direction trend → color (rising/falling/stable, escalating/de-escalating/stable). */
export const TREND_COLORS: Record<string, string> = {
  rising: STATUS.good,
  falling: STATUS.bad,
  stable: STATUS.neutral,
  escalating: STATUS.bad,
  'de-escalating': STATUS.good,
};

/** Lifecycle → color (ACTIVE/DEGRADED/TRIPPED). */
export const LIFECYCLE_COLORS: Record<string, string> = {
  ACTIVE: STATUS.good,
  DEGRADED: STATUS.warn,
  TRIPPED: STATUS.bad,
};

/** Health (0..1 success rate) → color, matching the factor-health thresholds. */
export function healthColor(score: number): string {
  if (score >= 0.9) return STATUS.good;
  if (score >= 0.7) return STATUS.warn;
  return STATUS.bad;
}

/**
 * Tint a hex color for use as a fill/border — the house idiom is `${hex}1a`
 * (~10% alpha). Pass an alpha suffix like '1a', '0d' (~5%), '55' (~33%).
 */
export function tint(hex: string, alpha = '1a'): string {
  return `${hex}${alpha}`;
}
