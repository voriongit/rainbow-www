// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * CrossAgentCorrelator — a first-class consumer of the Trust Signal Bus that
 * detects cross-agent patterns and emits correlation alerts. In the real
 * ecosystem this is a separate service downstream of the bus; here it consumes
 * the (synthetic) signal stream the fleet simulator produces. Its output is an
 * HONEST function of real co-occurrence in that stream — no fabricated data —
 * and is fed into RAINBOW's `computeCorrelationSummary`.
 */

import type { IngestedSignal } from '@vorionsys/rainbow';
import type { CorrelationAlertInput } from '@vorionsys/rainbow';

type Severity = 'warning' | 'critical' | 'emergency';

function maxSeverity(a: Severity, b: string | undefined): Severity {
  const rank: Record<string, number> = { warning: 0, critical: 1, emergency: 2 };
  if (b && (rank[b] ?? -1) > rank[a]) return b as Severity;
  return a;
}

export class CrossAgentCorrelator {
  /** Minimum distinct agents for a pattern to count as cross-agent. */
  private readonly minAgents: number;

  constructor(opts: { minAgents?: number } = {}) {
    this.minAgents = opts.minAgents ?? 2;
  }

  correlate(signals: IngestedSignal[]): CorrelationAlertInput[] {
    return [
      ...this.sharedFactorFailures(signals),
      ...this.correlatedIncidents(signals),
      ...this.synchronizedDrift(signals),
    ].sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  }

  /** ≥N agents failing the same trust factor in-window. */
  private sharedFactorFailures(signals: IngestedSignal[]): CorrelationAlertInput[] {
    const byFactor = new Map<string, { agents: Set<string>; latest: number; count: number }>();
    for (const s of signals) {
      if (s.success || s.blocked || !s.factorCode) continue;
      const e = byFactor.get(s.factorCode) ?? { agents: new Set<string>(), latest: 0, count: 0 };
      e.agents.add(s.agentId);
      e.latest = Math.max(e.latest, s.timestamp.getTime());
      e.count += 1;
      byFactor.set(s.factorCode, e);
    }
    const out: CorrelationAlertInput[] = [];
    for (const [factor, e] of byFactor) {
      if (e.agents.size < this.minAgents) continue;
      const agentIds = [...e.agents].sort();
      out.push({
        alertId: `cf-${factor}`,
        pattern: 'shared_factor_failure',
        agentIds,
        severity: agentIds.length >= 3 ? 'critical' : 'warning',
        description: `${agentIds.length} agents failing ${factor} (${e.count} failures in window)`,
        detectedAt: new Date(e.latest),
      });
    }
    return out;
  }

  /** ≥N agents sharing a correlation id (a correlated incident). */
  private correlatedIncidents(signals: IngestedSignal[]): CorrelationAlertInput[] {
    const byCorr = new Map<
      string,
      { agents: Set<string>; latest: number; count: number; sev: Severity }
    >();
    for (const s of signals) {
      if (!s.correlationId) continue;
      const e =
        byCorr.get(s.correlationId) ??
        { agents: new Set<string>(), latest: 0, count: 0, sev: 'warning' as Severity };
      e.agents.add(s.agentId);
      e.latest = Math.max(e.latest, s.timestamp.getTime());
      e.count += 1;
      e.sev = maxSeverity(e.sev, s.severity);
      byCorr.set(s.correlationId, e);
    }
    const out: CorrelationAlertInput[] = [];
    for (const [corr, e] of byCorr) {
      if (e.agents.size < this.minAgents) continue;
      const agentIds = [...e.agents].sort();
      out.push({
        alertId: `ci-${corr}`,
        pattern: 'correlated_incident',
        agentIds,
        severity: e.sev,
        description: `${agentIds.length} agents in correlated incident "${corr}" (${e.count} signals)`,
        detectedAt: new Date(e.latest),
      });
    }
    return out;
  }

  /** ≥N agents emitting DRIFT signals in-window (synchronized behavioural drift). */
  private synchronizedDrift(signals: IngestedSignal[]): CorrelationAlertInput[] {
    const agents = new Set<string>();
    let latest = 0;
    let count = 0;
    for (const s of signals) {
      if (s.busSignalType !== 'drift') continue;
      agents.add(s.agentId);
      latest = Math.max(latest, s.timestamp.getTime());
      count += 1;
    }
    if (agents.size < this.minAgents) return [];
    const agentIds = [...agents].sort();
    return [
      {
        alertId: 'sd-drift',
        pattern: 'synchronized_drift',
        agentIds,
        severity: agentIds.length >= 3 ? 'critical' : 'warning',
        description: `${agentIds.length} agents drifting from baseline together (${count} drift signals)`,
        detectedAt: new Date(latest),
      },
    ];
  }
}
