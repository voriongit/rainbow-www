// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Deterministic fleet simulator for the RAINBOW observability demo.
 *
 * Generates a synthetic Trust Signal Bus stream for a small fleet of agents,
 * each following a scripted behavioral archetype (steady, rising, degrading,
 * erratic, recovering, dormant, compromised cluster). Score dynamics use the
 * canonical BASIS formulas:
 *
 *   gain = gainRate × ln(1 + C − S) × ∛R
 *   loss = −P(T) × R × gainRate × ln(1 + C/2),  P(T) = 3 + T (STANDARD)
 *
 * The stream is seeded and reproducible: the same seed yields the same
 * relative history. Signal IDs are stable per agent+sequence.
 *
 * SEAM (#6 producers/simulator): this module stands in for the shared
 * ecosystem simulator. When that package lands, replace this file and keep
 * the `FleetSimulator` surface (`ensureUpTo`, `agents`, `resolveScoreAt`).
 */

import {
  GAIN_RATE,
  PENALTY_RATIO_MIN,
  PENALTY_RATIO_MAX,
  OBSERVATION_TIERS,
  RISK_LEVELS,
  RISK_ACCUMULATOR,
  CIRCUIT_BREAKER,
  QUALIFICATION_PASS_SCORE,
} from '@vorionsys/basis-spec';
import { CANARY_FACTOR_MAPPING, CANARY_RISK_MAPPING } from './canary-map';
import type { IngestedSignal } from '@vorionsys/rainbow';
import { SIG, SEV, type BusSignalType, type BusSeverity } from './bus-enums';
import { tierIndexForScore, tierKeyForScore } from './tiers';

// ============================================================================
// Deterministic PRNG
// ============================================================================

/** mulberry32 — small, fast, deterministic 32-bit PRNG */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash for per-agent seed derivation */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ============================================================================
// Archetypes
// ============================================================================

type RiskKey = keyof typeof RISK_LEVELS;
type ObsTier = keyof typeof OBSERVATION_TIERS;

/** Weighted risk-level distribution: [riskLevel, weight] */
type RiskWeights = Array<[RiskKey, number]>;

interface PhaseBehavior {
  /** Probability an action succeeds */
  successRate: number;
  /** Probability a tick emits a signal at all (sparse agents < 1) */
  activity: number;
  /** Distribution over action risk levels */
  riskWeights: RiskWeights;
  /** Factor codes this agent exercises */
  factorPool: string[];
  /** Factors biased toward failure (compromised-cluster phases) */
  failingFactors?: string[];
  /** Probability a signal draws from failingFactors */
  failingPickRate?: number;
  /** Success rate when a failing factor is drawn */
  failingSuccessRate?: number;
  /** Probability a failure is classified DRIFT/ANOMALY instead of TRUST_UPDATED */
  driftRate?: number;
}

interface Archetype {
  agentId: string;
  label: string;
  startScore: number;
  cadenceMinutes: number;
  observationTier: ObsTier;
  /** Every Nth emitted signal is a canary probe */
  canaryEvery: number;
  /** p = progress through history, 0 (start) → 1 (now); >1 for live extension */
  behavior: (p: number) => PhaseBehavior;
  /**
   * RNG seed key when it differs from agentId. Lets an agent be renamed without
   * changing its seeded stream (helix/wisp were renumbered to close a gap in
   * the roster; their behaviour is byte-identical to the old ids).
   */
  seedKey?: string;
}

const FOUNDATION = ['CT-COMP', 'CT-REL', 'CT-OBS', 'CT-TRANS', 'CT-ACCT', 'CT-SAFE'];
const SECURITY = ['CT-SEC', 'CT-PRIV', 'CT-ID'];
const AGENCY = ['OP-HUMAN', 'OP-ALIGN', 'OP-CONTEXT'];
const MATURITY = ['OP-STEW', 'SF-HUM'];
const EVOLUTION = ['SF-ADAPT', 'SF-LEARN'];

/** Calm production mix — mostly observation, occasional writes */
const SAFE_RISK: RiskWeights = [
  ['READ', 0.6],
  ['LOW', 0.3],
  ['MEDIUM', 0.1],
];

/** Operational mix with some higher-stakes actions */
const ACTIVE_RISK: RiskWeights = [
  ['READ', 0.45],
  ['LOW', 0.3],
  ['MEDIUM', 0.18],
  ['HIGH', 0.06],
  ['CRITICAL', 0.01],
];

const ARCHETYPES: Archetype[] = [
  {
    agentId: 'atlas-01',
    label: 'Steady performer',
    startScore: 815,
    cadenceMinutes: 14,
    observationTier: 'WHITE_BOX',
    canaryEvery: 12,
    behavior: () => ({
      successRate: 0.985,
      activity: 0.95,
      riskWeights: SAFE_RISK,
      factorPool: [...FOUNDATION, ...SECURITY, ...AGENCY, ...MATURITY],
    }),
  },
  {
    agentId: 'nova-02',
    label: 'Rising star',
    startScore: 365,
    cadenceMinutes: 12,
    observationTier: 'WHITE_BOX',
    canaryEvery: 10,
    behavior: () => ({
      successRate: 0.99,
      activity: 0.95,
      riskWeights: SAFE_RISK,
      factorPool: [...FOUNDATION, ...SECURITY],
    }),
  },
  {
    agentId: 'cascade-03',
    label: 'Degrading',
    startScore: 730,
    cadenceMinutes: 13,
    observationTier: 'GRAY_BOX',
    canaryEvery: 10,
    behavior: (p) =>
      p < 0.6
        ? {
            successRate: 0.975,
            activity: 0.95,
            riskWeights: SAFE_RISK,
            factorPool: [...FOUNDATION, ...SECURITY, ...AGENCY],
          }
        : {
            // Quality slide: rising failures, some classified as drift/anomaly
            successRate: 0.9 - 0.08 * Math.min(1, (p - 0.6) / 0.4),
            activity: 0.95,
            riskWeights: SAFE_RISK,
            factorPool: [...FOUNDATION, ...SECURITY, ...AGENCY],
            driftRate: 0.3,
          },
  },
  {
    agentId: 'flux-04',
    label: 'Erratic oscillator',
    startScore: 540,
    cadenceMinutes: 15,
    observationTier: 'GRAY_BOX',
    canaryEvery: 10,
    behavior: (p) => ({
      // ~3-day oscillation between solid and shaky performance
      successRate: 0.965 - 0.05 * (0.5 + 0.5 * Math.sin(p * 10 * 2 * Math.PI)),
      activity: 0.9,
      riskWeights: ACTIVE_RISK,
      factorPool: [...FOUNDATION, ...SECURITY],
    }),
  },
  {
    agentId: 'phoenix-05',
    label: 'CB trip → recovery',
    startScore: 250,
    cadenceMinutes: 14,
    observationTier: 'BLACK_BOX',
    canaryEvery: 8,
    behavior: (p) =>
      p < 0.12
        ? {
            // Rough start: heavy failures drive the score under the CB floor
            successRate: 0.62,
            activity: 0.95,
            riskWeights: ACTIVE_RISK,
            factorPool: FOUNDATION,
            driftRate: 0.2,
          }
        : {
            successRate: 0.98,
            activity: 0.95,
            riskWeights: SAFE_RISK,
            factorPool: FOUNDATION,
          },
  },
  {
    agentId: 'umbra-06',
    label: 'Dormant stretch',
    startScore: 470,
    cadenceMinutes: 25,
    observationTier: 'BLACK_BOX',
    canaryEvery: 9,
    behavior: (p) => ({
      successRate: 0.97,
      // Goes silent for ~8 days mid-history, then reactivates
      activity: p > 0.35 && p < 0.62 ? 0 : 0.55,
      riskWeights: SAFE_RISK,
      factorPool: FOUNDATION,
    }),
  },
  // ── Compromised cluster: orion/lyra/vega share failing factors late in
  //    the window, which RAINBOW should surface as an anomaly cluster. ──
  ...(['orion-07', 'lyra-08', 'vega-09'] as const).map((agentId, i): Archetype => ({
    agentId,
    label: 'Cluster anomaly (CT-SEC / CT-ID)',
    startScore: 690 + i * 25,
    cadenceMinutes: 17 + i,
    observationTier: 'GRAY_BOX',
    canaryEvery: 11,
    behavior: (p) =>
      p < 0.72
        ? {
            successRate: 0.975,
            activity: 0.85,
            riskWeights: SAFE_RISK,
            factorPool: [...FOUNDATION, ...SECURITY],
          }
        : {
            successRate: 0.95,
            activity: 0.85,
            riskWeights: SAFE_RISK,
            // Healthy draws avoid the compromised factors so their failure
            // rate stays decisively above the cluster-detection threshold
            factorPool: [...FOUNDATION, 'CT-PRIV'],
            failingFactors: ['CT-SEC', 'CT-ID'],
            failingPickRate: 0.35,
            failingSuccessRate: 0.15,
            driftRate: 0.25,
          },
  })),
  {
    agentId: 'quill-10',
    label: 'Background mid-tier',
    startScore: 575,
    cadenceMinutes: 19,
    observationTier: 'GRAY_BOX',
    canaryEvery: 12,
    behavior: () => ({
      successRate: 0.975,
      activity: 0.85,
      riskWeights: SAFE_RISK,
      factorPool: [...FOUNDATION, ...SECURITY],
    }),
  },
  {
    agentId: 'rune-11',
    label: 'Background mid-tier',
    startScore: 615,
    cadenceMinutes: 21,
    observationTier: 'WHITE_BOX',
    canaryEvery: 12,
    behavior: () => ({
      successRate: 0.98,
      activity: 0.85,
      riskWeights: SAFE_RISK,
      factorPool: [...FOUNDATION, ...AGENCY],
    }),
  },
  {
    agentId: 'helix-12',
    seedKey: 'helix-13',
    label: 'High-volume trusted',
    startScore: 880,
    cadenceMinutes: 7,
    observationTier: 'ATTESTED_BOX',
    canaryEvery: 15,
    behavior: () => ({
      successRate: 0.99,
      activity: 0.95,
      riskWeights: SAFE_RISK,
      factorPool: [...FOUNDATION, ...SECURITY, ...AGENCY, ...MATURITY, ...EVOLUTION],
    }),
  },
  {
    agentId: 'wisp-13',
    seedKey: 'wisp-14',
    label: 'Qualification climb',
    startScore: 215,
    cadenceMinutes: 16,
    observationTier: 'BLACK_BOX',
    canaryEvery: 5,
    behavior: () => ({
      successRate: 0.975,
      activity: 0.9,
      riskWeights: [
        ['READ', 0.7],
        ['LOW', 0.3],
      ],
      factorPool: FOUNDATION,
    }),
  },
];

// ============================================================================
// Canonical score dynamics
// ============================================================================

const CANARY_CATEGORIES = Object.keys(CANARY_FACTOR_MAPPING) as Array<
  keyof typeof CANARY_FACTOR_MAPPING
>;

/** P(T) = penaltyRatioMin + (T/7) × (penaltyRatioMax − penaltyRatioMin) */
function penaltyRatio(tierIndex: number): number {
  return PENALTY_RATIO_MIN + (tierIndex / 7) * (PENALTY_RATIO_MAX - PENALTY_RATIO_MIN);
}

function gainDelta(score: number, ceiling: number, riskMultiplier: number): number {
  return GAIN_RATE * Math.log(1 + Math.max(0, ceiling - score)) * Math.cbrt(riskMultiplier);
}

function lossDelta(tierIndex: number, ceiling: number, riskMultiplier: number): number {
  return -penaltyRatio(tierIndex) * riskMultiplier * GAIN_RATE * Math.log(1 + ceiling / 2);
}

function pickWeighted<T>(rng: () => number, entries: Array<[T, number]>): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

// ============================================================================
// Simulator
// ============================================================================

export interface SimAgentInfo {
  agentId: string;
  label: string;
  observationTier: ObsTier;
  lifecycleState: string;
  score: number;
  tier: string;
  signalCount: number;
}

interface AgentState {
  archetype: Archetype;
  rng: () => number;
  score: number;
  nextTickMs: number;
  seq: number;
  emitted: number;
  /** CB pause — agent halted until this time */
  trippedUntilMs: number;
  cbTrips: number;
  /** Operator requalification owed after a CB pause expires */
  requalifyPending: boolean;
  /** Rolling 24h corrected accumulator events for threshold-crossing signals */
  accEvents: Array<{ tMs: number; contribution: number }>;
  accValue: number;
  aboveWarning: boolean;
  aboveDegraded: boolean;
  /** Dormancy deduction fired for the current silent stretch */
  dormancyFired: boolean;
  wasSilent: boolean;
  /** Score checkpoints for resolveScoreAt — [timestampMs, score] */
  timeline: Array<[number, number]>;
  signalCount: number;
}

const TRIP_PAUSE_MS = 6 * 3_600_000;
const ACC_WINDOW_MS = RISK_ACCUMULATOR.windowHours * 3_600_000;

export class FleetSimulator {
  private readonly states: AgentState[];
  private readonly epochMs: number;
  private readonly historyMs: number;
  private readonly onSignal: (signal: IngestedSignal) => void;
  private generatedUpToMs: number;

  constructor(opts: {
    seed: number;
    historyDays: number;
    /** History ends here at construction; extended lazily via ensureUpTo */
    now: Date;
    onSignal: (signal: IngestedSignal) => void;
  }) {
    this.historyMs = opts.historyDays * 24 * 3_600_000;
    this.epochMs = opts.now.getTime() - this.historyMs;
    this.onSignal = opts.onSignal;
    this.generatedUpToMs = this.epochMs;

    this.states = ARCHETYPES.map((archetype) => {
      const rng = mulberry32((fnv1a(archetype.seedKey ?? archetype.agentId) ^ opts.seed) >>> 0);
      return {
        archetype,
        rng,
        score: archetype.startScore,
        // Stagger first ticks so agents interleave
        nextTickMs: this.epochMs + Math.floor(rng() * archetype.cadenceMinutes * 60_000),
        seq: 0,
        emitted: 0,
        trippedUntilMs: 0,
        cbTrips: 0,
        requalifyPending: false,
        accEvents: [],
        accValue: 0,
        aboveWarning: false,
        aboveDegraded: false,
        dormancyFired: false,
        wasSilent: false,
        timeline: [[this.epochMs, archetype.startScore]],
        signalCount: 0,
      };
    });

    this.ensureUpTo(opts.now);
  }

  /** Generate any pending ticks up to `now`. Idempotent, monotonic. */
  ensureUpTo(now: Date): void {
    const nowMs = now.getTime();
    if (nowMs <= this.generatedUpToMs) return;
    for (const state of this.states) {
      while (state.nextTickMs <= nowMs) {
        this.step(state, state.nextTickMs);
        // Deterministic jitter around the base cadence
        const cadenceMs = state.archetype.cadenceMinutes * 60_000;
        state.nextTickMs += Math.floor(cadenceMs * (0.75 + 0.5 * state.rng()));
      }
    }
    this.generatedUpToMs = nowMs;
  }

  /** Current fleet roster with live scores */
  agents(): SimAgentInfo[] {
    return this.states.map((s) => ({
      agentId: s.archetype.agentId,
      label: s.archetype.label,
      observationTier: s.archetype.observationTier,
      lifecycleState: this.lifecycleOf(s, this.generatedUpToMs),
      score: s.score,
      tier: tierKeyForScore(s.score),
      signalCount: s.signalCount,
    }));
  }

  /** Map of agentId → current score (for fleet distribution) */
  currentScores(): Map<string, number> {
    return new Map(this.states.map((s) => [s.archetype.agentId, s.score]));
  }

  /**
   * Trust score for an agent at a point in time (binary search over the
   * generated timeline). Used as Rainbow's `resolveInitialScore`.
   */
  resolveScoreAt(agentId: string, at: Date): number {
    const state = this.states.find((s) => s.archetype.agentId === agentId);
    if (!state) return 0;
    const atMs = at.getTime();
    const tl = state.timeline;
    if (atMs <= tl[0][0]) return tl[0][1];
    let lo = 0;
    let hi = tl.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tl[mid][0] <= atMs) lo = mid;
      else hi = mid - 1;
    }
    return tl[lo][1];
  }

  // ── internals ──

  private lifecycleOf(state: AgentState, atMs: number): string {
    if (atMs < state.trippedUntilMs) return 'TRIPPED';
    if (state.score < CIRCUIT_BREAKER.degradedThreshold) return 'DEGRADED';
    return 'ACTIVE';
  }

  private emit(state: AgentState, signal: Omit<IngestedSignal, 'signalId' | 'tenantId'>): void {
    state.seq++;
    state.signalCount++;
    this.onSignal({
      signalId: `${state.archetype.agentId}-${state.seq}`,
      tenantId: 'demo',
      ...signal,
    });
  }

  private step(state: AgentState, tMs: number): void {
    const { archetype, rng } = state;
    const p = (tMs - this.epochMs) / this.historyMs;
    const b = archetype.behavior(Math.min(p, 1.2));
    const timestamp = new Date(tMs);

    // Prune the rolling accumulator window and reset crossing edges
    state.accEvents = state.accEvents.filter((e) => e.tMs > tMs - ACC_WINDOW_MS);
    state.accValue = state.accEvents.reduce((s, e) => s + e.contribution, 0);
    if (state.accValue < RISK_ACCUMULATOR.warningThreshold) state.aboveWarning = false;
    if (state.accValue < RISK_ACCUMULATOR.degradedThreshold) state.aboveDegraded = false;

    // Circuit-breaker pause: agent is halted, nothing flows
    if (tMs < state.trippedUntilMs) return;

    // Pause expired: operator-approved requalification resets the score to
    // QUALIFICATION_PASS_SCORE (BASIS reactivation path). Without this the
    // agent would re-trip forever — below the degraded threshold gains are
    // frozen, so no organic path back above the CB floor exists.
    if (state.requalifyPending) {
      state.requalifyPending = false;
      const resetDelta = QUALIFICATION_PASS_SCORE + 30 - state.score;
      state.score = Math.max(0, Math.min(1000, state.score + resetDelta));
      state.timeline.push([tMs, state.score]);
      this.emit(state, {
        agentId: archetype.agentId,
        timestamp,
        busSignalType: SIG.TRUST_UPDATED,
        severity: SEV.MEDIUM,
        success: true,
        factorCode: 'CT-COMP',
        riskLevel: 'READ',
        delta: resetDelta,
        blocked: false,
        scoreAfter: state.score,
        tierAfter: tierIndexForScore(state.score),
        metadata: { requalified: true },
      });
      return;
    }

    // Dormancy: emit a stepped deduction when reactivating after silence
    if (b.activity === 0) {
      state.wasSilent = true;
      return;
    }
    if (state.wasSilent && !state.dormancyFired) {
      state.wasSilent = false;
      state.dormancyFired = true;
      const deduction = -0.06 * state.score;
      state.score = Math.max(0, state.score + deduction);
      state.timeline.push([tMs, state.score]);
      this.emit(state, {
        agentId: archetype.agentId,
        timestamp,
        busSignalType: SIG.DORMANCY_DEDUCTION,
        severity: SEV.MEDIUM,
        success: true,
        delta: deduction,
        blocked: false,
        scoreAfter: state.score,
        tierAfter: tierIndexForScore(state.score),
      });
      return;
    }

    if (rng() > b.activity) return;

    // ── Compose this tick's action ──
    const isCanary = state.emitted > 0 && state.emitted % archetype.canaryEvery === 0;
    state.emitted++;

    let factorCode: string;
    let riskLevel: RiskKey;
    let successRate = b.successRate;

    if (isCanary) {
      const category = CANARY_CATEGORIES[Math.floor(rng() * CANARY_CATEGORIES.length)];
      factorCode = CANARY_FACTOR_MAPPING[category];
      riskLevel = CANARY_RISK_MAPPING[category] as RiskKey;
    } else if (
      b.failingFactors &&
      b.failingPickRate !== undefined &&
      rng() < b.failingPickRate
    ) {
      factorCode = b.failingFactors[Math.floor(rng() * b.failingFactors.length)];
      riskLevel = pickWeighted(rng, b.riskWeights);
      successRate = b.failingSuccessRate ?? successRate;
    } else {
      factorCode = b.factorPool[Math.floor(rng() * b.factorPool.length)];
      riskLevel = pickWeighted(rng, b.riskWeights);
    }

    const success = rng() < successRate;
    const tierBefore = tierIndexForScore(state.score);
    const ceiling = OBSERVATION_TIERS[archetype.observationTier].ceiling;
    const multiplier = RISK_LEVELS[riskLevel].multiplier;

    // ── Circuit breaker trip: score already under the hard floor ──
    if (state.score < CIRCUIT_BREAKER.trippedThreshold) {
      state.cbTrips++;
      state.trippedUntilMs = tMs + TRIP_PAUSE_MS;
      state.requalifyPending = true;
      this.emit(state, {
        agentId: archetype.agentId,
        timestamp,
        busSignalType: SIG.CIRCUIT_BREAKER_TRIPPED,
        severity: SEV.CRITICAL,
        success: false,
        factorCode,
        riskLevel,
        delta: 0,
        blocked: true,
        blockReason: 'circuit_breaker',
        scoreAfter: state.score,
        tierAfter: tierBefore,
      });
      return;
    }

    // ── Degraded zone: gains frozen, occasional blocked writes ──
    const degraded = state.score < CIRCUIT_BREAKER.degradedThreshold;
    if (degraded && rng() < 0.15) {
      this.emit(state, {
        agentId: archetype.agentId,
        timestamp,
        severity: SEV.HIGH,
        success: false,
        factorCode,
        riskLevel,
        delta: 0,
        blocked: true,
        blockReason: 'degraded',
        scoreAfter: state.score,
        tierAfter: tierBefore,
      });
      return;
    }

    // ── Normal signal ──
    let delta: number;
    if (success) {
      delta = degraded ? 0 : gainDelta(state.score, ceiling, multiplier);
    } else {
      delta = lossDelta(tierBefore, ceiling, multiplier);
    }
    state.score = Math.max(0, Math.min(1000, state.score + delta));
    state.timeline.push([tMs, state.score]);

    let busSignalType: BusSignalType;
    let severity: BusSeverity;
    if (isCanary) {
      busSignalType = success ? SIG.CANARY_PASSED : SIG.CANARY_FAILED;
      severity = success ? SEV.LOW : SEV.HIGH;
    } else if (!success && b.driftRate !== undefined && rng() < b.driftRate) {
      busSignalType = rng() < 0.5 ? SIG.DRIFT : SIG.ANOMALY;
      severity = SEV.HIGH;
    } else {
      busSignalType = SIG.TRUST_UPDATED;
      severity = success
        ? SEV.LOW
        : multiplier >= RISK_LEVELS.CRITICAL.multiplier
          ? SEV.CRITICAL
          : multiplier >= RISK_LEVELS.MEDIUM.multiplier
            ? SEV.HIGH
            : SEV.MEDIUM;
    }

    this.emit(state, {
      agentId: archetype.agentId,
      timestamp,
      busSignalType,
      severity,
      success,
      factorCode,
      riskLevel,
      delta,
      blocked: false,
      scoreAfter: state.score,
      tierAfter: tierIndexForScore(state.score),
    });

    // ── Corrected risk accumulator (P(T) × R) + threshold-crossing signals ──
    if (!success) {
      state.accEvents.push({ tMs, contribution: penaltyRatio(tierBefore) * multiplier });
      state.accValue += penaltyRatio(tierBefore) * multiplier;

      if (
        state.accValue >= RISK_ACCUMULATOR.warningThreshold &&
        !state.aboveWarning
      ) {
        state.aboveWarning = true;
        this.emit(state, {
          agentId: archetype.agentId,
          timestamp,
          busSignalType: SIG.RISK_ACCUMULATOR_WARNING,
          severity: SEV.HIGH,
          success: true,
          delta: 0,
          blocked: false,
          scoreAfter: state.score,
          tierAfter: tierIndexForScore(state.score),
        });
      }
      if (
        state.accValue >= RISK_ACCUMULATOR.degradedThreshold &&
        !state.aboveDegraded
      ) {
        state.aboveDegraded = true;
        this.emit(state, {
          agentId: archetype.agentId,
          timestamp,
          busSignalType: SIG.RISK_ACCUMULATOR_DEGRADED,
          severity: SEV.CRITICAL,
          success: true,
          delta: 0,
          blocked: false,
          scoreAfter: state.score,
          tierAfter: tierIndexForScore(state.score),
        });
      }
    }
  }
}
