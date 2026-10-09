// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Trust-factor deep-dive — read-only RSC drill-down for one of the 16 canonical
 * trust factors. Resolves the factor from the canonical `@vorionsys/basis-spec`
 * TRUST_FACTORS (case-insensitive on the URL segment), explains it from the
 * glossary, then shows how the factor is being exercised across the whole fleet
 * within the active window.
 */

import { notFound } from 'next/navigation';
import { TRUST_FACTORS } from '@vorionsys/basis-spec';
import { ensureHydrated, getFleetSignals, isPresetDuration } from '../../lib/data-source';
import { getConcept, conceptSlug } from '../../lib/glossary';
import { tierName } from '../../lib/tiers';
import { STATUS, tint } from '../../lib/status-colors';
import { ExploreLink, exploreHref } from '../../components/explore-link';
import { InfoLink } from '../../components/info-link';
import { Panel, EmptyState } from '../../components/panel';
import { Stat } from '../../components/stat';
import { SignalLog } from '../../components/signal-log';
import type { Metadata } from 'next';
import { pageMetadata } from '../../lib/page-metadata';

export const dynamic = 'force-dynamic';

interface FactorSpec {
  name: string;
  group: string;
  weight: string;
  requiredFrom: string;
}

interface PageProps {
  params: Promise<{ factorCode: string }>;
  searchParams: Promise<{ window?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { factorCode } = await params;
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';
  return pageMetadata({
    title: `${factorCode} · ${window}`,
    description: `Trust factor ${factorCode} across the fleet over the last ${window}: per-agent health and the signals behind it.`,
    path: `/factor/${factorCode}`,
    query: { window },
  });
}

export default async function FactorPage({ params, searchParams }: PageProps) {
  await ensureHydrated();
  const { factorCode } = await params;
  const sp = await searchParams;
  const window = isPresetDuration(sp.window) ? sp.window : '24h';

  // Normalize the (possibly lowercase) URL segment to the canonical key.
  const code = Object.keys(TRUST_FACTORS).find(
    (k) => k.toLowerCase() === factorCode.toLowerCase()
  );
  if (!code) notFound();

  const spec = TRUST_FACTORS[code as keyof typeof TRUST_FACTORS] as FactorSpec;
  const slug = conceptSlug.factor(code);
  const concept = getConcept(slug);
  const requiredTier = spec.requiredFrom;

  // Fleet-wide signals exercising this factor, newest first.
  const signals = getFleetSignals(window, { factorCode: code });

  // Group by agent; derive outcomes (success = !blocked && success).
  const byAgent = new Map<
    string,
    { agentId: string; success: number; failure: number; blocked: number; total: number }
  >();
  for (const s of signals) {
    let row = byAgent.get(s.agentId);
    if (!row) {
      row = { agentId: s.agentId, success: 0, failure: 0, blocked: 0, total: 0 };
      byAgent.set(s.agentId, row);
    }
    row.total += 1;
    if (s.blocked) row.blocked += 1;
    else if (s.success) row.success += 1;
    else row.failure += 1;
  }
  const agentRows = [...byAgent.values()].sort(
    (a, b) => b.failure - a.failure || b.total - a.total
  );

  const totalSuccess = signals.filter((s) => !s.blocked && s.success).length;
  const totalFailure = signals.filter((s) => !s.blocked && !s.success).length;
  const totalBlocked = signals.filter((s) => s.blocked).length;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <ExploreLink href={exploreHref('/', { window })} className="text-xs text-white/55">
        ← Dashboard
      </ExploreLink>

      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-white/90">
            <span className="font-mono">{code}</span>
            <span className="mx-2 text-white/30">·</span>
            {spec.name}
          </h1>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ color: STATUS.info, backgroundColor: tint(STATUS.info) }}
          >
            {spec.group}
          </span>
          <InfoLink slug={slug} label={`${code} ${spec.name}`} />
        </div>
        <p className="text-sm text-white/45">
          One of the 16 canonical trust factors. Mandatory from{' '}
          <ExploreLink
            href={exploreHref(`/tier/${requiredTier}`, { window })}
            className="text-white/70"
          >
            {requiredTier} · {tierName(requiredTier as Parameters<typeof tierName>[0])}
          </ExploreLink>{' '}
          upward. Across the fleet · last {window}.
        </p>
      </header>

      {/* Fleet roll-up of this factor's outcomes */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`Signals · ${window}`} value={String(signals.length)} sub="fleet-wide" />
        <Stat
          label="Successes"
          value={String(totalSuccess)}
          color={totalSuccess > 0 ? STATUS.good : undefined}
        />
        <Stat
          label="Failures"
          value={String(totalFailure)}
          color={totalFailure > 0 ? STATUS.bad : undefined}
        />
        <Stat
          label="Blocked"
          value={String(totalBlocked)}
          color={totalBlocked > 0 ? STATUS.warnAlt : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Definition */}
        <Panel
          title="Definition"
          subtitle={`Canonical · @vorionsys/basis-spec`}
          footnote="Sourced directly from the sealed BASIS specification — these values cannot drift from the published standard."
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-white/40">Code</dt>
              <dd className="mt-0.5 font-mono text-sm text-white/80">{code}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-white/40">Group</dt>
              <dd className="mt-0.5 text-sm text-white/80">{spec.group}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-white/40">Weight</dt>
              <dd className="mt-0.5 text-sm text-white/80">{spec.weight}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-white/40">
                Required from
              </dt>
              <dd className="mt-0.5 text-sm">
                <ExploreLink
                  href={exploreHref(`/tier/${requiredTier}`, { window })}
                  className="text-white/80"
                >
                  {requiredTier} · {tierName(requiredTier as Parameters<typeof tierName>[0])}
                </ExploreLink>
              </dd>
            </div>
          </dl>
          {concept?.long ? (
            <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/55">
              {concept.long}
            </p>
          ) : null}
        </Panel>

        {/* Across the fleet */}
        <Panel
          title="Across the fleet"
          subtitle={`Agents exercising ${code} · last ${window}`}
          className="min-w-0 lg:col-span-2"
          footnote="Success = succeeded and not blocked. Sorted by failures (highest first), then total activity."
        >
          {agentRows.length === 0 ? (
            <EmptyState
              message={`No signals exercised ${code} across the fleet in the last ${window}.`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40">
                    <th className="py-2 pr-3 font-medium">Agent</th>
                    <th className="py-2 pr-3 text-right font-medium">Success</th>
                    <th className="py-2 pr-3 text-right font-medium">Failure</th>
                    <th className="py-2 pr-3 text-right font-medium">Blocked</th>
                    <th className="py-2 pr-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {agentRows.map((row) => (
                    <tr key={row.agentId} className="border-b border-white/5">
                      <td className="py-1.5 pr-3">
                        <ExploreLink
                          href={exploreHref(`/agent/${row.agentId}`, { window })}
                          className="font-mono text-[11px] text-white/80"
                        >
                          {row.agentId}
                        </ExploreLink>
                      </td>
                      <td
                        className="py-1.5 pr-3 text-right tabular-nums"
                        style={{ color: row.success > 0 ? STATUS.good : undefined }}
                      >
                        {row.success}
                      </td>
                      <td
                        className="py-1.5 pr-3 text-right tabular-nums"
                        style={{ color: row.failure > 0 ? STATUS.bad : undefined }}
                      >
                        {row.failure}
                      </td>
                      <td
                        className="py-1.5 pr-3 text-right tabular-nums"
                        style={{ color: row.blocked > 0 ? STATUS.warnAlt : undefined }}
                      >
                        {row.blocked}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-white/70">
                        {row.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Signal log — full width */}
      <Panel
        title="Signals exercising this factor"
        subtitle={`Fleet-wide event log · ${code} · last ${window}`}
      >
        <SignalLog
          signals={signals}
          window={window}
          emptyLabel={`No signals exercised ${code} across the fleet in the last ${window}.`}
        />
      </Panel>
    </main>
  );
}
