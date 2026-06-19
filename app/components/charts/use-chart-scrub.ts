// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Shared "scrub" interaction for the SVG charts (LineChart + BarChart).
 *
 * Unifies mouse + touch + pen onto Pointer Events so the floating detail card
 * works on a phone (tap to select the nearest sample, drag to scrub across
 * samples) exactly as it does on desktop hover — the charts were previously
 * mouse-only (`onMouseMove`) and showed nothing on touch.
 *
 * Design notes (kept honest to the existing charts):
 * - `hover` starts `null`, so SSR === first client paint (no crosshair, no
 *   card, no highlight delta) → no hydration mismatch. Identical to the prior
 *   `useState<number | null>(null)` the charts used.
 * - `touch-action: pan-y` on the SVG lets the browser keep vertical PAGE scroll
 *   while horizontal drags are delivered to us as scrubs — so a finger landing
 *   on a chart never traps the page (a horizontal time-series scrubber wants
 *   exactly this), and a tap still selects.
 * - On touch the card PERSISTS after lift (mobile expectation); a subsequent
 *   pointer-down outside the chart dismisses it (mirrors info-link.tsx). On
 *   mouse, leaving the chart clears it (desktop hover semantics).
 * - `setHover` is returned so callers can drive the same highlight from other
 *   inputs (e.g. BarChart's <a> onFocus/onBlur — keyboard parity preserved).
 *
 * Hooks run unconditionally; `scrubHandlers(geometry)` is a plain builder called
 * AFTER the chart's empty-data guard with the per-render geometry, so the rule
 * "hooks before early return" is never violated.
 */

import { useEffect, useRef, useState } from 'react';

interface ScrubGeometry {
  /** Number of samples (points/bars). */
  count: number;
  /** x position of sample `i` in viewBox units. */
  positionOf: (i: number) => number;
  /** viewBox width in the same units as positionOf (e.g. 640). */
  width: number;
}

export function useChartScrub() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const draggingRef = useRef(false);

  // Dismiss the persistent (touch) card when the next pointer-down lands
  // outside the chart. Only armed while something is shown.
  useEffect(() => {
    if (hover == null) return;
    function onDocDown(ev: PointerEvent) {
      const svg = svgRef.current;
      if (svg && !svg.contains(ev.target as Node)) setHover(null);
    }
    document.addEventListener('pointerdown', onDocDown);
    return () => document.removeEventListener('pointerdown', onDocDown);
  }, [hover]);

  function scrubHandlers({ count, positionOf, width }: ScrubGeometry) {
    function nearest(clientX: number): number | null {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return null; // hidden / SSR — avoid NaN
      const svgX = ((clientX - rect.left) / rect.width) * width;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < count; i++) {
        const d = Math.abs(positionOf(i) - svgX);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }

    return {
      style: { touchAction: 'pan-y' as const },
      onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
        draggingRef.current = true;
        const idx = nearest(e.clientX);
        if (idx != null) setHover(idx);
      },
      onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
        // Mouse: always track (hover). Touch/pen: only while a finger is down,
        // so a passive resting finger never scrubs.
        if (e.pointerType !== 'mouse' && !draggingRef.current) return;
        const idx = nearest(e.clientX);
        if (idx != null) setHover(idx);
      },
      onPointerUp() {
        draggingRef.current = false; // leave the card up on touch
      },
      onPointerCancel() {
        draggingRef.current = false;
      },
      onPointerLeave(e: React.PointerEvent<SVGSVGElement>) {
        if (e.pointerType === 'mouse') setHover(null);
      },
    };
  }

  return { svgRef, hover, setHover, scrubHandlers };
}
