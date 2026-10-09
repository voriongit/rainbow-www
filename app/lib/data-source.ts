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
 * SEAM (#5 persistent store): a configured Supabase store that actually
 * holds signals flips the read path to live. Signals are replayed into a
 * fresh Rainbow (collector + in-memory store) so risk/log/correlation
 * queries — which read the collector — see the same rows as window
 * analytics. The persistent store is NOT passed into Rainbow: ingest always
 * store.puts, and sharing the instance would duplicate rows on replay.
 */

import 'server-only';

import { cache } from 'react';
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
  LiveFleetSource,
  SimulatedFleetSource,
  type FleetSource,
  type SourceMode,
} from './fleet-source';
import { SupabaseWindowStore } from './supabase-window-store';
import {
  computeCorrectedRiskTrend,
  RISK_SEED_WINDOW_MS,
} from './corrected-risk-trend';
import { CrossAgentCorrelator } from './cross-agent-correlator';
import { DelegationService, type DelegationPolicy } from './delegation-service';
import { replayStoreIntoRainbow } from './replay';
import {
  deriveAgentInsights,
  deriveFleetInsights,
  peakContributors,
  sortInsights,
  type ContributingSignal,
  type FleetAgentInput,
} from './insights';

/** Demo seed — fixed so every cold start tells the same relative story */
const SEED = 20260606;
const HISTORY_DAYS = 30;
const DEFAULT_AGENT = 'cascade-03';

export type PresetDuration = Exclude<WindowDuration, 'custom'>;
export const PRESET_DURATIONS = Object.keys(WINDOW_DURATION_MS) as PresetDuration[];

export function isPresetDuration(value: unknown): value is PresetDuration {
  return typeof value === 'string' && value in WINDOW_DURATION_MS;
}

interface ReadSource {
  source: FleetSource;
  rainbow: Rainbow;
}

/** What the site is actually serving right now, derived — never hardcoded. */
export interface Provenance {
  mode: SourceMode;
  /** Signals currently loaded. */
  signalCount: number;
  agentCount: number;
  /** Why this mode was chosen, in words fit to show a reader. */
  reason: string;
}

const globalCache = globalThis as unknown as {
  __rainbowSource?: ReadSource;
  __rainbowStore?: SupabaseWindowStore;
  __rainbowHydration?: Promise<number>;
};

/**
 * The persistent store, when one is configured. Returns undefined otherwise —
 * a missing store is a normal deployment state, not an error.
 */
function getStore(): SupabaseWindowStore | undefined {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return undefined;
  globalCache.__rainbowStore ??= new SupabaseWindowStore({ url, serviceKey });
  return globalCache.__rainbowStore;
}

/** The store, for the ingest route. Undefined when none is configured. */
export function getIngestStore(): SupabaseWindowStore | undefined {
  return getStore();
}

/**
 * Drop the cached read source so the next read re-derives its mode.
 *
 * Called after ingest: the very first real signal has to be able to flip the
 * site from simulated to live within the same process, rather than waiting for
 * a cold start.
 */
export function invalidateSource(): void {
  globalCache.__rainbowSource = undefined;
}

/**
 * Load persisted signals into the store's mirror, once per process.
 *
 * Async because the read path is synchronous by interface (WindowStore), so
 * hydration has to happen at an explicit boundary. Async entry points (the
 * API routes) await this so their first response is already live; a failure
 * is logged and reported as zero signals, which degrades to the simulator
 * with a stated reason rather than serving a silently empty fleet.
 */
export function ensureHydrated(): Promise<number> {
  const store = getStore();
  if (!store) return Promise.resolve(0);
  if (!globalCache.__rainbowHydration) {
    globalCache.__rainbowHydration = store
      .hydrate()
      .then((n) => {
        // Drop any source built against an empty mirror before hydrate finished.
        invalidateSource();
        return n;
      })
      .catch((err) => {
        console.error('[rainbow] hydrate failed - falling back to the simulator:', err);
        globalCache.__rainbowHydration = undefined;
        return 0;
      });
  }
  return globalCache.__rainbowHydration;
}

/**
 * Live only when a store is configured AND it actually holds signals.
 *
 * A configured-but-empty store reports as simulated with a reason rather than
 * as an empty real fleet: an empty dashboard reads as "the fleet is healthy"
 * when the truth is "nothing has reported yet".
 */
