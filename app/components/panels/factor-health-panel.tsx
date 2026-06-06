// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { NonBinaryStateSnapshot } from '@vorionsys/rainbow';
import { TrendingUp, TrendingDown, Minus, Check, X } from 'lucide-react';
import { Panel } from '../panel';
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

  return (
    <Panel
      title="Factor health"
      subtitle={`${state.agentId} · 16 canonical trust factors · last ${duration}`}
      footnote="Success rate per factor over window evidence. Factors with no evidence in the window display as 100% by the library's healthy-by-default assumption — the evidence count tells the real story."
    >
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {groups.map(({ group, factors }) => (
          <div key={group}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              {group}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {factors.map((factor) => {
                const { Icon, color } = TREND_ICONS[factor.trend];
                const barColor = healthColor(factor.currentScore);
                return (
                  <li key={factor.factorCode} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-xs text-white/75">
                      {factor.factorName}
                    </span>
                    <span className="w-20 shrink-0 font-mono text-[10px] text-white/35">
                      {factor.factorCode}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round(factor.currentScore * 100)}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs font-semibold text-white/80">
                      {fmtPct(factor.currentScore)}
                    </span>
                    <Icon size={13} style={{ color }} className="shrink-0" aria-hidden />
                    <span className="w-12 shrink-0 text-right text-[10px] text-white/35">
                      {factor.recentEvidenceCount} ev
                    </span>
                    <span className="w-4 shrink-0" title={factor.meetsMinimum ? 'Meets tier minimum' : 'Below tier minimum'}>
                      {factor.meetsMinimum ? (
                        <Check size={13} className="text-emerald-500" aria-label="Meets tier minimum" />
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
    </Panel>
  );
}
