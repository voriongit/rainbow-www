// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { ExploreLink, exploreHref } from '../explore-link';
import { STATUS, tint } from '../../lib/status-colors';

export interface EscalationPairBar {
  requestor: string;
  handler: string;
  count: number;
  /** count as a % of the requestor's total escalations (the collusion-relevant share). */
  sharePct: number;
  colluding: boolean;
}

/**
 * Horizontal bar view of the top requestor→handler escalation pairs. Bar length
 * encodes the escalation count (relative to the busiest pair); the pair's SHARE
 * of its requestor's routing — the collusion-relevant metric — is shown inline
 * next to the count, with a fuller explanation on hover/focus (and an sr-only
 * copy so it's never hover-gated). Flagged pairs use amber (a policy-model
 * caution), NOT red: red is reserved for observed failures, and this concentration
 * is policy-induced, not an observed pattern. Drill-down links are preserved.
 * Server component — CSS-only hover, zero client JS.
 */
export function EscalationPairsBars({
  pairs,
  maxCount,
  window,
}: {
  pairs: EscalationPairBar[];
  maxCount: number;
  window: string;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {pairs.map((p) => {
        const widthPct = Math.max(5, (p.count / Math.max(1, maxCount)) * 100);
        const color = p.colluding ? STATUS.warn : STATUS.info;
        const note = p.colluding
          ? 'Flagged: policy-induced concentration on a single handler (matches the ≥80%-to-one-handler collusion rule; see the disclaimer above).'
          : 'Within the normal load-balanced spread across the trusted handler pool.';
        return (
          <li key={`${p.requestor}-${p.handler}`} className="group relative">
            <div className="relative overflow-hidden rounded-md border border-white/5 bg-white/[0.02] transition-colors group-hover:border-white/15">
              {/* count bar (decorative) */}
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: tint(color, '22'),
                  borderRight: `2px solid ${color}`,
                }}
                aria-hidden="true"
              />
              {/* foreground row */}
              <div className="relative flex items-center gap-2 px-3 py-2 text-xs">
                <ExploreLink
                  href={exploreHref(`/agent/${p.requestor}`, { window })}
                  className="font-medium text-white/85"
                >
                  {p.requestor}
                </ExploreLink>
                <span className="text-white/30" aria-hidden="true">
                  →
                </span>
                <ExploreLink
                  href={exploreHref(`/agent/${p.handler}`, { window })}
                  className="font-medium text-white/85"
                >
                  {p.handler}
                </ExploreLink>
                {p.colluding && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ color: STATUS.warn, backgroundColor: tint(STATUS.warn) }}
                  >
                    collusion risk
                  </span>
                )}
                <span className="ml-auto tabular-nums text-white/70">
                  {p.count}
                  <span className="sr-only"> escalations</span>
                </span>
                <span
                  className="tabular-nums text-white/40"
                  title="share of this requestor's escalations routed to this handler"
                >
                  · {p.sharePct}%<span className="sr-only"> of {p.requestor}&apos;s routing</span>
                </span>
                {/* full context for assistive tech (never hover-gated) */}
                <span className="sr-only">{note}</span>
              </div>
            </div>

            {/* sighted-only supplementary card — the visible/sr-only text above is
                the accessible source, so this is aria-hidden. Placed above the bar
                so it never overflows the bottom of the panel. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-full left-3 z-20 mb-1 hidden w-max max-w-[300px] rounded-md border border-white/15 bg-[#0c0c14] px-2.5 py-1.5 text-[11px] shadow-lg group-hover:block group-focus-within:block"
            >
              <span className="font-semibold text-white/90">
                {p.count} escalations · {p.sharePct}% of {p.requestor}&apos;s routing → {p.handler}
              </span>
              <span className="mt-0.5 block text-white/55">{note}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
