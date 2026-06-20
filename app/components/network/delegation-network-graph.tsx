// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * DelegationNetworkGraph — a deterministic, read-only bipartite SVG of the
 * agent-to-agent delegation network: requestors on the left, handlers on the
 * right, with weighted edges (escalation count) between them.
 *
 * Everything here is computed deterministically from the modeled delegation
 * (see /lab and `delegation-service.ts`): there is NO physics layout, NO
 * randomness, and NO chart library. Nodes are placed at evenly-spaced vertical
 * positions in two columns; edge stroke-width encodes the escalation count;
 * node radius encodes total load. Collusion edges — the library's
 * >=80%-to-one-handler rule SCOPED to the security cluster (the same rule /lab
 * uses) — are drawn in amber (a policy-model caution), never red, because
 * the concentration is policy-induced, not an observed failure.
 *
 * Server component — pure SVG/CSS, zero client JS. Nodes are drill-down
 * links into /agent/[id] (next/link works in RSC) so the graph is explorable
 * and touch-legible. Secondary labels are kept at white/55+ for WCAG contrast
 * on the near-black background.
 */

import type { EscalationEvent } from '@vorionsys/rainbow';
import { ExploreLink, exploreHref } from '../explore-link';
import { STATUS } from '../../lib/status-colors';

// ── Model ───────────────────────────────────────────────────
export interface NetworkRequestor {
  id: string;
  /** Total escalations this requestor originated. */
  total: number;
  /** True if this requestor has any collusion-flagged outbound edge. */
  colluding: boolean;
}

export interface NetworkHandler {
  id: string;
  /** Total escalations routed to this handler. */
  inboundCount: number;
  /** Distinct requestors that escalated to this handler. */
  requestorCount: number;
}

export interface NetworkEdge {
  requestor: string;
  handler: string;
  /** Escalations along this requestor → handler pair. */
  count: number;
  /** Share of the requestor's total routing that this edge carries. */
  sharePct: number;
  /** Policy-induced collusion edge (the /lab rule). */
  colluding: boolean;
}

export interface DelegationNetwork {
  requestors: NetworkRequestor[];
  handlers: NetworkHandler[];
  edges: NetworkEdge[];
  maxEdgeCount: number;
  maxHandlerInbound: number;
  maxRequestorTotal: number;
}

/**
 * Build the bipartite delegation network from the modeled escalation log.
 *
 * The collusion rule MIRRORS /lab exactly: an edge is flagged when its
 * requestor is in the security cluster (real CT-SEC / CT-ID failures), has
 * >=3 escalations total, and routes >=80% of them to that single handler.
 * Pure + deterministic — stable roster order, no randomness.
 */
