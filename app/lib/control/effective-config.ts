// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * REFERENCE cross-layer precedence MERGE (local reimplementation).
 *
 * This is a LOCAL, faithful reimplementation of the deny-biased precedence merge
 * a future control layer would run across the three enforcement layers. It does
 * NOT depend on vorion-core (or any backend) — it is a self-contained reference
 * so the read-only model can *show* how a resolution lands. It changes nothing.
 *
 * Deny-biased precedence order (first hard floor wins; below the human-override
 * line, scopes may only TIGHTEN, never loosen):
 *
 *   0  lockdown / kernel-deny      (kernel, ambient floor — wins outright)
 *   1  industry floors (locked)    (kernel, ambient floor — cannot be relaxed)
 *   2  human override              (sidecar — the override line)
 *   ── below here scopes may only tighten ──
 *   3  per-agent                   (sidecar)
 *   4  A2A relationship            (control-plane)
 *   5  channel                     (sidecar)
 *   6  capability / per-factor     (sidecar)
 *   7  data-sensitivity / time     (control-plane)
 *   8  tier                        (kernel)
 *   9  risk                        (kernel)
 *  10  operation-mode default      (the composed baseline from the chosen mode)
 *
 * Conflict resolution:
 *  - execution mode  → MOST RESTRICTIVE wins (block > inline > deferred).
 *  - verdict         → DENY OVERRIDES (deny > tighten > allow), and below the
 *                      human-override line a scope can only move a verdict toward
 *                      deny ("tighten"), never back toward allow.
 */

import type {
  ControlInput,
  EffectiveConfig,
  ResolvedEffect,
  Verdict,
} from './contract';
import type { ExecutionMode } from './provenance';
import { strictestExecutionMode } from './provenance';
import { getOperationMode } from './operation-modes';

const VERDICT_STRICTNESS: Verdict[] = ['deny', 'tighten', 'allow'];

/** Most deny-biased of two verdicts (deny > tighten > allow). */
function strictestVerdict(a: Verdict, b: Verdict): Verdict {
  return VERDICT_STRICTNESS.indexOf(a) <= VERDICT_STRICTNESS.indexOf(b) ? a : b;
}

/** A merge step the resolver can apply, in precedence order (lower rank wins). */
interface MergeStep {
  rank: number;
  /** Name shown as `decidedBy`. */
  name: string;
  /** True only when this step is active for the given input. */
  active: boolean;
  verdict: Verdict;
  executionMode: ExecutionMode;
  layer: 'kernel' | 'sidecar' | 'control-plane';
  origin: 'caused' | 'ambient';
  rationale: string;
  /** Whether this step's proof rests on a stub (TEE/attestation) — honesty ceiling. */
  stubbed?: boolean;
}

/**
 * Resolve the illustrative EffectiveConfig for an input under the reference merge.
 *
 * The result carries a deny-biased verdict roll-up, a most-restrictive execution
 * mode, and per-category effects each with their own provenance — honesty is
 * per-effect, never one badge. Stamped `synthetic: true`.
 */
