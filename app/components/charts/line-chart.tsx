// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Interactive SVG line chart. The series, area fill, gridlines, thresholds and
 * optional least-squares regression render server-identically; on top, a
 * client hover layer tracks the cursor, snaps to the nearest sample, and shows
 * a crosshair + highlighted point + a floating detail card (value + timestamp).
 * Keyboard/touch fall back to the static chart gracefully.
 */

import { fmtAxisTime, fmtNum, fmtDateTime } from '../../lib/format';
import { useChartScrub } from './use-chart-scrub';

export interface LinePoint {
  /** Timestamp ms */
  t: number;
  /** Value */
  v: number;
}

export interface Threshold {
  value: number;
  label: string;
  color: string;
}

/** One named, colored line for the optional multi-series overlay. */
export interface LineSeries {
  points: LinePoint[];
  color: string;
  label: string;
}

interface LineChartProps {
  points: LinePoint[];
  /** Unique per page instance — namespaces SVG gradient ids */
  id: string;
  color?: string;
  height?: number;
  yDomain?: [number, number];
  thresholds?: Threshold[];
  /** Overlay a least-squares regression line */
  regression?: boolean;
  /** Label for the value in the hover card (e.g. "Score", "Accumulator") */
  valueLabel?: string;
  /** Vertical event markers drawn at a timestamp (e.g. the Elbow — the bend
   *  where the curve crosses into a discrete state change). */
  markers?: { t: number; label: string; color: string }[];
  /**
   * Optional multi-series overlay. When provided, every series is drawn on a
   * shared, auto-fitted domain (with a small inline legend + per-series hover
   * readouts) instead of the single `points` line. Fully backward compatible:
   * omit it and the chart behaves exactly as the single-series form.
   * `points` is still required (used as the time axis / empty-data guard and
   * as the area-fill baseline series).
   */
  series?: LineSeries[];
}

const W = 640;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