export function buildDelegationNetwork({
  escalations,
  securityCluster,
}: {
  escalations: EscalationEvent[];
  securityCluster: string[];
}): DelegationNetwork {
  const cluster = new Set(securityCluster);

  // requestor -> total
  const requestorTotals = new Map<string, number>();
  // "requestor→handler" -> count
  const edgeCounts = new Map<string, number>();
  // handler -> inbound count
  const handlerInbound = new Map<string, number>();
  // handler -> set of requestors
  const handlerRequestors = new Map<string, Set<string>>();
  // preserve first-seen order for deterministic, stable layout
  const requestorOrder: string[] = [];
  const handlerOrder: string[] = [];

  for (const e of escalations) {
    requestorTotals.set(
      e.requestorId,
      (requestorTotals.get(e.requestorId) ?? 0) + 1
    );
    if (!requestorOrder.includes(e.requestorId)) requestorOrder.push(e.requestorId);
    if (!handlerOrder.includes(e.handlerId)) handlerOrder.push(e.handlerId);

    const key = `${e.requestorId}→${e.handlerId}`;
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);

    handlerInbound.set(
      e.handlerId,
      (handlerInbound.get(e.handlerId) ?? 0) + 1
    );
    let set = handlerRequestors.get(e.handlerId);
    if (!set) {
      set = new Set<string>();
      handlerRequestors.set(e.handlerId, set);
    }
    set.add(e.requestorId);
  }

  const isColluding = (requestor: string, count: number): boolean => {
    const total = requestorTotals.get(requestor) ?? 0;
    return cluster.has(requestor) && total >= 3 && count / total >= 0.8;
  };

  const edges: NetworkEdge[] = [];
  const collusiveRequestors = new Set<string>();
  for (const [key, count] of edgeCounts) {
    const sep = key.indexOf('→');
    const requestor = key.slice(0, sep);
    const handler = key.slice(sep + 1);
    const total = requestorTotals.get(requestor) ?? 0;
    const colluding = isColluding(requestor, count);
    if (colluding) collusiveRequestors.add(requestor);
    edges.push({
      requestor,
      handler,
      count,
      sharePct: total > 0 ? Math.round((count / total) * 100) : 0,
      colluding,
    });
  }

  // Sort requestors by load (desc) then stable order; handlers likewise.
  const requestors: NetworkRequestor[] = requestorOrder
    .map((id) => ({
      id,
      total: requestorTotals.get(id) ?? 0,
      colluding: collusiveRequestors.has(id),
    }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        requestorOrder.indexOf(a.id) - requestorOrder.indexOf(b.id)
    );

  const handlers: NetworkHandler[] = handlerOrder
    .map((id) => ({
      id,
      inboundCount: handlerInbound.get(id) ?? 0,
      requestorCount: handlerRequestors.get(id)?.size ?? 0,
    }))
    .sort(
      (a, b) =>
        b.inboundCount - a.inboundCount ||
        handlerOrder.indexOf(a.id) - handlerOrder.indexOf(b.id)
    );

  const maxEdgeCount = Math.max(1, ...edges.map((e) => e.count));
  const maxHandlerInbound = Math.max(1, ...handlers.map((h) => h.inboundCount));
  const maxRequestorTotal = Math.max(1, ...requestors.map((r) => r.total));

  return {
    requestors,
    handlers,
    edges,
    maxEdgeCount,
    maxHandlerInbound,
    maxRequestorTotal,
  };
}

// ── Layout constants (deterministic) ──────────────────────────────
const WIDTH = 720;
const MARGIN_Y = 36;
const ROW_GAP = 48; // vertical spacing between nodes in a column
const LEFT_X = 150;
const RIGHT_X = WIDTH - 150;
const MIN_R = 7;
const MAX_R = 18;
const MIN_STROKE = 1.25;
const MAX_STROKE = 9;

/** Evenly-spaced y for the n-th of `count` nodes in a column. */
function rowY(index: number): number {
  return MARGIN_Y + index * ROW_GAP;
}

/** Scale a value in [0,max] to a radius band. */
function radiusFor(value: number, max: number): number {
  const t = max > 0 ? value / max : 0;
  return MIN_R + t * (MAX_R - MIN_R);
}

/** Scale an edge count to a stroke-width band. */
function strokeFor(count: number, max: number): number {
  const t = max > 0 ? count / max : 0;
  return MIN_STROKE + t * (MAX_STROKE - MIN_STROKE);
}

