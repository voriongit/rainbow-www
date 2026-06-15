// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Server-rendered SVG bar chart — zero client JS.
 */

export interface Bar {
  label: string;
  value: number;
  color: string;
  /** Secondary line under the label (e.g. tier name) */
  sublabel?: string;
}

interface BarChartProps {
  bars: Bar[];
  height?: number;
  /** Hide per-bar value labels (dense histograms) */
  dense?: boolean;
  /** When provided and it returns a URL, the bar becomes a drill-down link. */
  hrefFor?: (bar: Bar) => string | undefined;
}

const W = 640;
const PAD = { top: 16, right: 8, bottom: 34, left: 8 };

export function BarChart({ bars, height = 190, dense = false, hrefFor }: BarChartProps) {
  if (bars.length === 0) return null;

  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const slot = innerW / bars.length;
  const barW = Math.min(slot * 0.62, 56);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart">
      {bars.map((b, i) => {
        const cx = PAD.left + slot * i + slot / 2;
        const h = (b.value / max) * innerH;
        const yTop = PAD.top + innerH - h;
        const inner = (
          <>
            <rect
              x={cx - barW / 2}
              y={yTop}
              width={barW}
              height={Math.max(h, b.value > 0 ? 2 : 0)}
              rx="3"
              fill={b.color}
              fillOpacity="0.85"
            />
            {!dense && b.value > 0 && (
              <text x={cx} y={yTop - 5} textAnchor="middle" fontSize="11" fill="#ffffff" fillOpacity="0.85">
                {b.value}
              </text>
            )}
            <text x={cx} y={H - 20} textAnchor="middle" fontSize={dense ? 8 : 11} fill="#ffffff" fillOpacity="0.6">
              {b.label}
            </text>
            {b.sublabel && (
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="8" fill="#ffffff" fillOpacity="0.35">
                {b.sublabel}
              </text>
            )}
          </>
        );
        const href = hrefFor?.(b);
        return href ? (
          <a
            key={b.label}
            href={href}
            className="cursor-pointer transition-opacity hover:opacity-80"
            aria-label={`${b.label}${b.sublabel ? ` (${b.sublabel})` : ''}: ${b.value}`}
          >
            {inner}
          </a>
        ) : (
          <g key={b.label}>{inner}</g>
        );
      })}
    </svg>
  );
}
