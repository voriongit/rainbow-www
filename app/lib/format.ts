// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Deterministic display formatting. Everything renders server-side (RSC),
 * so we pin locale + UTC to keep output independent of server locale.
 */

const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const DATE_TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});

/** "14:05" (UTC) */
export function fmtTime(d: Date | number): string {
  return TIME_FMT.format(d);
}

/** "Jun 6, 14:05" (UTC) */
export function fmtDateTime(d: Date | number): string {
  return DATE_TIME_FMT.format(d);
}

/** "Jun 6" (UTC) */
export function fmtDate(d: Date | number): string {
  return DATE_FMT.format(d);
}

/** Axis label appropriate for the window span */
export function fmtAxisTime(d: Date | number, spanMs: number): string {
  return spanMs > 48 * 3_600_000 ? fmtDate(d) : fmtTime(d);
}

/** "412" / "412.4" — fixed decimals, no locale grouping surprises */
export function fmtNum(n: number, decimals = 0): string {
  return n.toFixed(decimals);
}

/** "+2.4" / "-1.1" / "0.0" */
export function fmtSigned(n: number, decimals = 1): string {
  const s = n.toFixed(decimals);
  return n > 0 ? `+${s}` : s;
}

/** 0.87 → "87%" */
export function fmtPct(ratio: number, decimals = 0): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}
