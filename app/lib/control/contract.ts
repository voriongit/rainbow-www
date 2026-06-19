// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Control-model contract — the READ-ONLY shape of the agent-control MODEL.
 *
 * IMPORTANT HONESTY NOTE. Nothing in this module controls a live agent. It is
 * an ILLUSTRATIVE conceptual model of how a future, vendor-neutral control
 * layer *would* resolve configuration across enforcement layers. rainbow.vorion.org
 * is a read-only Trust Analytics Observatory over a deterministic seeded
 * simulator; this file adds an honest, read-only visualization of the control
 * MODEL only.
 *
 * Vocabulary discipline: this is audit infrastructure / trust telemetry /
 * observability. We describe enforcement as the *direction of travel*, never
 * a shipped capability, and we never say "governs"/"governance" as something
 * this surface does. CogniGate (the would-be control-plane component) is
 * "advisory v0.x". The honesty ceiling is WHITE_BOX — TEE/attestation are
 * stubs (`proof: 'stubbed'`), never asserted as `verified` from here.
 *
 * The port is intentionally READ-ONLY for now: `mode()` and
 * `getEffectiveConfig()`. There are deliberately NO apply/write methods — this
 * model resolves and *shows* configuration, it does not change anything.
 */

// ── Enforcement layers ──────────────────────────────────────────────────────

/**
 * The three layers a future control stack would compose. Listed inner→outer:
 *  - kernel        — the in-process execution boundary (layer-mode / posture).
 *  - sidecar       — the per-agent policy envelope (governance mode).
 *  - control-plane — the fleet/orchestration advisory plane (CogniGate, v0.x).
 */
export type EnforcementLayer = 'kernel' | 'sidecar' | 'control-plane';

export const ENFORCEMENT_LAYERS: EnforcementLayer[] = ['kernel', 'sidecar', 'control-plane'];

export const LAYER_LABELS: Record<EnforcementLayer, string> = {
  kernel: 'Kernel',
  sidecar: 'Sidecar',
  'control-plane': 'Control plane',
};

export const LAYER_BLURBS: Record<EnforcementLayer, string> = {
  kernel: 'In-process execution boundary. Posture + layer-mode. Hard floors live here.',
  sidecar: 'Per-agent policy envelope. Governance mode resolves the agent’s effective posture.',
  'control-plane': 'Fleet/orchestration advisory plane (CogniGate, advisory v0.x). Direction of travel: enforcement.',
};

// ── Per-effect provenance vocabulary (re-exported from ./provenance) ─────────

export type {
  ExecutionMode,
  LayerMode,
  ProofStatus,
  EffectOrigin,
  EffectProvenance,
} from './provenance';

import type {
  ExecutionMode,
  LayerMode,
  ProofStatus,
  EffectOrigin,
  EffectProvenance,
} from './provenance';

// ── Scope dimensions (the adjustability taxonomy) ───────────────────────────

/** The nine dimensions along which the model can be scoped/tightened. */
export type ScopeDimensionKey =
  | 'risk-class'
  | 'action-class'
  | 'channel'
  | 'per-agent'
  | 'per-tier'
  | 'per-factor'
  | 'a2a-relationship'
  | 'data-sensitivity'
  | 'time-window';

export interface ScopeDimension {
  key: ScopeDimensionKey;
  label: string;
  /** What the dimension scopes, in one honest line. */
  description: string;
  /** Which enforcement layer resolves this dimension today / would resolve it. */
  layer: EnforcementLayer;
  /** Honesty: does the underlying mechanism exist today, or is it net-new? */
  maturity: 'exists-today' | 'net-new';
  /**
   * Precedence rank in the deny-biased merge (0 = highest floor wins first).
   * Mirrors the order documented in ./effective-config. Lower wins.
   */
  precedenceRank: number;
}

// ── Operation modes ─────────────────────────────────────────────────────────

/** The five named operation modes — composed defaults over the underlying knobs. */
export type OperationModeKey =
  | 'observe'
  | 'guarded'
  | 'strict'
  | 'autonomous-within-tier'
  | 'lockdown';