function computeProvenance(): Provenance {
  const store = getStore();
  if (!store) {
    return {
      mode: 'simulated',
      signalCount: 0,
      agentCount: 0,
      reason: 'No signal store configured - showing the seeded demo fleet.',
    };
  }
  const agentCount = store.agentIds().length;
  const signalCount = store.size;
  if (signalCount === 0) {
    return {
      mode: 'simulated',
      signalCount: 0,
      agentCount: 0,
      reason: 'Signal store configured but empty - no agent has reported yet.',
    };
  }
  return {
    mode: 'live',
    signalCount,
    agentCount,
    reason: `Live telemetry from ${agentCount} reporting agent${agentCount === 1 ? '' : 's'}.`,
  };
}

/**
 * Provenance for the current request.
 *
 * Memoized per render: it is read by the page, by every API route, and by
 * getSource() itself, and recomputing it each time would re-walk the store.
 * Callers must await ensureHydrated() first so a configured store is loaded.
 */
export const getProvenance = cache(computeProvenance);

function getSource(): ReadSource {
  const provenance = getProvenance();
  const cached = globalCache.__rainbowSource;
  if (cached && cached.source.mode === provenance.mode) return cached;

  if (provenance.mode === 'live') {
    const store = getStore()!;
    const live = new LiveFleetSource(store);
    // Fresh Rainbow (its own MemoryWindowStore). Passing `store` here and then
    // ingesting would store.put each row again and enqueue a duplicate flush.
    const rainbow = new Rainbow({
      resolveInitialScore: (agentId, at) => live.resolveScoreAt(agentId, at),
    });
    replayStoreIntoRainbow(store, rainbow);
    globalCache.__rainbowSource = { source: live, rainbow };
    return globalCache.__rainbowSource;
  }

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
  globalCache.__rainbowSource = { source: new SimulatedFleetSource(simRef), rainbow };
  return globalCache.__rainbowSource;
}

// ----------------------------------------------------------------------------
// Per-request memoization (React `cache()` — dedupes within one render pass).
//
// Every accessor used to call `new Date()` + `sim.ensureUpTo(now)` + (often)
// `computeAnalyticsWindow` independently, so a single dashboard render advanced
// the simulator ~5× and recomputed the selected agent's window twice plus one
// window PER agent for sparklines (14×). The per-call `new Date()` also meant no
// two accessors could share work. These three caches fix that: one frozen `now`,
// one `ensureUpTo`, and one window per (duration, agentId) per request — a real
// mobile cold-nav win, with the bonus that all accessors now see a consistent
// `now` (a latent correctness fix). The `globalThis` simulator cache is
// orthogonal and unchanged.
// ----------------------------------------------------------------------------

/** One frozen "now" per request render. */
const getNow = cache((): Date => new Date());

/** The source with the simulated stream advanced to `now` — once per request. */
const getReadySource = cache((): ReadSource => {
  const src = getSource();
  src.source.ensureUpTo(getNow());
  return src;
});

/** Windowed analytics per (duration, agentId) — memoized within a request.
 *  Always call with both args (cache keys are positional). */
const computeWindow = cache(
  (duration: PresetDuration, agentId: string | undefined): AnalyticsWindowResult =>
    getReadySource().rainbow.computeAnalyticsWindow({ duration, agentId }, getNow())
);

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
  /** Selected agent's score at the window's left edge */
  startScore: number;
  /** Corrected accumulator (P(T) × R) for the selected agent */
  correctedRisk: RiskTrend;
  /** Fleet-wide orchestration snapshot */
  fleet: OrchestrationSnapshot;
  /** Non-binary state snapshot (16-factor health) for the selected agent */
  state: NonBinaryStateSnapshot;
  /** Rule-based insights bound to the selected agent's displayed series */
  insights: RecordedInsight[];
  /** Total signals across the fleet within the window */
  fleetSignalCount: number;
}

