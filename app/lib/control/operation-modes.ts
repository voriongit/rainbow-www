// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * The five named OPERATION MODES + the nine SCOPE DIMENSIONS.
 *
 * This is ILLUSTRATIVE data for the read-only control MODEL. The modes are
 * defaults that compose the underlying knobs across the three layers
 * (kernel / sidecar / control-plane); the dimensions are the adjustability
 * taxonomy with the layer each maps to, whether the mechanism exists today vs
 * is net-new, and its precedence rank in the deny-biased merge.
 *
 * Nothing here controls a live agent — it describes how a future control layer
 * *would* compose. CogniGate (the control-plane) is advisory v0.x; enforcement
 * is the direction of travel, not a shipped capability.
 */

import type {
  OperationMode,
  OperationModeKey,
  ScopeDimension,
  ScopeDimensionKey,
} from './contract';

// ── Operation modes ─────────────────────────────────────────────────────────

export const OPERATION_MODES: OperationMode[] = [
  {
    key: 'observe',
    label: 'Observe',
    description:
      'Watch only. Every layer records; none acts. The model surfaces what *would* happen without changing anything — the most honest posture for a read-only observatory.',
    layers: {
      kernelLayerMode: 'observe',
      sidecarGovernanceMode: 'audit-only',
      channelDefault: 'deferred',
      escalationPosture: 'Log + notify; no automatic tightening.',
    },
  },
  {
    key: 'guarded',
    label: 'Guarded',
    description:
      'The default balanced posture. Hard floors enforce in the kernel; the sidecar tightens high-risk actions inline; the control plane advises. Reversible, audited delegation within a tier.',
    isDefault: true,
    layers: {
      kernelLayerMode: 'enforce',
      sidecarGovernanceMode: 'guarded',
      channelDefault: 'inline',
      escalationPosture: 'Tighten inline on risk; escalate to human on floor breach.',
    },
  },
  {
    key: 'strict',
    label: 'Strict',
    description:
      'Deny-biased. The sidecar blocks anything not explicitly permitted for the tier; the control plane enforces in observe-then-act mode. For sensitive workloads where ambiguity should fail closed.',
    layers: {
      kernelLayerMode: 'enforce',
      sidecarGovernanceMode: 'strict',
      channelDefault: 'block',
      escalationPosture: 'Block-by-default; two-person escalation to relax.',
    },
  },
  {
    key: 'autonomous-within-tier',
    label: 'Autonomous within tier',
    description:
      'Widest reversible autonomy the agent’s tier permits — but never beyond it. Floors still bind; the tier ceiling is the hard boundary. Higher tiers earn more headroom, never an exemption.',
    layers: {
      kernelLayerMode: 'enforce',
      sidecarGovernanceMode: 'tier-bounded',
      channelDefault: 'inline',
      escalationPosture: 'Auto-proceed within tier; floor/ceiling breach escalates.',
    },
  },
  {
    key: 'lockdown',
    label: 'Lockdown',
    description:
      'Hard stop. The kernel denies first; nothing below the human-override line can loosen it. The break-glass posture for an active incident.',
    layers: {
      kernelLayerMode: 'enforce',
      sidecarGovernanceMode: 'deny-all',
      channelDefault: 'block',
      escalationPosture: 'Deny all; only an authenticated human override clears it.',
    },
  },
];

const MODE_BY_KEY = new Map<OperationModeKey, OperationMode>(
  OPERATION_MODES.map((m) => [m.key, m])
);

export const DEFAULT_OPERATION_MODE: OperationModeKey = 'guarded';

export function getOperationMode(key?: OperationModeKey): OperationMode {
  return MODE_BY_KEY.get(key ?? DEFAULT_OPERATION_MODE) ?? MODE_BY_KEY.get(DEFAULT_OPERATION_MODE)!;
}

// ── Scope dimensions (adjustability taxonomy) ───────────────────────────────
//
// precedenceRank mirrors the deny-biased merge order in ./effective-config:
//   0 lockdown/kernel-deny → 1 industry floors → 2 human override →
//   3 per-agent → 4 A2A → 5 channel → 6 capability → 7 data-sensitivity →
//   8 tier → 9 risk → 10 operation-mode default.
// The dimensions below occupy ranks 3..9 (the user-tunable band). Ranks 0–2 and
// 10 are merge steps, not scope dimensions, and are documented in the merge.

export const SCOPE_DIMENSIONS: ScopeDimension[] = [
  {
    key: 'per-agent',
    label: 'Per-agent',
    description: 'Pin a posture to a specific agent identity, overriding broader scopes.',
    layer: 'sidecar',
    maturity: 'exists-today',
    precedenceRank: 3,
  },
  {
    key: 'a2a-relationship',
    label: 'A2A relationship',
    description: 'Constrain a requestor→handler delegation edge between two agents.',
    layer: 'control-plane',
    maturity: 'net-new',
    precedenceRank: 4,
  },
  {
    key: 'channel',
    label: 'Channel',
    description: 'Scope by transport/channel (e.g. tool call, network egress, A2A bus).',
    layer: 'sidecar',
    maturity: 'exists-today',
    precedenceRank: 5,
  },
  {
    key: 'action-class',
    label: 'Action class / capability',
    description: 'Scope by capability the action exercises (read / write / spend / deploy).',
    layer: 'sidecar',
    maturity: 'exists-today',
    precedenceRank: 6,
  },
  {
    key: 'data-sensitivity',
    label: 'Data sensitivity',
    description: 'Scope by classification of the data touched (public → restricted).',
    layer: 'control-plane',
    maturity: 'net-new',
    precedenceRank: 7,
  },
  {
    key: 'per-tier',
    label: 'Per-tier',
    description: 'Scope by the agent’s trust tier T0–T7; the tier ceiling is a hard bound.',
    layer: 'kernel',
    maturity: 'exists-today',
    precedenceRank: 8,
  },
  {
    key: 'risk-class',
    label: 'Risk class',
    description: 'Scope by the canonical risk level of the action (LOW → CRITICAL).',
    layer: 'kernel',
    maturity: 'exists-today',
    precedenceRank: 9,
  },
  {
    key: 'per-factor',
    label: 'Per-factor',
    description: 'Scope by an individual trust factor’s satisfaction (one of the 16).',
    layer: 'sidecar',
    maturity: 'net-new',
    precedenceRank: 6,
  },
  {
    key: 'time-window',
    label: 'Time window',
    description: 'Scope by time (business hours, change-freeze windows, incident windows).',
    layer: 'control-plane',
    maturity: 'net-new',
    precedenceRank: 7,
  },
];

const DIMENSION_BY_KEY = new Map<ScopeDimensionKey, ScopeDimension>(
  SCOPE_DIMENSIONS.map((d) => [d.key, d])
);

export function getScopeDimension(key: ScopeDimensionKey): ScopeDimension | undefined {
  return DIMENSION_BY_KEY.get(key);
}

/** Scope dimensions in precedence order (highest-precedence / lowest rank first). */
export const SCOPE_DIMENSIONS_BY_PRECEDENCE: ScopeDimension[] = [...SCOPE_DIMENSIONS].sort(
  (a, b) => a.precedenceRank - b.precedenceRank
);