export interface OperationMode {
  key: OperationModeKey;
  label: string;
  /** Honest one-liner describing the posture this mode composes. */
  description: string;
  /** Is this the default mode? (Guarded is.) */
  isDefault?: boolean;
  /** How the mode maps onto the three layers (illustrative composition). */
  layers: {
    /** Kernel posture / layer-mode. */
    kernelLayerMode: LayerMode;
    /** Sidecar governance mode (the per-agent posture label). */
    sidecarGovernanceMode: string;
    /** Default channel execution mode for caused effects. */
    channelDefault: ExecutionMode;
    /** Escalation posture (what happens when a floor is hit). */
    escalationPosture: string;
  };
}

// ── Effective configuration (the resolved output) ───────────────────────────

/**
 * The categories the model resolves a value for. These map onto the surfaced
 * effects a future cockpit would show; each carries its own provenance, because
 * honesty is PER-EFFECT, never one global badge.
 */
export type EffectiveCategoryKey =
  | 'execution-verdict'
  | 'execution-mode'
  | 'kernel-posture'
  | 'sidecar-governance'
  | 'channel-posture'
  | 'escalation-posture';

export const EFFECTIVE_CATEGORY_LABELS: Record<EffectiveCategoryKey, string> = {
  'execution-verdict': 'Execution verdict',
  'execution-mode': 'Execution mode',
  'kernel-posture': 'Kernel posture',
  'sidecar-governance': 'Sidecar governance',
  'channel-posture': 'Channel posture',
  'escalation-posture': 'Escalation posture',
};

/** A deny-biased verdict the merge can resolve to. */
export type Verdict = 'allow' | 'tighten' | 'deny';

/**
 * One resolved category: the value the merge landed on, which precedence layer
 * decided it (the "winning origin"), a human-readable rationale, and the
 * per-effect provenance (layer / executionMode / layerMode / proof / origin).
 */
export interface ResolvedEffect {
  category: EffectiveCategoryKey;
  /** The resolved value (verdict string, execution mode, or posture label). */
  value: string;
  /**
   * The precedence source that won this category — e.g. 'lockdown/kernel-deny',
   * 'industry floors', 'operation-mode default'. Names the merge step.
   */
  decidedBy: string;
  /** Honest one-line rationale for why this value won. */
  rationale: string;
  /** Per-effect provenance. Honesty is per-effect, never one badge. */
  provenance: EffectProvenance;
}

/**
 * The resolved configuration for a given input. Per-category resolved value +
 * per-effect provenance, plus the deny-biased verdict roll-up.
 *
 * Every payload from the SimulatorControlPort is stamped `synthetic: true`.
 */
export interface EffectiveConfig {
  /** Echo of the resolved input scope, for display. */
  input: ControlInput;
  /** The overall deny-biased verdict (deny > tighten > allow). */
  verdict: Verdict;
  /** The most-restrictive resolved execution mode (block > inline > deferred). */
  executionMode: ExecutionMode;
  /** Per-category resolved effects, each with its own provenance. */
  effects: ResolvedEffect[];
  /** Always true here — this is illustrative model output, not real control. */
  synthetic: true;
}

/** The scope of a resolution request (which slice of the 9 dimensions). */
export interface ControlInput {
  /** Operation mode the resolution is evaluated under (defaults to guarded). */
  mode?: OperationModeKey;
  riskClass?: string;
  actionClass?: string;
  channel?: string;
  agentId?: string;
  tier?: string;
  factor?: string;
  a2aRelationship?: string;
  dataSensitivity?: string;
  timeWindow?: string;
  /** Optional toggles for illustrative floors (industry floor / human override / kernel lockdown). */
  industryFloor?: boolean;
  humanOverride?: Verdict;
  kernelLockdown?: boolean;
}

// ── The port ────────────────────────────────────────────────────────────────

/**
 * READ-ONLY control-model port. Implementations resolve and *show* effective
 * configuration; they never apply or write. (No apply/write methods are
 * defined — by design.)
 */
export interface GovernanceControlPort {
  /** 'demo' for the simulator-backed model; 'live' is reserved (not shipped). */
  mode(): 'demo' | 'live';
  /** Resolve the illustrative effective configuration for a scope input. */
  getEffectiveConfig(input: ControlInput): EffectiveConfig;
}
