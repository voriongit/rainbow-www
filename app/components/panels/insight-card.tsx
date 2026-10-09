// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * One explorable insight card. Each rule-based finding from RAINBOW's detection
 * engine becomes a tappable surface: clicking the card header toggles an
 * in-place disclosure that surfaces the REAL evidence the insight already
 * carries — the trust factor(s) it names, the agents involved, the failures
 * that produced an accumulator peak, the per-agent numbers behind a fleet
 * finding, and claim-safe "where to look next" drill-down links. The call to
 * action names what the disclosure actually holds; the proof-plane evidence
 * chain is rendered only when one is attached (never in rainbow 0.3).
 *
 * Honesty boundary: this component fabricates nothing. Driving factors are only
 * the canonical TRUST_FACTORS codes the insight literally names (in its
 * `metadata.commonFactors` or in its title/description text); no remediation,
 * cause, or score is invented. It is an observability affordance, not a fix.
 *
 * Interaction: the header is a real <button> (keyboard + screen-reader
 * friendly, aria-expanded reflects state); the disclosure region is plain
 * markup toggled by state. Reuses the info-link.tsx Esc / outside-click idiom
 * so a tap elsewhere collapses it. Reduced-motion safe — the only animation is
 * a colour transition, which respects the global motion preference.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { RecordedInsight } from '@vorionsys/rainbow';
import { TRUST_FACTORS } from '@vorionsys/basis-spec';
import { ExploreLink, exploreHref } from '../explore-link';
import { ConceptTooltip } from '../tooltip';
import { conceptSlug } from '../../lib/glossary';
import { TIER_COLORS, type TierKey } from '../../lib/tiers';
import { fmtDateTime, fmtNum } from '../../lib/format';
import { insightMeta } from '../../lib/insights';
import { STATUS, tint } from '../../lib/status-colors';

const SEVERITY_COLORS: Record<string, string> = {
  info: STATUS.info,
  warning: STATUS.warn,
  critical: STATUS.bad,
  emergency: '#dc2626',
};

const FACTOR_CODES = Object.keys(TRUST_FACTORS);

interface FactorRef {
  code: string;
  name: string;
  /** Tier the factor becomes mandatory from — used for the spectrum colour. */
  requiredFrom: string;
}

/**
 * The canonical trust factors this insight actually names — pulled from its
 * `metadata.commonFactors` (FLEET_ANOMALY carries these) and from any factor
 * code that appears verbatim in the title/description (FACTOR_DEGRADATION lists
 * them inline). Deduplicated, canonical order. Nothing inferred.
 */
function drivingFactors(insight: RecordedInsight): FactorRef[] {
  const found = new Set<string>();

  const fromMeta = insight.metadata?.commonFactors;
  if (Array.isArray(fromMeta)) {
    for (const c of fromMeta) {
      if (typeof c === 'string' && c in TRUST_FACTORS) found.add(c);
    }
  }

  const haystack = `${insight.title} ${insight.description}`;
  for (const code of FACTOR_CODES) {
    // Word-boundary match so 'CT-ID' doesn't swallow a longer token.
    if (new RegExp(`\\b${code}\\b`).test(haystack)) found.add(code);
  }

  return FACTOR_CODES.filter((c) => found.has(c)).map((code) => {
    const spec = TRUST_FACTORS[code as keyof typeof TRUST_FACTORS] as {
      name: string;
      requiredFrom: string;
    };
    return { code, name: spec.name, requiredFrom: spec.requiredFrom };
  });
}

interface InsightCardProps {
  insight: RecordedInsight;
  /** Active window, carried into every drill-down link. */
  window?: string;
}

