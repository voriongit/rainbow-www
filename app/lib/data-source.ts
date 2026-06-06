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
  type WindowDuration,
  type AnalyticsWindowResult,
  type OrchestrationSnapshot,
  type NonBinaryStateSnapshot,
  type RiskTrend,
} from '@vorionsys/rainbow';
import { FleetSimulator, type SimAgentInfo } from './simulator';
import { computeCorrectedRiskTrend } from './corrected-risk-trend';

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
  const agentSignals = rainbow.collector.query(agentId, from, now);
  const correctedRisk = computeCorrectedRiskTrend(agentSignals);

  const fleet = rainbow.getOrchestrationSnapshot(
    { agentScores: sim.currentScores(), correlationAlerts: [], escalationEvents: [] },
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

  const fleetSignalCount = rainbow.collector.queryAll(from, now).length;

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
  const signals = agentId
    ? rainbow.collector.query(agentId, from, now)
    : rainbow.collector.queryAll(from, now);
  return computeCorrectedRiskTrend(signals);
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
