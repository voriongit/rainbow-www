// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * DelegationService — a model of agent-to-agent escalation, DERIVED from the
 * real simulated trust trajectories (not fabricated).
 *
 * The trust simulator deliberately has no native concept of who handles an
 * escalation, so this service supplies one explicit, declared orchestration
 * policy and then grounds every outcome in observable state:
 *
 *   • Stress events (circuit-breaker trips / risk-accumulator crossings) are
 *     real signals on the bus — they give the requestor, timestamp and severity.
 *   • The handler pool is the actual highest-trust agents AT THE ESCALATION
 *     INSTANT (via the simulator's `trustAt`/resolveScoreAt), not the current
 *     roster and not a hash.
 *   • Whether an escalation resolves, and how fast, is DERIVED from that
 *     handler's real trust at the time versus the difficulty of the case
 *     (severity + how degraded the requestor itself is). No coin, no hash.
 *   • Agents sharing CT-SEC / CT-ID failures are a real, observable signal (the
 *     same one the correlation panel surfaces). The policy ROUTES them all to a
 *     single security lead; that policy-induced concentration — not an observed
 *     delegation pattern — is what trips RAINBOW's collusion detector.
 *
 * The orchestration POLICY remains a model (the simulator does not prescribe
 * delegation), which is why this is surfaced only on the explicitly-labeled
 * /lab route. But unlike the previous version, no outcome is invented — every
 * field traces back to the simulated signal stream and the real trust history.
 * It never feeds back into trust scores, so the rest of the dashboard is
 * unaffected.
 */

import type { IngestedSignal, EscalationEvent } from '@vorionsys/rainbow';

/** Stress signals that trigger an escalation to a handler. */
const STRESS_TYPES = new Set([
  'circuit_breaker_tripped',
  'risk_accumulator_degraded',
  'risk_accumulator_warning',
]);

/** Security factors whose shared failure routes a requestor to the security lead. */
const SECURITY_FACTORS = new Set(['CT-SEC', 'CT-ID']);

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export interface DelegationConfig {
  /** Stable fleet roster order (agent ids) — used for deterministic spread. */
  agentIds: string[];
  /** Trust score for an agent at a point in time (the simulator's resolveScoreAt). */
  trustAt: (agentId: string, at: Date) => number;
  /** Size of the high-trust handler pool. */
  handlerCount?: number;
}

export class DelegationService {
  private readonly agentIds: string[];
  private readonly trustAt: (agentId: string, at: Date) => number;
  private readonly handlerCount: number;
  private readonly ordinal: Map<string, number>;

  constructor(cfg: DelegationConfig) {
    this.agentIds = [...cfg.agentIds];
    this.trustAt = cfg.trustAt;
    this.handlerCount = cfg.handlerCount ?? 3;
    this.ordinal = new Map(this.agentIds.map((id, i) => [id, i]));
  }

  /**
   * The highest-trust agents at a given instant — the escalation handler pool.
   * Ties broken by stable roster order so the result is fully deterministic.
   */
  handlerPoolAt(at: Date, exclude?: string): string[] {
    return this.agentIds
      .filter((id) => id !== exclude)
      .map((id) => [id, this.trustAt(id, at)] as const)
      .sort((a, b) => b[1] - a[1] || (this.ordinal.get(a[0]) ?? 0) - (this.ordinal.get(b[0]) ?? 0))
      .slice(0, this.handlerCount)
      .map(([id]) => id);
  }

  /**
   * Agents whose CT-SEC / CT-ID checks are failing in the window — the same
   * shared-security-failure signal the correlator surfaces. A sane orchestration
   * policy routes their escalations to a single security lead.
   */
  private securityStressed(signals: IngestedSignal[]): Set<string> {
    const ring = new Set<string>();
    for (const s of signals) {
      if (!s.success && !s.blocked && s.factorCode && SECURITY_FACTORS.has(s.factorCode)) {
        ring.add(s.agentId);
      }
    }
    return ring;
  }

  /**
   * The security-failing cluster (agents with CT-SEC / CT-ID failures) in the
   * window — exposed so the view can scope the collusion flag to genuine shared
   * security failures rather than any incidental requestor→handler concentration.
   */
  securityCluster(signals: IngestedSignal[]): string[] {
    return [...this.securityStressed(signals)];
  }

  /**
   * Difficulty bar an escalation must clear, in [0,1]. Rises with severity and
   * with how degraded the requestor is (a more-degraded requestor implies a
   * harder problem), so even top handlers sometimes have to reject.
   */
  private demand(severity: string | undefined, requestorTrust: number): number {
    const base =
      severity === 'emergency' ? 0.92 :
      severity === 'critical' ? 0.8 :
      severity === 'high' ? 0.64 :
      0.5;
    const distress = (1 - clamp01(requestorTrust / 1000)) * 0.18;
    return Math.min(0.98, base + distress);
  }

  /**
   * Resolution time in ms, derived from how comfortably the handler clears the
   * bar (more slack → faster). Rejections take longer (time spent before giving
   * up). Bounded to a 2–10 minute band.
   */
  private resolution(capability: number, demand: number, success: boolean): number {
    const FAST = 120_000;
    const SLOW = 600_000;
    const slack = clamp01(capability - demand + 0.5);
    const eased = success ? slack : slack * 0.6;
    const t = SLOW - Math.round(eased * (SLOW - FAST));
    return Math.max(FAST, Math.min(SLOW, t));
  }

  /**
   * Produce escalation events from the window's stress signals, with handler,
   * outcome and resolution all derived from real trust at each event's instant.
   */
  escalations(signals: IngestedSignal[]): EscalationEvent[] {
    const securitySet = this.securityStressed(signals);

    // An agent escalates to a handler when it is in acute distress (a circuit-
    // breaker trip or a risk-accumulator crossing) OR hits a security-factor
    // (CT-SEC / CT-ID) failure — both are real signals on the bus. Signals
    // co-emitted at the same instant (e.g. a failure and the risk crossing it
    // triggers) are de-duplicated so one moment yields one escalation.
    const triggers = signals
      .filter(
        (s) =>
          (s.busSignalType && STRESS_TYPES.has(s.busSignalType)) ||
          (!s.success && !s.blocked && s.factorCode != null && SECURITY_FACTORS.has(s.factorCode))
      )
      .slice()
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const seen = new Set<string>();
    const stress = triggers.filter((s) => {
      const key = `${s.agentId}:${s.timestamp.getTime()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (stress.length === 0) return [];

    // A single, stable security lead: the highest-trust agent OUTSIDE the failing
    // cluster at the window's most recent stress event. Routing every security-
    // failing agent here is a realistic "designated lead" policy that concentrates
    // the requestor→handler pairs. (Outcomes are still derived from the lead's
    // actual trust at each event's own instant.)
    const tRef = stress[stress.length - 1].timestamp;
    const securityLead = this.agentIds
      .filter((id) => !securitySet.has(id))
      .map((id) => [id, this.trustAt(id, tRef)] as const)
      .sort((a, b) => b[1] - a[1] || (this.ordinal.get(a[0]) ?? 0) - (this.ordinal.get(b[0]) ?? 0))[0]?.[0];

    const occurrence = new Map<string, number>();
    const out: EscalationEvent[] = [];

    for (const s of stress) {
      const t = s.timestamp;
      const requestorId = s.agentId;
      const pool = this.handlerPoolAt(t, requestorId);
      if (pool.length === 0) continue;

      const i = occurrence.get(requestorId) ?? 0;
      occurrence.set(requestorId, i + 1);

      // Security-failing agents concentrate on the single lead (→ collusion
      // flag); everyone else load-balances deterministically across the pool.
      const handlerId =
        securitySet.has(requestorId) && securityLead && securityLead !== requestorId
          ? securityLead
          : pool[((this.ordinal.get(requestorId) ?? 0) + i) % pool.length];

      const capability = clamp01(this.trustAt(handlerId, t) / 1000);
      const demand = this.demand(s.severity, this.trustAt(requestorId, t));
      const success = capability >= demand;

      out.push({
        requestorId,
        handlerId,
        success,
        resolutionTimeMs: this.resolution(capability, demand, success),
        timestamp: t,
      });
    }

    return out;
  }
}
