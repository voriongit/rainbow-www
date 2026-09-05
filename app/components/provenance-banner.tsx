// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { Provenance } from '../lib/data-source';
import { FreshnessIndicator } from './freshness-indicator';

export function ProvenancePill({ provenance }: { provenance: Provenance }) {
  const live = provenance.mode === 'live';
  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-medium ${
        live
          ? 'border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-200/90'
          : 'border-white/15 bg-white/[0.04] text-white/45'
      }`}
    >
      {live ? 'Live telemetry' : 'Demo fleet'}
    </span>
  );
}

export function ProvenanceBanner({
  provenance,
  computedAt,
}: {
  provenance: Provenance;
  computedAt?: Date;
}) {
  const live = provenance.mode === 'live';
  return (
    <div
      className={`rounded-lg border px-4 py-2.5 ${
        live
          ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
          : 'border-cyan-500/20 bg-cyan-500/[0.06]'
      }`}
    >
      <p
        className={`text-xs leading-relaxed ${live ? 'text-emerald-100/80' : 'text-cyan-200/80'}`}
      >
        <span className="font-semibold">{live ? 'Live telemetry.' : 'Demo fleet.'}</span>{' '}
        {live
          ? `This view is computed from ${provenance.signalCount} ingested signal${
              provenance.signalCount === 1 ? '' : 's'
            } across ${provenance.agentCount} agent${provenance.agentCount === 1 ? '' : 's'}. Rainbow observes; it does not gate anyone.`
          : 'Thirteen scripted agents, same story every load. Not live production. Rainbow observes; it does not gate anyone.'}{' '}
        {provenance.reason}
        {computedAt ? (
          <>
            {' '}
            Computed {computedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC.{' '}
            <FreshnessIndicator computedAt={computedAt.toISOString()} />
          </>
        ) : null}
      </p>
    </div>
  );
}