export function DelegationNetworkGraph({
  graph,
  window,
}: {
  graph: DelegationNetwork;
  window: string;
}) {
  const { requestors, handlers, edges } = graph;

  const reqY = new Map<string, number>();
  requestors.forEach((r, i) => reqY.set(r.id, rowY(i)));
  const handY = new Map<string, number>();
  handlers.forEach((h, i) => handY.set(h.id, rowY(i)));

  const rows = Math.max(requestors.length, handlers.length, 1);
  const height = MARGIN_Y * 2 + (rows - 1) * ROW_GAP;

  // Draw non-collusion edges first so amber collusion edges sit on top.
  const orderedEdges = edges
    .slice()
    .sort((a, b) => Number(a.colluding) - Number(b.colluding));

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-2 overflow-x-auto px-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          width="100%"
          height={height}
          className="min-w-[560px]"
          role="img"
          aria-label={`Delegation network: ${requestors.length} requestors escalating to ${handlers.length} handlers across ${edges.length} routes.`}
        >
          {/* Column captions */}
          <text
            x={LEFT_X}
            y={16}
            textAnchor="middle"
            className="fill-white/55 text-[11px] font-semibold uppercase tracking-wider"
          >
            Requestors
          </text>
          <text
            x={RIGHT_X}
            y={16}
            textAnchor="middle"
            className="fill-white/55 text-[11px] font-semibold uppercase tracking-wider"
          >
            Handlers
          </text>

          {/* Edges */}
          <g fill="none">
            {orderedEdges.map((e) => {
              const y1 = reqY.get(e.requestor);
              const y2 = handY.get(e.handler);
              if (y1 === undefined || y2 === undefined) return null;
              const color = e.colluding ? STATUS.warn : STATUS.info;
              const midX = (LEFT_X + RIGHT_X) / 2;
              // A gentle cubic so overlapping edges stay distinguishable.
              const d = `M ${LEFT_X} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${RIGHT_X} ${y2}`;
              return (
                <path
                  key={`${e.requestor}-${e.handler}`}
                  d={d}
                  stroke={color}
                  strokeWidth={strokeFor(e.count, graph.maxEdgeCount)}
                  strokeOpacity={e.colluding ? 0.85 : 0.4}
                  strokeLinecap="round"
                >
                  <title>
                    {`${e.requestor} → ${e.handler}: ${e.count} escalation${
                      e.count === 1 ? '' : 's'
                    } (${e.sharePct}% of ${e.requestor}'s routing)${
                      e.colluding ? ' — collusion-flagged' : ''
                    }`}
                  </title>
                </path>
              );
            })}
          </g>

          {/* Requestor nodes (left) */}
          {requestors.map((r) => {
            const y = reqY.get(r.id) ?? 0;
            const radius = radiusFor(r.total, graph.maxRequestorTotal);
            const color = r.colluding ? STATUS.warn : STATUS.neutral;
            return (
              <ExploreLink
                key={r.id}
                href={exploreHref(`/agent/${r.id}`, { window })}
                ariaLabel={`${r.id}: ${r.total} escalations originated${
                  r.colluding ? ', collusion-flagged' : ''
                }`}
              >
                <g className="[&>circle]:transition-opacity hover:[&>circle]:opacity-90">
                  <circle
                    cx={LEFT_X}
                    cy={y}
                    r={radius}
                    fill={`${color}33`}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <text
                    x={LEFT_X - radius - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-white/80 text-[11px] font-medium"
                  >
                    {r.id}
                  </text>
                  <title>
                    {`${r.id}: ${r.total} escalation${
                      r.total === 1 ? '' : 's'
                    } originated`}
                  </title>
                </g>
              </ExploreLink>
            );
          })}

          {/* Handler nodes (right) */}
          {handlers.map((h) => {
            const y = handY.get(h.id) ?? 0;
            const radius = radiusFor(h.inboundCount, graph.maxHandlerInbound);
            return (
              <ExploreLink
                key={h.id}
                href={exploreHref(`/agent/${h.id}`, { window })}
                ariaLabel={`${h.id}: ${h.inboundCount} escalations handled from ${h.requestorCount} requestors`}
              >
                <g className="[&>circle]:transition-opacity hover:[&>circle]:opacity-90">
                  <circle
                    cx={RIGHT_X}
                    cy={y}
                    r={radius}
                    fill={`${STATUS.info}33`}
                    stroke={STATUS.info}
                    strokeWidth={1.5}
                  />
                  <text
                    x={RIGHT_X + radius + 8}
                    y={y + 3}
                    textAnchor="start"
                    className="fill-white/80 text-[11px] font-medium"
                  >
                    {h.id}
                  </text>
                  <title>
                    {`${h.id}: ${h.inboundCount} escalation${
                      h.inboundCount === 1 ? '' : 's'
                    } handled from ${h.requestorCount} requestor${
                      h.requestorCount === 1 ? '' : 's'
                    }`}
                  </title>
                </g>
              </ExploreLink>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/55">
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: `${STATUS.neutral}33`,
              border: `1.5px solid ${STATUS.neutral}`,
            }}
            aria-hidden="true"
          />
          requestor (size = escalations originated)
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: `${STATUS.info}33`,
              border: `1.5px solid ${STATUS.info}`,
            }}
            aria-hidden="true"
          />
          handler (size = escalations handled)
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-6 rounded-full"
            style={{ backgroundColor: STATUS.info }}
            aria-hidden="true"
          />
          escalation edge (width = count)
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-6 rounded-full"
            style={{ backgroundColor: STATUS.warn }}
            aria-hidden="true"
          />
          <span style={{ color: STATUS.warn }}>
            collusion edge (policy-induced, ≥80% to one handler)
          </span>
        </li>
      </ul>
    </div>
  );
}
