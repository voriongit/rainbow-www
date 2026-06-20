// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * /control — per-agent control-card INDEX.
 *
 * A read-only roster of the (synthetic) fleet, each agent linking to its own
 * control card at /control/[agentId]. The control card shows how the
 * ILLUSTRATIVE control MODEL would resolve an effective configuration for that
 * one agent under a chosen operation mode.
 *
 * This page controls NOTHING — no live agents, no auth, no writes, no backend.
 * It is server-rendered (force-dynamic) and reads the same deterministic, seeded
 * simulator shown across RAINBOW. Enforcement is the direction of travel, never
 * a shipped capability; this surface never "governs".
 */

import type { Metadata } from 'next';
import { getAgents } from '../lib/data-source';
import { Panel, EmptyState } from '../components/panel';
import { ExploreLink, exploreHref } from '../components/explore-link';
import { TIER_COLORS, tierName, type TierKey } from '../lib/tiers';
import { STATUS, LIFECYCLE_COLORS, tint } from '../lib/status-colors';
import { fmtNum } from '../lib/format';
import { DEFAULT_OPERATION_MODE } from '../lib/control/operation-modes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Control cards (illustrative) — RAINBOW',
  description:
    'A read-only index of per-agent control cards: how an illustrative, vendor-neutral agent-control model would resolve an effective configuration for each agent. Not connected to live agents.',
};

export default async function ControlIndexPage() {
  const agents = getAgents();
  const sorted = agents
    .slice()
    .sort((a, b) => b.score - a.score || a.agentId.localeCompare(b.agentId));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <div className="flex flex-wrap items-center gap-4">
        <ExploreLink href={exploreHref('/')} className="text-sm text-white/55">
          ← Dashboard
        </ExploreLink>
        <ExploreLink href={exploreHref('/model')} className="text-sm text-white/55">
          Control model →
        </ExploreLink>
      </div>

      {/* Header + persistent illustrative badge */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-white/90">
            Control cards <span className="text-white/50">· per agent</span>
          </h1>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              borderColor: `${STATUS.warnAlt}66`,
              backgroundColor: `${STATUS.warnAlt}1a`,
              color: STATUS.warnAlt,
            }}
          >
            ▲ Illustrative model — not connected to live agents
          </span>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-white/60">
          Open any agent to see how the illustrative control{' '}
          <span className="text-white/85">model</span> would resolve an effective configuration for
          it — verdict, execution mode, and per-category effects grouped by enforcement layer, each
          with its own provenance. It controls nothing: no live agents, no auth, no writes, no
          backend. Everything is resolved by a local reference merge and is synthetic.
        </p>

        {/* Persistent synthetic / honesty banner (mirrors the model + benchmark idiom). */}
        <div
          className="rounded-lg border px-4 py-2.5"
          style={{ borderColor: `${STATUS.warnAlt}33`, backgroundColor: `${STATUS.warnAlt}10` }}
        >
          <p className="text-xs leading-relaxed" style={{ color: `${STATUS.warnAlt}cc` }}>
            <span className="font-semibold">Synthetic · illustrative model.</span> These agents are
            the same deterministic, seeded simulator shown across RAINBOW. The control cards{' '}
            <span className="italic">show</span> a resolution; there is no apply/write path. Honesty
            is per-effect, and the honesty ceiling is <span className="font-mono">WHITE_BOX</span> —
            attestation/TEE are stubs (<span className="font-mono">proof: stubbed</span>), never
            asserted as verified. CogniGate (control plane) is advisory v0.x; enforcement is the
            direction of travel.
          </p>
        </div>
      </header>

      {/* Roster */}
      <Panel
        title="Fleet roster"
        subtitle={`${sorted.length} synthetic agents · default mode ${DEFAULT_OPERATION_MODE}`}
        footnote="Each row opens the agent's illustrative control card. Tier and lifecycle reflect the live (synthetic) simulator; the resolution shown on the card is read-only."
      >
        {sorted.length === 0 ? (
          <EmptyState message="No agents in the simulated fleet." />
        ) : (
          <ul className="flex flex-col gap-1">
            {sorted.map((a) => {
              const tier = a.tier as TierKey;
              const tierColor = TIER_COLORS[tier] ?? STATUS.neutral;
              const lifecycleColor = LIFECYCLE_COLORS[a.lifecycleState] ?? STATUS.neutral;
              return (
                <li key={a.agentId}>
                  <ExploreLink
                    href={exploreHref(`/control/${a.agentId}`)}
                    variant="block"
                    ariaLabel={`Control card for ${a.label} (${a.agentId})`}
                    className="flex flex-wrap items-center gap-3 px-3 py-2.5"
                  >
                    <span className="min-w-[8rem] shrink-0 font-mono text-sm font-semibold text-white/85">
                      {a.agentId}
                    </span>
                    <span className="min-w-[10rem] flex-1 truncate text-xs text-white/60">
                      {a.label}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ color: tierColor, backgroundColor: tint(tierColor) }}
                    >
                      {tier} · {tierName(tier)}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ color: lifecycleColor, backgroundColor: tint(lifecycleColor) }}
                    >
                      {a.lifecycleState}
                    </span>
                    <span className="w-14 shrink-0 text-right text-xs font-semibold text-white/75">
                      {fmtNum(a.score)}
                    </span>
                    <span aria-hidden className="shrink-0 text-white/35">
                      →
                    </span>
                  </ExploreLink>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <p className="text-[11px] leading-relaxed text-white/55">
        Illustrative model only. There is no live agent, no auth, no write path, and no backend call
        on these pages — the control port is demo-mode and read-only, and every payload is stamped
        synthetic. This is audit infrastructure / trust telemetry / observability; enforcement is
        the direction of travel, not a capability this surface ships.{' '}
        <a href="https://vorion.org" className="underline hover:text-white/75">
          vorion.org
        </a>
      </p>
    </main>
  );
}
