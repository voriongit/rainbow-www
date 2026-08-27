// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * The fleet seam: where rainbow's read path gets its agents.
 *
 * The dashboard used to be hard-wired to FleetSimulator, and the three public
 * API routes announced a literal `synthetic: true`. This file makes the source
 * pluggable and the provenance *derived* rather than hardcoded, so the site
 * cannot claim to be showing a real fleet when it is showing a simulated one,
 * or keep claiming to be simulated once real signals arrive.
 *
 * Two implementations, one interface — the whole read path only ever uses
 * four methods (ensureUpTo / agents / currentScores / resolveScoreAt):
 *
 *   SimulatedFleetSource — FleetSimulator, the seeded demo fleet.
 *   LiveFleetSource      — real signals ingested via POST /api/signals and
 *                          persisted in Supabase (SupabaseWindowStore).
 *
 * Selection is in data-source.ts and is evidence-based: live only when a
 * store is configured AND it actually holds signals. A configured-but-empty
 * store is reported as simulated-with-a-reason, not as an empty real fleet,
 * because an empty dashboard would read as "the fleet is fine" rather than
 * "nothing has reported yet".
 */

import 'server-only';

import { CIRCUIT_BREAKER } from '@vorionsys/basis-spec';
import type { IngestedSignal, WindowStore } from '@vorionsys/rainbow';
import { tierKeyForScore } from './tiers';
import type { SimAgentInfo } from './simulator';
import { FleetSimulator } from './simulator';

/** Agent summary shown by the dashboard. Same shape in both modes. */
export type AgentInfo = SimAgentInfo;

export type SourceMode = 'live' | 'simulated';

export interface FleetSource {
  readonly mode: SourceMode;
  /** Advance any generated stream to `now`. No-op for a live source. */
  ensureUpTo(now: Date): void;
  agents(): AgentInfo[];
  currentScores(): Map<string, number>;
  resolveScoreAt(agentId: string, at: Date): number;
}

// ---------------------------------------------------------------------------
// Simulated
// ---------------------------------------------------------------------------

export class SimulatedFleetSource implements FleetSource {
  readonly mode = 'simulated' as const;
  constructor(private readonly sim: FleetSimulator) {}

  ensureUpTo(now: Date): void {
    this.sim.ensureUpTo(now);
  }
  agents(): AgentInfo[] {
    return this.sim.agents();
  }
  currentScores(): Map<string, number> {
    return this.sim.currentScores();
  }
  resolveScoreAt(agentId: string, at: Date): number {
    return this.sim.resolveScoreAt(agentId, at);
  }
}

// ---------------------------------------------------------------------------
// Live
// ---------------------------------------------------------------------------

const EPOCH = new Date(0);
const FAR_FUTURE = new Date(8.64e15);

/**
 * Absolute trust score for a live agent at a point in time.
 *
 * Producers SHOULD send `scoreAfter` — the score their own engine computed.
 * When they do, the most recent one at or before `at` is authoritative.
 * When they never do, the only thing rainbow actually knows is the sum of the
 * deltas it was sent, so that is what we report. We do not invent a starting
 * score: an undeclared baseline is 0, and the accumulated deltas are real.
 */
function scoreAt(signals: IngestedSignal[], at: Date): number {
  const atMs = at.getTime();
  let score = 0;

  for (const signal of signals) {
    if (signal.timestamp.getTime() > atMs) break;
    const declared = (signal as { scoreAfter?: number }).scoreAfter;
    if (typeof declared === 'number' && Number.isFinite(declared)) {
      // A declared score is authoritative and resets the running total.
      score = declared;
    } else {
      // Otherwise the only truth available is the delta rainbow was sent.
      score += signal.delta;
    }
  }
  return score;
}

/** Undeclared observability IS black-box — that is the accurate reading. */
function observationTierOf(signals: IngestedSignal[]): AgentInfo['observationTier'] {
  for (let i = signals.length - 1; i >= 0; i -= 1) {
    const meta = (signals[i] as { metadata?: Record<string, unknown> }).metadata;
    const declared = meta?.observationTier;
    if (
      declared === 'BLACK_BOX' ||
      declared === 'GRAY_BOX' ||
      declared === 'WHITE_BOX' ||
      declared === 'ATTESTED_BOX' ||
      declared === 'VERIFIED_BOX'
    ) {
      return declared;
    }
  }
  return 'BLACK_BOX';
}

/** Same vocabulary the simulator uses, derived from real signals. */
function lifecycleOf(signals: IngestedSignal[], score: number): string {
  const latest = signals[signals.length - 1] as
    | { busSignalType?: string }
    | undefined;
  if (latest?.busSignalType === 'circuit_breaker_tripped') return 'TRIPPED';
  if (score < CIRCUIT_BREAKER.degradedThreshold) return 'DEGRADED';
  return 'ACTIVE';
}

export class LiveFleetSource implements FleetSource {
  readonly mode = 'live' as const;
  constructor(private readonly store: WindowStore) {}

  ensureUpTo(): void {
    // Real time. Data arrives through POST /api/signals, not by generation.
  }

  private signalsFor(agentId: string): IngestedSignal[] {
    return this.store.query(agentId, EPOCH, FAR_FUTURE);
  }

  agents(): AgentInfo[] {
    const now = new Date();
    return this.store.agentIds().map((agentId) => {
      const signals = this.signalsFor(agentId);
      const score = scoreAt(signals, now);
      return {
        agentId,
        // No invented narrative label — a real agent is named by its id.
        label: agentId,
        observationTier: observationTierOf(signals),
        lifecycleState: lifecycleOf(signals, score),
        score,
        tier: tierKeyForScore(score),
        signalCount: signals.length,
      };
    });
  }

  currentScores(): Map<string, number> {
    const now = new Date();
    return new Map(
      this.store.agentIds().map((agentId) => [agentId, scoreAt(this.signalsFor(agentId), now)]),
    );
  }

  resolveScoreAt(agentId: string, at: Date): number {
    return scoreAt(this.signalsFor(agentId), at);
  }
}
