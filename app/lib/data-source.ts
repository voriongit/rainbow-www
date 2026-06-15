// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Server-side RAINBOW data source — strictly read-only toward the UI.
 *
 * One simulator + one Rainbow facade per server process, cached on
 * `globalThis` (survives dev HMR). Every accessor first extends the
 * simulated stream to "now", then reads through the Rainbow facade.
 * No accessor mutates trust data on behalf of a request.
 *
 * SEAM (#5 persistent store): to back this with Supabase instead of the
 * simulator, construct `Rainbow` with a persistent `WindowStore`
 * implementation and drop the simulator wiring — the accessors below only
 * depend on the facade surface.
 */

import 'server-only';

import {
  Rainbow,
  WINDOW_DURATION_MS,
  computeDelegationHealth,
  type WindowDuration,
  type AnalyticsWindowResult,
  type OrchestrationSnapshot,
  type NonBinaryStateSnapshot,
  type RiskTrend,
  type IngestedSignal,
  type RecordedInsight,
  type CorrelationAlertInput,
  type EscalationEvent,
  type DelegationHealthSummary,
} from '@vorionsys/rainbow';
import { FleetSimulator, type SimAgentInfo } from './simulator';
import {
  computeCorrectedRiskTrend,
  RISK_SEED_WINDOW_MS,
} from './corrected-risk-trend';

/** Demo seed — fixed so every cold start tells the same relative story */
const SEED = 20260606;
const HISTORY_DAYS = 30;
const DEFAULT_AGENT = 'cascade-03';

export type PresetDuration = Exclude<WindowDuration, 'custom'>;
export const PRESET_DURATIONS = Object.keys(WINDOW_DURATION_MS) as PresetDuration[];

export function isPresetDuration(value: unknown): value is PresetDuration {
  return typeof value === 'string' && value in WINDOW_DURATION_MS;
}

interface Source {
  sim: FleetSimulator;
  rainbow: Rainbow;
}

const globalCache = globalThis as unknown as { __rainbowDemoSource?: Source };

function getSource(): Source {
  if (!globalCache.__rainbowDemoSource) {
    let simRef: FleetSimulator | undefined;
    const rainbow = new Rainbow({
      // Exact initial scores from the simulator's own timeline
      resolveInitialScore: (agentId, at) => simRef?.resolveScoreAt(agentId, at) ?? 0,
    });
    simRef = new FleetSimulator({
      seed: SEED,
      historyDays: HISTORY_DAYS,
      now: new Date(),
      onSignal: (signal) => rainbow.collector.ingest(signal),
    });
    globalCache.__rainbowDemoSource = { sim: simRef, rainbow };
  }
  return globalCache.__rainbowDemoSource;
}

// ============================================================================
// Read-only accessors
// ============================================================================

export interface DashboardData {
  computedAt: Date;
  duration: PresetDuration;
  agentId: string;
  agentInfo: SimAgentInfo;
  agents: SimAgentInfo[];
  /** Windowed analytics for the selected agent */
  window: AnalyticsWindowResult;
  /** Corrected accumulator (P(T) × R) for the selected agent */
  correctedRisk: RiskTrend;
  /** Fleet-wide orchestration snapshot */
  fleet: OrchestrationSnapshot;
  /** Non-binary state snapshot (16-factor health) for the selected agent */
  state: NonBinaryStateSnapshot;
  /** Rule-based insights derived from the selected agent's window */
  insights: RecordedInsight[];
  /** Total signals across the fleet within the window */
  fleetSignalCount: number;
}

/** Everything the dashboard page needs, in one read pass. */
export function getDashboardData(durationRaw?: string, agentRaw?: string): DashboardData {
  const { sim, rainbow } = getSource();
  const now = new Date();
  sim.ensureUpTo(now);

  const agents = sim.agents();
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  const requested = agents.find((a) => a.agentId === agentRaw);
  const agentInfo =
    requested ?? agents.find((a) => a.agentId === DEFAULT_AGENT) ?? agents[0];
  const agentId = agentInfo.agentId;

  const from = new Date(now.getTime() - WINDOW_DURATION_MS[duration]);
  const window = rainbow.computeAnalyticsWindow({ duration, agentId }, now);
  // Seed the rolling-24h accumulator with pre-window failures so the left
  // edge of the chart reflects true accumulated pressure, not a cold start
  const seedFrom = new Date(from.getTime() - RISK_SEED_WINDOW_MS);
  const riskSignals = rainbow.collector.query(agentId, seedFrom, now);
  const correctedRisk = computeCorrectedRiskTrend(riskSignals, from.getTime());

  // Cross-agent correlations are HONESTLY DERIVED from real co-occurrence in
  // the (synthetic) signal stream — shared failing factors and shared
  // correlation ids across agents. Delegation/escalation is deliberately left
  // empty here; the simulator models trust dynamics, not agent-to-agent
  // delegation, so that lives only on the explicitly-modeled /lab route.
  const fleetWindowSignals = rainbow.collector.queryAll(from, now);
  const fleet = rainbow.getOrchestrationSnapshot(
    {
      agentScores: sim.currentScores(),
      correlationAlerts: deriveCorrelationAlerts(fleetWindowSignals),
      escalationEvents: [],
    },
    { duration },
    now
  );

  const state = rainbow.getStateSnapshot(
    agentId,
    {
      compositeScore: agentInfo.score,
      observationTier: agentInfo.observationTier,
      lifecycleState: agentInfo.lifecycleState,
    },
    { duration, agentId },
    now
  );

  const fleetSignalCount = fleetWindowSignals.length;

  // Rule-based insights derived from the selected agent's window analytics.
  const insights = rainbow.getInsights(window, now);

  return {
    computedAt: now,
    duration,
    agentId,
    agentInfo,
    agents,
    window,
    correctedRisk,
    fleet,
    state,
    insights,
    fleetSignalCount,
  };
}

/** Roster of simulated agents (read-only) */
export function getAgents(): SimAgentInfo[] {
  const { sim } = getSource();
  sim.ensureUpTo(new Date());
  return sim.agents();
}

/** Windowed analytics for one agent (or fleet-wide when agentId omitted) */
export function getWindowResult(
  durationRaw?: string,
  agentId?: string
): AnalyticsWindowResult {
  const { sim, rainbow } = getSource();
  const now = new Date();
  sim.ensureUpTo(now);
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  return rainbow.computeAnalyticsWindow({ duration, agentId }, now);
}

/** Corrected risk accumulator trend (P(T) × R) for one agent */
export function getAgentRiskTrend(durationRaw?: string, agentId?: string): RiskTrend {
  const { sim, rainbow } = getSource();
  const now = new Date();
  sim.ensureUpTo(now);
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  const from = new Date(now.getTime() - WINDOW_DURATION_MS[duration]);
  const seedFrom = new Date(from.getTime() - RISK_SEED_WINDOW_MS);
  const signals = agentId
    ? rainbow.collector.query(agentId, seedFrom, now)
    : rainbow.collector.queryAll(seedFrom, now);
  return computeCorrectedRiskTrend(signals, from.getTime());
}

/** Fleet-wide orchestration snapshot */
export function getFleetSnapshot(durationRaw?: string): OrchestrationSnapshot {
  const { sim, rainbow } = getSource();
  const now = new Date();
  sim.ensureUpTo(now);
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  return rainbow.getOrchestrationSnapshot(
    { agentScores: sim.currentScores(), correlationAlerts: [], escalationEvents: [] },
    { duration },
    now
  );
}

/**
 * Raw signal log for one agent within the window — the deepest real detail in
 * the system, newest first. Backs the drill-down "event log" tables. Optional
 * predicates filter to a factor, bus type, severity, risk level, or outcome.
 */
export function getAgentSignals(
  agentId: string,
  durationRaw?: string,
  filter?: {
    factorCode?: string;
    busSignalType?: string;
    severity?: string;
    riskLevel?: string;
    outcome?: 'success' | 'failure' | 'blocked';
  }
): IngestedSignal[] {
  const { sim, rainbow } = getSource();
  const now = new Date();
  sim.ensureUpTo(now);
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  const from = new Date(now.getTime() - WINDOW_DURATION_MS[duration]);
  let signals = rainbow.collector.query(agentId, from, now);
  if (filter) {
    signals = signals.filter((s) => {
      if (filter.factorCode && s.factorCode !== filter.factorCode) return false;
      if (filter.busSignalType && s.busSignalType !== filter.busSignalType) return false;
      if (filter.severity && s.severity !== filter.severity) return false;
      if (filter.riskLevel && s.riskLevel !== filter.riskLevel) return false;
      if (filter.outcome === 'blocked' && !s.blocked) return false;
      if (filter.outcome === 'success' && !(s.success && !s.blocked)) return false;
      if (filter.outcome === 'failure' && !(!s.success && !s.blocked)) return false;
      return true;
    });
  }
  return signals.slice().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/** Fleet-wide signal log within the window (newest first), with the same filters. */
export function getFleetSignals(
  durationRaw?: string,
  filter?: Parameters<typeof getAgentSignals>[2]
): IngestedSignal[] {
  const { sim, rainbow } = getSource();
  const now = new Date();
  sim.ensureUpTo(now);
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  const from = new Date(now.getTime() - WINDOW_DURATION_MS[duration]);
  let signals = rainbow.collector.queryAll(from, now);
  if (filter) {
    signals = signals.filter((s) => {
      if (filter.factorCode && s.factorCode !== filter.factorCode) return false;
      if (filter.busSignalType && s.busSignalType !== filter.busSignalType) return false;
      if (filter.severity && s.severity !== filter.severity) return false;
      if (filter.riskLevel && s.riskLevel !== filter.riskLevel) return false;
      if (filter.outcome === 'blocked' && !s.blocked) return false;
      if (filter.outcome === 'success' && !(s.success && !s.blocked)) return false;
      if (filter.outcome === 'failure' && !(!s.success && !s.blocked)) return false;
      return true;
    });
  }
  return signals.slice().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/** One agent's roster info (or undefined if unknown). */
export function getAgentInfo(agentId: string): SimAgentInfo | undefined {
  const { sim } = getSource();
  sim.ensureUpTo(new Date());
  return sim.agents().find((a) => a.agentId === agentId);
}

/** Agents currently resolving to a given tier key (T0–T7). */
export function getTierMembers(tierKey: string): SimAgentInfo[] {
  const { sim } = getSource();
  sim.ensureUpTo(new Date());
  return sim.agents().filter((a) => a.tier === tierKey);
}

export interface AgentSparkline {
  agentId: string;
  /** Downsampled score trajectory for an inline sparkline (≤ 24 points). */
  points: { t: number; v: number }[];
}

/** A compact score trajectory per agent, for fleet-roster sparklines. */
export function getFleetSparklines(durationRaw?: string): AgentSparkline[] {
  const { sim, rainbow } = getSource();
  const now = new Date();
  sim.ensureUpTo(now);
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  return sim.agents().map((a) => {
    const samples = rainbow.computeAnalyticsWindow({ duration, agentId: a.agentId }, now).trajectory
      .samples;
    const step = Math.max(1, Math.ceil(samples.length / 24));
    const points = samples
      .filter((_, i) => i % step === 0 || i === samples.length - 1)
      .map((p) => ({ t: p.timestamp.getTime(), v: p.score }));
    return { agentId: a.agentId, points };
  });
}

/** Rule-based insights derived from the FLEET-WIDE window (all agents). */
export function getFleetInsights(durationRaw?: string): RecordedInsight[] {
  const { sim, rainbow } = getSource();
  const now = new Date();
  sim.ensureUpTo(now);
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  const fleetWindow = rainbow.computeAnalyticsWindow({ duration }, now);
  return rainbow.getInsights(fleetWindow, now);
}

/** Deterministic FNV-1a hash for stable synthetic choices. */
function hash(str: string): number {
  let h = 2166136261;
  for (let k = 0; k < str.length; k++) {
    h ^= str.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * HONEST cross-agent correlation: alerts derived purely from real co-occurrence
 * in the (synthetic) signal stream — no fabricated data. Two patterns:
 *   • shared_factor_failure — ≥2 agents failing the same trust factor in-window
 *   • correlated_incident   — ≥2 agents sharing a correlation id
 */
function deriveCorrelationAlerts(signals: IngestedSignal[]): CorrelationAlertInput[] {
  const alerts: CorrelationAlertInput[] = [];

  const byFactor = new Map<string, { agents: Set<string>; latest: number; count: number }>();
  for (const s of signals) {
    if (s.success || s.blocked || !s.factorCode) continue;
    const e = byFactor.get(s.factorCode) ?? { agents: new Set<string>(), latest: 0, count: 0 };
    e.agents.add(s.agentId);
    e.latest = Math.max(e.latest, s.timestamp.getTime());
    e.count += 1;
    byFactor.set(s.factorCode, e);
  }
  for (const [factor, e] of byFactor) {
    if (e.agents.size < 2) continue;
    const agentIds = [...e.agents].sort();
    alerts.push({
      alertId: `cf-${factor}`,
      pattern: 'shared_factor_failure',
      agentIds,
      severity: agentIds.length >= 3 ? 'critical' : 'warning',
      description: `${agentIds.length} agents failing ${factor} (${e.count} failures in window)`,
      detectedAt: new Date(e.latest),
    });
  }

  const byCorr = new Map<
    string,
    { agents: Set<string>; latest: number; count: number; sev: 'warning' | 'critical' | 'emergency' }
  >();
  for (const s of signals) {
    if (!s.correlationId) continue;
    const e =
      byCorr.get(s.correlationId) ?? { agents: new Set<string>(), latest: 0, count: 0, sev: 'warning' as const };
    e.agents.add(s.agentId);
    e.latest = Math.max(e.latest, s.timestamp.getTime());
    e.count += 1;
    if (s.severity === 'critical' || s.severity === 'emergency') e.sev = s.severity;
    byCorr.set(s.correlationId, e);
  }
  for (const [corr, e] of byCorr) {
    if (e.agents.size < 2) continue;
    const agentIds = [...e.agents].sort();
    alerts.push({
      alertId: `ci-${corr}`,
      pattern: 'correlated_incident',
      agentIds,
      severity: e.sev,
      description: `${agentIds.length} agents in correlated incident "${corr}" (${e.count} signals)`,
      detectedAt: new Date(e.latest),
    });
  }

  return alerts.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
}

export interface DelegationModel {
  escalations: EscalationEvent[];
  summary: DelegationHealthSummary;
  handlers: string[];
}

/**
 * MODELED (illustrative) delegation — for the /lab route ONLY, never the main
 * dashboard. The simulator models trust dynamics, not agent-to-agent
 * delegation, so escalations are SYNTHESIZED from real stress signals
 * (circuit-breaker trips / risk-accumulator crossings): a struggling agent is
 * shown "escalating" to a high-trust handler. The routing is an illustrative
 * orchestration policy, not observed delegation. Agents failing the security
 * factors (CT-SEC/CT-ID) are routed entirely to one handler to demonstrate the
 * library's collusion-risk detection.
 */
export function getDelegationModel(durationRaw?: string): DelegationModel {
  const { sim, rainbow } = getSource();
  const now = new Date();
  sim.ensureUpTo(now);
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  const from = new Date(now.getTime() - WINDOW_DURATION_MS[duration]);
  const signals = rainbow.collector.queryAll(from, now);
  const agents = sim.agents();

  const handlers = agents
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((a) => a.agentId);
  const topHandler = handlers[0] ?? agents[0]?.agentId ?? 'atlas-01';

  const compromised = new Set<string>();
  for (const s of signals) {
    if (!s.success && !s.blocked && (s.factorCode === 'CT-SEC' || s.factorCode === 'CT-ID')) {
      compromised.add(s.agentId);
    }
  }

  const STRESS = new Set([
    'circuit_breaker_tripped',
    'risk_accumulator_degraded',
    'risk_accumulator_warning',
  ]);
  const escalations: EscalationEvent[] = [];
  let i = 0;
  for (const s of signals) {
    if (!s.busSignalType || !STRESS.has(s.busSignalType)) continue;
    const requestorId = s.agentId;
    let handlerId = compromised.has(requestorId)
      ? topHandler
      : handlers[(hash(requestorId) + i) % Math.max(1, handlers.length)] ?? topHandler;
    if (handlerId === requestorId) handlerId = topHandler === requestorId ? (handlers[1] ?? topHandler) : topHandler;
    escalations.push({
      requestorId,
      handlerId,
      success: s.busSignalType !== 'circuit_breaker_tripped',
      resolutionTimeMs: 60_000 + (hash(s.signalId) % 540_000),
      timestamp: s.timestamp,
    });
    i++;
  }

  return { escalations, summary: computeDelegationHealth(escalations), handlers };
}