export function resolveEffectiveConfig(input: ControlInput): EffectiveConfig {
  const mode = getOperationMode(input.mode);

  // The mode default is the baseline (rank 10) every resolution starts from.
  const baselineExec = mode.layers.channelDefault;
  const baselineVerdict: Verdict =
    mode.key === 'lockdown' ? 'deny' : mode.key === 'observe' ? 'allow' : 'tighten';

  const steps: MergeStep[] = [
    {
      rank: 0,
      name: 'lockdown / kernel-deny',
      active: !!input.kernelLockdown || mode.key === 'lockdown',
      verdict: 'deny',
      executionMode: 'block',
      layer: 'kernel',
      origin: 'ambient',
      rationale:
        'Kernel lockdown is the top floor: it denies first and nothing below the human-override line can loosen it.',
    },
    {
      rank: 1,
      name: 'industry floors (locked)',
      active: !!input.industryFloor,
      verdict: 'tighten',
      executionMode: 'block',
      layer: 'kernel',
      origin: 'ambient',
      rationale: 'A locked industry/regulatory floor applies regardless of input and cannot be relaxed by lower scopes.',
    },
    {
      rank: 2,
      name: 'human override',
      active: input.humanOverride !== undefined,
      // Above the override line a human may set any verdict; below it, scopes may only tighten.
      verdict: input.humanOverride ?? 'tighten',
      executionMode: input.humanOverride === 'allow' ? baselineExec : 'block',
      layer: 'sidecar',
      origin: 'caused',
      rationale: 'Authenticated human override — the line below which scopes may only tighten, never loosen.',
    },
    {
      rank: 3,
      name: 'per-agent',
      active: !!input.agentId,
      verdict: 'tighten',
      executionMode: 'inline',
      layer: 'sidecar',
      origin: 'caused',
      rationale: `Per-agent posture pinned for ${input.agentId ?? 'agent'} tightens within the override line.`,
    },
    {
      rank: 4,
      name: 'A2A relationship',
      active: !!input.a2aRelationship,
      verdict: 'tighten',
      executionMode: 'inline',
      layer: 'control-plane',
      origin: 'caused',
      rationale: `Delegation edge ${input.a2aRelationship ?? ''} constrained at the control plane (advisory v0.x).`.trim(),
      stubbed: true,
    },
    {
      rank: 5,
      name: 'channel',
      active: !!input.channel,
      verdict: 'tighten',
      executionMode: input.channel === 'egress' ? 'block' : 'inline',
      layer: 'sidecar',
      origin: 'caused',
      rationale: `Channel "${input.channel ?? ''}" posture applied at the sidecar.`.trim(),
    },
    {
      rank: 6,
      name: 'capability / per-factor',
      active: !!input.actionClass || !!input.factor,
      verdict: 'tighten',
      executionMode: input.actionClass === 'spend' || input.actionClass === 'deploy' ? 'block' : 'inline',
      layer: 'sidecar',
      origin: 'caused',
      rationale: `Capability "${input.actionClass ?? input.factor ?? ''}" scoped at the sidecar.`.trim(),
    },
    {
      rank: 7,
      name: 'data-sensitivity / time',
      active: !!input.dataSensitivity || !!input.timeWindow,
      verdict: 'tighten',
      executionMode: input.dataSensitivity === 'restricted' ? 'block' : 'inline',
      layer: 'control-plane',
      origin: 'caused',
      rationale: `Data class "${input.dataSensitivity ?? ''}"/window "${input.timeWindow ?? ''}" scoped at the control plane.`.trim(),
      stubbed: true,
    },
    {
      rank: 8,
      name: 'tier',
      active: !!input.tier,
      verdict: 'tighten',
      executionMode: 'inline',
      layer: 'kernel',
      origin: 'caused',
      rationale: `Tier ${input.tier ?? ''} ceiling bounds autonomy at the kernel — never an exemption.`.trim(),
    },
    {
      rank: 9,
      name: 'risk',
      active: !!input.riskClass,
      verdict: 'tighten',
      executionMode:
        input.riskClass === 'CRITICAL' || input.riskClass === 'HIGH' ? 'block' : 'inline',
      layer: 'kernel',
      origin: 'caused',
      rationale: `Risk class ${input.riskClass ?? ''} weights the kernel posture.`.trim(),
    },
    {
      rank: 10,
      name: 'operation-mode default',
      active: true, // the baseline always participates
      verdict: baselineVerdict,
      executionMode: baselineExec,
      layer: 'sidecar',
      origin: 'ambient',
      rationale: `Composed baseline from the "${mode.label}" operation mode.`,
    },
  ];

  const active = steps.filter((s) => s.active).sort((a, b) => a.rank - b.rank);
  const topStep = active[0];

  // Verdict roll-up: deny-overrides across all active steps.
  const verdict = active.reduce<Verdict>((acc, s) => strictestVerdict(acc, s.verdict), 'allow');

  // Execution mode roll-up: most-restrictive across all active steps.
  const executionMode = active.reduce<ExecutionMode>(
    (acc, s) => strictestExecutionMode(acc, s.executionMode),
    'deferred'
  );

  // Below the human-override line (rank > 2), a hard floor (rank 0/1) caps things:
  // if a floor is active, the verdict cannot be looser than that floor.
  const floor = active.find((s) => s.rank <= 1);

  const effects: ResolvedEffect[] = [
    {
      category: 'execution-verdict',
      value: verdict,
      decidedBy: (floor ?? topStep).name,
      rationale: floor
        ? `Hard floor "${floor.name}" caps the verdict; lower scopes may only tighten further.`
        : `Deny-biased roll-up across ${active.length} active scope(s).`,
      provenance: {
        layer: (floor ?? topStep).layer,
        executionMode,
        layerMode: mode.layers.kernelLayerMode,
        proof: 'verified',
        origin: (floor ?? topStep).origin,
      },
    },
    {
      category: 'execution-mode',
      value: executionMode,
      decidedBy: 'most-restrictive across layers',
      rationale: 'Execution-mode conflicts resolve to the most restrictive (block > inline > deferred).',
      provenance: {
        layer: 'kernel',
        executionMode,
        layerMode: mode.layers.kernelLayerMode,
        proof: 'verified',
        origin: floor ? 'ambient' : 'caused',
      },
    },
    {
      category: 'kernel-posture',
      value: mode.layers.kernelLayerMode,
      decidedBy: `operation mode · ${mode.label}`,
      rationale: 'Kernel layer-mode is set by the chosen operation mode; floors enforce here first.',
      provenance: {
        layer: 'kernel',
        executionMode: input.kernelLockdown || mode.key === 'lockdown' ? 'block' : executionMode,
        layerMode: mode.layers.kernelLayerMode,
        proof: 'verified',
        origin: input.kernelLockdown ? 'ambient' : 'caused',
      },
    },
    {
      category: 'sidecar-governance',
      value: mode.layers.sidecarGovernanceMode,
      decidedBy: `operation mode · ${mode.label}`,
      rationale: 'Sidecar governance mode resolves the per-agent effective posture under the human-override line.',
      provenance: {
        layer: 'sidecar',
        executionMode,
        layerMode: mode.layers.kernelLayerMode === 'observe' ? 'observe' : 'enforce',
        proof: 'verified',
        origin: input.agentId ? 'caused' : 'ambient',
      },
    },
    {
      category: 'channel-posture',
      value: input.channel ? `${input.channel} · ${executionMode}` : `default · ${mode.layers.channelDefault}`,
      decidedBy: input.channel ? 'channel scope' : `operation mode · ${mode.label}`,
      rationale: 'Channel posture sets the default execution mode for caused effects on that transport.',
      provenance: {
        layer: 'sidecar',
        executionMode: input.channel ? executionMode : mode.layers.channelDefault,
        layerMode: mode.layers.kernelLayerMode === 'observe' ? 'observe' : 'enforce',
        proof: 'verified',
        origin: input.channel ? 'caused' : 'ambient',
      },
    },
    {
      category: 'escalation-posture',
      value: mode.layers.escalationPosture,
      decidedBy: `operation mode · ${mode.label}`,
      // Escalation crossing the control plane rests on the advisory v0.x / attestation stubs.
      rationale:
        'Escalation routes through the control plane (CogniGate, advisory v0.x); attestation is a stub, so its proof is honest-stubbed.',
      provenance: {
        layer: 'control-plane',
        executionMode: verdict === 'deny' ? 'block' : executionMode,
        layerMode: mode.layers.kernelLayerMode === 'observe' ? 'observe' : 'enforce',
        proof: 'stubbed',
        origin: 'caused',
      },
    },
  ];

  return {
    input,
    verdict,
    executionMode,
    effects,
    synthetic: true,
  };
}
