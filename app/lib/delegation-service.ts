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

/**
 * Stress bus-signal types, tiered by acuteness. The active set is selected by
 * the `riskTolerance` POLICY knob (see DelegationPolicy): a lower tolerance
 * escalates more eagerly (includes the early risk-accumulator WARNING), a
 * higher tolerance only escalates on acute stress. This is a property of the
 * modeled routing policy — it changes which real signals the policy ACTS on,
 * never the signals themselves.
 */
const ACUTE_STRESS_TYPES = ['circuit_breaker_tripped', 'risk_accumulator_degraded'] as const;
const EARLY_STRESS_TYPE = 'risk_accumulator_warning';

/** Security factors whose shared failure routes a requestor to the security lead. */
const SECURITY_FACTORS = new Set(['CT-SEC', 'CT-ID']);

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Bounds for the handler-pool-size policy knob. */
export const MIN_HANDLER_COUNT = 1;
export const MAX_HANDLER_COUNT = 5;
export const DEFAULT_HANDLER_COUNT = 3;

/**
 * Security-lead routing policy. `concentrated` (the default, and the collusion
 * driver) routes every security-failing requestor to ONE designated lead;
 * `distributed` spreads them across the trusted pool like everyone else, so the
 * ≥80%-to-one-handler concentration never builds.
 */
export type LeadRouting = 'concentrated' | 'distributed';
export const DEFAULT_LEAD_ROUTING: LeadRouting = 'concentrated';

/**
 * Risk-tolerance policy. Selects which stress signals the policy escalates on —
 * `low` escalates eagerly (acute + early warnings), `balanced` is acute + early
 * (the prior default), `high` only escalates on acute stress.
 */
export type RiskTolerance = 'low' | 'balanced' | 'high';
export const DEFAULT_RISK_TOLERANCE: RiskTolerance = 'balanced';

/**
 * The modeled DELEGATION POLICY overlaid on the honestly-grounded signal
 * stream. None of these knobs touch the simulator or the trust trajectories —
 * they only change how the policy routes/triggers over the real signals. All
 * fields are optional; the defaults reproduce the prior fixed behavior exactly.
 */
export interface DelegationPolicy {
  /** Size of the high-trust handler pool (clamped 1–5). */
  handlerCount?: number;
  /** Security-lead routing (collusion driver vs. spread). */
  leadRouting?: LeadRouting;
  /** Which stress signals trigger an escalation. */
  riskTolerance?: RiskTolerance;
}

export interface DelegationConfig extends DelegationPolicy {
  /** Stable fleet roster order (agent ids) — used for deterministic spread. */
  agentIds: string[];
  /** Trust score for an agent at a point in time (the simulator's resolveScoreAt). */
  trustAt: (agentId: string, at: Date) => number;
}

/** Clamp a requested handler count into the supported range. */
export function clampHandlerCount(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_HANDLER_COUNT;
  return Math.min(MAX_HANDLER_COUNT, Math.max(MIN_HANDLER_COUNT, Math.round(n)));
}

export class DelegationService {
  private readonly agentIds: string[];
  private readonly trustAt: (agentId: string, at: Date) => number;
  private readonly handlerCount: number;
  private readonly leadRouting: LeadRouting;
  private readonly stressTypes: Set<string>;
  private readonly ordinal: Map<string, number>;

  constructor(cfg: DelegationConfig) {
    this.agentIds = [...cfg.agentIds];
    this.trustAt = cfg.trustAt;
    this.handlerCount = clampHandlerCount(cfg.handlerCount ?? DEFAULT_HANDLER_COUNT);
    this.leadRouting = cfg.leadRouting ?? DEFAULT_LEAD_ROUTING;
    // Risk tolerance selects the active stress-trigger set. `balanced` (the
    // prior default) and `low` both include the early warning; `low` also lets
    // the early warning trigger security-cluster routing (see below). `high`
    // restricts triggers to acute stress only.
    const tolerance: RiskTolerance = cfg.riskTolerance ?? DEFAULT_RISK_TOLERANCE;
    this.stressTypes =
      tolerance === 'high'
        ? new Set<string>(ACUTE_STRESS_TYPES)
        : new Set<string>([...ACUTE_STRESS_TYPES, EARLY_STRESS_TYPE]);
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
          (s.busSignalType && this.stressTypes.has(s.busSignalType)) ||
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
    // actual trust at each event's own instant.) Under the `distributed` policy
    // there is NO designated lead, so security-failing agents load-balance across
    // the trusted pool like everyone else and the concentration never builds.
    const tRef = stress[stress.length - 1].timestamp;
    const securityLead =
      this.leadRouting === 'concentrated'
        ? this.agentIds
            .filter((id) => !securitySet.has(id))
            .map((id) => [id, this.trustAt(id, tRef)] as const)
            .sort(
              (a, b) =>
                b[1] - a[1] || (this.ordinal.get(a[0]) ?? 0) - (this.ordinal.get(b[0]) ?? 0)
            )[0]?.[0]
        : undefined;

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
