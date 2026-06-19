// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Proof-chain derivation — pure, deterministic, read-only.
 *
 * Groups one agent's raw IngestedSignal stream (as returned by the read-only
 * `getAgentSignals` accessor) into correlation traces and classifies every
 * signal into a propagation STAGE, so the UI can show how trust signals flow
 * into outcomes:
 *
 *   signal → canary result → risk-accumulator crossing → circuit-breaker decision
 *
 * Nothing here fabricates data. Stage, severity and outcome are read straight
 * off each real (synthetic) signal; ordering is by the signal's own timestamp.
 * The "Elbow" is detected, never invented — it is the observed inflection where
 * the continuous risk/trust curve bends into a discrete state change
 * (a degraded crossing or a circuit-breaker trip already present in the stream).
 */

import type { IngestedSignal } from '@vorionsys/rainbow';
import { SIG } from './bus-enums';

/** Propagation stages, in causal order (low index = earlier in the flow). */
export type ProofStage = 'signal' | 'canary' | 'risk' | 'breaker';

export const STAGE_ORDER: ProofStage[] = ['signal', 'canary', 'risk', 'breaker'];

export const STAGE_META: Record<
  ProofStage,
  { label: string; description: string }
> = {
  signal: {
    label: 'Signal',
    description: 'A raw trust-bus event — an action outcome or detection.',
  },
  canary: {
    label: 'Canary',
    description: 'An active probe result that tests the agent.',
  },
  risk: {
    label: 'Risk accumulator',
    description: 'A rolling-24h risk-accumulator threshold crossing.',
  },
  breaker: {
    label: 'Circuit breaker',
    description: 'A circuit-breaker decision freezing the agent.',
  },
};

/** Bus types that belong to the canary stage. */
const CANARY_TYPES: ReadonlySet<string> = new Set([
  SIG.CANARY_PASSED,
  SIG.CANARY_FAILED,
]);

/** Bus types that belong to the risk-accumulator stage. */
const RISK_TYPES: ReadonlySet<string> = new Set([
  SIG.RISK_ACCUMULATOR_WARNING,
  SIG.RISK_ACCUMULATOR_DEGRADED,
]);

/** Bus types that belong to the circuit-breaker stage. */
const BREAKER_TYPES: ReadonlySet<string> = new Set([SIG.CIRCUIT_BREAKER_TRIPPED]);

/** Classify one signal into its propagation stage. */
export function stageOf(signal: IngestedSignal): ProofStage {
  const t = signal.busSignalType;
  if (t && BREAKER_TYPES.has(t)) return 'breaker';
  if (t && RISK_TYPES.has(t)) return 'risk';
  if (t && CANARY_TYPES.has(t)) return 'canary';
  return 'signal';
}

export type Outcome = 'success' | 'failure' | 'blocked';

export function outcomeOf(signal: IngestedSignal): Outcome {
  if (signal.blocked) return 'blocked';
  return signal.success ? 'success' : 'failure';
}

/**
 * A signal is an "Elbow" — the observed inflection where the continuous curve
 * bends into a discrete state change — when it is a degraded risk crossing or a
 * circuit-breaker trip. This is read off the real stream, not synthesised.
 */
export function isElbow(signal: IngestedSignal): boolean {
  const t = signal.busSignalType;
  return (
    t === SIG.RISK_ACCUMULATOR_DEGRADED || t === SIG.CIRCUIT_BREAKER_TRIPPED
  );
}

export interface ChainNode {
  signal: IngestedSignal;
  stage: ProofStage;
  outcome: Outcome;
  /** True at an observed continuous→discrete inflection. */
  elbow: boolean;
}

export interface CorrelationTrace {
  /** correlationId, or null for the bucket of signals that carry none. */
  correlationId: string | null;
  /** Chain nodes ordered oldest → newest (the direction causation flows). */
  nodes: ChainNode[];
  /** Earliest / latest timestamps in the trace (ms). */
  startMs: number;
  endMs: number;
  /** Whether any node in the trace is an Elbow (reached a state change). */
  reachesElbow: boolean;
  /** The most advanced stage reached anywhere in the trace. */
  peakStage: ProofStage;
}

/** Summary counts across all traces, for the header strip. */
export interface ChainSummary {
  totalSignals: number;
  correlatedTraces: number;
  uncorrelatedSignals: number;
  elbowCount: number;
  byStage: Record<ProofStage, number>;
}

export interface ProofChain {
  traces: CorrelationTrace[];
  summary: ChainSummary;
}

const stageRank = (s: ProofStage): number => STAGE_ORDER.indexOf(s);

/**
 * Build the proof chain from a window's signals.
 *
 * @param signals  Real signals for one agent (any order; we sort internally).
 * @param order    'newest' (default) shows the most recent traces first;
 *                 'oldest' reverses. Within a trace, nodes are ALWAYS oldest →
 *                 newest so the arrows read in causal order regardless.
 */
export function buildProofChain(
  signals: IngestedSignal[],
  order: 'newest' | 'oldest' = 'newest'
): ProofChain {
  const byStage: Record<ProofStage, number> = {
    signal: 0,
    canary: 0,
    risk: 0,
    breaker: 0,
  };
  let elbowCount = 0;

  // Group by correlationId. Signals without one each form their own
  // single-node trace (honestly labelled as uncorrelated), so nothing is
  // dropped and we never invent a correlation that the data does not assert.
  const groups = new Map<string, IngestedSignal[]>();
  const loose: IngestedSignal[] = [];
  for (const s of signals) {
    if (s.correlationId) {
      const arr = groups.get(s.correlationId);
      if (arr) arr.push(s);
      else groups.set(s.correlationId, [s]);
    } else {
      loose.push(s);
    }
  }

  const toNode = (s: IngestedSignal): ChainNode => {
    const stage = stageOf(s);
    byStage[stage] += 1;
    const elbow = isElbow(s);
    if (elbow) elbowCount += 1;
    return { signal: s, stage, outcome: outcomeOf(s), elbow };
  };

  const traces: CorrelationTrace[] = [];

  for (const [correlationId, group] of groups) {
    const ordered = group
      .slice()
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const nodes = ordered.map(toNode);
    traces.push(makeTrace(correlationId, nodes));
  }

  for (const s of loose) {
    traces.push(makeTrace(null, [toNode(s)]));
  }

  // Order traces by their latest activity.
  traces.sort((a, b) =>
    order === 'oldest' ? a.endMs - b.endMs : b.endMs - a.endMs
  );

  return {
    traces,
    summary: {
      totalSignals: signals.length,
      correlatedTraces: groups.size,
      uncorrelatedSignals: loose.length,
      elbowCount,
      byStage,
    },
  };
}

function makeTrace(
  correlationId: string | null,
  nodes: ChainNode[]
): CorrelationTrace {
  let startMs = Infinity;
  let endMs = -Infinity;
  let reachesElbow = false;
  let peakStage: ProofStage = 'signal';
  for (const n of nodes) {
    const t = n.signal.timestamp.getTime();
    if (t < startMs) startMs = t;
    if (t > endMs) endMs = t;
    if (n.elbow) reachesElbow = true;
    if (stageRank(n.stage) > stageRank(peakStage)) peakStage = n.stage;
  }
  return { correlationId, nodes, startMs, endMs, reachesElbow, peakStage };
}
