// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * DelegationService — a first-class model of agent-to-agent escalation. In the
 * real ecosystem this service owns the delegation graph and emits escalation
 * events; the trust simulator does NOT model delegation, so this service builds
 * a deterministic delegation topology over the roster and derives escalations
 * from real stress signals (circuit-breaker trips / risk-accumulator crossings)
 * on the bus. It is a synthetic MODEL (labeled as such on /lab), but a genuine,
 * deterministic, self-contained producer — not a view-layer bolt-on — and it
 * never feeds back into trust scores, so the rest of the dashboard is unaffected.
 */

import type { IngestedSignal, EscalationEvent } from '@vorionsys/rainbow';

export interface RosterMember {
  agentId: string;
  score: number;
  tier: string;
}

const STRESS_TYPES = new Set([
  'circuit_breaker_tripped',
  'risk_accumulator_degraded',
  'risk_accumulator_warning',
]);

/** Deterministic FNV-1a hash for stable, seed-free synthetic choices. */
function hash(str: string): number {
  let h = 2166136261;
  for (let k = 0; k < str.length; k++) {
    h ^= str.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class DelegationService {
  /** Coordinator pool — the highest-trust agents act as escalation handlers. */
  private readonly handlers: string[];
  private readonly topHandler: string;
  private readonly scoreOf: Map<string, number>;

  constructor(roster: RosterMember[], opts: { handlerCount?: number } = {}) {
    const sorted = roster.slice().sort((a, b) => b.score - a.score);
    this.handlers = sorted.slice(0, opts.handlerCount ?? 3).map((m) => m.agentId);
    this.topHandler = this.handlers[0] ?? roster[0]?.agentId ?? 'atlas-01';
    this.scoreOf = new Map(roster.map((m) => [m.agentId, m.score]));
  }

  /** The coordinator/handler pool (highest-trust agents). */
  handlerPool(): string[] {
    return [...this.handlers];
  }

  /**
   * Agents whose stress reflects security-factor failure (CT-SEC/CT-ID) are
   * modeled as a collusion ring: each routes ALL its escalations to a single
   * handler, which trips RAINBOW's collusion-risk detector.
   */
  private collusionRing(signals: IngestedSignal[]): Set<string> {
    const ring = new Set<string>();
    for (const s of signals) {
      if (!s.success && !s.blocked && (s.factorCode === 'CT-SEC' || s.factorCode === 'CT-ID')) {
        ring.add(s.agentId);
      }
    }
    return ring;
  }

  private pickHandler(requestor: string, ring: Set<string>, i: number): string {
    if (ring.has(requestor)) {
      const fixed = this.handlers[0] ?? this.topHandler;
      return fixed === requestor ? this.handlers[1] ?? this.topHandler : fixed;
    }
    const pool = this.handlers.filter((h) => h !== requestor);
    if (pool.length === 0) return this.topHandler;
    return pool[(hash(requestor) + i) % pool.length];
  }

  /** Success modeled from handler trust and signal severity. */
  private modelSuccess(signalId: string, handlerScore: number, severity?: string): boolean {
    const trustFrac = Math.min(1, Math.max(0, handlerScore / 1000));
    const base = 50 + Math.round(trustFrac * 40); // 50–90%
    const penalty = severity === 'emergency' ? 30 : severity === 'critical' ? 15 : 0;
    const roll = hash(`${signalId}:s`) % 100;
    return roll < Math.max(10, base - penalty);
  }

  /** Resolution time modeled from handler trust (higher trust → faster). */
  private modelResolution(signalId: string, handlerScore: number): number {
    const trustFrac = Math.min(1, Math.max(0, handlerScore / 1000));
    const base = 600_000 - Math.round(trustFrac * 480_000); // 120k–600k ms
    return base + (hash(`${signalId}:r`) % 120_000);
  }

  /** Produce escalation events from the window's stress signals. */
  escalations(signals: IngestedSignal[]): EscalationEvent[] {
    const ring = this.collusionRing(signals);
    const out: EscalationEvent[] = [];
    let i = 0;
    for (const s of signals) {
      if (!s.busSignalType || !STRESS_TYPES.has(s.busSignalType)) continue;
      const requestorId = s.agentId;
      const handlerId = this.pickHandler(requestorId, ring, i);
      const handlerScore = this.scoreOf.get(handlerId) ?? 500;
      out.push({
        requestorId,
        handlerId,
        success: this.modelSuccess(s.signalId, handlerScore, s.severity),
        resolutionTimeMs: this.modelResolution(s.signalId, handlerScore),
        timestamp: s.timestamp,
      });
      i++;
    }
    return out;
  }
}
