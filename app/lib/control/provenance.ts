// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Per-effect provenance model.
 *
 * Honesty is PER-EFFECT, never one global badge. Every surfaced effect carries
 * the full quintet below so a reader can see, for that specific effect: which
 * layer decided it, how it would be executed, what posture the layer is in,
 * whether its proof is real or stubbed, and whether the effect was directly
 * caused by the input or is an ambient floor.
 *
 * The honesty ceiling is WHITE_BOX: TEE / attestation are stubs, so any effect
 * whose proof would depend on them is `proof: 'stubbed'`. We never assert
 * `verified` from this read-only model where the real mechanism is a stub.
 */

/**
 * How an effect is enforced in time.
 *  - block    — synchronous hard stop before the action proceeds.
 *  - inline   — evaluated in the request path, may tighten but not stop.
 *  - deferred — evaluated after the fact (observe/audit), never stops.
 *
 * Most-restrictive ordering for conflict resolution: block > inline > deferred.
 */
export type ExecutionMode = 'block' | 'inline' | 'deferred';

/** Strict-to-loose order; index 0 is most restrictive. Used by the merge. */
export const EXECUTION_MODE_STRICTNESS: ExecutionMode[] = ['block', 'inline', 'deferred'];

/**
 * The posture a layer itself is running in.
 *  - enforce — the layer acts on its verdicts.
 *  - observe — the layer records but does not act (advisory).
 *  - shadow  — the layer evaluates in parallel for comparison only.
 */
export type LayerMode = 'enforce' | 'observe' | 'shadow';

/**
 * Whether the proof backing an effect is real or a stub.
 * The honesty ceiling is WHITE_BOX; attestation/TEE are stubbed, so anything
 * resting on them is `stubbed` and must never be shown as `verified`.
 */
export type ProofStatus = 'verified' | 'stubbed';

/**
 * Where the effect came from:
 *  - caused  — directly produced by the resolution input (a chosen scope).
 *  - ambient — a standing floor that applies regardless of input (e.g. an
 *              industry floor or kernel lockdown).
 */
export type EffectOrigin = 'caused' | 'ambient';

export interface EffectProvenance {
  layer: 'kernel' | 'sidecar' | 'control-plane';
  executionMode: ExecutionMode;
  layerMode: LayerMode;
  proof: ProofStatus;
  origin: EffectOrigin;
}

/** Pick the most-restrictive of two execution modes (block > inline > deferred). */
export function strictestExecutionMode(a: ExecutionMode, b: ExecutionMode): ExecutionMode {
  return EXECUTION_MODE_STRICTNESS.indexOf(a) <= EXECUTION_MODE_STRICTNESS.indexOf(b) ? a : b;
}

/** Human labels for provenance chips. */
export const EXECUTION_MODE_LABELS: Record<ExecutionMode, string> = {
  block: 'block',
  inline: 'inline',
  deferred: 'deferred',
};

export const LAYER_MODE_LABELS: Record<LayerMode, string> = {
  enforce: 'enforce',
  observe: 'observe',
  shadow: 'shadow',
};
