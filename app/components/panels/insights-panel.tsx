// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { RecordedInsight } from '@vorionsys/rainbow';
import { Panel, EmptyState } from '../panel';
import { ExploreLink, exploreHref } from '../explore-link';
import { ConceptTooltip } from '../tooltip';
import { conceptSlug } from '../../lib/glossary';
import { fmtDateTime } from '../../lib/format';
import { STATUS, tint } from '../../lib/status-colors';

interface InsightsPanelProps {
  insights: RecordedInsight[];
  /** Active window, carried into drill-down links. */
  window?: string;
  subtitle?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: STATUS.info,
  warning: STATUS.warn,
  critical: STATUS.bad,
  emergency: '#dc2626',
};

/**
 * Rule-based insights from RAINBOW's detection engine. Each card names the
 * finding, the agents involved, and (when present) its evidence chain — every
 * categorical element drills into its concept or the agent.
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
          {sorted.map((insight) => {
            const color = SEVERITY_COLORS[insight.severity] ?? STATUS.neutral;
            return (
              <li
                key={insight.insightId}
                className="rounded-lg border-l-2 border border-white/10 bg-white/[0.02] px-3.5 py-3"
                style={{ borderLeftColor: color }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ConceptTooltip slug={conceptSlug.insight(insight.category)}>
                    <ExploreLink
                      href={exploreHref(`/concepts/${conceptSlug.insight(insight.category)}`, { window })}
                    >
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color, backgroundColor: tint(color) }}
                      >
                        {insight.category.replace(/_/g, ' ')}
                      </span>
                    </ExploreLink>
                  </ConceptTooltip>
                  <span className="text-[10px] uppercase tracking-wider" style={{ color }}>
                    {insight.severity}
                  </span>
                  <span className="ml-auto text-[10px] text-white/30">
                    {fmtDateTime(insight.detectedAt)} UTC
                  </span>
                </div>

                <p className="mt-1.5 text-sm font-semibold text-white/90">{insight.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-white/60">
                  {insight.description}
                </p>

                {insight.agentIds.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-white/45">
                    Agents:{' '}
                    {insight.agentIds.map((id, i) => (
                      <span key={id}>
                        {i > 0 ? ', ' : ''}
                        <ExploreLink
                          href={exploreHref(`/agent/${id}`, { window })}
                          className="text-white/70"
                        >
                          {id}
                        </ExploreLink>
                      </span>
                    ))}
                  </p>
                )}

                {insight.evidenceChain.length > 0 && (
                  <details className="mt-2 group/ev">
                    <summary className="cursor-pointer list-none text-[11px] text-cyan-300/70 transition-colors hover:text-cyan-200 [&::-webkit-details-marker]:hidden">
                      Evidence chain ({insight.evidenceChain.length}) ▾
                    </summary>
                    <ul className="mt-1.5 flex flex-col gap-1 border-l border-white/10 pl-3">
                      {insight.evidenceChain.map((ev) => (
                        <li key={ev.eventId} className="text-[11px] text-white/55">
                          <span className="text-white/35 tabular-nums">{fmtDateTime(ev.timestamp)}</span>{' '}
                          — {ev.summary}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
