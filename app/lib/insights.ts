// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Scope-bound insight derivation.
 *
 * `@vorionsys/rainbow`'s `detectInsights` is a per-agent rule set. Run over a
 * pooled fleet window (agentId undefined) it produced sentences an operator
 * could not reconcile: the "fleet" trajectory accumulated every agent's deltas
 * onto the first signal's score, so "fell from X to Y" quoted endpoints that
 * belonged to no series on the page, and the accumulator summed every agent's
 * failures into one pooled number with no counterpart in BASIS. Per agent, the
 * library reads its own unseeded accumulator while the panel shows the seeded
 * one, so title, severity and direction could disagree with the chart beside it.
 *
 * The rules here keep the library's thresholds but bind every number to the
 * series the page actually draws:
 *
 *   - agent scope reads the agent's trajectory and the SAME corrected (seeded)
 *     accumulator the risk panel renders, so one status word, one peak;
 *   - fleet scope cites only fleet statistics (mean, median, agent counts) and
 *     per-agent results listed by name — never one agent's start/end score in
 *     a fleet sentence, and no pooled fleet accumulator (the accumulator is
 *     per-agent by spec).
 *
 * Scores render as integers and rates to one decimal; no float is ever
 * interpolated into prose.
 */

import {
  PENALTY_RATIO_MAX,
  PENALTY_RATIO_MIN,
  RISK_ACCUMULATOR,
  RISK_LEVELS,
} from '@vorionsys/basis-spec';
import type {
  AnalyticsWindowResult,
  AnomalyCluster,
  IngestedSignal,
  InsightSeverity,
  RecordedInsight,
  RiskTrend,
} from '@vorionsys/rainbow';
import { fmtNum, fmtSigned } from './format';
import { SIG } from './bus-enums';

export type InsightScope = 'fleet' | 'agent';

/** A failure that fed the accumulator, with its canonical P(T) × R weight. */
export interface ContributingSignal {
  signalId: string;
  agentId: string;
  at: Date;
  factorCode?: string;
  riskLevel?: string;
  busSignalType?: string;
  contribution: number;
}

/** Per-agent row a fleet insight lists by name. */
export interface FleetInsightRow {
  agentId: string;
  /** Pre-formatted value, e.g. "peak 269 · de-escalating". */
  detail: string;
}

/** Typed view of the metadata this module attaches. */
export interface InsightMeta {
  scope: InsightScope;
  contributing?: ContributingSignal[];
  rows?: FleetInsightRow[];
  clusterId?: string;
  commonFactors?: string[];
}

export function insightMeta(insight: RecordedInsight): InsightMeta | undefined {
  const m = insight.metadata as Partial<InsightMeta> | undefined;
  return m?.scope ? (m as InsightMeta) : undefined;
}

/** Library thresholds, kept so findings fire exactly when they used to. */
const DECLINE_VELOCITY = -2;
const FACTOR_FAIL_RATE = 0.5;
const FACTOR_MIN_SIGNALS = 3;

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
  emergency: 3,
};

function maxSeverity(list: InsightSeverity[]): InsightSeverity {
  return list.reduce<InsightSeverity>(
    (acc, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[acc] ? s : acc),
    'info'
  );
}

function declineSeverity(velocity: number): InsightSeverity {
  return velocity < -10 ? 'critical' : velocity < -5 ? 'warning' : 'info';
}

function peakSeverity(peak: number): InsightSeverity {
  return peak >= RISK_ACCUMULATOR.cbThreshold
    ? 'emergency'
    : peak >= RISK_ACCUMULATOR.degradedThreshold
      ? 'critical'
      : 'warning';
}

/**
 * Severity follows the pressure that still applies: the peak while the
 * accumulator is escalating or flat, the current value once it is
 * de-escalating (a cleared peak should not keep reading EMERGENCY).
 * Never below warning — the finding only exists because warning was crossed.
 */
function accumulatorSeverity(risk: RiskTrend): InsightSeverity {
  return peakSeverity(
    risk.trend === 'de-escalating' ? risk.currentAccumulatorValue : risk.peakInWindow
  );
}

function severityBasis(risk: RiskTrend): string {
  return risk.trend === 'de-escalating'
    ? 'Severity reflects the current value because pressure is falling.'
    : 'Severity reflects the peak.';
}

