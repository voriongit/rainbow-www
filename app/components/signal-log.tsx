// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * The event/signal log table — the deepest real detail in the system, now
 * surfaced. Renders raw IngestedSignal records (newest first) with each
 * categorical field linked into its concept/drill-down page, so an event row
 * is itself fully explorable. Server component; follows the fleet-panel table
 * idiom.
 */

import type { IngestedSignal } from '@vorionsys/rainbow';
import { ExploreLink, exploreHref } from './explore-link';
import { ConceptTooltip } from './tooltip';
import { EmptyState } from './panel';
import { fmtDateTime, fmtSigned, fmtNum } from '../lib/format';
import { SEVERITY_COLORS, STATUS, tint } from '../lib/status-colors';
import { conceptSlug } from '../lib/glossary';

interface SignalLogProps {
  signals: IngestedSignal[];
  /** Active window, carried into drill-down links. */
  window?: string;
  /** Cap rows rendered (default 200). */
  limit?: number;
  emptyLabel?: string;
}

function outcomeOf(s: IngestedSignal): { label: string; color: string } {
  if (s.blocked) return { label: 'blocked', color: STATUS.warnAlt };
  return s.success ? { label: 'success', color: STATUS.good } : { label: 'failure', color: STATUS.bad };
}

export function SignalLog({ signals, window, limit = 200, emptyLabel }: SignalLogProps) {
  if (signals.length === 0) {
    return <EmptyState message={emptyLabel ?? 'No signals in this window.'} />;
  }
  const rows = signals.slice(0, limit);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40">
            <th className="py-2 pr-3 font-medium">Time (UTC)</th>
            <th className="py-2 pr-3 font-medium">Signal type</th>
            <th className="py-2 pr-3 font-medium">Outcome</th>
            <th className="py-2 pr-3 font-medium">Severity</th>
            <th className="py-2 pr-3 font-medium">Factor</th>
            <th className="py-2 pr-3 font-medium">Risk</th>
            <th className="py-2 pr-3 text-right font-medium">Δ</th>
            <th className="py-2 pr-3 text-right font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const outcome = outcomeOf(s);
            const sev = s.severity ? SEVERITY_COLORS[s.severity] ?? STATUS.neutral : undefined;
            return (
              <tr key={s.signalId} className="border-b border-white/5">
                <td className="py-1.5 pr-3 tabular-nums text-white/55">{fmtDateTime(s.timestamp)}</td>
                <td className="py-1.5 pr-3 font-mono text-[11px]">
                  {s.busSignalType ? (
                    <ConceptTooltip slug={conceptSlug.signalType(s.busSignalType)}>
                      <ExploreLink
                        href={exploreHref(`/signal-type/${s.busSignalType}`, { window })}
                        className="text-white/80"
                      >
                        {s.busSignalType}
                      </ExploreLink>
                    </ConceptTooltip>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td className="py-1.5 pr-3">
                  <span style={{ color: outcome.color }}>{outcome.label}</span>
                  {s.blocked && s.blockReason ? (
                    <span className="text-white/35"> · {s.blockReason}</span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-3">
                  {s.severity && sev ? (
                    <ConceptTooltip slug={conceptSlug.severity(s.severity)}>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ color: sev, backgroundColor: tint(sev) }}
                      >
                        {s.severity}
                      </span>
                    </ConceptTooltip>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 font-mono text-[11px]">
                  {s.factorCode ? (
                    <ExploreLink href={exploreHref(`/factor/${s.factorCode}`, { window })} className="text-white/80">
                      {s.factorCode}
                    </ExploreLink>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td className="py-1.5 pr-3">
                  {s.riskLevel ? (
                    <ConceptTooltip slug={conceptSlug.risk(s.riskLevel)}>
                      <ExploreLink href={exploreHref(`/risk/${s.riskLevel}`, { window })} className="text-white/70">
                        {s.riskLevel}
                      </ExploreLink>
                    </ConceptTooltip>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td
                  className="py-1.5 pr-3 text-right tabular-nums"
                  style={{ color: s.delta > 0 ? STATUS.good : s.delta < 0 ? STATUS.bad : STATUS.neutral }}
                >
                  {fmtSigned(s.delta)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-white/70">
                  {s.scoreAfter !== undefined ? fmtNum(s.scoreAfter) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {signals.length > rows.length ? (
        <p className="mt-2 text-[11px] text-white/35">
          Showing newest {rows.length} of {signals.length} signals.
        </p>
      ) : null}
    </div>
  );
}
