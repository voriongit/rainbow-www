// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { RecordedInsight } from '@vorionsys/rainbow';
import { Panel, EmptyState } from '../panel';
import { InsightCard } from './insight-card';

interface InsightsPanelProps {
  insights: RecordedInsight[];
  /** Active window, carried into drill-down links. */
  window?: string;
  subtitle?: string;
}

/**
 * Rule-based insights from RAINBOW's detection engine. Each card names the
 * finding, the agents involved, and (when present) its evidence chain; the
 * whole strip is an explorable surface that, on tap, discloses the driving
 * trust factor(s), the agents involved, the evidence chain, and claim-safe
 * "where to look next" drill-downs — all derived ONLY from the real evidence
 * the insight already carries (see insight-card.tsx). Server-rendered shell;
 * only each card's expand interaction is client-side.
 *
 * Used on both the dashboard (fleet-wide insights) and /agent (per-agent).
 */
export function InsightsPanel({ insights, window, subtitle }: InsightsPanelProps) {
  const sorted = insights
    .slice()
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());

  return (
    <Panel
      title="Insights"
      subtitle={subtitle ?? 'Rule-based findings from the window analytics'}
      badge={
        insights.length > 0 ? (
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/70">
            {insights.length}
          </span>
        ) : undefined
      }
    >
      {sorted.length === 0 ? (
        <EmptyState message="Nothing flagged for this agent in the window — no insights detected." />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {sorted.map((insight) => (
            <InsightCard key={insight.insightId} insight={insight} window={window} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