export function InsightCard({ insight, window }: InsightCardProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const panelId = useId();

  const color = SEVERITY_COLORS[insight.severity] ?? STATUS.neutral;
  const factors = drivingFactors(insight);
  const categorySlug = conceptSlug.insight(insight.category);
  const meta = insightMeta(insight);
  const contributing = meta?.contributing ?? [];
  const rows = meta?.rows ?? [];
  // Promise only what the disclosure can show: contributing signals when the
  // finding carries them, the per-agent breakdown for fleet findings, else details.
  const cta =
    contributing.length > 0
      ? 'Show contributing signals'
      : rows.length > 0
        ? `Show the ${rows.length} agent${rows.length === 1 ? '' : 's'}`
        : 'Show details';
  const scopeLabel =
    meta?.scope === 'fleet' ? 'Fleet' : insight.agentIds.length === 1 ? insight.agentIds[0] : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <li
      ref={ref}
      className="rounded-lg border-l-2 border border-white/10 bg-white/[0.02]"
      style={{ borderLeftColor: color }}
    >
      {/* Header — the whole strip is the toggle. Nested links use stopPropagation
          so drilling into a concept/agent doesn't also collapse/expand. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="block w-full rounded-lg px-3.5 py-3 text-left transition-colors [touch-action:manipulation] hover:bg-white/[0.02] focus-visible:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color, backgroundColor: tint(color) }}
          >
            {insight.category.replace(/_/g, ' ')}
          </span>
          <span className="text-[10px] uppercase tracking-wider" style={{ color }}>
            {insight.severity}
          </span>
          {scopeLabel && (
            <span
              className="rounded border border-white/10 px-1.5 py-px text-[10px] text-white/50"
              title={
                meta?.scope === 'fleet'
                  ? 'Fleet scope: cites fleet statistics and names agents; never one agent’s scores'
                  : 'Agent scope: computed from the same series as this agent’s panels'
              }
            >
              {scopeLabel}
            </span>
          )}
          {factors.length > 0 && (
            <span className="text-[10px] text-white/35">
              {factors.length} factor{factors.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2 text-[10px] text-white/30">
            {fmtDateTime(insight.detectedAt)} UTC
            <span
              aria-hidden
              className="text-white/40 transition-transform motion-safe:duration-150"
              style={{ transform: open ? 'rotate(180deg)' : 'none' }}
            >
              ▾
            </span>
          </span>
        </div>

        <p className="mt-1.5 text-sm font-semibold text-white/90">{insight.title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-white/60">
          {insight.description}
        </p>
        {!open && (
          <p className="mt-1 text-[10px] uppercase tracking-wider text-cyan-300/45">
            {cta}
          </p>
        )}
      </button>

      {/* Disclosure — only the real evidence this insight already carries. */}
      {open && (
        <div id={panelId} className="border-t border-white/[0.06] px-3.5 pb-3.5 pt-3">
          {/* Driving factors — spectrum-coloured by the tier each is required
              from; every chip drills into the factor's fleet-wide deep-dive. */}
          {factors.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                Driving factor{factors.length > 1 ? 's' : ''}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {factors.map((f) => {
                  const fc = TIER_COLORS[f.requiredFrom as TierKey] ?? STATUS.neutral;
                  return (
                    <ConceptTooltip key={f.code} slug={conceptSlug.factor(f.code)}>
                      <ExploreLink
                        href={exploreHref(`/factor/${f.code}`, { window })}
                        variant="inline"
                        ariaLabel={`Explore factor ${f.code} ${f.name}`}
                      >
                        <span
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            color: fc,
                            borderColor: tint(fc, '55'),
                            backgroundColor: tint(fc),
                          }}
                        >
                          <span className="font-semibold">{f.code}</span>
                          <span className="text-white/55">{f.name}</span>
                        </span>
                      </ExploreLink>
                    </ConceptTooltip>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agents involved — each drills into the agent's own dashboard. */}
          {insight.agentIds.length > 0 && (
            <div className={factors.length > 0 ? 'mt-3' : undefined}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                Agent{insight.agentIds.length > 1 ? 's' : ''} involved
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {insight.agentIds.map((id) => (
                  <ExploreLink
                    key={id}
                    href={exploreHref(`/agent/${id}`, { window })}
                    variant="inline"
                    className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/70"
                  >
                    {id}
                  </ExploreLink>
                ))}
              </div>
            </div>
          )}

          {/* Contributing signals — the failures whose P(T) × R sum is the peak. */}
          {contributing.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                Contributing signals · largest first
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 border-l border-white/10 pl-3">
                {contributing.map((c) => (
                  <li key={c.signalId} className="text-[11px] text-white/55">
                    <span className="tabular-nums text-white/35">{fmtDateTime(c.at)}</span>{' '}
                    · {c.factorCode ?? 'no factor'} · {c.riskLevel ?? '—'} ·{' '}
                    <span className="font-semibold tabular-nums text-white/75">
                      +{fmtNum(c.contribution)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] text-white/35">
                Each failure adds P(T) × R to the rolling 24h sum; these are the failures inside the 24h
                ending at the peak.
              </p>
            </div>
          )}

          {/* Fleet findings — the per-agent numbers the sentence summarizes. */}
          {rows.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                Per agent
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {rows.map((r) => (
                  <li key={r.agentId} className="flex flex-wrap gap-x-2 text-[11px]">
                    <ExploreLink
                      href={exploreHref(`/agent/${r.agentId}`, { window })}
                      variant="inline"
                      className="font-mono text-white/75"
                    >
                      {r.agentId}
                    </ExploreLink>
                    <span className="tabular-nums text-white/50">{r.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Proof-plane evidence chain — rendered only when one is attached.
              @vorionsys/rainbow leaves it empty in this version, so say so once. */}
          {insight.evidenceChain.length > 0 ? (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                Evidence chain
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 border-l border-white/10 pl-3">
                {insight.evidenceChain.map((ev) => (
                  <li key={ev.eventId} className="text-[11px] text-white/55">
                    <span className="text-white/35 tabular-nums">
                      {fmtDateTime(ev.timestamp)}
                    </span>{' '}
                    — {ev.summary}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-[10px] leading-relaxed text-white/35">
              Rule-based finding over the window analytics. No proof-plane evidence chain is attached
              in this version.
            </p>
          )}

          {/* Where to look next — claim-safe drill-down. Observability only:
              these lead to read-only deep-dives, not remediations. */}
          <div className="mt-3 border-t border-white/[0.06] pt-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
              Where to look next
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              <ConceptTooltip slug={categorySlug}>
                <ExploreLink
                  href={exploreHref(`/concepts/${categorySlug}`, { window })}
                  className="text-cyan-300/80"
                >
                  What is {insight.category.replace(/_/g, ' ').toLowerCase()}? →
                </ExploreLink>
              </ConceptTooltip>
              {factors.slice(0, 1).map((f) => (
                <ExploreLink
                  key={f.code}
                  href={exploreHref(`/factor/${f.code}`, { window })}
                  className="text-cyan-300/80"
                >
                  Inspect {f.code} across the fleet →
                </ExploreLink>
              ))}
              {insight.agentIds.slice(0, 1).map((id) => (
                <ExploreLink
                  key={id}
                  href={exploreHref(`/agent/${id}`, { window })}
                  className="text-cyan-300/80"
                >
                  Open {id} →
                </ExploreLink>
              ))}
              {typeof meta?.clusterId === 'string' && (
                <ExploreLink
                  href={exploreHref(`/cluster/${meta.clusterId}`, { window })}
                  className="text-cyan-300/80"
                >
                  Open the cluster →
                </ExploreLink>
              )}
              {meta?.scope === 'agent' && insight.agentIds.length === 1 && (
                <ExploreLink
                  href={exploreHref('/proof', { agent: insight.agentIds[0], window })}
                  className="text-cyan-300/80"
                >
                  Signal log &amp; proof chain →
                </ExploreLink>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
