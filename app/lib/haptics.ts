// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Subtle haptic feedback (Vibration API). Guarded: no-op when unsupported
 * (iOS Safari, desktop) or when the user prefers reduced motion. Keep durations
 * tiny (≤15ms) — a tick, never a buzz. Used by gesture/threshold interactions.
 */
export function haptic(ms = 10): void {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