/** Everything the dashboard page needs, in one read pass. */
export function getDashboardData(durationRaw?: string, agentRaw?: string): DashboardData {
  const { source: fleetSource, rainbow } = getReadySource();
  const now = getNow();

  const agents = fleetSource.agents();
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  const requested = agents.find((a) => a.agentId === agentRaw);
  const agentInfo =
    requested ?? agents.find((a) => a.agentId === DEFAULT_AGENT) ?? agents[0];
  const agentId = agentInfo.agentId;

  const from = new Date(now.getTime() - WINDOW_DURATION_MS[duration]);
  const window = computeWindow(duration, agentId);
  // Seed the rolling-24h accumulator with pre-window failures so the left
  // edge of the chart reflects true accumulated pressure, not a cold start
  const seedFrom = new Date(from.getTime() - RISK_SEED_WINDOW_MS);
  const riskSignals = rainbow.collector.query(agentId, seedFrom, now);
  const correctedRisk = computeAgentRisk(duration, agentId);

  // Cross-agent correlations are HONESTLY DERIVED from real co-occurrence in
  // the (synthetic) signal stream — shared failing factors and shared
  // correlation ids across agents. Delegation/escalation is deliberately left
  // empty here; the simulator has no native agent-to-agent delegation, so it
  // lives only on the /lab route, which derives it under a declared
  // orchestration policy (one model the assumption-free main dashboard avoids).
  const fleetWindowSignals = rainbow.collector.queryAll(from, now);
  const fleet = computeFleetSnapshot(duration);

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

  // Rule-based insights bound to the series this view draws: the agent's
  // trajectory and the SAME seeded accumulator the risk panel renders.
  const startScore = fleetSource.resolveScoreAt(agentId, from);
  const insights = sortInsights(
    deriveAgentInsights({
      agentId,
      window,
      startScore,
      risk: correctedRisk,
      riskSignals,
      now,
    })
  );

  return {
    computedAt: now,
    duration,
    agentId,
    agentInfo,
    agents,
    window,
    startScore,
    correctedRisk,
    fleet,
    state,
    insights,
    fleetSignalCount,
  };
}

/** Roster of simulated agents (read-only) */
export function getAgents(): SimAgentInfo[] {
  return getReadySource().source.agents();
}

/** Windowed analytics for one agent (or fleet-wide when agentId omitted) */
export function getWindowResult(
  durationRaw?: string,
  agentId?: string
): AnalyticsWindowResult {
  getReadySource();
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  return computeWindow(duration, agentId);
}

/** Corrected risk accumulator trend (P(T) × R) for one agent */
export function getAgentRiskTrend(durationRaw?: string, agentId?: string): RiskTrend {
  const { rainbow } = getReadySource();
  const now = getNow();
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  const from = new Date(now.getTime() - WINDOW_DURATION_MS[duration]);
  const seedFrom = new Date(from.getTime() - RISK_SEED_WINDOW_MS);
  const signals = agentId
    ? rainbow.collector.query(agentId, seedFrom, now)
    : rainbow.collector.queryAll(seedFrom, now);
  return computeCorrectedRiskTrend(signals, from.getTime());
}

/** Fleet snapshot per duration — memoized within a request. */
const computeFleetSnapshot = cache((duration: PresetDuration): OrchestrationSnapshot => {
  const { source: fleetSource, rainbow } = getReadySource();
  const now = getNow();
  const from = new Date(now.getTime() - WINDOW_DURATION_MS[duration]);
  const signals = rainbow.collector.queryAll(from, now);
  return rainbow.getOrchestrationSnapshot(
    {
      agentScores: fleetSource.currentScores(),
      correlationAlerts: deriveCorrelationAlerts(signals),
      escalationEvents: [],
    },
    { duration },
    now
  );
});

/** Fleet-wide orchestration snapshot */
export function getFleetSnapshot(durationRaw?: string): OrchestrationSnapshot {
  return computeFleetSnapshot(isPresetDuration(durationRaw) ? durationRaw : '24h');
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
  const { rainbow } = getReadySource();
  const now = getNow();
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
  const { rainbow } = getReadySource();
  const now = getNow();
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
  return getReadySource().source.agents().find((a) => a.agentId === agentId);
}

/** Agents currently resolving to a given tier key (T0–T7). */
export function getTierMembers(tierKey: string): SimAgentInfo[] {
  return getReadySource().source.agents().filter((a) => a.tier === tierKey);
}

export interface AgentSparkline {
  agentId: string;
  /** Downsampled score trajectory for an inline sparkline (≤ 24 points). */
  points: { t: number; v: number }[];
}

/** A compact score trajectory per agent, for fleet-roster sparklines. */
export function getFleetSparklines(durationRaw?: string): AgentSparkline[] {
  const { source: fleetSource } = getReadySource();
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  return fleetSource.agents().map((a) => {
    const samples = computeWindow(duration, a.agentId).trajectory.samples;
    const step = Math.max(1, Math.ceil(samples.length / 24));
    const points = samples
      .filter((_, i) => i % step === 0 || i === samples.length - 1)
      .map((p) => ({ t: p.timestamp.getTime(), v: p.score }));
    return { agentId: a.agentId, points };
  });
}

