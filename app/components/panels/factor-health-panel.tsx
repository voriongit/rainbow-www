// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { NonBinaryStateSnapshot } from '@vorionsys/rainbow';
import { TrendingUp, TrendingDown, Minus, Check, X } from 'lucide-react';
import { Panel, EmptyState } from '../panel';
import { ExploreLink, exploreHref } from '../explore-link';
import { ConceptTooltip } from '../tooltip';
import { conceptSlug } from '../../lib/glossary';
import { healthColor, tint } from '../../lib/status-colors';
import { fmtPct } from '../../lib/format';

interface FactorHealthPanelProps {
  state: NonBinaryStateSnapshot;
  duration: string;
}

const GROUP_ORDER = ['Foundation', 'Security', 'Agency', 'Maturity', 'Evolution'];

const TREND_ICONS = {
  rising: { Icon: TrendingUp, color: '#22c55e' },
  falling: { Icon: TrendingDown, color: '#ef4444' },
  stable: { Icon: Minus, color: '#64748b' },
} as const;

/**
 * One factor cell in the heatmap. Colored by health when there is evidence;
 * a no-evidence factor is rendered as an explicit, dimmed "no data" cell — we
 * never fabricate a score, because absence of evidence is not evidence of
 * health. The whole cell is the drill-down target into /factor/[code]; the
 * factor name keeps its glossary ConceptTooltip.
 */
function FactorCell({
  factor,
  duration,
}: {
  factor: NonBinaryStateSnapshot['factors'][number];
  duration: string;
}) {
  const noEvidence = factor.recentEvidenceCount === 0;
  const { Icon, color } = TREND_ICONS[factor.trend];
  const cellColor = healthColor(factor.currentScore);

  // Health-colored cells get a tinted fill + border; no-evidence cells are
  // deliberately neutral/dashed/dimmed and carry NO health color, so a factor
  // we know nothing about can never read as "green / healthy".
  const cellStyle = noEvidence
    ? undefined
    : { backgroundColor: tint(cellColor, '1f'), borderColor: tint(cellColor, '4d') };

  return (
    <ExploreLink
      variant="block"
      href={exploreHref(`/factor/${factor.factorCode}`, { window: duration })}
      title={
        noEvidence
          ? `${factor.factorName} — no evidence in window`
          : `${factor.factorName} — ${fmtPct(factor.currentScore)} success · ${factor.recentEvidenceCount} evidence`
      }
      ariaLabel={`Explore factor ${factor.factorName}`}
      style={cellStyle}
      className={`border p-2 ${
        noEvidence ? 'border-dashed border-white/10 bg-white/[0.015] opacity-60' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <ConceptTooltip slug={conceptSlug.factor(factor.factorCode)}>
          <span className="font-mono text-[9px] uppercase tracking-wide text-white/45">
            {factor.factorCode}
          </span>
        </ConceptTooltip>
        {noEvidence ? (
          <span
            className="text-slate-600"
            title="No evidence in window"
            aria-label="No evidence in window"
          >
            ·
          </span>
        ) : factor.meetsMinimum ? (
          <Check size={11} className="shrink-0 text-emerald-500" aria-label="Meets tier minimum" />
        ) : (
          <X size={11} className="shrink-0 text-red-500" aria-label="Below tier minimum" />
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-1">
        <span
          className={`text-base font-bold tabular-nums ${
            noEvidence ? 'text-white/30' : 'text-white/90'
          }`}
        >
          {noEvidence ? '—' : fmtPct(factor.currentScore)}
        </span>
        {noEvidence ? (
          <Minus size={12} className="shrink-0 text-slate-600" aria-hidden />
        ) : (
          <Icon size={12} style={{ color }} className="shrink-0" aria-hidden />
        )}
      </div>
      <div
        className="mt-0.5 truncate text-[9px] leading-tight text-white/40"
        title={factor.factorName}
      >
        {factor.factorName}
      </div>
      <div className="text-[9px] text-white/30">
        {noEvidence ? 'no data' : `${factor.recentEvidenceCount} ev`}
      </div>
    </ExploreLink>
  );
}

/** 16-factor health heatmap grouped by factor group */
export function FactorHealthPanel({ state, duration }: FactorHealthPanelProps) {
  const groups = GROUP_ORDER.map((group) => ({
    group,
    factors: state.factors.filter((f) => f.group === group),
  })).filter((g) => g.factors.length > 0);

  const totalEvidence = state.factors.reduce((s, f) => s + f.recentEvidenceCount, 0);
  const withEvidence = state.factors.filter((f) => f.recentEvidenceCount > 0).length;

  return (
    <Panel
      title="Factor health"
      subtitle={`${state.agentId} · ${withEvidence}/${state.factors.length} factors with evidence · last ${duration}`}
      footnote="Success rate per factor over window evidence. Factors with no evidence in this window are shown as “no data” — absence of evidence is not evidence of health (we don't fabricate a score). Maturity & Evolution factors typically accrue evidence only at higher tiers or under specific activity, so partial coverage is expected."
    >
      {totalEvidence === 0 ? (
        <EmptyState
          message={`No factor evidence for ${state.agentId} in the last ${duration}.`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ group, factors }) => (
            <div key={group}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                {group}
              </h3>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {factors.map((factor) => (
                  <FactorCell key={factor.factorCode} factor={factor} duration={duration} />
                ))}
              </div>
            </div>
          ))}

          {/* Legend — keeps the health scale honest and explicit. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[10px] text-white/45">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm border"
                style={{ backgroundColor: tint(healthColor(0.95), '1f'), borderColor: tint(healthColor(0.95), '4d') }}
              />
              ≥90%
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm border"
                style={{ backgroundColor: tint(healthColor(0.8), '1f'), borderColor: tint(healthColor(0.8), '4d') }}
              />
              70–89%
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm border"
                style={{ backgroundColor: tint(healthColor(0.5), '1f'), borderColor: tint(healthColor(0.5), '4d') }}
              />
              &lt;70%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-white/15 bg-white/[0.015]" />
              no data
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={11} className="text-emerald-500" aria-hidden /> meets tier minimum
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}
