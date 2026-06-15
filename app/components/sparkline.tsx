// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Minimal static sparkline — a single normalized polyline in a tiny viewBox,
 * no axes, labels, or interactivity. Server-renderable (pure SVG). x is spread
 * evenly by index; y is min/max-normalized over the value set. Returns null
 * for fewer than two points (nothing meaningful to draw).
 */

import { STATUS } from '../lib/status-colors';

interface SparklineProps {
  points: { t: number; v: number }[];
  color?: string;
  width?: number;
  height?: number;
}

export function Sparkline({
  points,
  color = STATUS.info,
  width = 96,
  height = 24,
}: SparklineProps) {
  if (points.length < 2) return null;

  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const step = w / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = pad + i * step;
    // SVG y grows downward, so invert the normalized value.
    const y = pad + (1 - (p.v - min) / span) * h;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Trend sparkline"
      preserveAspectRatio="none"
      className="block overflow-visible"
    >
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
