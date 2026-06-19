// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * /model — the ILLUSTRATIVE control MODEL.
 *
 * A read-only, server-rendered visualization of the agent-control MODEL: the
 * conceptual bridge to a future cockpit, shown strictly as a model. It controls
 * NOTHING — no live agents, no auth, no writes, no backend. Everything is
 * resolved by the local reference merge over the SimulatorControlPort and is
 * stamped synthetic.
 *
 * Honesty discipline: a persistent badge marks this as an illustrative model;
 * provenance is per-effect (not one badge); the honesty ceiling is WHITE_BOX
 * (attestation/TEE are stubbed). We describe enforcement as the direction of
 * travel, never a shipped capability, and never say this surface "governs".
 */

import type { Metadata } from 'next';
import { Panel } from '../components/panel';
import { ExploreLink, exploreHref } from '../components/explore-link';
import {
  ControlResolverSelector,
  type ResolverControl,
} from '../components/control-resolver-selector';
import { STATUS } from '../lib/status-colors';
import {
  OPERATION_MODES,
  SCOPE_DIMENSIONS_BY_PRECEDENCE,
} from '../lib/control/operation-modes';
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
} from '../lib/control/contract';
import { simulatorControlPort } from '../lib/control/simulator-control-port';

export const metadata: Metadata = {
  title: 'Control model (illustrative) — RAINBOW',
  description:
    'An illustrative, read-only model of how a future vendor-neutral agent-control layer would resolve configuration across kernel, sidecar, and control-plane. Not connected to live agents.',
};

const LAYER_ACCENT: Record<EnforcementLayer, string> = {
  kernel: STATUS.bad, // inner hard floor
  sidecar: STATUS.warn,
  'control-plane': STATUS.info,
};

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

// ── Interactive resolver: the URL-driven scope ──────────────────────────────
//
// The /model resolver is driven by five query params: ?mode, ?risk, ?tier,
// ?channel, ?data. Each is clamped to a known enum below; anything unknown (or
// absent) falls back to the DEFAULT, which reproduces the original hard-coded
// example exactly — so a bare /model is byte-for-byte unchanged. This is still
// strictly READ-ONLY: the params only choose which illustrative resolution the
// reference merge *shows*; there is no apply/write path.

const MODE_OPTIONS = OPERATION_MODES.map((m) => ({ value: m.key, label: m.label }));
const RISK_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((v) => ({ value: v, label: v }));
const TIER_OPTIONS = ['T2', 'T4', 'T6', 'T7'].map((v) => ({ value: v, label: v }));
const CHANNEL_OPTIONS = [
  { value: 'tool-call', label: 'tool-call' },
  { value: 'a2a-bus', label: 'a2a-bus' },
  { value: 'egress', label: 'egress' },
];
const DATA_OPTIONS = [
  { value: 'public', label: 'public' },
  { value: 'internal', label: 'internal' },
  { value: 'restricted', label: 'restricted' },
];

// Defaults — chosen so a bare /model reproduces the original worked example.
const DEFAULTS = {
  mode: 'guarded' as OperationModeKey,
  risk: 'CRITICAL',
  tier: 'T6',
  channel: 'egress',
  data: 'restricted',
} as const;

/** Clamp a raw query value to a known option, defaulting when absent/unknown. */
function clamp(
  raw: string | string[] | undefined,
  options: readonly { value: string }[],
  fallback: string,
): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && options.some((o) => o.value === v) ? v : fallback;
}

/** Small chip primitive — used for verdict, exec-mode, layer-mode, proof, origin. */
function Chip({
  label,
  color,
  title,
}: {
  label: string;
  color?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none"
      style={{
        borderColor: color ? `${color}55` : 'rgba(255,255,255,0.15)',
        backgroundColor: color ? `${color}1a` : 'rgba(255,255,255,0.04)',
        color: color ?? 'rgba(255,255,255,0.6)',
      }}
    >
      {label}
    </span>
  );
}

