// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * /control/[agentId] — a per-agent CONTROL CARD.
 *
 * A read-only view of how the ILLUSTRATIVE control MODEL would resolve an
 * effective configuration for ONE specific (synthetic) agent under a chosen
 * operation mode. It builds a ControlInput from the agent's REAL simulated
 * attributes (its tier, agentId), feeds it through the local reference merge via
 * the demo-mode SimulatorControlPort, and renders the resolved verdict +
 * execution-mode roll-up plus the per-category effects grouped by enforcement
 * layer, each with its own per-effect provenance.
 *
 * It controls NOTHING — no live agents, no auth, no writes, no backend. Server
 * component, force-dynamic, URL-driven (?mode) and deep-linkable. Honesty is
 * per-effect (not one badge); the honesty ceiling is WHITE_BOX (attestation/TEE
 * are stubbed). Enforcement is the direction of travel, never a shipped
 * capability, and this surface never "governs".
 */

import { notFound } from 'next/navigation';
import { getAgentInfo } from '../../lib/data-source';
import { Panel } from '../../components/panel';
import { ExploreLink, exploreHref } from '../../components/explore-link';
import { ControlModeSelector } from '../../components/control/control-mode-selector';
import { Chip, ProvenanceChips } from '../../components/control/provenance-chip';
import { TIER_COLORS, tierName, type TierKey } from '../../lib/tiers';
import { STATUS, LIFECYCLE_COLORS, tint } from '../../lib/status-colors';
import { fmtNum } from '../../lib/format';
import {
  OPERATION_MODES,
  DEFAULT_OPERATION_MODE,
  getOperationMode,
} from '../../lib/control/operation-modes';
import {
  EFFECTIVE_CATEGORY_LABELS,
  ENFORCEMENT_LAYERS,
  LAYER_BLURBS,
  LAYER_LABELS,
  type ControlInput,
  type EnforcementLayer,
  type OperationModeKey,
  type ResolvedEffect,
  type Verdict,
} from '../../lib/control/contract';
import { simulatorControlPort } from '../../lib/control/simulator-control-port';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ mode?: string }>;
}

const VERDICT_COLOR: Record<Verdict, string> = {
  allow: STATUS.good,
  tighten: STATUS.warn,
  deny: STATUS.bad,
};

const EXEC_COLOR: Record<string, string> = {
  block: STATUS.bad,
  inline: STATUS.warn,
  deferred: STATUS.info,
};

const LAYER_ACCENT: Record<EnforcementLayer, string> = {
  kernel: STATUS.bad,
  sidecar: STATUS.warn,
  'control-plane': STATUS.info,
};

const MODE_OPTIONS = OPERATION_MODES.map((m) => ({ value: m.key, label: m.label }));
const VALID_MODE_KEYS = new Set<string>(OPERATION_MODES.map((m) => m.key));

/** Clamp the raw ?mode to a known operation-mode key, defaulting when absent/unknown. */
function clampMode(raw: string | undefined): OperationModeKey {
  return raw && VALID_MODE_KEYS.has(raw)
    ? (raw as OperationModeKey)
    : DEFAULT_OPERATION_MODE;
}