/** Seeded (window-correct) accumulator for one agent — memoized per request. */
const computeAgentRisk = cache((duration: PresetDuration, agentId: string): RiskTrend => {
  const { rainbow } = getReadySource();
  const now = getNow();
  const from = new Date(now.getTime() - WINDOW_DURATION_MS[duration]);
  const seedFrom = new Date(from.getTime() - RISK_SEED_WINDOW_MS);
  return computeCorrectedRiskTrend(rainbow.collector.query(agentId, seedFrom, now), from.getTime());
});

/**
 * The accumulator peak and the failures that make it up, for the proof page:
 * the same seeded series the risk panel and the agent insight cite.
 */
export function getAgentRiskEvidence(
  durationRaw: string | undefined,
  agentId: string,
  limit = 12
): { risk: RiskTrend; peakAt?: Date; contributors: ContributingSignal[]; contributorCount: number } {
  const { rainbow } = getReadySource();
  const now = getNow();
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  const from = new Date(now.getTime() - WINDOW_DURATION_MS[duration]);
  const seedFrom = new Date(from.getTime() - RISK_SEED_WINDOW_MS);
  const risk = computeAgentRisk(duration, agentId);
  const evidence = peakContributors(risk, rainbow.collector.query(agentId, seedFrom, now), limit);
  return { risk, peakAt: evidence.peakAt, contributors: evidence.signals, contributorCount: evidence.total };
}

/** One agent's line in the fleet overview. */
export interface FleetAgentRow {
  agentId: string;
  label: string;
  tier: string;
  /** Score at the window's left edge. */
  start: number;
  current: number;
  velocity: number;
  trend: AnalyticsWindowResult['trajectory']['trend'];
  risk: Omit<RiskTrend, 'samples'>;
}

export interface FleetOverview {
  computedAt: Date;
  duration: PresetDuration;
  agentCount: number;
  /** Fleet mean / median over time, sampled on a fixed grid. */
  meanSeries: { t: number; v: number }[];
  medianSeries: { t: number; v: number }[];
  mean: { start: number; end: number };
  median: { start: number; end: number };
  rows: FleetAgentRow[];
  /** Pooled signal counts — a legitimate fleet statistic (counts add up). */
  distribution: AnalyticsWindowResult['distribution'];
  insights: RecordedInsight[];
}

const FLEET_SERIES_POINTS = 48;

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = xs.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Fleet-scope view: fleet statistics computed from every agent's own series
 * (not from a pooled window, whose "trajectory" sums all agents' deltas onto
 * one starting score and is meaningless). Memoized per request.
 */
const computeFleetOverview = cache((duration: PresetDuration): FleetOverview => {
  const { source: fleetSource } = getReadySource();
  const now = getNow();
  const fromMs = now.getTime() - WINDOW_DURATION_MS[duration];
  const from = new Date(fromMs);
  const agents = fleetSource.agents();
  const ids = agents.map((a) => a.agentId);

  const meanSeries: FleetOverview['meanSeries'] = [];
  const medianSeries: FleetOverview['medianSeries'] = [];
  const step = (now.getTime() - fromMs) / (FLEET_SERIES_POINTS - 1);
  for (let i = 0; i < FLEET_SERIES_POINTS; i++) {
    const t = i === FLEET_SERIES_POINTS - 1 ? now.getTime() : fromMs + i * step;
    const scores = ids.map((id) => fleetSource.resolveScoreAt(id, new Date(t)));
    meanSeries.push({ t, v: mean(scores) });
    medianSeries.push({ t, v: median(scores) });
  }

  const inputs: FleetAgentInput[] = agents.map((a) => ({
    agentId: a.agentId,
    window: computeWindow(duration, a.agentId),
    startScore: fleetSource.resolveScoreAt(a.agentId, from),
    risk: computeAgentRisk(duration, a.agentId),
  }));

  const startScores = inputs.map((i) => i.startScore);
  const endScores = agents.map((a) => a.score);
  const meanStats = { start: mean(startScores), end: mean(endScores) };
  const medianStats = { start: median(startScores), end: median(endScores) };

  const snapshot = computeFleetSnapshot(duration);
  const fleetWindow = computeWindow(duration, undefined);

  const rows: FleetAgentRow[] = inputs.map((i, idx) => {
    const { samples: _samples, ...risk } = i.risk;
    return {
      agentId: i.agentId,
      label: agents[idx].label,
      tier: agents[idx].tier,
      start: i.startScore,
      current: i.window.trajectory.current,
      velocity: i.window.trajectory.velocity,
      trend: i.window.trajectory.trend,
      risk,
    };
  });

  return {
    computedAt: now,
    duration,
    agentCount: agents.length,
    meanSeries,
    medianSeries,
    mean: meanStats,
    median: medianStats,
    rows,
    distribution: fleetWindow.distribution,
    insights: sortInsights(
      deriveFleetInsights({
        agents: inputs,
        fleetWindow,
        fleetMean: meanStats,
        fleetMedian: medianStats.end,
        anomalyClusters: snapshot.anomalyClusters,
        now,
      })
    ),
  };
});