/** Per-effect provenance chips — honesty is per-effect, never one global badge. */
function ProvenanceChips({ effect }: { effect: ResolvedEffect }) {
  const p = effect.provenance;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Chip
        label={p.executionMode}
        color={EXEC_COLOR[p.executionMode]}
        title="Execution mode (block > inline > deferred)"
      />
      <Chip label={p.layerMode} title="Layer posture (enforce / observe / shadow)" />
      <Chip
        label={p.proof === 'verified' ? 'proof: verified' : 'proof: stubbed'}
        color={p.proof === 'verified' ? STATUS.good : STATUS.neutral}
        title={
          p.proof === 'stubbed'
            ? 'Honesty ceiling is WHITE_BOX — this rests on a TEE/attestation stub, so it is not asserted as verified.'
            : 'Backed by a real check in this reference model.'
        }
      />
      <Chip
        label={p.origin}
        title={p.origin === 'caused' ? 'Directly caused by the input scope.' : 'Ambient standing floor.'}
      />
    </div>
  );
}

interface ControlModelPageProps {
  searchParams: Promise<{
    mode?: string | string[];
    risk?: string | string[];
    tier?: string | string[];
    channel?: string | string[];
    data?: string | string[];
  }>;
}

export default async function ControlModelPage({ searchParams }: ControlModelPageProps) {
  // Resolve + clamp the URL-driven scope. Unknown/absent values fall back to the
  // DEFAULTS, which reproduce the original worked example so a bare /model is
  // unchanged. Everything below is still strictly read-only and synthetic.
  const params = await searchParams;
  const selected = {
    mode: clamp(params.mode, MODE_OPTIONS, DEFAULTS.mode) as OperationModeKey,
    risk: clamp(params.risk, RISK_OPTIONS, DEFAULTS.risk),
    tier: clamp(params.tier, TIER_OPTIONS, DEFAULTS.tier),
    channel: clamp(params.channel, CHANNEL_OPTIONS, DEFAULTS.channel),
    data: clamp(params.data, DATA_OPTIONS, DEFAULTS.data),
  };

  // An illustrative resolution: a high-tier agent under the chosen mode attempts
  // the chosen risk-class spend over the chosen channel/data, with a locked
  // industry floor — so a stricter layer can cap the intent. agentId,
  // actionClass and the industry floor stay fixed to keep the example legible.
  const exampleInput: ControlInput = {
    mode: selected.mode,
    agentId: 'cascade-03',
    tier: selected.tier,
    riskClass: selected.risk,
    actionClass: 'spend',
    channel: selected.channel,
    dataSensitivity: selected.data,
    industryFloor: true,
  };
  const result = simulatorControlPort.getEffectiveConfig(exampleInput);

  // The five URL-driven controls, each clamped to a known enum (validated above).
  const resolverControls: ResolverControl[] = [
    { param: 'mode', label: 'Operation mode', options: MODE_OPTIONS, current: selected.mode },
    { param: 'risk', label: 'Risk class', options: RISK_OPTIONS, current: selected.risk },
    { param: 'tier', label: 'Trust tier', options: TIER_OPTIONS, current: selected.tier },
    { param: 'channel', label: 'Channel', options: CHANNEL_OPTIONS, current: selected.channel },
    { param: 'data', label: 'Data sensitivity', options: DATA_OPTIONS, current: selected.data },
  ];

  // Group resolved effects by the layer that carries them, for the three lanes.
  const effectsByLayer: Record<EnforcementLayer, ResolvedEffect[]> = {
    kernel: [],
    sidecar: [],
    'control-plane': [],
  };
  for (const e of result.effects) effectsByLayer[e.provenance.layer].push(e);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header + back link */}
      <div className="flex flex-col gap-3">
        <ExploreLink href={exploreHref('/')} className="text-sm text-white/55">
          ← Dashboard
        </ExploreLink>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-white/90">Control model</h1>
          {/* Persistent, prominent illustrative badge — never mistakable for real control. */}
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
        <p className="max-w-3xl text-sm leading-relaxed text-white/55">
          This is a read-only, illustrative <span className="text-white/80">model</span> of how a
          future vendor-neutral control layer <span className="italic">would</span> resolve
          configuration across three enforcement layers. It is the conceptual bridge to a future
          cockpit — shown as a model. It controls nothing: no live agents, no auth, no writes, no
          backend calls. Everything below is resolved by a local reference merge and is synthetic.
          This is audit infrastructure / trust telemetry; enforcement is the{' '}
          <span className="text-white/80">direction of travel</span>, not a shipped capability.
        </p>
      </div>

      {/* Persistent banner (mirrors the dashboard's synthetic notice idiom) */}
      <div
        className="rounded-lg border px-4 py-2.5"
        style={{ borderColor: `${STATUS.warnAlt}33`, backgroundColor: `${STATUS.warnAlt}10` }}
      >
        <p className="text-xs leading-relaxed" style={{ color: `${STATUS.warnAlt}cc` }}>
          <span className="font-semibold">Illustrative model.</span> Nothing here is connected to a
          live agent. There are no apply/write paths — the model resolves and shows configuration,
          it never changes anything. Honesty is per-effect: every resolved effect carries its own
          provenance (layer · execution mode · posture · proof · origin), and the honesty ceiling is{' '}
          <span className="font-mono">WHITE_BOX</span> — attestation/TEE are stubs, shown as{' '}
          <span className="font-mono">proof: stubbed</span>, never as verified.
        </p>
      </div>

      {/* (a) Operation-mode cards */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          Operation modes
        </h2>
        <p className="max-w-3xl text-xs leading-relaxed text-white/45">
          Five named modes, each a default that composes the underlying knobs across the three
          layers. Guarded is the default. Modes set a baseline; the deny-biased merge below can only
          tighten from there.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OPERATION_MODES.map((m) => (
            <Panel
              key={m.key}
              title={m.label}
              subtitle={m.isDefault ? 'Default' : undefined}
              badge={
                m.key === 'lockdown' ? (
                  <Chip label="hard stop" color={STATUS.bad} />
                ) : m.key === 'observe' ? (
                  <Chip label="watch only" color={STATUS.info} />
                ) : undefined
              }
            >
              <div className="flex flex-col gap-3">
                <p className="text-xs leading-relaxed text-white/60">{m.description}</p>
                <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-[11px]">
                  <dt className="text-white/40">Kernel</dt>
                  <dd className="text-white/75">{m.layers.kernelLayerMode}</dd>
                  <dt className="text-white/40">Sidecar</dt>
                  <dd className="text-white/75">{m.layers.sidecarGovernanceMode}</dd>
                  <dt className="text-white/40">Channel</dt>
                  <dd className="text-white/75">{m.layers.channelDefault}</dd>
                  <dt className="text-white/40">Escalation</dt>
                  <dd className="text-white/75">{m.layers.escalationPosture}</dd>
                </dl>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      {/* (b) Adjustability taxonomy table */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          Adjustability taxonomy
        </h2>
        <p className="max-w-3xl text-xs leading-relaxed text-white/45">
          The nine dimensions along which the model can be scoped. Each maps to the enforcement layer
          that resolves it, is marked exists-today vs net-new (honesty about what is built), and
          carries its precedence rank in the deny-biased merge (lower wins).
        </p>
        <Panel title="Scope dimensions" subtitle="9 dimensions · ordered by precedence">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/40">
                  <th className="py-2 pr-3 font-medium">Dimension</th>
                  <th className="py-2 pr-3 font-medium">Enforcement layer</th>
                  <th className="py-2 pr-3 font-medium">Maturity</th>
                  <th className="py-2 pr-3 font-medium">Precedence</th>
                  <th className="py-2 font-medium">What it scopes</th>
                </tr>
              </thead>
              <tbody>
                {SCOPE_DIMENSIONS_BY_PRECEDENCE.map((d) => (
                  <tr key={d.key} className="border-b border-white/5 align-top">
                    <td className="py-2 pr-3 font-medium text-white/85">{d.label}</td>
                    <td className="py-2 pr-3">
                      <Chip label={LAYER_LABELS[d.layer]} color={LAYER_ACCENT[d.layer]} />
                    </td>
                    <td className="py-2 pr-3">
                      <Chip
                        label={d.maturity}
                        color={d.maturity === 'exists-today' ? STATUS.good : STATUS.neutral}
                        title={
                          d.maturity === 'exists-today'
                            ? 'The underlying mechanism exists today.'
                            : 'Net-new — direction of travel, not yet built.'
                        }
                      />
                    </td>
                    <td className="py-2 pr-3 font-mono text-white/60">{d.precedenceRank}</td>
                    <td className="py-2 text-white/55">{d.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      {/* (c) Interactive effective-config resolution — three stacked lanes */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          Interactive resolution
        </h2>
        <p className="max-w-3xl text-xs leading-relaxed text-white/45">
          Pick an operation mode and an example scope below to explore — read-only — how the
          reference merge resolves it across the three layers. The selection lives in the URL
          (shareable, no storage); it only chooses which illustrative resolution is{' '}
          <span className="italic">shown</span>, it applies nothing. The input intent is{' '}
          <span className="text-white/70">agent {exampleInput.agentId}</span> (tier{' '}
          {exampleInput.tier}) attempting a <span className="text-white/70">{exampleInput.riskClass}</span>{' '}
          <span className="text-white/70">{exampleInput.actionClass}</span> over{' '}
          <span className="text-white/70">{exampleInput.channel}</span> on{' '}
          <span className="text-white/70">{exampleInput.dataSensitivity}</span> data, under{' '}
          <span className="text-white/70">{exampleInput.mode}</span> mode, with a locked industry
          floor. Watch a stricter layer cap the intent.
        </p>

        {/* URL-driven scope selectors (the only interactive surface; still read-only). */}
        <Panel
          title="Resolution scope"
          subtitle="Choose a scope — read-only · shown, never applied"
          badge={<Chip label="illustrative" color={STATUS.warnAlt} />}
        >
          <ControlResolverSelector controls={resolverControls} />
        </Panel>

        {/* Verdict roll-up */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-3 text-sm">
          <span className="text-white/45">Resolved:</span>
          <span className="flex items-center gap-1.5">
            <span className="text-white/55">verdict</span>
            <Chip label={result.verdict} color={VERDICT_COLOR[result.verdict]} />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-white/55">execution mode</span>
            <Chip label={result.executionMode} color={EXEC_COLOR[result.executionMode]} />
          </span>
          <span className="text-[11px] text-white/35">
            deny-overrides verdict · most-restrictive execution mode · synthetic
          </span>
        </div>

        {/* Three stacked lanes: kernel / sidecar / control-plane */}
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
                  <p className="text-xs text-white/40">
                    No effect resolved at this layer for this input.
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
                        <p className="mt-1 text-[11px] leading-relaxed text-white/50">
                          {e.rationale}{' '}
                          <span className="text-white/35">— decided by {e.decidedBy}.</span>
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

      {/* Scope & limitations footer */}
      <footer className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">
          Scope & limitations
        </h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] leading-relaxed text-white/40">
          <li>
            Illustrative model only. There is no live agent, no auth, no write path, and no backend
            call on this page — the control port is demo-mode and read-only, and every payload is
            stamped synthetic.
          </li>
          <li>
            The merge is a local, faithful reimplementation of a deny-biased cross-layer precedence
            resolution; it does not depend on vorion-core. First hard floor wins; below the
            human-override line scopes may only tighten.
          </li>
          <li>
            Honesty is per-effect: each effect shows its own provenance. The honesty ceiling is
            WHITE_BOX — attestation/TEE are stubs, surfaced as <span className="font-mono">proof:
            stubbed</span>, never asserted as verified. CogniGate (control plane) is advisory v0.x.
          </li>
          <li>
            This is audit infrastructure / trust telemetry / observability. Enforcement is the
            direction of travel — not a capability this surface ships.
          </li>
        </ul>
        <p className="mt-3 text-[11px] text-white/30">
          @vorionsys/rainbow ·{' '}
          <ExploreLink href="/concepts" className="text-white/40">
            Browse all concepts
          </ExploreLink>{' '}
          ·{' '}
          <a href="https://vorion.org" className="underline hover:text-white/60">
            vorion.org
          </a>
        </p>
      </footer>
    </main>
  );
}