export function LineChart({
  points,
  id,
  color = '#06b6d4',
  height = 200,
  yDomain,
  thresholds = [],
  regression = false,
  valueLabel = 'Value',
  markers = [],
  series,
}: LineChartProps) {
  const { svgRef, hover, scrubHandlers } = useChartScrub();

  if (points.length === 0) return null;

  const multi = series != null && series.length > 0;
  // The set of lines to draw. Single-series mode wraps `points` so the rest of
  // the geometry/render path is shared; multi-series mode draws each overlay.
  const lines: LineSeries[] = multi ? series : [{ points, color, label: valueLabel }];

  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // Time axis: spans every series so overlaid lines share one x-scale. `points`
  // is the canonical axis source (and scrub index source) in single-series mode.
  const allPoints = lines.flatMap((s) => s.points);
  const tMin = Math.min(...allPoints.map((p) => p.t));
  const tMax = Math.max(...allPoints.map((p) => p.t));
  const tSpan = Math.max(1, tMax - tMin);

  let yMin: number;
  let yMax: number;
  if (yDomain) {
    [yMin, yMax] = yDomain;
  } else {
    const vs = allPoints.map((p) => p.v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const pad = Math.max(1, (hi - lo) * 0.12);
    yMin = lo - pad;
    yMax = hi + pad;
  }
  const ySpan = Math.max(1e-9, yMax - yMin);

  const x = (t: number) => PAD.left + ((t - tMin) / tSpan) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - yMin) / ySpan) * innerH;

  const linePath = (pts: LinePoint[]) =>
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join(' ');

  // Single-series keeps its gradient area fill (byte-identical to before);
  // multi-series omits the fill so overlaid lines stay readable.
  const path = linePath(points);
  const areaPath = `${path} L${x(tMax).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(
    tMin
  ).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  // Least-squares regression in (hours, value) space
  let regLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (regression && points.length >= 2) {
    const n = points.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    for (const p of points) {
      const xh = (p.t - tMin) / 3_600_000;
      sumX += xh;
      sumY += p.v;
      sumXY += xh * p.v;
      sumX2 += xh * xh;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom !== 0) {
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      const v1 = intercept;
      const v2 = intercept + slope * (tSpan / 3_600_000);
      regLine = { x1: x(tMin), y1: y(v1), x2: x(tMax), y2: y(v2) };
    }
  }

  // Ticks
  const yTicks = [0, 1, 2, 3].map((i) => yMin + (ySpan * i) / 3);
  const xTicks = [0, 1, 2, 3].map((i) => tMin + (tSpan * i) / 3);

  const handlers = scrubHandlers({ count: points.length, positionOf: (i) => x(points[i].t), width: W });

  const hp = hover != null ? points[hover] : null;
  const hx = hp ? x(hp.t) : 0;
  const hy = hp ? y(hp.v) : 0;
  const hLeft = (hx / W) * 100;
  // Flip the card horizontally near the edges so it stays on-canvas
  const cardTransform =
    hLeft > 80 ? 'translate(-100%, -100%)' : hLeft < 20 ? 'translate(0, -100%)' : 'translate(-50%, -100%)';

  // Per-series readout at the hovered timestamp: snap each overlay line to its
  // own sample nearest the crosshair (compare series share sample times, but
  // this stays correct if they ever drift). Only used in multi-series mode.
  const hoverSeries =
    multi && hp
      ? lines.map((s) => {
          let best = s.points[0];
          let bestD = Infinity;
          for (const p of s.points) {
            const d = Math.abs(p.t - hp.t);
            if (d < bestD) {
              bestD = d;
              best = p;
            }
          }
          return { color: s.color, label: s.label, point: best };
        })
      : [];

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={
          markers.length
            ? `Time-series chart with ${markers.map((m) => m.label).join(', ')}; tap or hover for values`
            : 'Time-series chart (tap or hover for values)'
        }
        {...handlers}
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid + y labels */}
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#ffffff" strokeOpacity="0.06" />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#ffffff" fillOpacity="0.45">
              {fmtNum(v)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xTicks.map((t) => (
          <text key={`x-${t}`} x={x(t)} y={H - 8} textAnchor="middle" fontSize="10" fill="#ffffff" fillOpacity="0.45">
            {fmtAxisTime(t, tSpan)}
          </text>
        ))}

        {/* Thresholds */}
        {thresholds
          .filter((th) => th.value >= yMin && th.value <= yMax)
          .map((th) => (
            <g key={th.label}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(th.value)}
                y2={y(th.value)}
                stroke={th.color}
                strokeOpacity="0.6"
                strokeDasharray="5 4"
              />
              <text x={W - PAD.right - 4} y={y(th.value) - 4} textAnchor="end" fontSize="9" fill={th.color} fillOpacity="0.9">
                {th.label}
              </text>
            </g>
          ))}

        {/* Series — single-series keeps the gradient area fill; multi-series
            draws each overlay line with its own color. */}
        {multi ? (
          lines.map((s, i) => (
            <path
              key={`line-${i}`}
              d={linePath(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth="1.8"
            />
          ))
        ) : (
          <>
            <path d={areaPath} fill={`url(#${id}-fill)`} />
            <path d={path} fill="none" stroke={color} strokeWidth="1.8" />
          </>
        )}

        {/* Regression overlay */}
        {regLine && (
          <line
            x1={regLine.x1}
            y1={regLine.y1}
            x2={regLine.x2}
            y2={regLine.y2}
            stroke="#ffffff"
            strokeOpacity="0.5"
            strokeWidth="1.2"
            strokeDasharray="2 4"
          />
        )}

        {/* Event markers (e.g. the Elbow) — drawn over the series, under the
            hover crosshair so scrubbing stays on top. */}
        {markers
          .filter((mk) => mk.t >= tMin && mk.t <= tMax)
          .map((mk) => {
            const mx = x(mk.t);
            const leftPct = (mx / W) * 100;
            const atEnd = leftPct > 70;
            return (
              <g key={mk.label} pointerEvents="none">
                <line
                  x1={mx}
                  x2={mx}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  stroke={mk.color}
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                />
                <circle cx={mx} cy={PAD.top + 5} r="3" fill={mk.color} stroke="#05050a" strokeWidth="1" />
                <text
                  x={mx + (atEnd ? -5 : 5)}
                  y={PAD.top + 9}
                  textAnchor={atEnd ? 'end' : 'start'}
                  fontSize="9"
                  fontWeight="600"
                  fill={mk.color}
                >
                  {mk.label}
                </text>
              </g>
            );
          })}

        {/* Hover crosshair + marker(s) */}
        {hp && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + innerH} stroke="#ffffff" strokeOpacity="0.25" strokeDasharray="3 3" />
            {multi ? (
              hoverSeries.map((hs, i) => (
                <circle
                  key={`hpt-${i}`}
                  cx={x(hs.point.t)}
                  cy={y(hs.point.v)}
                  r="3.5"
                  fill={hs.color}
                  stroke="#05050a"
                  strokeWidth="1.5"
                />
              ))
            ) : (
              <circle cx={hx} cy={hy} r="3.5" fill={color} stroke="#05050a" strokeWidth="1.5" />
            )}
          </g>
        )}
      </svg>

      {/* Inline legend for the multi-series overlay. */}
      {multi && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {lines.map((s, i) => (
            <span key={`lg-${i}`} className="flex items-center gap-1.5 text-[11px] text-white/65">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Floating detail card (decorative — pointer/aria hidden). */}
      {hp && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md border border-white/15 bg-[#0c0c14] px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: `${hLeft}%`, top: `${(hy / H) * 100}%`, transform: cardTransform, marginTop: '-6px' }}
        >
          {multi ? (
            <>
              {hoverSeries.map((hs, i) => (
                <div key={`hc-${i}`} className="flex items-center gap-1.5 font-semibold">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: hs.color }}
                    aria-hidden
                  />
                  <span style={{ color: hs.color }}>{hs.label}</span>
                  <span className="text-white/90">
                    {fmtNum(hs.point.v, Number.isInteger(hs.point.v) ? 0 : 1)}
                  </span>
                </div>
              ))}
              <div className="mt-0.5 text-white/50">{fmtDateTime(new Date(hp.t))} UTC</div>
            </>
          ) : (
            <>
              <div className="font-semibold text-white/90">
                {valueLabel}: {fmtNum(hp.v, Number.isInteger(hp.v) ? 0 : 1)}
              </div>
              <div className="text-white/50">{fmtDateTime(new Date(hp.t))} UTC</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