/** Fleet-scope overview (fleet trend, per-agent accumulators, fleet insights). */
export function getFleetOverview(durationRaw?: string): FleetOverview {
  return computeFleetOverview(isPresetDuration(durationRaw) ? durationRaw : '24h');
}


const correlator = new CrossAgentCorrelator();

/** Cross-agent correlation alerts, via the CrossAgentCorrelator producer. */
function deriveCorrelationAlerts(signals: IngestedSignal[]): CorrelationAlertInput[] {
  return correlator.correlate(signals);
}

export interface DelegationModel {
  escalations: EscalationEvent[];
  summary: DelegationHealthSummary;
  handlers: string[];
  /** Agents with real CT-SEC/CT-ID failures — scopes the collusion flag. */
  securityCluster: string[];
}

/**
 * Delegation derivation shared by the full /lab model and the dashboard teaser
 * (see DelegationService's module header). The simulator has no native
 * delegation, so the service applies one explicit orchestration policy and
 * DERIVES every outcome from the real simulated trust trajectories (handler
 * pool, resolution and rejection all come from each handler's actual trust at
 * the escalation instant via `resolveScoreAt` — no fabrication). The policy
 * itself is the only model.
 */
function buildDelegation(
  durationRaw?: string,
  policy?: DelegationPolicy
): {
  service: DelegationService;
  signals: IngestedSignal[];
  escalations: EscalationEvent[];
  now: Date;
} {
  const { source: fleetSource, rainbow } = getReadySource();
  const now = getNow();
  const duration: PresetDuration = isPresetDuration(durationRaw) ? durationRaw : '24h';
  const from = new Date(now.getTime() - WINDOW_DURATION_MS[duration]);
  const signals = rainbow.collector.queryAll(from, now);
  // The policy knobs (handler pool size, lead routing, risk tolerance) change
  // ONLY the modeled routing overlay. The simulator stream above and the
  // `resolveScoreAt` trust trajectories below are untouched, so the underlying
  // synthetic sim/trust stays byte-identical regardless of the policy.
  const service = new DelegationService({
    agentIds: fleetSource.agents().map((a) => a.agentId),
    trustAt: (agentId, at) => fleetSource.resolveScoreAt(agentId, at),
    handlerCount: policy?.handlerCount,
    leadRouting: policy?.leadRouting,
    escalateAt: policy?.escalateAt,
  });
  return { service, signals, escalations: service.escalations(signals), now };
}

/** Full delegation model — escalation log, summary, handler pool and security
 *  cluster — for the explicitly-labeled /lab route. Accepts an optional modeled
 *  policy (handler pool size, lead routing, risk tolerance); omitting it
 *  reproduces the prior default behavior. */
export function getDelegationModel(
  durationRaw?: string,
  policy?: DelegationPolicy
): DelegationModel {
  const { service, signals, escalations, now } = buildDelegation(durationRaw, policy);
  return {
    escalations,
    summary: computeDelegationHealth(escalations),
    handlers: service.handlerPoolAt(now),
    securityCluster: service.securityCluster(signals),
  };
}

/** Just the delegation-health summary, for the dashboard teaser — skips the
 *  handler-pool and security-cluster derivation the full model returns. The
 *  teaser always uses the DEFAULT policy (no overlay knobs). */
export function getDelegationSummary(durationRaw?: string): DelegationHealthSummary {
  return computeDelegationHealth(buildDelegation(durationRaw).escalations);
}
