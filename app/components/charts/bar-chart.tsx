// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Interactive SVG bar chart. The bars, inline value labels, axis labels and
 * (when an href is provided) drill-down anchors render server-identically; on
 * top, a client hover layer tracks the cursor, snaps to the nearest bar, lifts
 * a crosshair + highlighted bar, and shows a floating detail card (value +
 * category). Clickable bars stay real <a> links and their focus drives the same
 * highlight + card as the mouse, so keyboard users get parity with the cursor.
 *
 * SSR output equals the static chart: `hover` starts `null`, so the server and
 * first client paint render no crosshair, no highlight delta and no card — there
 * is no hydration mismatch. All values use the deterministic fmtNum formatter.
 */

import { fmtNum } from '../../lib/format';
import { useChartScrub } from './use-chart-scrub';

export interface Bar {
  label: string;
  value: number;
  color: string;
  /** Secondary line under the label / hover-card subtitle (e.g. tier name, score range). */
  sublabel?: string;
  /** Precomputed drill-down URL. When set, the bar becomes a clickable <a> link. */
  href?: string;
}

interface BarChartProps {
  bars: Bar[];
  height?: number;
  /** Hide per-bar inline value labels and on-axis sublabels (dense histograms). */
  dense?: boolean;
  /** Label for the value in the hover card (e.g. "Agents", "Count"). */
  valueLabel?: string;
}

const W = 640;
const PAD = { top: 16, right: 8, bottom: 34, left: 8 };

export function BarChart({ bars, height = 190, dense = false, valueLabel = 'Value' }: BarChartProps) {
  const { svgRef, hover, setHover, scrubHandlers } = useChartScrub();

  // Guard AFTER hooks so hook order is stable across renders (mirrors LineChart).
  if (bars.length === 0) return null;

  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const slot = innerW / bars.length;
  const barW = Math.min(slot * 0.62, 56);

  const centerX = (i: number) => PAD.left + slot * i + slot / 2;
  const barH = (v: number) => (v / max) * innerH;
  const barTop = (v: number) => PAD.top + innerH - barH(v);

  const handlers = scrubHandlers({ count: bars.length, positionOf: centerX, width: W });

  const hp = hover != null ? bars[hover] : null;
  const hcx = hover != null ? centerX(hover) : 0;
  const hyTop = hp ? barTop(hp.value) : 0;
  const hLeft = (hcx / W) * 100;
  // Flip the card horizontally near the edges so it stays on-canvas...
  const cardX = hLeft > 80 ? '-100%' : hLeft < 20 ? '0' : '-50%';
  // ...and vertically: tall bars sit near the top, where a card placed above
  // would clip off-canvas — drop it just below the bar top instead.
  const cardBelow = hyTop - PAD.top < innerH * 0.4;
  const cardY = cardBelow ? '0' : '-100%';
  const cardTransform = `translate(${cardX}, ${cardY})`;
  const cardMarginTop = cardBelow ? 6 : -6;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Bar chart (tap or hover for values)"
        {...handlers}
      >
        {bars.map((b, i) => {
          const cx = centerX(i);
          const h = barH(b.value);
          const yTop = barTop(b.value);
          const isActive = hover === i;
          const inner = (
            <>
              <rect
                x={cx - barW / 2}
                y={yTop}
                width={barW}
                height={Math.max(h, b.value > 0 ? 2 : 0)}
                rx="3"
                fill={b.color}
                fillOpacity={isActive ? '1' : '0.85'}
                stroke="#ffffff"
                strokeOpacity={isActive ? '0.9' : '0'}
                strokeWidth={isActive ? 1.5 : 0}
              />
              {!dense && b.value > 0 && (
                <text
                  x={cx}
                  y={yTop - 5}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#ffffff"
                  fillOpacity={isActive ? '1' : '0.85'}
                >
                  {fmtNum(b.value, Number.isInteger(b.value) ? 0 : 1)}
                </text>
              )}
              <text x={cx} y={H - 20} textAnchor="middle" fontSize={dense ? 8 : 11} fill="#ffffff" fillOpacity="0.6">
                {b.label}
              </text>
              {!dense && b.sublabel && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="8" fill="#ffffff" fillOpacity="0.35">
                  {b.sublabel}
                </text>
              )}
            </>
          );
          return b.href ? (
            <a
              key={b.label}
              href={b.href}
              className="cursor-pointer"
              aria-label={`${b.label}${b.sublabel ? ` (${b.sublabel})` : ''}: ${b.value}`}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              {inner}
            </a>
          ) : (
            <g key={b.label}>{inner}</g>
          );
        })}

        {/* Hover crosshair — visual only, never steals clicks from the bar links. */}
        {hp && (
          <g pointerEvents="none">
            <line
              x1={hcx}
              x2={hcx}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="#ffffff"
              strokeOpacity="0.25"
              strokeDasharray="3 3"
            />
          </g>
        )}
      </svg>

      {/* Screen-reader live region: announces the active bar on hover/focus change. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {hp ? `${hp.label}${hp.sublabel ? `, ${hp.sublabel}` : ''}, ${valueLabel} ${hp.value}` : ''}
      </div>

      {/* Floating detail card — LineChart tokens verbatim. Decorative: the
          sr-only live region above carries the same info for screen readers. */}
      {hp && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md border border-white/15 bg-[#0c0c14] px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: `${hLeft}%`, top: `${(hyTop / H) * 100}%`, transform: cardTransform, marginTop: `${cardMarginTop}px` }}
        >
          <div className="font-semibold text-white/90">
            {valueLabel}: {fmtNum(hp.value, Number.isInteger(hp.value) ? 0 : 1)}
          </div>
          <div className="text-white/50">{hp.sublabel ?? hp.label}</div>
        </div>
      )}
    </div>
  );
}