export default async function ControlCardPage({ params, searchParams }: PageProps) {
  const { agentId } = await params;
  const sp = await searchParams;

  // Resolve the agent from the (synthetic) simulator. Honest not-found if unknown.
  const info = getAgentInfo(agentId);
  if (!info) notFound();

  const modeKey = clampMode(sp.mode);
  const mode = getOperationMode(modeKey);

  const tier = info.tier as TierKey;
  const tierColor = TIER_COLORS[tier] ?? STATUS.neutral;
  const lifecycleColor = LIFECYCLE_COLORS[info.lifecycleState] ?? STATUS.neutral;

  // Build the ControlInput from the agent's REAL simulated attributes. The
  // per-agent identity + tier are the agent's own; the chosen operation mode is
  // the only URL-driven knob. This is still strictly read-only and synthetic —
  // it only selects which illustrative resolution the reference merge *shows*.
  const input: ControlInput = {
    mode: modeKey,
    agentId: info.agentId,
    tier,
  };
  const result = simulatorControlPort.getEffectiveConfig(input);

  // Group resolved effects by the enforcement layer that carries them.
  const effectsByLayer: Record<EnforcementLayer, ResolvedEffect[]> = {
    kernel: [],
    sidecar: [],
    'control-plane': [],
  };
  for (const e of result.effects) effectsByLayer[e.provenance.layer].push(e);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Back links */}
      <div className="flex flex-wrap items-center gap-4">
        <ExploreLink href={exploreHref('/control')} className="text-sm text-white/55">
          ← All control cards
        </ExploreLink>
        <ExploreLink
          href={exploreHref(`/agent/${info.agentId}`)}
          className="text-sm text-white/55"
        >
          Agent profile →
        </ExploreLink>
        <ExploreLink href={exploreHref('/')} className="text-sm text-white/55">
          Dashboard
        </ExploreLink>
      </div>

      {/* Header: identity + persistent illustrative badge */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-extrabold tracking-tight text-white/90">
                {info.agentId}
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
            <p className="mt-1 text-sm text-white/60">{info.label}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExploreLink href={exploreHref(`/tier/${tier}`)}>
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ color: tierColor, backgroundColor: tint(tierColor) }}
              >
                {tier} · {tierName(tier)}
              </span>
            </ExploreLink>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ color: lifecycleColor, backgroundColor: tint(lifecycleColor) }}
            >
              {info.lifecycleState}
            </span>
          </div>
        </div>
        <p className="text-[11px] uppercase tracking-wider text-white/55">
          Observation: <span className="normal-case text-white/70">{info.observationTier.replace(/_/g, ' ')}</span>{' '}
          · score {fmtNum(info.score)} · {info.signalCount} lifetime signals · resolved under{' '}
          <span className="normal-case text-white/70">{mode.label}</span> mode
        </p>
      </header>

      {/* Persistent synthetic / honesty banner (mirrors the model page idiom). */}
      <div
        className="rounded-lg border px-4 py-2.5"
        style={{ borderColor: `${STATUS.warnAlt}33`, backgroundColor: `${STATUS.warnAlt}10` }}
      >
        <p className="text-xs leading-relaxed" style={{ color: `${STATUS.warnAlt}cc` }}>
          <span className="font-semibold">Illustrative model · synthetic.</span> This card is not
          connected to a live agent. It only <span className="italic">shows</span> how a future
          vendor-neutral control layer would resolve a configuration for{' '}
          <span className="font-mono">{info.agentId}</span> — there is no apply/write path. Honesty
          is per-effect: every effect carries its own provenance (layer · execution mode · posture ·
          proof · origin), and the honesty ceiling is <span className="font-mono">WHITE_BOX</span> —
          attestation/TEE are stubs, shown as <span className="font-mono">proof: stubbed</span>,
          never as verified. CogniGate (control plane) is advisory v0.x; enforcement is the direction
          of travel.
        </p>
      </div>

      {/* Mode selector — the only interactive surface; still read-only. */}
      <Panel
        title="Operation mode"
        subtitle="Choose a mode — read-only · shown, never applied"
        badge={<Chip label="illustrative" color={STATUS.warnAlt} />}
        footnote={mode.description}
      >
        <ControlModeSelector
          basePath={`/control/${info.agentId}`}
          options={MODE_OPTIONS}
          current={modeKey}
        />
      </Panel>

      {/* Resolved roll-up: deny-biased verdict + most-restrictive execution mode. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-3 text-sm">
        <span className="text-white/55">Resolved for {info.agentId}:</span>
        <span className="flex items-center gap-1.5">
          <span className="text-white/55">verdict</span>
          <Chip label={result.verdict} color={VERDICT_COLOR[result.verdict]} />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-white/55">execution mode</span>
          <Chip label={result.executionMode} color={EXEC_COLOR[result.executionMode]} />
        </span>
        <span className="text-[11px] text-white/55">
          deny-overrides verdict · most-restrictive execution mode · synthetic
        </span>
      </div>

      {/* Per-category resolved effects, grouped by enforcement layer (inner→outer). */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/55">
          Resolved effects by enforcement layer
        </h2>
        <p className="max-w-3xl text-xs leading-relaxed text-white/55">
          The {EFFECTIVE_CATEGORY_LABELS['execution-verdict'].toLowerCase()} and the other resolved
          categories below are grouped by the layer that carries each one. Honesty is per-effect:
          every effect shows its own provenance chips, never one global badge.
        </p>
        <div className="flex flex-col gap-4">
          {ENFORCEMENT_LAYERS.map((layer) => {
            const lane = effectsByLayer[layer];
            return (
              <Panel
                key={layer}
                title={LAYER_LABELS[layer]}
                subtitle={LAYER_BLURBS[layer]}
                badge={<Chip label={layer} color={LAYER_ACCENT[layer]} />}
                className="border-l-2"
              >
                {lane.length === 0 ? (
                  <p className="text-xs text-white/55">
                    No effect resolved at this layer for {info.agentId} under {mode.label}.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {lane.map((e) => (
                      <li
                        key={e.category}
                        className="rounded-lg border border-white/10 bg-white/[0.02] p-3"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-xs font-medium text-white/85">
                            {EFFECTIVE_CATEGORY_LABELS[e.category]}
                          </span>
                          <span className="font-mono text-[11px] text-white/70">{e.value}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-white/55">
                          {e.rationale}{' '}
                          <span className="text-white/45">— decided by {e.decidedBy}.</span>
                        </p>
                        <div className="mt-2">
                          <ProvenanceChips effect={e} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })}
        </div>
      </section>

      {/* Scope & limitations footer (mirrors the model page). */}
      <footer className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/55">
          Scope &amp; limitations
        </h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] leading-relaxed text-white/55">
          <li>
            Illustrative model only. There is no live agent, no auth, no write path, and no backend
            call on this card — the control port is demo-mode and read-only, and every payload is
            stamped synthetic.
          </li>
          <li>
            The resolution is produced by a local, faithful reimplementation of a deny-biased
            cross-layer precedence merge; it does not depend on vorion-core. First hard floor wins;
            below the human-override line scopes may only tighten.
          </li>
          <li>
            Honesty is per-effect: each effect shows its own provenance. The honesty ceiling is
            WHITE_BOX — attestation/TEE are stubs, surfaced as{' '}
            <span className="font-mono">proof: stubbed</span>, never asserted as verified. CogniGate
            (control plane) is advisory v0.x.
          </li>
          <li>
            This is audit infrastructure / trust telemetry / observability. Enforcement is the
            direction of travel — not a capability this surface ships, and this surface never
            governs.
          </li>
        </ul>
        <p className="mt-3 text-[11px] text-white/55">
          @vorionsys/rainbow ·{' '}
          <ExploreLink href="/model" className="text-white/55">
            Control model
          </ExploreLink>{' '}
          ·{' '}
          <a href="https://vorion.org" className="underline hover:text-white/75">
            vorion.org
          </a>
        </p>
      </footer>
    </main>
  );
}
