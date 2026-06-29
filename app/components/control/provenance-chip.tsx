// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Control-card provenance chips — a LOCAL rendering of per-effect provenance.
 *
 * This is deliberately self-contained for the /control lane: it does NOT import
 * from app/model (edited in parallel) nor from app/components/control-resolver-selector.
 * It is a plain server-renderable presentational component.
 *
 * Honesty is PER-EFFECT, never one global badge. Each resolved effect carries
 * the full quintet — layer · execution mode · layer mode · proof · origin — and
 * we render every one. The honesty ceiling is WHITE_BOX: attestation/TEE are
 * stubs, so `proof: stubbed` is shown plainly and is never dressed up as
 * verified.
 */

import type { CSSProperties } from 'react';
import type { ResolvedEffect } from '../../lib/control/contract';
import { LAYER_LABELS } from '../../lib/control/contract';
import { STATUS } from '../../lib/status-colors';

const LAYER_ACCENT: Record<'kernel' | 'sidecar' | 'control-plane', string> = {
  kernel: STATUS.bad, // inner hard floor
  sidecar: STATUS.warn,
  'control-plane': STATUS.info,
};

const EXEC_COLOR: Record<string, string> = {
  block: STATUS.bad,
  inline: STATUS.warn,
  deferred: STATUS.info,
};

/** A single pill. Server-renderable; color-tinted via inline style. */
export function Chip({
  label,
  color,
  title,
}: {
  label: string;
  color?: string;
  title?: string;
}) {
  const style: CSSProperties = {
    borderColor: color ? `${color}55` : 'rgba(255,255,255,0.15)',
    backgroundColor: color ? `${color}1a` : 'rgba(255,255,255,0.04)',
    // Secondary text stays at white/60+ on the near-black bg for WCAG.
    color: color ?? 'rgba(255,255,255,0.6)',
  };
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none"
      style={style}
    >
      {label}
    </span>
  );
}

/**
 * The five provenance chips for one resolved effect, in honest order:
 * layer · execution mode · layer mode · proof · origin.
 */
export function ProvenanceChips({ effect }: { effect: ResolvedEffect }) {
  const p = effect.provenance;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Chip
        label={LAYER_LABELS[p.layer]}
        color={LAYER_ACCENT[p.layer]}
        title="Enforcement layer that carries this effect (kernel / sidecar / control-plane)."
      />
      <Chip
        label={p.executionMode}
        color={EXEC_COLOR[p.executionMode]}
        title="Execution mode (most-restrictive wins: block > inline > deferred)."
      />
      <Chip
        label={p.layerMode}
        title="Layer posture (enforce / observe / shadow)."
      />
      <Chip
        label={p.proof === 'verified' ? 'proof: verified' : 'proof: stubbed'}
        color={p.proof === 'verified' ? STATUS.good : STATUS.neutral}
        title={
          p.proof === 'stubbed'
            ? 'Honesty ceiling is WHITE_BOX — this rests on a TEE/attestation stub, so it is not asserted as verified.'
            : 'Backed by a real check in this local reference model.'
        }
      />
      <Chip
        label={p.origin}
        title={
          p.origin === 'caused'
            ? 'Directly caused by this resolution input.'
            : 'Ambient standing floor — applies regardless of input.'
        }
      />
    </div>
  );
}