function cbSeverity(trips: number): InsightSeverity {
  return trips >= 3 ? 'emergency' : trips >= 2 ? 'critical' : 'warning';
}

/** Rate, one decimal, always "pts/h". */
function rate(v: number): string {
  return `${fmtSigned(v, 1)} pts/h`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Stable id so a card keeps its identity across re-renders of the same view. */
function makeInsight(
  scope: InsightScope,
  key: string,
  params: Omit<RecordedInsight, 'insightId' | 'evidenceChain' | 'metadata'> & {
    metadata?: Omit<InsightMeta, 'scope'>;
  }
): RecordedInsight {
  const { metadata, ...rest } = params;
  return {
    insightId: `${scope}:${params.category}:${key}`,
    evidenceChain: [],
    ...rest,
    metadata: { scope, ...metadata },
  };
}

function failingFactors(
  byFactor: AnalyticsWindowResult['distribution']['byFactor']
): Array<{ code: string; failure: number; total: number }> {
  return Object.entries(byFactor)
    .map(([code, s]) => ({ code, failure: s.failure, total: s.success + s.failure }))
    .filter((f) => f.total >= FACTOR_MIN_SIGNALS && f.failure / f.total >= FACTOR_FAIL_RATE)
    .sort((a, b) => b.failure / b.total - a.failure / a.total);
}

function dormancyCount(result: AnalyticsWindowResult): number {
  return result.distribution.byType[SIG.DORMANCY_DEDUCTION] ?? 0;
}

function isPromotionCandidate(result: AnalyticsWindowResult): boolean {
  return (
    result.trajectory.trend === 'rising' &&
    result.distribution.byOutcome.failure === 0 &&
    result.distribution.total >= 10 &&
    result.transitions.tierPromotions === 0
  );
}

// ---------------------------------------------------------------------------
// Accumulator evidence
// ---------------------------------------------------------------------------

/** Canonical per-failure contribution, P(T) × R — same as computeRiskTrend. */
export function riskContribution(signal: IngestedSignal): number | undefined {
  if (signal.success || signal.blocked || !signal.riskLevel) return undefined;
  const entry = (RISK_LEVELS as Record<string, { multiplier: number } | undefined>)[signal.riskLevel];
  const tierAfter = signal.tierAfter;
  if (!entry || tierAfter === undefined || !Number.isFinite(tierAfter)) return undefined;
  const tier = Math.trunc(tierAfter);
  if (tier < 0 || tier > 7) return undefined;
  return (PENALTY_RATIO_MIN + (tier / 7) * (PENALTY_RATIO_MAX - PENALTY_RATIO_MIN)) * entry.multiplier;
}

/**
 * The failures inside the rolling 24h window that ends at the accumulator's
 * in-window peak — i.e. exactly the signals whose P(T) × R sum IS the peak.
 * Largest contributors first.
 */
export function peakContributors(
  risk: RiskTrend,
  seededSignals: IngestedSignal[],
  limit = 8
): { peakAt?: Date; signals: ContributingSignal[]; total: number } {
  if (risk.samples.length === 0 || risk.peakInWindow <= 0) return { signals: [], total: 0 };
  const peak = risk.samples.reduce((best, s) => (s.value > best.value ? s : best));
  const end = peak.timestamp.getTime();
  const start = end - RISK_ACCUMULATOR.windowHours * 3_600_000;
  const all: ContributingSignal[] = [];
  for (const s of seededSignals) {
    const t = s.timestamp.getTime();
    if (t <= start || t > end) continue;
    const contribution = riskContribution(s);
    if (contribution === undefined) continue;
    all.push({
      signalId: s.signalId,
      agentId: s.agentId,
      at: s.timestamp,
      factorCode: s.factorCode,
      riskLevel: s.riskLevel,
      busSignalType: s.busSignalType,
      contribution,
    });
  }
  all.sort((a, b) => b.contribution - a.contribution || b.at.getTime() - a.at.getTime());
  return { peakAt: peak.timestamp, signals: all.slice(0, limit), total: all.length };
}

/** "escalating" / "flat" / "de-escalating" — one word, same slope as the chart badge. */
export function accumulatorWord(trend: RiskTrend['trend']): string {
  return trend === 'stable' ? 'flat' : trend;
}

// ---------------------------------------------------------------------------
// Agent scope
// ---------------------------------------------------------------------------

export interface AgentInsightInput {
  agentId: string;
  window: AnalyticsWindowResult;
  /** Score at the window's left edge (the trajectory panel's starting point). */
  startScore: number;
  /** The seeded accumulator the risk panel renders — not the library's own. */
  risk: RiskTrend;
  /** Signals the seeded accumulator was computed from (seed span + window). */
  riskSignals: IngestedSignal[];
  now: Date;
}

export function deriveAgentInsights(input: AgentInsightInput): RecordedInsight[] {
  const { agentId, window: w, startScore, risk, riskSignals, now } = input;
  const { duration } = w.windowConfig;
  const traj = w.trajectory;
  const base = { agentIds: [agentId], windowConfig: w.windowConfig, detectedAt: now };
  const out: RecordedInsight[] = [];

  if (traj.trend === 'falling' && traj.velocity < DECLINE_VELOCITY) {
    out.push(
      makeInsight('agent', agentId, {
        ...base,
        category: 'TREND_DETECTED',
        severity: declineSeverity(traj.velocity),
        title: `${agentId} trust falling at ${rate(traj.velocity)}`,
        description: `Score ${fmtNum(startScore)} at the start of the ${duration} window, ${fmtNum(traj.current)} now (range ${fmtNum(traj.min)}–${fmtNum(traj.max)}). Regression slope ${rate(traj.velocity)}, the same line the trajectory chart draws.`,
      })
    );
  }

  if (w.transitions.cbTrips > 0) {
    out.push(
      makeInsight('agent', agentId, {
        ...base,
        category: 'CB_PATTERN',
        severity: cbSeverity(w.transitions.cbTrips),
        title: `${plural(w.transitions.cbTrips, 'circuit-breaker trip')} in ${duration}`,
        description: `${agentId}: ${plural(w.transitions.cbTrips, 'trip')}, ${plural(w.transitions.cbResets, 'reset')}, ${plural(w.transitions.cbDegradedEntries, 'degraded entry', 'degraded entries')} in the ${duration} window.`,
      })
    );
  }

  if (risk.peakInWindow >= RISK_ACCUMULATOR.warningThreshold) {
    const word = accumulatorWord(risk.trend);
    const evidence = peakContributors(risk, riskSignals);
    out.push(
      makeInsight('agent', agentId, {
        ...base,
        category: 'ACCUMULATOR_ESCALATION',
        severity: accumulatorSeverity(risk),
        title: `Risk accumulator ${word} — peak ${fmtNum(risk.peakInWindow)}, now ${fmtNum(risk.currentAccumulatorValue)}`,
        description: `Rolling ${RISK_ACCUMULATOR.windowHours}h accumulator for ${agentId} over the ${duration} window: peak ${fmtNum(risk.peakInWindow)}, current ${fmtNum(risk.currentAccumulatorValue)}, ${word} (thresholds: warning ${RISK_ACCUMULATOR.warningThreshold}, degraded ${RISK_ACCUMULATOR.degradedThreshold}, circuit breaker ${RISK_ACCUMULATOR.cbThreshold}). Crossings into warning: ${risk.warningBreaches}; into degraded: ${risk.degradedBreaches}. ${plural(evidence.total, 'failure')} make up the peak. ${severityBasis(risk)}`,
        metadata: { contributing: evidence.signals },
      })
    );
  }

  const failing = failingFactors(w.distribution.byFactor);
  if (failing.length > 0) {
    out.push(
      makeInsight('agent', agentId, {
        ...base,
        category: 'FACTOR_DEGRADATION',
        severity: failing.length >= 3 ? 'critical' : 'warning',
        title: `${plural(failing.length, 'factor')} failing ≥50%: ${failing.map((f) => f.code).join(', ')}`,
        description: `${agentId} in the ${duration} window: ${failing.map((f) => `${f.code} ${f.failure}/${f.total} failed`).join('; ')}. ${plural(w.distribution.total, 'signal')} total.`,
      })
    );
  }

  if (isPromotionCandidate(w)) {
    out.push(
      makeInsight('agent', agentId, {
        ...base,
        category: 'PROMOTION_CANDIDATE',
        severity: 'info',
        title: `${agentId} is a promotion candidate`,
        description: `${plural(w.distribution.total, 'signal')} with no failures and a rising trajectory (${rate(traj.velocity)}). Current score ${fmtNum(traj.current)}.`,
      })
    );
  }

  const dormancy = dormancyCount(w);
  if (dormancy > 0) {
    out.push(
      makeInsight('agent', agentId, {
        ...base,
        category: 'DORMANCY_WARNING',
        severity: dormancy >= 3 ? 'warning' : 'info',
        title: `${plural(dormancy, 'dormancy deduction')} in ${duration}`,
        description: `Dormancy milestones triggered ${plural(dormancy, 'stepped deduction')} for ${agentId} in the ${duration} window. The agent may be inactive or under-utilized.`,
      })
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// Fleet scope
// ---------------------------------------------------------------------------

export interface FleetAgentInput {
  agentId: string;
  window: AnalyticsWindowResult;
  startScore: number;
  risk: RiskTrend;
}

export interface FleetInsightInput {
  agents: FleetAgentInput[];
  /** Pooled fleet window — used ONLY for pooled counts (signal distribution). */
  fleetWindow: AnalyticsWindowResult;
  fleetMean: { start: number; end: number };
  fleetMedian: number;
  anomalyClusters: AnomalyCluster[];
  now: Date;
}

export function deriveFleetInsights(input: FleetInsightInput): RecordedInsight[] {
  const { agents, fleetWindow, fleetMean, fleetMedian, anomalyClusters, now } = input;
  const windowConfig = { duration: fleetWindow.windowConfig.duration };
  const { duration } = windowConfig;
  const n = agents.length;
  const base = { windowConfig, detectedAt: now };
  const out: RecordedInsight[] = [];

  // 1. Anomaly clusters — the grounded cross-agent finding.
  for (const c of anomalyClusters) {
    out.push(
      makeInsight('fleet', c.clusterId, {
        ...base,
        category: 'FLEET_ANOMALY',
        severity: c.severity,
        agentIds: c.agentIds,
        title: `Anomaly cluster: ${c.agentIds.length} agents failing ${c.commonFactors.join(' + ')}`,
        description: `${c.agentIds.join(', ')} share failing ${c.commonFactors.join(' and ')} in the ${duration} window. One cluster = one group of agents sharing the same failing factors.`,
        metadata: { clusterId: c.clusterId, commonFactors: c.commonFactors },
      })
    );
  }

  // 2. Declining agents — fleet sentence carries fleet numbers; agents by name.
  const declining = agents
    .filter((a) => a.window.trajectory.trend === 'falling' && a.window.trajectory.velocity < DECLINE_VELOCITY)
    .sort((a, b) => a.window.trajectory.velocity - b.window.trajectory.velocity);
  if (declining.length > 0) {
    out.push(
      makeInsight('fleet', 'declining', {
        ...base,
        category: 'TREND_DETECTED',
        severity: maxSeverity(declining.map((a) => declineSeverity(a.window.trajectory.velocity))),
        agentIds: declining.map((a) => a.agentId),
        title: `${declining.length} of ${n} agents falling faster than ${Math.abs(DECLINE_VELOCITY)} pts/h`,
        description: `Fleet mean ${fmtNum(fleetMean.start)} at the start of the ${duration} window, ${fmtNum(fleetMean.end)} now (median ${fmtNum(fleetMedian)}, ${n} agents). Falling: ${declining.map((a) => `${a.agentId} ${rate(a.window.trajectory.velocity)}`).join(', ')}.`,
        metadata: {
          rows: declining.map((a) => ({
            agentId: a.agentId,
            detail: `${fmtNum(a.startScore)} → ${fmtNum(a.window.trajectory.current)} · ${rate(a.window.trajectory.velocity)}`,
          })),
        },
      })
    );
  }

  // 3. Accumulator — per-agent by spec; list who crossed, never pool.
  const hot = agents
    .filter((a) => a.risk.peakInWindow >= RISK_ACCUMULATOR.warningThreshold)
    .sort((a, b) => b.risk.peakInWindow - a.risk.peakInWindow);
  if (hot.length > 0) {
    const top = hot[0];
    out.push(
      makeInsight('fleet', 'accumulator', {
        ...base,
        category: 'ACCUMULATOR_ESCALATION',
        severity: maxSeverity(hot.map((a) => accumulatorSeverity(a.risk))),
        agentIds: hot.map((a) => a.agentId),
        title: `${hot.length} of ${n} agents crossed the risk warning threshold (${RISK_ACCUMULATOR.warningThreshold})`,
        description: `The accumulator is per agent; there is no pooled fleet value. Highest: ${top.agentId}, peak ${fmtNum(top.risk.peakInWindow)}, now ${fmtNum(top.risk.currentAccumulatorValue)}, ${accumulatorWord(top.risk.trend)}. Thresholds: warning ${RISK_ACCUMULATOR.warningThreshold}, degraded ${RISK_ACCUMULATOR.degradedThreshold}, circuit breaker ${RISK_ACCUMULATOR.cbThreshold}. Severity is the highest of the agents' own accumulator severities.`,
        metadata: {
          rows: hot.map((a) => ({
            agentId: a.agentId,
            detail: `peak ${fmtNum(a.risk.peakInWindow)} · now ${fmtNum(a.risk.currentAccumulatorValue)} · ${accumulatorWord(a.risk.trend)} · ${a.risk.warningBreaches} warning / ${a.risk.degradedBreaches} degraded crossings`,
          })),
        },
      })
    );
  }

  // 4. Circuit breakers — per-agent trips, summed and listed.
  const tripped = agents.filter((a) => a.window.transitions.cbTrips > 0);
  if (tripped.length > 0) {
    const total = tripped.reduce((s, a) => s + a.window.transitions.cbTrips, 0);
    out.push(
      makeInsight('fleet', 'cb', {
        ...base,
        category: 'CB_PATTERN',
        severity: maxSeverity(tripped.map((a) => cbSeverity(a.window.transitions.cbTrips))),
        agentIds: tripped.map((a) => a.agentId),
        title: `${plural(total, 'circuit-breaker trip')} across ${plural(tripped.length, 'agent')} in ${duration}`,
        description: `${tripped.map((a) => `${a.agentId}: ${plural(a.window.transitions.cbTrips, 'trip')}`).join('; ')}.`,
      })
    );
  }

  // 5. Factor degradation — pooled counts are a legitimate fleet statistic.
  const failing = failingFactors(fleetWindow.distribution.byFactor);
  if (failing.length > 0) {
    out.push(
      makeInsight('fleet', 'factors', {
        ...base,
        category: 'FACTOR_DEGRADATION',
        severity: failing.length >= 3 ? 'critical' : 'warning',
        agentIds: [],
        title: `${plural(failing.length, 'factor')} failing ≥50% fleet-wide: ${failing.map((f) => f.code).join(', ')}`,
        description: `Pooled across ${n} agents in the ${duration} window: ${failing.map((f) => `${f.code} ${f.failure}/${f.total} failed`).join('; ')}.`,
      })
    );
  }

  // 6. Promotion candidates.
  const promo = agents.filter((a) => isPromotionCandidate(a.window));
  if (promo.length > 0) {
    out.push(
      makeInsight('fleet', 'promotion', {
        ...base,
        category: 'PROMOTION_CANDIDATE',
        severity: 'info',
        agentIds: promo.map((a) => a.agentId),
        title: `${plural(promo.length, 'promotion candidate')}`,
        description: `Rising with no failures in the ${duration} window: ${promo.map((a) => `${a.agentId} (${fmtNum(a.window.trajectory.current)})`).join(', ')}.`,
      })
    );
  }

  // 7. Dormancy.
  const dormant = agents.filter((a) => dormancyCount(a.window) > 0);
  if (dormant.length > 0) {
    out.push(
      makeInsight('fleet', 'dormancy', {
        ...base,
        category: 'DORMANCY_WARNING',
        severity: dormant.some((a) => dormancyCount(a.window) >= 3) ? 'warning' : 'info',
        agentIds: dormant.map((a) => a.agentId),
        title: `${plural(dormant.length, 'agent')} with dormancy deductions in ${duration}`,
        description: `${dormant.map((a) => `${a.agentId}: ${dormancyCount(a.window)}`).join('; ')}.`,
      })
    );
  }

  return out;
}

/**
 * Most important first: severity, then category order. Sorting by detectedAt
 * (as before) was meaningless — every finding shares the request's `now`.
 */
const CATEGORY_ORDER = [
  'FLEET_ANOMALY',
  'ACCUMULATOR_ESCALATION',
  'CB_PATTERN',
  'TREND_DETECTED',
  'FACTOR_DEGRADATION',
  'DORMANCY_WARNING',
  'PROMOTION_CANDIDATE',
  'DELEGATION_RISK',
];

export function sortInsights(list: RecordedInsight[]): RecordedInsight[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
    );
}
