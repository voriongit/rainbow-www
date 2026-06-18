// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { DelegationHealthSummary } from '@vorionsys/rainbow';
import { Panel } from '../panel';
import { ExploreLink, exploreHref } from '../explore-link';
import { Tooltip } from '../tooltip';
import { STATUS, tint } from '../../lib/status-colors';

/** Faint dotted-underline + help cursor signalling a hoverable metric value. */
const METRIC_TIP = 'cursor-help underline decoration-dotted decoration-white/25 underline-offset-2';

/**
 * Compact gateway to the /lab delegation view. Delegation health is DERIVED from
 * real trust but under a declared orchestration POLICY (the simulator has no
 * native delegation), so unlike the panels above it carries a "modeled policy"
 * badge and links out rather than presenting the modeled detail on the grounded
 * grid. The collusion flag is surfaced here because it is the one actionable
 * signal — clearly tagged as policy-induced, with the full explanation in the Lab.
 */
export function DelegationTeaserPanel({
  summary,
  window,
}: {
  summary: DelegationHealthSummary;
  window: string;
}) {
  const href = exploreHref('/lab', { window });

  return (
    <Panel
      title="Delegation health"
      subtitle="Routing under a declared orchestration policy; outcomes derived from real trust"
      badge={
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: STATUS.warn, backgroundColor: tint(STATUS.warn) }}
          title="Modeled: the simulator has no native agent-to-agent delegation. Outcomes are derived from real trust, but the routing policy is a model — full detail in the Lab."
        >
          modeled policy
        </span>
      }
      footnote="Modeled view — deliberately kept out of the grounded metrics above. Open the Lab for the full derivation, the escalation log, and how the collusion flag is produced."
    >
      {summary.totalEscalations === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-white/45">No escalations derived in this window.</p>
          <ExploreLink href={href} className="text-xs text-cyan-300/80 transition-colors hover:text-cyan-200">
            Open delegation lab →
          </ExploreLink>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {summary.potentialCollusionRisk && (
            <div
              className="rounded-lg border px-3 py-2"
              style={{ borderColor: tint(STATUS.warn, '55'), backgroundColor: tint(STATUS.warn) }}
            >
              <p className="text-xs font-semibold" style={{ color: STATUS.warn }}>
                ⚠ Potential collusion risk
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">
                A security-failing requestor routes ≥80% of its escalations to one handler. Policy-induced
                concentration — see the Lab for the full chain.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white/[0.03] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Escalations</p>
              <p className="text-sm font-bold text-white/90">
                <Tooltip
                  content="Escalations derived in this window — an agent in distress (circuit-breaker trip, risk-accumulator crossing, or security-factor failure) routed to a handler."
                  className={METRIC_TIP}
                >
                  {summary.totalEscalations}
                </Tooltip>
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Resolved</p>
              <p className="text-sm font-bold" style={{ color: STATUS.good }}>
                <Tooltip
                  content="Escalations the chosen handler resolved — derived from the handler's actual trust at the time versus the case difficulty."
                  className={METRIC_TIP}
                >
                  {summary.successfulEscalations}
                </Tooltip>
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Rejected</p>
              <p className="text-sm font-bold" style={{ color: STATUS.bad }}>
                <Tooltip
                  content="Escalations no available handler could resolve at the time."
                  className={METRIC_TIP}
                >
                  {summary.rejectedEscalations}
                </Tooltip>
              </p>
            </div>
          </div>

          <ExploreLink href={href} className="text-xs text-cyan-300/80 transition-colors hover:text-cyan-200">
            Open delegation lab →
          </ExploreLink>
        </div>
      )}
    </Panel>
  );
}
