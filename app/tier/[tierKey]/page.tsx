// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Trust-tier deep-dive — what a tier means, which trust factors it makes
 * mandatory, and which simulated agents currently resolve to it. Read-only RSC;
 * tier boundaries/descriptions/factor requirements are canonical
 * (`@vorionsys/basis-spec`), so this page can never drift from the standard.
 */

import { notFound } from 'next/navigation';
import { TRUST_TIERS, TRUST_FACTORS } from '@vorionsys/basis-spec';

import { ensureHydrated, getTierMembers, isPresetDuration } from '../../lib/data-source';
import { TIER_COLORS, TIER_ORDER, tierName, type TierKey } from '../../lib/tiers';
import { LIFECYCLE_COLORS, tint } from '../../lib/status-colors';
import { conceptSlug } from '../../lib/glossary';
import { fmtNum } from '../../lib/format';
import { Panel, EmptyState } from '../../components/panel';
import { ExploreLink, exploreHref } from '../../components/explore-link';
import { InfoLink } from '../../components/info-link';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ tierKey: string }>;
  searchParams: Promise<{ window?: string }>;
}

export default async function TierPage({ params, searchParams }: PageProps) {
  await ensureHydrated();
  const { tierKey } = await params;
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';

  const key = tierKey.toUpperCase() as TierKey;
  if (!(key in TRUST_TIERS)) notFound();

  const spec = TRUST_TIERS[key];
  const color = TIER_COLORS[key];

  // Factors that become mandatory FROM this tier upward.
  const requiredHere = (
    Object.entries(TRUST_FACTORS) as [
      string,
      { name: string; group: string; weight: string; requiredFrom: string },
    ][]
  ).filter(([, f]) => f.requiredFrom === key);

  const members = getTierMembers(key);

  // Neighbour tiers for prev/next navigation.
  const idx = TIER_ORDER.indexOf(key);
  const prev = idx > 0 ? TIER_ORDER[idx - 1] : undefined;
  const next = idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : undefined;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ExploreLink href={exploreHref('/', { window })} className="text-sm text-white/55">
          ← Dashboard
        </ExploreLink>
        {/* Neighbour tiers */}
        <nav className="flex items-center gap-3 text-[11px]">
          {prev ? (
            <ExploreLink
              href={exploreHref(`/tier/${prev}`, { window })}
              className="text-white/55"
              title={`${prev} · ${tierName(prev)}`}
            >
              ← {prev} {tierName(prev)}
            </ExploreLink>
          ) : (
            <span className="text-white/20">← lowest tier</span>
          )}
          <span className="text-white/20">·</span>
          {next ? (
            <ExploreLink
              href={exploreHref(`/tier/${next}`, { window })}
              className="text-white/55"
              title={`${next} · ${tierName(next)}`}
            >
              {next} {tierName(next)} →
            </ExploreLink>
          ) : (
            <span className="text-white/20">highest tier →</span>
          )}
        </nav>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color }}>
          {key} · {spec.name}
          <InfoLink slug={conceptSlug.tier(key)} label={`${key} ${spec.name}`} />
        </h1>
        <p className="text-sm text-white/45">
          Composite trust score range {spec.min}–{spec.max} on the 0–1000 scale.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* What this tier means */}
        <Panel
          title="What this tier means"
          subtitle="Canonical definition from @vorionsys/basis-spec"
          badge={
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ color, backgroundColor: tint(color) }}
            >
              {key}
            </span>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-white/80">{spec.description}.</p>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-xs">
              <div className="bg-[#05050a] px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wider text-white/40">Score range</dt>
                <dd className="mt-0.5 font-semibold text-white/85">
                  {spec.min}–{spec.max}
                </dd>
              </div>
              <div className="bg-[#05050a] px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wider text-white/40">Name</dt>
                <dd className="mt-0.5 font-semibold text-white/85">{spec.name}</dd>
              </div>
            </dl>

            <ExploreLink
              href={exploreHref(`/concepts/${conceptSlug.tier(key)}`, { window })}
              className="text-xs text-cyan-300/80"
            >
              Full explainer: {key} {spec.name} →
            </ExploreLink>

            {/* Factors first required at this tier */}
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-white/40">
                Trust factors required from {key}
              </h3>
              {requiredHere.length === 0 ? (
                <p className="mt-2 text-xs text-white/45">
                  No new trust factors become mandatory at {key}
                  {idx === 0
                    ? ' — sandboxed agents carry no factor obligations.'
                    : ' — agents inherit only the requirements of lower tiers.'}
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {requiredHere.map(([code, f]) => (
                    <li key={code}>
                      <ExploreLink
                        href={exploreHref(`/factor/${code}`, { window })}
                        variant="block"
                        className="flex items-center justify-between gap-2 px-2 py-1.5"
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-white/85">{code}</span>
                          <span className="text-xs text-white/70">{f.name}</span>
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-white/40">
                          {f.group} · {f.weight}
                        </span>
                      </ExploreLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>

        {/* Agents in this tier */}
        <Panel
          title="Agents in this tier"
          subtitle={`${members.length} simulated agent${members.length === 1 ? '' : 's'} currently resolving to ${key}`}
          className="lg:col-span-2"
        >
          {members.length === 0 ? (
            <EmptyState message={`No agents currently in ${key}.`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40">
                    <th className="py-2 pr-3 font-medium">Agent</th>
                    <th className="py-2 pr-3 text-right font-medium">Score</th>
                    <th className="py-2 pr-3 font-medium">Lifecycle</th>
                    <th className="py-2 pr-3 text-right font-medium">Signals</th>
                    <th className="py-2 font-medium">Archetype</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((agent) => {
                    const lifecycleColor = LIFECYCLE_COLORS[agent.lifecycleState] ?? '#94a3b8';
                    return (
                      <tr key={agent.agentId} className="border-b border-white/5">
                        <td className="py-2 pr-3">
                          <ExploreLink
                            href={exploreHref(`/agent/${agent.agentId}`, { window })}
                            className="font-medium text-white/85"
                          >
                            {agent.agentId}
                          </ExploreLink>
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold text-white/85">
                          {fmtNum(agent.score)}
                        </td>
                        <td className="py-2 pr-3">
                          <ExploreLink
                            href={exploreHref(
                              `/concepts/${conceptSlug.lifecycle(agent.lifecycleState)}`,
                              { window }
                            )}
                            className="text-[11px]"
                          >
                            <span style={{ color: lifecycleColor }}>{agent.lifecycleState}</span>
                          </ExploreLink>
                        </td>
                        <td className="py-2 pr-3 text-right text-white/55">{agent.signalCount}</td>
                        <td className="py-2 text-white/45">{agent.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}
