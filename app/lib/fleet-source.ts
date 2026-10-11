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
 *                          persisted in Supabase and read through the
 *                          LiveSignalFeed.
 *
 * Selection is by deployment, in data-source.ts: the public deployment is
 * always simulated and the live deployment is always live. A live deployment
 * with nothing to show says so (`Provenance.available`) rather than falling
 * back to the simulator or drawing an empty fleet, because an empty dashboard
 * would read as "the fleet is fine" rather than "nothing has reported yet".
 */

import 'server-only';

import { CIRCUIT_BREAKER, MAX_TRUST_SCORE, MIN_TRUST_SCORE } from '@vorionsys/basis-spec';
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

/** An agent's running trust score after each of its signals, oldest first. */
export interface ScoreTimeline {
  timesMs: number[];
  scores: number[];
  /** The score before the first signal. */
  baseline: number;
}

/**
 * Build the score timeline for one agent's signals (oldest first).
 *
 * Producers SHOULD send `scoreAfter` — the score their own engine computed.
 * When they do, it is authoritative and resets the running total. When they
 * never do, the only thing rainbow actually knows is the sum of the deltas it
 * was sent, so that is what we report.
 *
 * The baseline (the score before the first signal) is declared too when the
 * first signal carries `scoreAfter`: it is that score minus the signal's delta.
 * A window that starts before an agent's first signal replays from there, not
 * from 0, which would draw every new agent's trajectory climbing out of zero.
 * We do not invent a starting score: with nothing declared, the baseline is 0.
 */
export function buildScoreTimeline(signals: IngestedSignal[]): ScoreTimeline {
  const timesMs: number[] = [];
  const scores: number[] = [];
  const first = signals[0];
  const baseline =
    first && typeof first.scoreAfter === 'number' && Number.isFinite(first.scoreAfter)
      ? Math.min(MAX_TRUST_SCORE, Math.max(MIN_TRUST_SCORE, first.scoreAfter - first.delta))
      : 0;
  let score = baseline;
  for (const signal of signals) {
    const declared = signal.scoreAfter;
    score = typeof declared === 'number' && Number.isFinite(declared) ? declared : score + signal.delta;
    timesMs.push(signal.timestamp.getTime());
    scores.push(score);
  }
  return { timesMs, scores, baseline };
}

/** The score after the last signal at or before `atMs` (the baseline before the first). */
export function scoreAtTime(timeline: ScoreTimeline, atMs: number): number {
  // First index whose time is after atMs; the signal before it is the answer.
  let low = 0;
  let high = timeline.timesMs.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (timeline.timesMs[mid] <= atMs) low = mid + 1;
    else high = mid;
  }
  return low === 0 ? timeline.baseline : timeline.scores[low - 1];
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

interface AgentSeries {
  signals: IngestedSignal[];
  timeline: ScoreTimeline;
}

/**
 * A live fleet over one snapshot of the store. Each agent's series is built on
 * first use and kept, so the dozens of score lookups a single render makes cost
 * one pass per agent, not one per lookup. A source must therefore be replaced,
 * not reused, when the store changes (the live feed hands out a fresh one).
 */
export class LiveFleetSource implements FleetSource {
  readonly mode = 'live' as const;
  private readonly series = new Map<string, AgentSeries>();

  constructor(private readonly store: WindowStore) {}

  ensureUpTo(): void {
    // Real time. Data arrives through POST /api/signals, not by generation.
  }

  private seriesFor(agentId: string): AgentSeries {
    let entry = this.series.get(agentId);
    if (!entry) {
      const signals = this.store.query(agentId, EPOCH, FAR_FUTURE);
      entry = { signals, timeline: buildScoreTimeline(signals) };
      this.series.set(agentId, entry);
    }
    return entry;
  }

  /** Stable roster order: ids sorted, not the order agents happened to report. */
  private agentIds(): string[] {
    return this.store.agentIds().slice().sort();
  }

  agents(): AgentInfo[] {
    const nowMs = Date.now();
    return this.agentIds().map((agentId) => {
      const { signals, timeline } = this.seriesFor(agentId);
      const score = scoreAtTime(timeline, nowMs);
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
    const nowMs = Date.now();
    return new Map(
      this.agentIds().map((agentId) => [agentId, scoreAtTime(this.seriesFor(agentId).timeline, nowMs)]),
    );
  }

  resolveScoreAt(agentId: string, at: Date): number {
    return scoreAtTime(this.seriesFor(agentId).timeline, at.getTime());
  }
}
