// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { NonBinaryStateSnapshot } from '@vorionsys/rainbow';
import { TrendingUp, TrendingDown, Minus, Check, X } from 'lucide-react';
import { Panel, EmptyState } from '../panel';
import { ExploreLink, exploreHref } from '../explore-link';
import { ConceptTooltip } from '../tooltip';
import { conceptSlug } from '../../lib/glossary';
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

function healthColor(score: number): string {
  if (score >= 0.9) return '#22c55e';
  if (score >= 0.7) return '#eab308';
  return '#ef4444';
}

/** 16-factor health grid grouped by factor group */
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
        <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
          {groups.map(({ group, factors }) => (
            <div key={group}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                {group}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {factors.map((factor) => {
                  const noEvidence = factor.recentEvidenceCount === 0;
                  const { Icon, color } = TREND_ICONS[factor.trend];
                  const barColor = healthColor(factor.currentScore);
                  return (
                    <li
                      key={factor.factorCode}
                      className={`flex items-center gap-3 ${noEvidence ? 'opacity-50' : ''}`}
                    >
                      <ConceptTooltip
                        slug={conceptSlug.factor(factor.factorCode)}
                        className="w-24 shrink-0"
                      >
                        <ExploreLink
                          href={exploreHref(`/factor/${factor.factorCode}`, { window: duration })}
                          className="truncate text-xs text-white/75"
                          title={`Explore factor ${factor.factorCode}`}
                        >
                          {factor.factorName}
                        </ExploreLink>
                      </ConceptTooltip>
                      <ExploreLink
                        href={exploreHref(`/factor/${factor.factorCode}`, { window: duration })}
                        className="w-20 shrink-0 font-mono text-[10px] text-white/35"
                      >
                        {factor.factorCode}
                      </ExploreLink>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        {!noEvidence && (
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round(factor.currentScore * 100)}%`,
                              backgroundColor: barColor,
                            }}
                          />
                        )}
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs font-semibold text-white/80">
                        {noEvidence ? '—' : fmtPct(factor.currentScore)}
                      </span>
                      {noEvidence ? (
                        <Minus size={13} className="shrink-0 text-slate-600" aria-hidden />
                      ) : (
                        <Icon size={13} style={{ color }} className="shrink-0" aria-hidden />
                      )}
                      <span className="w-12 shrink-0 text-right text-[10px] text-white/35">
                        {noEvidence ? 'no data' : `${factor.recentEvidenceCount} ev`}
                      </span>
                      <span
                        className="w-4 shrink-0"
                        title={
                          noEvidence
                            ? 'No evidence in window'
                            : factor.meetsMinimum
                              ? 'Meets tier minimum'
                              : 'Below tier minimum'
                        }
                      >
                        {noEvidence ? (
                          <span className="text-slate-600" aria-label="No evidence in window">
                            ·
                          </span>
                        ) : factor.meetsMinimum ? (
                          <Check
                            size={13}
                            className="text-emerald-500"
                            aria-label="Meets tier minimum"
                          />
                        ) : (
                          <X size={13} className="text-red-500" aria-label="Below tier minimum" />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
